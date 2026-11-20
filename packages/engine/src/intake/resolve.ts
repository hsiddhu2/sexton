// Pure range resolver for repositories without a lockfile. Spec: .kiro/specs/repo-intake, Requirement 5.
// No I/O. Range satisfaction and ordering come from semver, npm's own semantics.

import semver from "semver";

export const UNRESOLVED_VERSION = "unresolved";
export const MAX_RANGE_LENGTH = 256;

function compareCodeUnits(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** True when the range is a semver range of at most 256 characters. Dist-tags, URLs and aliases are not. */
export function isResolvableRange(range: string): boolean {
  try {
    return range.length <= MAX_RANGE_LENGTH && semver.validRange(range) !== null;
  } catch {
    return false;
  }
}

/**
 * Returns the greatest candidate version that satisfies the range, or UNRESOLVED_VERSION.
 * Prereleases are excluded unless the range names one (semver default).
 */
export function resolveUnlocked(range: string, versions: readonly string[]): string {
  try {
    if (!isResolvableRange(range)) return UNRESOLVED_VERSION;
    let best: string | null = null;
    for (const v of versions) {
      if (typeof v !== "string" || semver.valid(v) !== v || !semver.satisfies(v, range)) continue;
      if (best === null) {
        best = v;
        continue;
      }
      const order = semver.compare(v, best);
      if (order > 0 || (order === 0 && compareCodeUnits(v, best) < 0)) best = v;
    }
    return best ?? UNRESOLVED_VERSION;
  } catch {
    return UNRESOLVED_VERSION;
  }
}
