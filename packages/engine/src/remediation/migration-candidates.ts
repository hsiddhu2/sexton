// Candidate lists for the node-sass to sass recipe. Spec: .kiro/specs/migration-node-sass, Requirements 3.2 to 3.4. Pure.

import semver from "semver";
import type { IntakePackage } from "../types.js";
import { isUsableRange, MAX_CANDIDATES } from "./candidates.js";
import { isPublishedVersion } from "./published-version.js";

/** The lowest sass-loader release that loads sass without an implementation option. Design, Research findings 1. */
export const SASS_LOADER_MINIMUM = "7.2.0";

function compareCodeUnits(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function byVersion(a: string, b: string): number {
  return semver.compare(a, b) || compareCodeUnits(a, b);
}

/** Published versions with no prerelease part, repeats removed, ascending. */
function releases(published: readonly string[]): string[] {
  const seen = new Set<string>();
  for (const v of published) if (isPublishedVersion(v) && semver.prerelease(v) === null) seen.add(v);
  return [...seen].sort(byVersion);
}

/** sass: the newest 20 releases, newest first. Never throws. */
export function sassCandidates(published: readonly string[]): string[] {
  try {
    return releases(published).reverse().slice(0, MAX_CANDIDATES);
  } catch {
    return [];
  }
}

/** sass-loader: the lowest 20 releases at or above the minimum and above effective, lowest first. Never throws. */
export function sassLoaderCandidates(published: readonly string[], effective: string): string[] {
  try {
    return releases(published)
      .filter((v) => semver.gte(v, SASS_LOADER_MINIMUM) && semver.gt(v, effective))
      .slice(0, MAX_CANDIDATES);
  } catch {
    return [];
  }
}

/** The installed version when valid, else the lowest version of a usable declared range, else null. */
export function effectiveVersion(pkg: IntakePackage): string | null {
  try {
    if (semver.valid(pkg.installedVersion) === pkg.installedVersion) return pkg.installedVersion;
    if (!isUsableRange(pkg.declaredRange)) return null;
    return semver.minVersion(pkg.declaredRange)?.version ?? null;
  } catch {
    return null;
  }
}

export type SassLoaderNeed =
  | { readonly kind: "absent" }
  | { readonly kind: "compatible"; readonly pkg: IntakePackage }
  | { readonly kind: "unknown"; readonly pkg: IntakePackage }
  | { readonly kind: "raise"; readonly pkg: IntakePackage; readonly effective: string };

export function sassLoaderNeed(packages: readonly IntakePackage[]): SassLoaderNeed {
  const pkg = packages.find((p) => p.name === "sass-loader");
  if (pkg === undefined) return { kind: "absent" };
  const effective = effectiveVersion(pkg);
  if (effective === null) return { kind: "unknown", pkg };
  return semver.gte(effective, SASS_LOADER_MINIMUM) ? { kind: "compatible", pkg } : { kind: "raise", pkg, effective };
}
