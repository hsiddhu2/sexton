// Candidate order. Spec: .kiro/specs/remediation, Requirements 2.2 to 2.5, 2.12, 2.14, HP decisions 1 to 3. Pure.

import semver from "semver";
import { isResolvableRange } from "../intake/resolve.js";
import { isPublishedVersion } from "./published-version.js";

export const MAX_CANDIDATES = 20;

export interface Candidate {
  readonly version: string;
  readonly inRange: boolean;
}

function compareCodeUnits(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function byVersion(a: string, b: string): number {
  return semver.compare(a, b) || compareCodeUnits(a, b);
}

function safeSatisfies(version: string, range: string): boolean {
  try {
    return semver.satisfies(version, range);
  } catch {
    return false;
  }
}

/**
 * True when any comparator of the range has a prerelease part, such as ^2.0.0-beta.1. The "<X.Y.Z-0" upper bound
 * that semver adds when it expands ^ and ~ is not a prerelease comparator.
 */
export function hasPrereleaseComparator(range: string): boolean {
  try {
    return new semver.Range(range).set.some((comparators) =>
      comparators.some((c) => {
        const pre = c.semver.prerelease;
        return pre.length > 0 && !(c.operator === "<" && pre.length === 1 && pre[0] === 0);
      }),
    );
  } catch {
    return false;
  }
}

/** True when the Declared range is present and usable. Requirement 2.12. */
export function isUsableRange(declaredRange: string | undefined): declaredRange is string {
  return typeof declaredRange === "string" && isResolvableRange(declaredRange);
}

/**
 * Candidates in Candidate order, cut to the first 20: in-range by ascending version, then out-of-range.
 * Only versions above the installed one. Prereleases only when the range has a prerelease comparator and
 * the prerelease is in range. Total: never throws.
 */
export function orderCandidates(installedVersion: string, declaredRange: string | undefined, published: readonly string[]): readonly Candidate[] {
  try {
    if (typeof installedVersion !== "string" || semver.valid(installedVersion) !== installedVersion) return [];
    const usable = isUsableRange(declaredRange);
    const prereleaseRange = usable && hasPrereleaseComparator(declaredRange);
    const inRange = (v: string): boolean => usable && safeSatisfies(v, declaredRange);
    const seen = new Set<unknown>();
    const inside: string[] = [];
    const outside: string[] = [];
    for (const v of published) {
      if (seen.has(v) || !isPublishedVersion(v)) continue;
      seen.add(v);
      if (!semver.gt(v, installedVersion)) continue;
      const within = inRange(v);
      if (semver.prerelease(v) !== null && !(prereleaseRange && within)) continue;
      (within ? inside : outside).push(v);
    }
    inside.sort(byVersion);
    outside.sort(byVersion);
    return [...inside.map((version) => ({ version, inRange: true })), ...outside.map((version) => ({ version, inRange: false }))].slice(
      0,
      MAX_CANDIDATES,
    );
  } catch {
    return [];
  }
}
