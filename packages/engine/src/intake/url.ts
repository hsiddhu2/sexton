// GitHub repository URL parser. Spec: .kiro/specs/repo-intake, Requirement 1. Pure, linear time.

import type { ParseRepoUrlResult, RepoRef } from "../types.js";

const PREFIX = "https://github.com/";
const GIT_SUFFIX = ".git";

/** Fixed text. Holds no part of the input. Requirement 7.11. */
export const INVALID_URL_MESSAGE =
  "The URL is not a public GitHub repository URL of the form https://github.com/{owner}/{repo}.";

const REJECTED: ParseRepoUrlResult = { ok: false, code: "invalid-url", message: INVALID_URL_MESSAGE };

function isSegmentChar(c: number): boolean {
  return (
    (c >= 0x30 && c <= 0x39) ||
    (c >= 0x41 && c <= 0x5a) ||
    (c >= 0x61 && c <= 0x7a) ||
    c === 0x2d ||
    c === 0x2e ||
    c === 0x5f
  );
}

function isValidSegment(s: string): boolean {
  if (s.length === 0 || s.startsWith(".") || s.includes("..")) return false;
  for (let i = 0; i < s.length; i += 1) {
    if (!isSegmentChar(s.charCodeAt(i))) return false;
  }
  return true;
}

/** Requirement 1.5: /orgs/{owner} is a GitHub path, not a repository. "orgs" is reserved, so no account has that name. */
export function isValidOwner(owner: string): boolean {
  return isValidSegment(owner) && owner !== "orgs";
}

export function isValidRepo(repo: string): boolean {
  return isValidSegment(repo) && !repo.endsWith(GIT_SUFFIX);
}

export function formatRepoUrl(reference: Pick<RepoRef, "owner" | "repo">): string {
  return `${PREFIX}${reference.owner}/${reference.repo}`;
}

export function parseRepoUrl(input: string): ParseRepoUrlResult {
  if (!input.startsWith(PREFIX)) return REJECTED;
  if (/[\s\p{Cc}]/u.test(input)) return REJECTED;
  const rest = input.slice(PREFIX.length);
  if (rest.includes("?") || rest.includes("#") || rest.includes("\\")) return REJECTED;

  const firstSlash = rest.indexOf("/");
  if (firstSlash === -1) return REJECTED;
  const owner = rest.slice(0, firstSlash);
  const afterOwner = rest.slice(firstSlash + 1);

  const secondSlash = afterOwner.indexOf("/");
  const repoSegment = secondSlash === -1 ? afterOwner : afterOwner.slice(0, secondSlash);
  const tail = secondSlash === -1 ? "" : afterOwner.slice(secondSlash);

  const tailOk = tail === "" || tail === "/" || (tail.startsWith("/tree/") && tail.length > "/tree/".length);
  if (!tailOk) return REJECTED;

  const repo = repoSegment.endsWith(GIT_SUFFIX) ? repoSegment.slice(0, -GIT_SUFFIX.length) : repoSegment;
  if (!isValidOwner(owner) || !isValidRepo(repo)) return REJECTED;

  return { ok: true, repo: { owner, repo, url: formatRepoUrl({ owner, repo }) } };
}
