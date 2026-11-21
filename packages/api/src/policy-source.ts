// Fetches sexton.policy.yml from the repository root. Spec: .kiro/specs/infra, Requirements 4.10 to 4.13.
// Same rules as the engine's github-raw client: one URL shape, a byte limit, no auth or cookie header,
// found and 404 cached for the cache TTL, every other outcome not cached.

import { cacheKey, GITHUB_RAW_HOST, GITHUB_RAW_SOURCE, isValidOwner, isValidRepo, requestWithRetry, UpstreamError, type ClientContext, type RepoRef, type TransportRequest } from "@sexton/engine";
import { POLICY_FILE } from "./http/responses.js";

export { POLICY_FILE };
export const MAX_POLICY_BYTES = 256 * 1024;

export type PolicyText = { readonly kind: "found"; readonly text: string } | { readonly kind: "absent" } | { readonly kind: "failed" };
type CachedPolicy = { readonly kind: "found"; readonly text: string } | { readonly kind: "absent" };

const REQUEST: TransportRequest = { method: "GET", headers: { Accept: "text/plain" } };

/** Re-checks the reference. Throws for an invalid one, so no request is ever built from it. */
export function policyUrl(repo: Pick<RepoRef, "owner" | "repo">): string {
  if (typeof repo.owner !== "string" || typeof repo.repo !== "string" || !isValidOwner(repo.owner) || !isValidRepo(repo.repo)) {
    throw new Error("invalid reference");
  }
  return `${GITHUB_RAW_HOST}/${repo.owner}/${repo.repo}/HEAD/${POLICY_FILE}`;
}

async function download(ctx: ClientContext, url: string): Promise<CachedPolicy> {
  const response = await requestWithRetry(ctx.transport, url, REQUEST, ctx.retry ?? {});
  if (response.status === 404) return { kind: "absent" };
  if (!Number.isInteger(response.status) || response.status < 200 || response.status >= 300) throw new UpstreamError(url, response.status);
  if (response.text === undefined) throw new Error("transport cannot read text");
  const body = await response.text(MAX_POLICY_BYTES);
  if (!body.ok) throw new Error(body.reason);
  return { kind: "found", text: body.text };
}

/** Never rejects. */
export async function fetchPolicyText(ctx: ClientContext, repo: Pick<RepoRef, "owner" | "repo">): Promise<PolicyText> {
  let url: string;
  try {
    url = policyUrl(repo);
  } catch {
    return { kind: "failed" };
  }
  try {
    return await ctx.cache.get<CachedPolicy>(cacheKey(GITHUB_RAW_SOURCE, `${repo.owner}/${repo.repo}`, POLICY_FILE), () => download(ctx, url));
  } catch {
    return { kind: "failed" };
  }
}
