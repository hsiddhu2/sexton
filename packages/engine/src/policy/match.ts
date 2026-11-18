// Package scope matching. Requirement 3. Pure. Reads no signals. No RegExp.

import type { Matchers } from "../types.js";
import { compileGlob, matchGlob, type GlobToken } from "./glob.js";

export type MatcherFields = Matchers;

const TOKEN_MEMO_CAP = 1000;
const tokenMemo = new Map<string, GlobToken[]>();

function tokensFor(pattern: string): GlobToken[] {
  const hit = tokenMemo.get(pattern);
  if (hit !== undefined) {
    return hit;
  }
  if (tokenMemo.size >= TOKEN_MEMO_CAP) {
    tokenMemo.clear();
  }
  const tokens = compileGlob(pattern);
  tokenMemo.set(pattern, tokens);
  return tokens;
}

/** True iff the package is selected by the include matchers (or none exist) and not excluded. Requirement 3.1. */
export function inScope(rule: MatcherFields, packageName: string): boolean {
  if (rule.excludePackageNames?.includes(packageName) === true) {
    return false;
  }
  const names = rule.matchPackageNames ?? [];
  const patterns = rule.matchPackagePatterns ?? [];
  if (names.length === 0 && patterns.length === 0) {
    return true;
  }
  return names.includes(packageName) || patterns.some((p) => matchGlob(tokensFor(p), packageName));
}
