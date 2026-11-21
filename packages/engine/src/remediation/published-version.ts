// Published version test. Spec: .kiro/specs/remediation, Requirements 2.2, 2.3, 8.4. Pure.

import semver from "semver";

export const MAX_VERSION_LENGTH = 64;

/** True iff v is a string, valid semver, equal to its own normalised form, and at most 64 characters. */
export function isPublishedVersion(v: unknown): v is string {
  try {
    return typeof v === "string" && v.length <= MAX_VERSION_LENGTH && semver.valid(v) === v;
  } catch {
    return false;
  }
}
