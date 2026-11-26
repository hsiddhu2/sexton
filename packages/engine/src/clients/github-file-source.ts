// GitHub File source: one repository at one commit. Spec: .kiro/specs/hosted-plans, Requirement 3.
// Lists from the tree of the commit (an authenticated api.github.com read), reads files from raw.githubusercontent.com
// at the commit without a token. The recipe runner still wraps it with capFileSource and the default Caps.

import { cacheKey } from "../cache.js";
import { requestWithRetry, type TransportRequest } from "../http.js";
import { isValidOwner, isValidRepo } from "../intake/url.js";
import { MAX_FILE_BYTES } from "../remediation/capped-source.js";
import { isSafePath } from "../remediation/safe-path.js";
import type { FileSource, RepoRef } from "../types.js";
import { isRecord, type ClientContext } from "./context.js";
import { listTree, type GithubAuth } from "./github-api.js";
import { GITHUB_RAW_HOST } from "./github-raw.js";
import { isCommitSha } from "./github-ref.js";

export const GITHUB_FILE_SOURCE = "github-file";
/** Raw reads stop this long after the first listing, so a recipe cannot push a scan near the 60 second limit. */
export const READ_BUDGET_MS = 15_000;

export interface GithubFileSourceOptions {
  readonly now?: () => number;
  readonly budgetMs?: number;
}

const REQUEST: TransportRequest = { method: "GET", headers: { Accept: "text/plain" } };

type CachedFile = { readonly kind: "found"; readonly text: string } | { readonly kind: "absent" };
const ABSENT: CachedFile = { kind: "absent" };

/** raw.githubusercontent.com/{owner}/{repo}/{sha}/{path}, each segment percent-encoded. Throws on any invalid part. */
export function githubFileUrl(repo: Pick<RepoRef, "owner" | "repo">, sha: string, path: string): string {
  if (typeof repo.owner !== "string" || typeof repo.repo !== "string" || !isValidOwner(repo.owner) || !isValidRepo(repo.repo)) {
    throw new Error("invalid reference");
  }
  if (!isCommitSha(sha)) throw new Error("invalid reference");
  if (!isSafePath(path)) throw new Error("invalid path");
  return `${GITHUB_RAW_HOST}/${repo.owner}/${repo.repo}/${sha}/${path.split("/").map(encodeURIComponent).join("/")}`;
}

export interface GithubSourceCounts {
  readonly performed: boolean;
  readonly capped: boolean;
  readonly listed: number;
}

async function download(ctx: ClientContext, url: string): Promise<CachedFile> {
  const response = await requestWithRetry(ctx.transport, url, REQUEST, ctx.retry ?? {});
  if (response.status === 404) return ABSENT;
  if (response.status !== 200 || response.text === undefined) throw new Error("raw read failed");
  const body = await response.text(MAX_FILE_BYTES);
  if (body.ok) return { kind: "found", text: body.text };
  if (body.reason === "too-large") return ABSENT;
  throw new Error("raw read failed");
}

export class GithubFileSource implements FileSource {
  readonly #ctx: ClientContext;
  readonly #repo: Pick<RepoRef, "owner" | "repo">;
  readonly #sha: string;
  readonly #auth: GithubAuth;
  readonly #now: () => number;
  readonly #budgetMs: number;
  #deadline = Number.POSITIVE_INFINITY;
  #listing: Promise<readonly string[]> | undefined;
  #listed: ReadonlySet<string> = new Set();
  #performed = false;
  #capped = false;

  constructor(ctx: ClientContext, repo: Pick<RepoRef, "owner" | "repo">, sha: string, auth: GithubAuth, options: GithubFileSourceOptions = {}) {
    this.#ctx = ctx;
    this.#repo = { owner: repo.owner, repo: repo.repo };
    this.#sha = sha;
    this.#auth = { token: auth.token };
    this.#now = options.now ?? (() => Date.now());
    this.#budgetMs = options.budgetMs ?? READ_BUDGET_MS;
  }

  /**
   * Rejects when the tree cannot be read, so the Capped source reports the files as not scanned. A capped tree answers
   * the paths of its first 20000 raw entries and counts() reports it capped (decision 8).
   */
  listFiles(): Promise<readonly string[]> {
    if (this.#listing === undefined) {
      this.#deadline = this.#now() + this.#budgetMs;
      this.#listing = this.#list();
    }
    return this.#listing.then((paths) => [...paths]);
  }

  async #list(): Promise<readonly string[]> {
    const tree = await listTree(this.#ctx, this.#repo, this.#sha, this.#auth);
    if (!tree.ok) throw new Error("tree unavailable");
    this.#capped = tree.capped;
    this.#listed = new Set(tree.paths);
    this.#performed = true;
    return tree.paths;
  }

  /** Only a listed Safe path is ever requested, and only within the read budget. Any failure answers undefined. */
  async readFile(path: string): Promise<string | undefined> {
    if (!this.#listed.has(path) || !isSafePath(path)) return undefined;
    if (this.#now() > this.#deadline) return undefined;
    try {
      const url = githubFileUrl(this.#repo, this.#sha, path);
      const key = cacheKey(GITHUB_FILE_SOURCE, `${this.#repo.owner}/${this.#repo.repo}@${this.#sha}`, path);
      const cached: unknown = await this.#ctx.cache.get<CachedFile>(key, () => download(this.#ctx, url));
      return isRecord(cached) && cached["kind"] === "found" && typeof cached["text"] === "string" ? cached["text"] : undefined;
    } catch {
      return undefined;
    }
  }

  counts(): GithubSourceCounts {
    return { performed: this.#performed, capped: this.#capped, listed: this.#listed.size };
  }
}
