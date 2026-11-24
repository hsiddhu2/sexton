// Timeline facts from the documents scoring already holds. Spec cemetery-time, requirement 8.1 to 8.6. Pure.

import { compareVersionOrder, type PublishedVersion } from "../history.js";
import type { Advisory, ProvenanceValue, Signal } from "../types.js";
import {
  TIMELINE_MAX_ADVISORIES,
  TIMELINE_MAX_MAINTAINERS,
  TIMELINE_MAX_VERSIONS,
  type TimelineAdvisory,
  type TimelineFacts,
  type TimelineVersion,
} from "./types.js";

export interface TimelineFactsInput {
  /** Full packument document, or null when it was unavailable. */
  readonly fullPackument: unknown;
  /** Abbreviated packument document, or null when it was unavailable. */
  readonly abbreviatedPackument: unknown;
  readonly installed: string;
  /** Provenance of the installed version, or null when not read. */
  readonly provenance: Signal<ProvenanceValue> | null;
  readonly advisories: Signal<readonly Advisory[]> | null;
  /** Published time of each advisory id, ISO, or null when unknown. */
  readonly advisoryDates: ReadonlyMap<string, string | null>;
  /** Versions published after this instant are ignored. */
  readonly scanDate: Date;
}

const NON_VERSION_TIME_KEYS: ReadonlySet<string> = new Set(["created", "modified"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function maintainerNames(entry: unknown): readonly string[] | null {
  if (!isRecord(entry)) return null;
  const raw = entry["maintainers"];
  const names: string[] = [];
  const add = (item: unknown): void => {
    if (!isRecord(item)) return;
    const name = item["name"];
    if (typeof name === "string" && name.length > 0 && !names.includes(name)) names.push(name);
  };
  if (Array.isArray(raw)) {
    for (const item of raw as unknown[]) add(item);
  } else if (Object.hasOwn(entry, "_npmUser") && isRecord(entry["_npmUser"])) {
    add(entry["_npmUser"]);
  }
  // Unknown, not a partial list: a truncated or empty list would give a false change.
  return names.length === 0 || names.length > TIMELINE_MAX_MAINTAINERS ? null : names;
}

function datedVersions(full: unknown, scanMs: number): PublishedVersion[] {
  if (!isRecord(full) || !isRecord(full["time"])) return [];
  const time = full["time"];
  const out: PublishedVersion[] = [];
  for (const version of Object.keys(time)) {
    if (NON_VERSION_TIME_KEYS.has(version)) continue;
    const raw = time[version];
    if (typeof raw !== "string") continue;
    const publishMs = new Date(raw).getTime();
    if (!Number.isFinite(publishMs) || publishMs > scanMs) continue;
    out.push({ version, publishTime: new Date(publishMs).toISOString(), publishMs });
  }
  return out.sort(compareVersionOrder);
}

function advisoryFacts(input: TimelineFactsInput): readonly TimelineAdvisory[] | null {
  const signal = input.advisories;
  if (signal === null || !signal.available) return null;
  if (signal.value.length > TIMELINE_MAX_ADVISORIES) return null;
  const out: TimelineAdvisory[] = [];
  for (const advisory of signal.value) {
    const raw = input.advisoryDates.get(advisory.id);
    const ms = raw === null || raw === undefined ? Number.NaN : new Date(raw).getTime();
    if (!Number.isFinite(ms)) return null;
    out.push({ id: advisory.id, severity: advisory.severity, summary: advisory.summary, publishedAt: new Date(ms).toISOString() });
  }
  return out;
}

/** Builds Timeline facts. Versions come from the packument `time` map. Never throws on malformed input. */
export function timelineFacts(input: TimelineFactsInput): TimelineFacts {
  const scanMs = input.scanDate.getTime();
  const dated = datedVersions(input.fullPackument, scanMs);
  const installedDated = dated.find((v) => v.version === input.installed);
  const others = dated.filter((v) => v.version !== input.installed);

  const dropped = others.length > TIMELINE_MAX_VERSIONS - 1;
  const keptOthers = dropped ? others.slice(others.length - (TIMELINE_MAX_VERSIONS - 1)) : others;
  const oldestKept = keptOthers[0];
  const coveredFrom = dropped && oldestKept !== undefined ? oldestKept.publishTime : null;

  const ordered: PublishedVersion[] = [...keptOthers];
  if (installedDated !== undefined) ordered.push(installedDated);
  ordered.sort(compareVersionOrder);

  const fullVersions = isRecord(input.fullPackument) && isRecord(input.fullPackument["versions"]) ? input.fullPackument["versions"] : null;
  const abbreviatedVersions =
    isRecord(input.abbreviatedPackument) && isRecord(input.abbreviatedPackument["versions"])
      ? input.abbreviatedPackument["versions"]
      : null;

  const build = (version: string, publishedAt: string | null): TimelineVersion => {
    let installScript: boolean | null = null;
    if (abbreviatedVersions !== null && Object.hasOwn(abbreviatedVersions, version)) {
      const entry = abbreviatedVersions[version];
      installScript = isRecord(entry) && entry["hasInstallScript"] === true;
    }
    const provenance =
      version === input.installed && input.provenance !== null && input.provenance.available ? input.provenance.value.present : null;
    const maintainers =
      fullVersions !== null && Object.hasOwn(fullVersions, version) ? maintainerNames(fullVersions[version]) : null;
    return { version, publishedAt, installScript, provenance, maintainers };
  };

  const versions = ordered.map((v) => build(v.version, v.publishTime));
  if (installedDated === undefined) versions.push(build(input.installed, null));

  return { installed: input.installed, versions, coveredFrom, advisories: advisoryFacts(input) };
}
