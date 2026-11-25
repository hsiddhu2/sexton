// State as of a date. Spec cemetery-time, requirements 9 and 10. Pure: no I/O, no clock.

import { isRecent, maintainerDiff } from "../history.js";
import { evaluateState, type StateInputs } from "../state.js";
import type {
  Advisory,
  MaintainerChangeEvent,
  NewInstallScriptEvent,
  PackageHealth,
  ProvenanceRegressionValue,
} from "../types.js";
import type { Form, StateAsOf, TimelineFacts, TimelineVersion } from "./types.js";

export const NOT_PUBLISHED_REASON = "installed version not yet published";

export const NOT_PUBLISHED_FORM: Form = { state: null, reason: NOT_PUBLISHED_REASON, ghost: false };

/** Facts that no dated source gives before the scan date. */
const ALWAYS_UNAVAILABLE: readonly string[] = ["deprecated flag", "snapshot history"];

/** The Form of the scan: state, reason and Ghost as scored. A Ghost means one or more advisories. */
export function currentForm(health: PackageHealth): Form {
  const advisories = health.signals.advisories;
  return {
    state: health.state,
    reason: health.stateReason,
    ghost: advisories.available && advisories.value.length > 0,
  };
}

/**
 * Seen time of each version in ms: its publish time; for an undated entry the publish time of the
 * next dated entry in Version order, and when there is none the scan date.
 */
export function seenTimes(versions: readonly TimelineVersion[], scanDate: Date): number[] {
  const out: number[] = new Array<number>(versions.length);
  let next = scanDate.getTime();
  for (let i = versions.length - 1; i >= 0; i -= 1) {
    const v = versions[i] as TimelineVersion;
    const ms = v.publishedAt === null ? Number.NaN : new Date(v.publishedAt).getTime();
    if (Number.isFinite(ms)) next = ms;
    out[i] = next;
  }
  return out;
}

function iso(ms: number): string {
  return new Date(ms).toISOString();
}

interface BuiltInputs {
  readonly inputs: StateInputs;
  readonly unavailable: readonly string[];
}

function buildInputs(facts: TimelineFacts, seen: readonly number[], installedIndex: number, asOf: Date): BuiltInputs {
  const asOfMs = asOf.getTime();
  const versions = facts.versions;
  const unavailable: string[] = [...ALWAYS_UNAVAILABLE];
  const inputs: { -readonly [K in keyof StateInputs]: StateInputs[K] } = {};

  // lastPublish: the latest Seen time of a dated version not later than asOf.
  const coveredMs = facts.coveredFrom === null ? null : new Date(facts.coveredFrom).getTime();
  if (coveredMs !== null && Number.isFinite(coveredMs) && asOfMs < coveredMs) {
    unavailable.push("last publish");
  } else {
    let latest = Number.NEGATIVE_INFINITY;
    versions.forEach((v, i) => {
      const s = seen[i] as number;
      if (v.publishedAt !== null && s <= asOfMs && s > latest) latest = s;
    });
    if (Number.isFinite(latest)) inputs.lastPublish = new Date(latest);
    else unavailable.push("last publish");
  }

  // advisories: only those published by asOf.
  if (facts.advisories === null) {
    unavailable.push("advisories");
  } else {
    inputs.advisories = facts.advisories
      .filter((a) => new Date(a.publishedAt).getTime() <= asOfMs)
      .map((a): Advisory => ({ id: a.id, severity: a.severity, summary: a.summary }));
  }

  // maintainerChange: consecutive versions with lists that differ as sets, the later one Recent.
  const events: MaintainerChangeEvent[] = [];
  for (let i = 1; i < versions.length; i += 1) {
    const before = (versions[i - 1] as TimelineVersion).maintainers;
    const after = (versions[i] as TimelineVersion).maintainers;
    const s = seen[i] as number;
    if (before === null || after === null || s > asOfMs || !isRecent(new Date(s), asOf)) continue;
    const diff = maintainerDiff(before, after);
    if (diff.added.length > 0 || diff.removed.length > 0) {
      events.push({ kind: "snapshot-pair", before: [...before], after: [...after], eventTime: iso(s), recent: true });
    }
  }
  if (events.length > 0) inputs.maintainerChange = { status: "history-sufficient", events };

  // provenanceRegression: installed version without provenance, an earlier version with it.
  const installed = versions[installedIndex];
  if (installed !== undefined && installed.provenance === false && (seen[installedIndex] as number) <= asOfMs) {
    for (let i = installedIndex - 1; i >= 0; i -= 1) {
      const earlier = versions[i] as TimelineVersion;
      if (earlier.provenance === true) {
        const value: ProvenanceRegressionValue = {
          status: "regression",
          installedVersion: installed.version,
          earlierVersion: earlier.version,
          snapshotCaptureTime: iso(seen[installedIndex] as number),
        };
        inputs.provenanceRegression = value;
        break;
      }
    }
  }

  // newInstallScript: a version with the flag true after a predecessor with it false, Recent.
  const added: NewInstallScriptEvent[] = [];
  for (let j = 1; j < versions.length; j += 1) {
    const current = versions[j] as TimelineVersion;
    const previous = versions[j - 1] as TimelineVersion;
    const s = seen[j] as number;
    if (current.installScript === true && previous.installScript === false && s <= asOfMs && isRecent(new Date(s), asOf)) {
      added.push({ version: current.version, publishTime: current.publishedAt ?? iso(s) });
    }
  }
  if (added.length > 0) inputs.newInstallScript = added;

  // publisherChange and newDependency compare the installed version with versions published before it, so from the
  // installed version's Seen time on they are the scan's values. Spec new-signals, 4.2.
  if (installed !== undefined && (seen[installedIndex] as number) <= asOfMs) {
    if (facts.publisherChange !== undefined && facts.publisherChange !== null) inputs.publisherChange = facts.publisherChange;
    if (facts.newDependency !== undefined && facts.newDependency !== null) inputs.newDependency = facts.newDependency;
  }

  return { inputs, unavailable };
}

function ghostAsOf(facts: TimelineFacts, asOfMs: number): boolean {
  if (facts.advisories === null) return false;
  return facts.advisories.some((a) => new Date(a.publishedAt).getTime() <= asOfMs);
}

/**
 * The state inputs stateAsOf gives the state rules at an As-of date before the scan date, or null when it gives none
 * (at or after the scan date, or before the installed version is seen). Pure. Spec new-signals, 4.4.
 */
export function stateInputsAsOf(facts: TimelineFacts, scanDate: Date, asOf: Date): StateInputs | null {
  if (asOf.getTime() >= scanDate.getTime()) return null;
  const seen = seenTimes(facts.versions, scanDate);
  const installedIndex = facts.versions.findIndex((v) => v.version === facts.installed);
  if (installedIndex >= 0 && (seen[installedIndex] as number) > asOf.getTime()) return null;
  return buildInputs(facts, seen, installedIndex, asOf).inputs;
}

/**
 * The Form of one package at an As-of date, from dated facts. Reuses evaluateState, so the rule order,
 * the state-age rule and the all-unavailable rule are those of the scan. Deterministic.
 */
export function stateAsOf(facts: TimelineFacts, health: PackageHealth, scanDate: Date, asOf: Date): StateAsOf {
  const asOfMs = asOf.getTime();
  if (asOfMs >= scanDate.getTime()) return { form: currentForm(health), unavailable: [] };
  const seen = seenTimes(facts.versions, scanDate);
  const installedIndex = facts.versions.findIndex((v) => v.version === facts.installed);
  const installedSeen = installedIndex >= 0 ? (seen[installedIndex] as number) : null;
  if (installedSeen !== null && installedSeen > asOfMs) {
    return { form: NOT_PUBLISHED_FORM, unavailable: [] };
  }
  const { inputs, unavailable } = buildInputs(facts, seen, installedIndex, asOf);
  const { state, stateReason } = evaluateState(inputs, asOf);
  return { form: { state, reason: stateReason, ghost: ghostAsOf(facts, asOfMs) }, unavailable };
}
