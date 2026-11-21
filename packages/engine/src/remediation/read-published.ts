// Published versions and deprecations from a packument. Spec: .kiro/specs/remediation, Requirements 2.17, 8.6, 8.7. Pure.

import { isPublishedVersion } from "./published-version.js";

export interface PublishedVersions {
  readonly versions: readonly string[];
  readonly deprecated: ReadonlySet<string>;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value) as unknown;
  return proto === Object.prototype || proto === null;
}

/** Reads versions and deprecations by own-property access. Null when there is no versions object. Never throws. */
export function readPublished(packument: unknown): PublishedVersions | null {
  try {
    if (!isPlainObject(packument) || !Object.hasOwn(packument, "versions")) return null;
    const versions = packument["versions"];
    if (!isPlainObject(versions)) return null;
    const kept: string[] = [];
    const deprecated = new Set<string>();
    for (const key of Object.keys(versions)) {
      if (!isPublishedVersion(key)) continue;
      kept.push(key);
      const entry = versions[key];
      if (isPlainObject(entry) && Object.hasOwn(entry, "deprecated")) {
        const flag = entry["deprecated"];
        if (typeof flag === "string" && flag.length > 0) deprecated.add(key);
      }
    }
    return { versions: kept, deprecated };
  } catch {
    return null;
  }
}
