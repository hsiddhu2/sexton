// The two GitHub API reads: the head commit and the tree of a commit. Spec: .kiro/specs/hosted-plans, Requirement 2.
// The token is an argument of these two functions only, never part of ClientContext, so no other client can send it.
// It goes in the Authorization header to https://api.github.com and nowhere else, and no redirect is followed.
// Never rejects: every outcome is a value. No failure value carries the token or a response body.

import { cacheKey } from "../cache.js";
import { requestWithRetry, UpstreamError, type TransportRequest, type TransportResponse } from "../http.js";
import { isValidOwner, isValidRepo } from "../intake/url.js";
import type { RepoRef } from "../types.js";
import { isRecord, type ClientContext } from "./context.js";
import { isCommitSha } from "./github-ref.js";

export const GITHUB_API_ORIGIN = "https://api.github.com";
/** The version the REST pages name (https://docs.github.com/en/rest/about-the-rest-api/api-versions). */
export const GITHUB_API_VERSION = "2026-03-10";
export const GITHUB_TREE_SOURCE = "github-tree";
/** A GitHub personal access token. Any other value is never sent (spec hosted-plans, glossary "Token"). */
export const TOKEN_PATTERN = /^(ghp_|github_pat_)[A-Za-z0-9_]{20,255}$/;
/** Raw entries walked at most; the 20001st caps the listing. */
export const MAX_TREE_ENTRIES = 20000;
/** GitHub's recursive tree limit is 7 MB; the body is read under this cap before parsing. */
export const MAX_TREE_BYTES = 8 * 1024 * 1024;

const SHA_ACCEPT = "application/vnd.github.sha";
const JSON_ACCEPT = "application/vnd.github+json";
const SHA_BODY_LIMIT = 64;

export interface GithubAuth {
  readonly token: string;
}

export type ApiFailureReason = "invalid-input" | "http-status" | "network" | "invalid-body";

export interface ApiFailure {
  readonly ok: false;
  readonly reason: ApiFailureReason;
  /** The HTTP status when there was one. */
  readonly status: number | null;
}

export type HeadCommit = { readonly ok: true; readonly sha: string } | ApiFailure;

export interface TreeListing {
  readonly paths: readonly string[];
  /** True when GitHub truncated the tree or it held more than MAX_TREE_ENTRIES raw entries. */
  readonly capped: boolean;
}

export type TreeOutcome = ({ readonly ok: true } & TreeListing) | ApiFailure;

export function isToken(value: unknown): value is string {
  return typeof value === "string" && TOKEN_PATTERN.test(value);
}

function checkRepo(repo: Pick<RepoRef, "owner" | "repo">): void {
  if (typeof repo.owner !== "string" || typeof repo.repo !== "string" || !isValidOwner(repo.owner) || !isValidRepo(repo.repo)) {
    throw new Error("invalid reference");
  }
}

/** GET /repos/{owner}/{repo}/commits/HEAD. Throws on an invalid owner or repo. */
export function headCommitUrl(repo: Pick<RepoRef, "owner" | "repo">): string {
  checkRepo(repo);
  return `${GITHUB_API_ORIGIN}/repos/${repo.owner}/${repo.repo}/commits/HEAD`;
}

/** GET /repos/{owner}/{repo}/git/trees/{sha}?recursive=1. Throws on an invalid owner, repo or Commit SHA. */
export function treeUrl(repo: Pick<RepoRef, "owner" | "repo">, sha: string): string {
  checkRepo(repo);
  if (!isCommitSha(sha)) throw new Error("invalid reference");
  return `${GITHUB_API_ORIGIN}/repos/${repo.owner}/${repo.repo}/git/trees/${sha}?recursive=1`;
}

function apiRequest(token: string, accept: string): TransportRequest {
  return {
    method: "GET",
    headers: { Authorization: `Bearer ${token}`, Accept: accept, "X-GitHub-Api-Version": GITHUB_API_VERSION },
    redirect: "manual",
  };
}

const fail = (reason: ApiFailureReason, status: number | null = null): ApiFailure => ({ ok: false, reason, status });

class BodyError extends Error {}

function failureFrom(error: unknown): ApiFailure {
  if (error instanceof UpstreamError) return fail("http-status", error.status);
  if (error instanceof BodyError) return fail("invalid-body", 200);
  return fail("network");
}

async function send(ctx: ClientContext, url: string, request: TransportRequest): Promise<TransportResponse> {
  const response = await requestWithRetry(ctx.transport, url, request, ctx.retry ?? {});
  if (response.status !== 200) throw new UpstreamError(url, response.status);
  return response;
}

/** The head commit SHA of the default branch. Not cached. Never rejects. */
export async function resolveHeadCommit(ctx: ClientContext, repo: Pick<RepoRef, "owner" | "repo">, auth: GithubAuth): Promise<HeadCommit> {
  let url: string;
  try {
    if (!isToken(auth.token)) return fail("invalid-input");
    url = headCommitUrl(repo);
  } catch {
    return fail("invalid-input");
  }
  try {
    const response = await send(ctx, url, apiRequest(auth.token, SHA_ACCEPT));
    if (response.text === undefined) return fail("invalid-body", 200);
    const body = await response.text(SHA_BODY_LIMIT);
    return body.ok && isCommitSha(body.text) ? { ok: true, sha: body.text } : fail("invalid-body", 200);
  } catch (error) {
    return failureFrom(error);
  }
}

/** Blob paths of the first MAX_TREE_ENTRIES raw entries, capped when GitHub truncated or more entries exist. */
export function readTree(body: unknown): TreeListing {
  if (!isRecord(body) || !Array.isArray(body["tree"])) throw new BodyError("invalid tree");
  const entries = body["tree"] as unknown[];
  const paths: string[] = [];
  const limit = Math.min(entries.length, MAX_TREE_ENTRIES);
  for (let i = 0; i < limit; i++) {
    const entry = entries[i];
    if (isRecord(entry) && entry["type"] === "blob" && typeof entry["path"] === "string") paths.push(entry["path"]);
  }
  return { paths, capped: body["truncated"] === true || entries.length > MAX_TREE_ENTRIES };
}

/** The tree of a commit, cached under the repository and the SHA. Failures are never cached. Never rejects. */
export async function listTree(ctx: ClientContext, repo: Pick<RepoRef, "owner" | "repo">, sha: string, auth: GithubAuth): Promise<TreeOutcome> {
  let url: string;
  try {
    if (!isToken(auth.token)) return fail("invalid-input");
    url = treeUrl(repo, sha);
  } catch {
    return fail("invalid-input");
  }
  try {
    const key = cacheKey(GITHUB_TREE_SOURCE, `${repo.owner}/${repo.repo}`, sha);
    const listing = await ctx.cache.get<TreeListing>(key, async () => {
      const response = await send(ctx, url, apiRequest(auth.token, JSON_ACCEPT));
      if (response.text === undefined) throw new BodyError("invalid tree");
      const text = await response.text(MAX_TREE_BYTES);
      if (!text.ok) throw new BodyError("invalid tree");
      let body: unknown;
      try {
        body = JSON.parse(text.text) as unknown;
      } catch {
        throw new BodyError("invalid tree");
      }
      return readTree(body);
    });
    // A cached value comes back from the store: re-check its shape.
    const cached: unknown = listing;
    if (!isRecord(cached) || !Array.isArray(cached["paths"]) || typeof cached["capped"] !== "boolean") return fail("invalid-body", 200);
    const paths = (cached["paths"] as unknown[]).filter((p): p is string => typeof p === "string");
    return { ok: true, paths, capped: cached["capped"] };
  } catch (error) {
    return failureFrom(error);
  }
}
