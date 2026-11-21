// Refs for GitHub reads. Spec: .kiro/specs/hosted-plans, Requirement 1. Pure.
// A Ref is "HEAD" or a Commit SHA, 40 lower-case hexadecimal characters. Anything else is an invalid reference.

export const HEAD_REF = "HEAD";

const COMMIT_SHA = /^[0-9a-f]{40}$/;

export function isCommitSha(value: unknown): value is string {
  return typeof value === "string" && COMMIT_SHA.test(value);
}

export function isValidRef(ref: unknown): ref is string {
  return ref === HEAD_REF || isCommitSha(ref);
}

/** The cache scope for a raw read: "owner/repo" at HEAD (the keys used before this spec), "owner/repo@sha" when pinned. */
export function refCacheScope(owner: string, repo: string, ref: string): string {
  return ref === HEAD_REF ? `${owner}/${repo}` : `${owner}/${repo}@${ref}`;
}
