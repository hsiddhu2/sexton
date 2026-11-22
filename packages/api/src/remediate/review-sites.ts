// The review-site comment. Spec: .kiro/specs/remediate, Requirement 4, design decision 3.
// GitHub takes review comments only on lines of the pull request diff, and a migration changes package.json only,
// so the sites are listed in one issue comment with links to the lines at the commit. Pure.

import { escapeField, isSafePath, neutralise, type RepoRef, type ReviewComment } from "@sexton/engine";

export const MAX_LISTED_SITES = 50;
export const MAX_COMMENT_BODY = 1000;
export const REVIEW_SITES_HEADING =
  "Sexton found lines this pull request does not change. Check each one before merging; each link opens the line at the scanned commit.";

export interface ReviewSiteComment {
  readonly body: string;
  readonly posted: number;
  readonly dropped: number;
}

function valid(c: ReviewComment, tree: ReadonlySet<string>): boolean {
  if (typeof c !== "object" || c === null) return false;
  if (!isSafePath(c.path) || !tree.has(c.path)) return false;
  if (typeof c.body !== "string" || c.body.length > MAX_COMMENT_BODY) return false;
  if (c.line === null) return c.path === "package.json";
  return Number.isSafeInteger(c.line) && c.line > 0;
}

export function blobLink(repo: Pick<RepoRef, "owner" | "repo">, sha: string, path: string, line: number | null): string {
  // ( and ) are encoded too, so a path cannot end the Markdown link early.
  const encoded = path
    .split("/")
    .map((segment) => encodeURIComponent(segment).replace(/\(/g, "%28").replace(/\)/g, "%29"))
    .join("/");
  return `https://github.com/${repo.owner}/${repo.repo}/blob/${sha}/${encoded}${line === null ? "" : `#L${String(line)}`}`;
}

/** Null when no comment survives validation. posted counts listed links; dropped counts invalid comments. */
export function reviewSiteComment(
  repo: Pick<RepoRef, "owner" | "repo">,
  sha: string,
  comments: readonly ReviewComment[],
  tree: ReadonlySet<string>,
): ReviewSiteComment | null {
  const kept = comments.filter((c) => valid(c, tree));
  const dropped = comments.length - kept.length;
  if (kept.length === 0) return null;
  const listed = kept.slice(0, MAX_LISTED_SITES);
  const lines = listed.map((c) => {
    const label = c.line === null ? c.path : `${c.path}:${String(c.line)}`;
    return `- [${escapeField(label)}](${blobLink(repo, sha, c.path, c.line)}): ${neutralise(c.body).replace(/[\r\n]+/g, " ")}`;
  });
  const rest = kept.length - listed.length;
  if (rest > 0) lines.push(`- and ${String(rest)} more review sites were found`);
  // posted counts every kept comment, listed or summarised, so posted + dropped is the input count.
  return { body: `${REVIEW_SITES_HEADING}\n\n${lines.join("\n")}\n`, posted: kept.length, dropped };
}
