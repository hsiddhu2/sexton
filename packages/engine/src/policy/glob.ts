// Glob matcher for matchPackagePatterns. Requirements 2.18, 2.19, 3.3, 3.11. Pure, total, no RegExp.

export type GlobToken =
  | { readonly kind: "literal"; readonly ch: string }
  | { readonly kind: "star" }
  | { readonly kind: "doublestar" }
  | { readonly kind: "question" };

const VALID_GLOB_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789@/._*?-";

/** True iff the pattern is non-empty and every character is in the pattern character set. */
export function isValidGlob(pattern: string): boolean {
  if (pattern.length === 0) {
    return false;
  }
  for (const ch of pattern) {
    if (!VALID_GLOB_CHARS.includes(ch)) {
      return false;
    }
  }
  return true;
}

/** Tokenises a pattern. A run of two or more stars is one doublestar. Never throws. */
export function compileGlob(pattern: string): GlobToken[] {
  const tokens: GlobToken[] = [];
  let i = 0;
  while (i < pattern.length) {
    const ch = pattern.charAt(i);
    if (ch === "*") {
      let end = i;
      while (end < pattern.length && pattern.charAt(end) === "*") {
        end += 1;
      }
      tokens.push(end - i >= 2 ? { kind: "doublestar" } : { kind: "star" });
      i = end;
    } else if (ch === "?") {
      tokens.push({ kind: "question" });
      i += 1;
    } else {
      tokens.push({ kind: "literal", ch });
      i += 1;
    }
  }
  return tokens;
}

/** Adds p + 1 for every member p whose token is a wildcard. Steps only move forward, so one pass suffices. */
function closeOverWildcards(tokens: readonly GlobToken[], set: boolean[]): void {
  for (let p = 0; p < tokens.length; p += 1) {
    const token = tokens[p];
    if (set[p] === true && token !== undefined && (token.kind === "star" || token.kind === "doublestar")) {
      set[p + 1] = true;
    }
  }
}

/** True iff the whole name matches the tokens. State-set walk, no backtracking. */
export function matchGlob(tokens: readonly GlobToken[], name: string): boolean {
  const n = tokens.length;
  let current: boolean[] = new Array<boolean>(n + 1).fill(false);
  current[0] = true;
  closeOverWildcards(tokens, current);

  for (let i = 0; i < name.length; i += 1) {
    const c = name.charAt(i);
    const next: boolean[] = new Array<boolean>(n + 1).fill(false);
    let any = false;
    for (let p = 0; p < n; p += 1) {
      if (current[p] !== true) {
        continue;
      }
      const token = tokens[p];
      if (token === undefined) {
        continue;
      }
      if (token.kind === "literal") {
        if (token.ch === c) {
          next[p + 1] = true;
          any = true;
        }
      } else if (token.kind === "question") {
        if (c !== "/") {
          next[p + 1] = true;
          any = true;
        }
      } else if (token.kind === "star") {
        if (c !== "/") {
          next[p] = true;
          any = true;
        }
      } else {
        next[p] = true;
        any = true;
      }
    }
    if (!any) {
      return false;
    }
    closeOverWildcards(tokens, next);
    current = next;
  }
  return current[n] === true;
}
