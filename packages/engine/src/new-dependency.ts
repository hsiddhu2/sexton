// New dependency. Spec new-signals, Requirement 2. Pure: documents in, values out. No I/O here.

import { earlierVersion, publishedVersions } from "./history.js";
import { isValidPackageName } from "./intake/names.js";
import { isResolvableRange, MAX_RANGE_LENGTH, resolveUnlocked, UNRESOLVED_VERSION } from "./intake/resolve.js";
import { cleanReason } from "./signal.js";
import type { NewDependencyEntry, NewDependencyValue } from "./types.js";

/** At most this many New dependency names are read in detail. Requirement 2.3. */
export const NEW_DEPENDENCY_CAP = 5;
/** The Fresh window: 7 times 24 hours. */
export const FRESH_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export const INVALID_NAME_REASON = "invalid package name";
export const NOT_SEMVER_REASON = "range is not a semver range";
export const NO_MATCH_REASON = "no version satisfies the range at the parent publish time";

/** A document read: the document, or why it could not be read. */
export type DocRead = { readonly ok: true; readonly doc: unknown } | { readonly ok: false; readonly reason: string };

export interface AddedDependency {
  readonly name: string;
  /** At most 256 characters. */
  readonly range: string;
  /** The declared range was longer than 256 characters and was cut: never resolved. */
  readonly tooLong?: true;
}

export type DependencyDiff =
  | { readonly status: "no-earlier-version"; readonly installedVersion: string }
  | {
      readonly status: "compared";
      readonly installedVersion: string;
      readonly earlierVersion: string;
      readonly installedPublishTime: string;
      readonly installedPublishMs: number;
      /** Every new name, ascending by code unit. */
      readonly added: readonly AddedDependency[];
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The Dependencies map of one version: own members whose value is a string. Anything else is empty. */
export function dependenciesOf(fullPackument: unknown, version: string): Map<string, string> {
  const out = new Map<string, string>();
  if (!isRecord(fullPackument)) return out;
  const versions = fullPackument["versions"];
  if (!isRecord(versions) || !Object.hasOwn(versions, version)) return out;
  const entry = versions[version];
  if (!isRecord(entry) || !Object.hasOwn(entry, "dependencies")) return out;
  const deps = entry["dependencies"];
  if (!isRecord(deps)) return out;
  for (const name of Object.keys(deps)) {
    const range = deps[name];
    if (typeof range === "string") out.set(name, range);
  }
  return out;
}

function byCodeUnit(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** New dependency names of the installed version against its Earlier version. Never throws. Requirement 2.1, 2.2. */
export function dependencyDiff(fullPackument: unknown, installed: string): DependencyDiff {
  const current = publishedVersions(fullPackument).find((v) => v.version === installed);
  const earlier = earlierVersion(fullPackument, installed);
  if (current === undefined || earlier === null) return { status: "no-earlier-version", installedVersion: installed };
  const before = dependenciesOf(fullPackument, earlier.version);
  const after = dependenciesOf(fullPackument, installed);
  const added = [...after.keys()]
    .filter((name) => !before.has(name))
    .sort(byCodeUnit)
    .map((name): AddedDependency => {
      const range = after.get(name) ?? "";
      return range.length > MAX_RANGE_LENGTH ? { name, range: range.slice(0, MAX_RANGE_LENGTH), tooLong: true } : { name, range };
    });
  return {
    status: "compared",
    installedVersion: installed,
    earlierVersion: earlier.version,
    installedPublishTime: new Date(current.publishMs).toISOString(),
    installedPublishMs: current.publishMs,
    added,
  };
}

/** The names read in detail: the first five in order. Requirement 2.3. */
export function detailNames(diff: DependencyDiff): readonly AddedDependency[] {
  return diff.status === "compared" ? diff.added.slice(0, NEW_DEPENDENCY_CAP) : [];
}

/** Published not later than the parent and at most 7 days before it, inclusive. */
export function isFresh(entryPublishMs: number, parentPublishMs: number): boolean {
  if (!Number.isFinite(entryPublishMs) || !Number.isFinite(parentPublishMs)) return false;
  const age = parentPublishMs - entryPublishMs;
  return age >= 0 && age <= FRESH_WINDOW_MS;
}

function installScriptOf(abbreviated: unknown, version: string): boolean | null {
  if (!isRecord(abbreviated)) return null;
  const versions = abbreviated["versions"];
  if (!isRecord(versions) || !Object.hasOwn(versions, version)) return null;
  const entry = versions[version];
  if (!isRecord(entry)) return null;
  return entry["hasInstallScript"] === true;
}

/** True when the dependency can be resolved at all: a valid name and a semver range that was not cut. */
export function isResolvable(dep: AddedDependency): boolean {
  return isValidPackageName(dep.name) && dep.tooLong !== true && isResolvableRange(dep.range);
}

function entry(dep: AddedDependency, fields: Partial<NewDependencyEntry>, reason?: string): NewDependencyEntry {
  return {
    name: dep.name,
    range: dep.range,
    resolvedVersion: null,
    resolvedPublishTime: null,
    installScript: null,
    fresh: false,
    ...fields,
    ...(reason === undefined ? {} : { reason: cleanReason(reason) }),
  };
}

/**
 * One detailed entry: the version the range resolved to at the parent publish time, its publish time, freshness and
 * Install script flag. Never throws. Requirement 2.4, 2.6, 2.7, 2.8.
 */
export function resolveDependency(dep: AddedDependency, parentPublishMs: number, full: DocRead, abbreviated: DocRead): NewDependencyEntry {
  if (!isValidPackageName(dep.name)) return entry(dep, {}, INVALID_NAME_REASON);
  if (dep.tooLong === true || !isResolvableRange(dep.range)) return entry(dep, {}, NOT_SEMVER_REASON);
  if (!full.ok) return entry(dep, {}, `packument unavailable: ${full.reason}`);
  const candidates = publishedVersions(full.doc).filter((v) => v.publishMs <= parentPublishMs);
  const resolved = resolveUnlocked(dep.range, candidates.map((v) => v.version));
  const hit = resolved === UNRESOLVED_VERSION ? undefined : candidates.find((v) => v.version === resolved);
  if (hit === undefined) return entry(dep, {}, NO_MATCH_REASON);
  const fields: Partial<NewDependencyEntry> = {
    resolvedVersion: hit.version,
    resolvedPublishTime: new Date(hit.publishMs).toISOString(),
    fresh: isFresh(hit.publishMs, parentPublishMs),
  };
  if (!abbreviated.ok) return entry(dep, fields, `abbreviated packument unavailable: ${abbreviated.reason}`);
  return entry(dep, { ...fields, installScript: installScriptOf(abbreviated.doc, hit.version) });
}

/** The newDependency value from the diff and the detailed entries, in the order of the diff. Requirement 2.2, 2.3. */
export function newDependencyValue(diff: DependencyDiff, details: readonly NewDependencyEntry[]): NewDependencyValue {
  if (diff.status === "no-earlier-version") return { status: "no-earlier-version", installedVersion: diff.installedVersion };
  return {
    status: "compared",
    installedVersion: diff.installedVersion,
    earlierVersion: diff.earlierVersion,
    installedPublishTime: diff.installedPublishTime,
    addedCount: diff.added.length,
    capped: diff.added.length > NEW_DEPENDENCY_CAP,
    added: details.slice(0, NEW_DEPENDENCY_CAP),
  };
}

/** The first entry that makes the New dependency rule match, by name order, or undefined. Requirement 3.2. */
export function possessingDependency(value: NewDependencyValue): NewDependencyEntry | undefined {
  return value.status === "compared" ? value.added.find((d) => d.installScript === true || d.fresh) : undefined;
}
