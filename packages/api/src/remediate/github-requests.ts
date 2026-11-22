// The one builder for every GitHub write-side request. Spec: .kiro/specs/remediate, Requirement 2, handoff decision 4.
// Knows exactly eight shapes, each to https://api.github.com with the token in Authorization, no redirect followed.
// Throws on any invalid part, so no request is ever built from one. No DELETE exists here.

import {
  BRANCH_PREFIX,
  GITHUB_API_ORIGIN,
  GITHUB_API_VERSION,
  isCommitSha,
  isToken,
  isValidBranchName,
  isValidOwner,
  isValidRepo,
  MAX_BRANCH_LENGTH,
  type RepoRef,
  type TransportRequest,
} from "@sexton/engine";
import { isAllowed } from "./allowlist.js";

export type WriteRequest =
  | { readonly kind: "get-repo" }
  | { readonly kind: "list-sexton-refs" }
  | { readonly kind: "list-pulls"; readonly branch: string }
  | { readonly kind: "get-package-json"; readonly sha: string }
  | { readonly kind: "create-ref"; readonly branch: string; readonly sha: string }
  | { readonly kind: "put-package-json"; readonly branch: string; readonly message: string; readonly contentBase64: string; readonly blobSha: string }
  | { readonly kind: "create-pull"; readonly branch: string; readonly base: string; readonly title: string; readonly body: string }
  | { readonly kind: "create-comment"; readonly number: number; readonly body: string };

export interface BuiltRequest {
  readonly url: string;
  readonly request: TransportRequest;
}

const JSON_ACCEPT = "application/vnd.github+json";
const BLOB_SHA = /^[0-9a-f]{40}$/;
const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;

export function isSextonBranch(branch: unknown): branch is string {
  return typeof branch === "string" && branch.startsWith(BRANCH_PREFIX) && branch.length <= MAX_BRANCH_LENGTH && isValidBranchName(branch);
}

function need(condition: boolean): void {
  if (!condition) throw new Error("invalid request part");
}

function text(value: unknown, max: number): string {
  need(typeof value === "string" && value.length <= max);
  return value as string;
}

export function buildWriteRequest(repo: Pick<RepoRef, "owner" | "repo">, allow: ReadonlySet<string>, token: string, request: WriteRequest): BuiltRequest {
  need(typeof repo.owner === "string" && typeof repo.repo === "string" && isValidOwner(repo.owner) && isValidRepo(repo.repo));
  need(isAllowed(allow, repo));
  need(isToken(token));
  const base = `${GITHUB_API_ORIGIN}/repos/${repo.owner}/${repo.repo}`;
  const headers = (json: boolean): Record<string, string> => ({
    Authorization: `Bearer ${token}`,
    Accept: JSON_ACCEPT,
    "X-GitHub-Api-Version": GITHUB_API_VERSION,
    ...(json ? { "Content-Type": "application/json" } : {}),
  });
  const get = (url: string): BuiltRequest => ({ url, request: { method: "GET", headers: headers(false), redirect: "manual" } });
  const send = (method: "POST" | "PUT", url: string, body: Record<string, unknown>): BuiltRequest => ({
    url,
    request: { method, headers: headers(true), body: JSON.stringify(body), redirect: "manual" },
  });
  switch (request.kind) {
    case "get-repo":
      return get(base);
    case "list-sexton-refs":
      return get(`${base}/git/matching-refs/heads/sexton/`);
    case "list-pulls":
      need(isSextonBranch(request.branch));
      return get(`${base}/pulls?head=${encodeURIComponent(`${repo.owner}:${request.branch}`)}&state=all&per_page=10`);
    case "get-package-json":
      need(isCommitSha(request.sha));
      return get(`${base}/contents/package.json?ref=${request.sha}`);
    case "create-ref":
      need(isSextonBranch(request.branch) && isCommitSha(request.sha));
      return send("POST", `${base}/git/refs`, { ref: `refs/heads/${request.branch}`, sha: request.sha });
    case "put-package-json":
      need(isSextonBranch(request.branch) && BLOB_SHA.test(request.blobSha) && BASE64.test(request.contentBase64));
      return send("PUT", `${base}/contents/package.json`, {
        message: text(request.message, 200),
        content: request.contentBase64,
        sha: request.blobSha,
        branch: request.branch,
      });
    case "create-pull":
      need(isSextonBranch(request.branch) && isValidBranchName(request.base) && !isSextonBranch(request.base));
      return send("POST", `${base}/pulls`, {
        title: text(request.title, 200),
        head: request.branch,
        base: request.base,
        body: text(request.body, 65536),
        draft: false,
      });
    case "create-comment":
      need(Number.isSafeInteger(request.number) && request.number > 0);
      return send("POST", `${base}/issues/${String(request.number)}/comments`, { body: text(request.body, 65536) });
  }
}
