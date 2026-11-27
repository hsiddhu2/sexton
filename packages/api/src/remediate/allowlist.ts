// The remediate allowlist. Spec: .kiro/specs/remediate, glossary "Allowlist", decision 1.
// Lower-cased exact owner/repo names. Empty or missing allows nothing. Pure.

import { isValidOwner, isValidRepo, type RepoRef } from "@sexton/engine";

export const ALLOWLIST_VARIABLE = "REMEDIATE_ALLOWLIST";

/** Comma-separated owner/repo names; anything that is not that shape is dropped. */
export function parseAllowlist(raw: string | undefined): ReadonlySet<string> {
  const out = new Set<string>();
  for (const part of (raw ?? "").split(",")) {
    const name = part.trim();
    const [owner, repo, extra] = name.split("/");
    if (owner === undefined || repo === undefined || extra !== undefined) continue;
    if (!isValidOwner(owner) || !isValidRepo(repo)) continue;
    out.add(name.toLowerCase());
  }
  return out;
}

export function isAllowed(allow: ReadonlySet<string>, repo: Pick<RepoRef, "owner" | "repo">): boolean {
  return typeof repo.owner === "string" && typeof repo.repo === "string" && allow.has(`${repo.owner}/${repo.repo}`.toLowerCase());
}
