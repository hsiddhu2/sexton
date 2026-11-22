// The GitHub executor. Spec: .kiro/specs/remediate, Requirements 2 to 5, handoff decision 5.
// Turns one proposed RemediationEntry from the server's own scan into one pull request on an allowed repository.
// Order: repository, branch check, read package.json at the commit, apply edits, create branch, put package.json,
// open the pull request, review-site comment, log entry. Nothing is deleted; a failure leaves the branch.
// Reads only the fields it checks from GitHub answers; no GitHub body reaches a response or a log.

import {
  applyPackageJsonEdits,
  isCommitSha,
  isValidBranchName,
  listTree,
  MAX_MANIFEST_BYTES,
  requestWithRetry,
  type ClientContext,
  type RemediationEntry,
  type RepoRef,
  type TransportResponse,
} from "@sexton/engine";
import { buildWriteRequest, isSextonBranch, type WriteRequest } from "./github-requests.js";
import type { RemediationLogWriter } from "./log-store.js";
import { reviewSiteComment } from "./review-sites.js";

export type Step =
  | "repository"
  | "branch-check"
  | "read-package-json"
  | "apply-edits"
  | "create-branch"
  | "put-package-json"
  | "open-pull-request"
  | "review-sites"
  | "log";

export type RemediateOutcome =
  | {
      readonly status: "opened";
      readonly prUrl: string;
      readonly logged: boolean;
      readonly reviewSites?: { readonly posted: number; readonly dropped: number };
    }
  | { readonly status: "existing"; readonly prUrl: string }
  | { readonly status: "refused"; readonly reason: string }
  | { readonly status: "failed"; readonly step: Step; readonly reason: string };

export const REASONS = {
  noToken: "GitHub token unavailable",
  headUnknown: "head commit unknown",
  scanFailed: "the scan failed",
  notProposed: "no pull request is proposed for this package",
  branchExists: "a Sexton branch for this package already exists, delete it to open a new pull request",
  inProgress: "another request is opening this pull request, try again in a minute",
  tooSlow: "the scan took too long, try again",
  noChange: "the change is already in package.json",
  stepFailed: "a GitHub request failed at this step",
} as const;

export interface ExecutorDeps {
  readonly ctx: ClientContext;
  readonly token: string;
  readonly allow: ReadonlySet<string>;
  readonly log: RemediationLogWriter;
  readonly clock: () => Date;
  /** Milliseconds the function has left; absent means no limit (tests). */
  readonly remainingMs?: () => number;
}

/** Below this, no branch is created: a timeout after it would leave a branch that blocks every later request. */
export const MIN_REMAINING_MS = 20_000;

/** https://github.com/{owner}/{repo}/pull/{digits}, exactly. */
export function isPullUrl(repo: Pick<RepoRef, "owner" | "repo">, url: unknown): url is string {
  if (typeof url !== "string") return false;
  const prefix = `https://github.com/${repo.owner}/${repo.repo}/pull/`;
  return url.startsWith(prefix) && /^[1-9][0-9]{0,9}$/.test(url.slice(prefix.length));
}

class StepError extends Error {
  constructor(readonly step: Step) {
    super(step);
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

async function body(response: TransportResponse, step: Step): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new StepError(step);
  }
}

export async function execute(repo: RepoRef, commit: string, entry: RemediationEntry, deps: ExecutorDeps): Promise<RemediateOutcome> {
  const intent = entry.intent;
  if (entry.status !== "proposed" || intent === undefined || !isSextonBranch(intent.branch)) return { status: "refused", reason: REASONS.notProposed };
  if (!isCommitSha(commit)) return { status: "refused", reason: REASONS.headUnknown };

  // Reads may retry on 429 and 503; writes are sent once, so nothing is created twice.
  const read = async (request: WriteRequest, step: Step): Promise<TransportResponse> => {
    try {
      const built = buildWriteRequest(repo, deps.allow, deps.token, request);
      return await requestWithRetry(deps.ctx.transport, built.url, built.request, deps.ctx.retry ?? {});
    } catch {
      throw new StepError(step);
    }
  };
  const write = async (request: WriteRequest, step: Step): Promise<TransportResponse> => {
    try {
      const built = buildWriteRequest(repo, deps.allow, deps.token, request);
      return await deps.ctx.transport(built.url, built.request);
    } catch {
      throw new StepError(step);
    }
  };

  /** Existing when a Branch collision has an open pull request, refused when it has none, null when no collision. */
  const branchCheck = async (noPullReason: string = REASONS.branchExists): Promise<RemediateOutcome | null> => {
    const refs = await read({ kind: "list-sexton-refs" }, "branch-check");
    if (refs.status !== 200) throw new StepError("branch-check");
    const list = await body(refs, "branch-check");
    if (!Array.isArray(list)) throw new StepError("branch-check");
    const wanted = intent.branch.toLowerCase();
    const collision = list
      .map((r: unknown) => (isRecord(r) && typeof r["ref"] === "string" && r["ref"].startsWith("refs/heads/") ? r["ref"].slice("refs/heads/".length) : null))
      .find((name): name is string => name !== null && name.toLowerCase() === wanted && isSextonBranch(name));
    if (collision === undefined) return null;
    const pulls = await read({ kind: "list-pulls", branch: collision }, "branch-check");
    if (pulls.status !== 200) throw new StepError("branch-check");
    const prs = await body(pulls, "branch-check");
    if (!Array.isArray(prs)) throw new StepError("branch-check");
    const open = prs.find(
      (p: unknown) => isRecord(p) && p["state"] === "open" && isRecord(p["head"]) && p["head"]["ref"] === collision && isPullUrl(repo, p["html_url"]),
    ) as Record<string, unknown> | undefined;
    return open === undefined ? { status: "refused", reason: noPullReason } : { status: "existing", prUrl: open["html_url"] as string };
  };

  let step: Step = "repository";
  try {
    const repoAnswer = await read({ kind: "get-repo" }, step);
    if (repoAnswer.status !== 200) throw new StepError(step);
    const repoBody = await body(repoAnswer, step);
    const defaultBranch = isRecord(repoBody) ? repoBody["default_branch"] : undefined;
    if (typeof defaultBranch !== "string" || !isValidBranchName(defaultBranch) || isSextonBranch(defaultBranch)) throw new StepError(step);

    step = "branch-check";
    const before = await branchCheck();
    if (before !== null) return before;

    step = "read-package-json";
    const file = await read({ kind: "get-package-json", sha: commit }, step);
    if (file.status !== 200) throw new StepError(step);
    const fileBody = await body(file, step);
    if (!isRecord(fileBody) || fileBody["encoding"] !== "base64" || typeof fileBody["content"] !== "string" || typeof fileBody["sha"] !== "string") {
      throw new StepError(step);
    }
    if (fileBody["content"].length > (MAX_MANIFEST_BYTES * 4) / 3 + 4096) throw new StepError(step);
    let original: string;
    try {
      original = new TextDecoder("utf-8", { fatal: true }).decode(Buffer.from(fileBody["content"].replace(/\n/g, ""), "base64"));
    } catch {
      throw new StepError(step);
    }
    const blobSha = fileBody["sha"];

    step = "apply-edits";
    const applied = applyPackageJsonEdits(original, intent.files);
    if (!applied.ok) throw new StepError(step);
    // Compared as values: re-serialising alone (indentation, spacing) is not a change.
    if (JSON.stringify(JSON.parse(applied.text)) === JSON.stringify(JSON.parse(original))) return { status: "refused", reason: REASONS.noChange };

    step = "create-branch";
    if (deps.remainingMs !== undefined && deps.remainingMs() < MIN_REMAINING_MS) return { status: "refused", reason: REASONS.tooSlow };
    const created = await write({ kind: "create-ref", branch: intent.branch, sha: commit }, step);
    if (created.status === 422) {
      // Another request created it first: answer as the branch check would (two requests open one pull request).
      let after: RemediateOutcome | null;
      try {
        after = await branchCheck(REASONS.inProgress);
      } catch {
        throw new StepError("create-branch");
      }
      if (after !== null) return after;
      throw new StepError(step);
    }
    if (created.status !== 201) throw new StepError(step);

    step = "put-package-json";
    const put = await write(
      { kind: "put-package-json", branch: intent.branch, message: intent.title, contentBase64: Buffer.from(applied.text, "utf8").toString("base64"), blobSha },
      step,
    );
    if (put.status !== 200 && put.status !== 201) throw new StepError(step);

    step = "open-pull-request";
    const pull = await write({ kind: "create-pull", branch: intent.branch, base: defaultBranch, title: intent.title, body: intent.body }, step);
    if (pull.status !== 201) throw new StepError(step);
    const pullBody = await body(pull, step);
    const number = isRecord(pullBody) ? pullBody["number"] : undefined;
    const prUrl = isRecord(pullBody) ? pullBody["html_url"] : undefined;
    if (typeof number !== "number" || !Number.isSafeInteger(number) || number <= 0 || !isPullUrl(repo, prUrl)) throw new StepError(step);

    // Review sites: one issue comment; a failure here leaves the pull request open.
    let reviewSites: { posted: number; dropped: number } | undefined;
    if (intent.reviewComments.length > 0) {
      step = "review-sites";
      reviewSites = { posted: 0, dropped: intent.reviewComments.length };
      try {
        const tree = await listTree(deps.ctx, repo, commit, { token: deps.token });
        if (tree.ok) {
          const comment = reviewSiteComment(repo, commit, intent.reviewComments, new Set(tree.paths));
          if (comment !== null) {
            const posted = await write({ kind: "create-comment", number, body: comment.body }, step);
            // A failed post counts every comment as dropped, so posted + dropped stays the input count (4.4).
            reviewSites = posted.status === 201 ? { posted: comment.posted, dropped: comment.dropped } : { posted: 0, dropped: intent.reviewComments.length };
          }
        }
      } catch {
        // Counted as not posted.
      }
    }

    step = "log";
    const appended = await deps.log
      .append({
      repository: repo.url,
      branch: intent.branch,
      prUrl,
      package: entry.packageName,
      kind: entry.kind,
      timestamp: deps.clock().toISOString(),
      })
      .catch(() => ({ ok: false }) as const);
    return { status: "opened", prUrl, logged: appended.ok, ...(reviewSites !== undefined ? { reviewSites } : {}) };
  } catch (error) {
    return { status: "failed", step: error instanceof StepError ? error.step : step, reason: REASONS.stepFailed };
  }
}
