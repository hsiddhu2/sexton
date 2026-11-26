// The Scan field's input (spec clean-site, design C2, requirements 1.11 and 1.12): owner/name or a github.com
// repository link, normalised to https://github.com/owner/name. Untrusted input: only GitHub's character rules pass.
// Pure.

export type RepoInput = { readonly ok: true; readonly url: string; readonly label: string } | { readonly ok: false };

/** Longer input is refused before any pattern runs. */
export const MAX_REPO_INPUT = 300;

/** Letters and digits, single inner hyphens, 1 to 39 characters. */
const OWNER = /^[A-Za-z0-9](?:-?[A-Za-z0-9])*$/;
const MAX_OWNER = 39;
/** Letters, digits, `-`, `_` and `.`, 1 to 100 characters, not `.` or `..`. */
const NAME = /^[A-Za-z0-9._-]+$/;
const MAX_NAME = 100;
/** An optional https:// or http://, an optional www., then github.com/ (host in any case). */
const LINK_PREFIX = /^(?:https?:\/\/)?(?:www\.)?github\.com\//i;
const GIT_SUFFIX = /\.git$/i;

const REFUSED: RepoInput = { ok: false };

function validOwner(owner: string): boolean {
  return owner.length <= MAX_OWNER && OWNER.test(owner);
}

function validName(name: string): boolean {
  // A name ending in .git would lose it on the next pass, so it is refused to keep the output a fixed point.
  return name.length <= MAX_NAME && NAME.test(name) && name !== "." && name !== ".." && !GIT_SUFFIX.test(name);
}

/** Pure. The canonical repository URL and its owner/name label, or `{ ok: false }`. */
export function normaliseRepo(input: string): RepoInput {
  if (input.length > MAX_REPO_INPUT) return REFUSED;
  let rest = input.trim();
  const prefix = LINK_PREFIX.exec(rest);
  if (prefix !== null) rest = rest.slice(prefix[0].length);
  if (rest.endsWith("/")) rest = rest.slice(0, -1);
  rest = rest.replace(GIT_SUFFIX, "");
  const parts = rest.split("/");
  if (parts.length !== 2) return REFUSED;
  const [owner, name] = parts as [string, string];
  if (!validOwner(owner) || !validName(name)) return REFUSED;
  return { ok: true, url: `https://github.com/${owner}/${name}`, label: `${owner}/${name}` };
}
