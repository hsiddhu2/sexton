// Pure history rules. Version order and the Recent window. Requirements 6.6, 7.2, 8.2, 8.7, 8.8. No I/O here.

import semver from "semver";
import { RECENT_WINDOW_MS, type Snapshot } from "./snapshot.js";
import type {
  MaintainerChangeEvent,
  MaintainerChangeValue,
  NewInstallScriptEvent,
  ProvenanceRegressionValue,
  ProvenanceValue,
  Signal,
} from "./types.js";

/** A version present in the packument with a parseable publish time. */
export interface PublishedVersion {
  readonly version: string;
  readonly publishTime: string; // ISO, as in the packument time map
  readonly publishMs: number; // parsed once, compared numerically
}

/** Publish time ascending. Equal publish time: the greater version string is later. */
export function compareVersionOrder(a: PublishedVersion, b: PublishedVersion): number {
  if (a.publishMs !== b.publishMs) {
    return a.publishMs < b.publishMs ? -1 : 1;
  }
  if (a.version === b.version) {
    return 0;
  }
  return a.version < b.version ? -1 : 1;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const NON_VERSION_TIME_KEYS: ReadonlySet<string> = new Set(["created", "modified"]);

/**
 * Versions present in `versions` with a time-map entry that parses as a date, in Version order.
 * `created` and `modified` are ignored. Malformed input gives an empty list.
 */
export function publishedVersions(fullPackument: unknown): PublishedVersion[] {
  if (!isRecord(fullPackument)) {
    return [];
  }
  const versions = fullPackument["versions"];
  const time = fullPackument["time"];
  if (!isRecord(versions) || !isRecord(time)) {
    return [];
  }
  const result: PublishedVersion[] = [];
  for (const version of Object.keys(versions)) {
    if (NON_VERSION_TIME_KEYS.has(version) || !Object.hasOwn(time, version)) {
      continue;
    }
    const publishTime = time[version];
    if (typeof publishTime !== "string") {
      continue;
    }
    const publishMs = new Date(publishTime).getTime();
    if (!Number.isFinite(publishMs)) {
      continue;
    }
    result.push({ version, publishTime, publishMs });
  }
  return result.sort(compareVersionOrder);
}

function isSemver(version: string): boolean {
  try {
    return semver.parse(version)?.raw === version;
  } catch {
    return false;
  }
}

/**
 * The Earlier version of the installed one: among Published versions that are valid semver, published strictly before
 * the installed version and lower than it, the greatest. Null when there is none or the installed version is not a
 * semver Published version. Spec new-signals, Glossary and design.md Decisions 1.
 */
export function earlierVersion(fullPackument: unknown, installed: string): PublishedVersion | null {
  if (!isSemver(installed)) return null;
  const published = publishedVersions(fullPackument);
  const current = published.find((v) => v.version === installed);
  if (current === undefined) return null;
  let best: PublishedVersion | null = null;
  for (const candidate of published) {
    if (candidate.publishMs >= current.publishMs || !isSemver(candidate.version)) continue;
    if (!semver.lt(candidate.version, installed)) continue;
    if (best === null || semver.gt(candidate.version, best.version)) best = candidate;
  }
  return best;
}

/** Recent (90 days): instant is not later than reference and at most 90 days before it. Numeric, inclusive. */
export function isRecent(instant: Date, reference: Date): boolean {
  const instantMs = instant.getTime();
  const referenceMs = reference.getTime();
  if (!Number.isFinite(instantMs) || !Number.isFinite(referenceMs)) {
    return false;
  }
  return instantMs <= referenceMs && referenceMs - instantMs <= RECENT_WINDOW_MS;
}

export interface MaintainerDiff {
  readonly added: readonly string[];
  readonly removed: readonly string[];
}

/** Names added and removed between two maintainer lists, compared as sets. Both results are deduplicated. */
export function maintainerDiff(before: readonly string[], after: readonly string[]): MaintainerDiff {
  const beforeSet = new Set(before);
  const afterSet = new Set(after);
  return {
    added: [...afterSet].filter((name) => !beforeSet.has(name)),
    removed: [...beforeSet].filter((name) => !afterSet.has(name)),
  };
}

function differAsSets(a: readonly string[], b: readonly string[]): boolean {
  const diff = maintainerDiff(a, b);
  return diff.added.length > 0 || diff.removed.length > 0;
}

function timeKey(iso: string): number {
  const ms = new Date(iso).getTime();
  return Number.isFinite(ms) ? ms : Number.POSITIVE_INFINITY;
}

function byTimeThenIndex(a: { ms: number; index: number }, b: { ms: number; index: number }): number {
  if (a.ms === b.ms) {
    return a.index - b.index;
  }
  return a.ms < b.ms ? -1 : 1;
}

/**
 * Maintainer change events from History plus the current maintainers list. Requirements 6.1 to 6.8.
 * `live` is null when the maintainers signal is unavailable, which skips the live comparison.
 */
export function maintainerChangeValue(
  history: readonly Snapshot[],
  live: { readonly maintainers: readonly string[]; readonly fetchedAt: string } | null,
  reference: Date,
): MaintainerChangeValue {
  if (history.length === 0) {
    return { status: "history-insufficient", events: [] };
  }
  const ordered = history
    .map((snapshot, index) => ({ snapshot, index, ms: timeKey(snapshot.captureTime) }))
    .sort(byTimeThenIndex)
    .map((entry) => entry.snapshot);

  const events: MaintainerChangeEvent[] = [];
  for (let i = 1; i < ordered.length; i += 1) {
    const earlier = ordered[i - 1];
    const later = ordered[i];
    if (earlier === undefined || later === undefined) {
      continue;
    }
    if (differAsSets(earlier.maintainers, later.maintainers)) {
      events.push({
        kind: "snapshot-pair",
        before: [...earlier.maintainers],
        after: [...later.maintainers],
        eventTime: later.captureTime,
        recent: isRecent(new Date(later.captureTime), reference),
      });
    }
  }
  const latest = ordered[ordered.length - 1];
  if (live !== null && latest !== undefined && differAsSets(latest.maintainers, live.maintainers)) {
    events.push({
      kind: "live",
      before: [...latest.maintainers],
      after: [...live.maintainers],
      eventTime: live.fetchedAt,
      recent: isRecent(new Date(latest.captureTime), reference),
    });
  }
  const sorted = events
    .map((event, index) => ({ event, index, ms: timeKey(event.eventTime) }))
    .sort(byTimeThenIndex)
    .map((entry) => entry.event);
  return { status: "history-sufficient", events: sorted };
}

export interface ProvenanceRegressionInput {
  readonly installedVersion: string;
  readonly provenance: Signal<ProvenanceValue>;
  readonly fullPackument: unknown;
  readonly historyRead:
    | { readonly ok: true; readonly history: readonly Snapshot[] }
    | { readonly ok: false; readonly reason: string };
}

export type ProvenanceRegressionOutcome =
  | { readonly kind: "unavailable"; readonly reason: string }
  | { readonly kind: "value"; readonly value: ProvenanceRegressionValue };

function insufficient(reason: string): ProvenanceRegressionOutcome {
  return { kind: "value", value: { status: "history-insufficient", reason } };
}

/**
 * Provenance regression from the installed version's provenance, the packument and the most recent Snapshot.
 * Precedence: unavailable, then history-insufficient, then regression or no-regression. Requirements 7.1 to 7.8.
 */
export function evaluateProvenanceRegression(input: ProvenanceRegressionInput): ProvenanceRegressionOutcome {
  const { provenance, historyRead } = input;
  if (!provenance.available) {
    return { kind: "unavailable", reason: "provenance unavailable" };
  }
  if (!historyRead.ok) {
    return { kind: "unavailable", reason: historyRead.reason };
  }
  const latest = historyRead.history
    .map((snapshot, index) => ({ snapshot, index, ms: timeKey(snapshot.captureTime) }))
    .sort(byTimeThenIndex)
    .map((entry) => entry.snapshot)
    .at(-1);
  if (latest === undefined) {
    return insufficient("history is empty");
  }
  const installed = publishedVersions(input.fullPackument).find((v) => v.version === input.installedVersion);
  if (installed === undefined) {
    return insufficient("installed version is absent from the packument or its publish time does not parse");
  }

  let latestEarlierWithProvenance: PublishedVersion | null = null;
  let anyEarlierKnown = false;
  for (const entry of latest.versions) {
    if (entry.provenance === null) {
      continue;
    }
    const publishMs = new Date(entry.publishTime).getTime();
    if (!Number.isFinite(publishMs)) {
      continue;
    }
    const candidate: PublishedVersion = { version: entry.version, publishTime: entry.publishTime, publishMs };
    if (compareVersionOrder(candidate, installed) >= 0) {
      continue;
    }
    anyEarlierKnown = true;
    if (
      entry.provenance &&
      (latestEarlierWithProvenance === null || compareVersionOrder(candidate, latestEarlierWithProvenance) > 0)
    ) {
      latestEarlierWithProvenance = candidate;
    }
  }
  if (!anyEarlierKnown) {
    return insufficient("no earlier version has a recorded provenance presence in the most recent snapshot");
  }
  if (!provenance.value.present && latestEarlierWithProvenance !== null) {
    return {
      kind: "value",
      value: {
        status: "regression",
        installedVersion: installed.version,
        earlierVersion: latestEarlierWithProvenance.version,
        snapshotCaptureTime: latest.captureTime,
      },
    };
  }
  return { kind: "value", value: { status: "no-regression", snapshotCaptureTime: latest.captureTime } };
}

function hasInstallScriptAt(abbreviatedVersions: Record<string, unknown> | null, version: string): boolean {
  if (abbreviatedVersions === null || !Object.hasOwn(abbreviatedVersions, version)) {
    return false;
  }
  const entry = abbreviatedVersions[version];
  return isRecord(entry) && entry["hasInstallScript"] === true;
}

/**
 * Install script events: every Published version that is Recent, has hasInstallScript true, and whose
 * predecessor in Version order has it false or absent. The first Published version never emits.
 * Reads packument data only. Malformed input gives an empty list. Requirements 8.1 to 8.4, 8.6 to 8.8.
 */
export function newInstallScriptEvents(
  fullPackument: unknown,
  abbreviatedPackument: unknown,
  reference: Date,
): NewInstallScriptEvent[] {
  if (!isRecord(abbreviatedPackument)) {
    return [];
  }
  const rawVersions = abbreviatedPackument["versions"];
  const abbreviatedVersions = isRecord(rawVersions) ? rawVersions : null;
  const published = publishedVersions(fullPackument);
  const events: NewInstallScriptEvent[] = [];
  for (let i = 1; i < published.length; i += 1) {
    const previous = published[i - 1];
    const current = published[i];
    if (previous === undefined || current === undefined) {
      continue;
    }
    if (
      isRecent(new Date(current.publishMs), reference) &&
      hasInstallScriptAt(abbreviatedVersions, current.version) &&
      !hasInstallScriptAt(abbreviatedVersions, previous.version)
    ) {
      events.push({ version: current.version, publishTime: current.publishTime });
    }
  }
  return events;
}
