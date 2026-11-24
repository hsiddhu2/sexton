// Shared builders for the timeline tests. No I/O.

import fc from "fast-check";
import { available } from "../../src/signal.js";
import { STATE_ORDER, SEVERITIES, type PackageHealth, type State } from "../../src/types.js";
import type { TimelineAdvisory, TimelineFacts, TimelineSegment, TimelineVersion } from "../../src/timeline/types.js";

export const DAY = 24 * 60 * 60 * 1000;
export const BASE = Date.UTC(2016, 0, 1);
export const SCAN = new Date("2026-11-23T12:00:00.000Z");
const FETCHED = new Date("2026-11-23T12:00:00.000Z");

export function iso(ms: number): string {
  return new Date(ms).toISOString();
}

export function healthOf(state: State, ghost: boolean, reason = "scan reason"): PackageHealth {
  const advisories = ghost ? [{ id: "GHSA-test", severity: "Low" as const, summary: "s" }] : [];
  return {
    name: "pkg",
    installedVersion: "1.0.0",
    state,
    stateReason: reason,
    signals: { advisories: available(advisories, "https://api.osv.dev/v1/querybatch", FETCHED) },
    missingSignals: [],
  } as unknown as PackageHealth;
}

export function version(v: string, publishedMs: number | null, extra: Partial<TimelineVersion> = {}): TimelineVersion {
  return {
    version: v,
    publishedAt: publishedMs === null ? null : iso(publishedMs),
    installScript: null,
    provenance: null,
    maintainers: null,
    ...extra,
  };
}

export function facts(versions: readonly TimelineVersion[], installed: string, extra: Partial<TimelineFacts> = {}): TimelineFacts {
  return { installed, versions, coveredFrom: null, advisories: [], ...extra };
}

export function advisory(id: string, severity: TimelineAdvisory["severity"], publishedMs: number): TimelineAdvisory {
  return { id, severity, summary: "s", publishedAt: iso(publishedMs) };
}

const arbMs = fc.record({ day: fc.integer({ min: 0, max: 3900 }), tod: fc.integer({ min: 0, max: DAY - 1 }) }).map((r) => BASE + r.day * DAY + r.tod);

const arbVersion = fc.record({
  installScript: fc.constantFrom(true, false, null),
  provenance: fc.constantFrom(true, false, null),
  maintainers: fc.constantFrom<readonly string[] | null>(null, ["a"], ["a", "b"], ["c"]),
});

const arbAdvisory = fc.record({
  severity: fc.constantFrom(...SEVERITIES),
  at: arbMs,
});

export interface FactsCase {
  readonly facts: TimelineFacts;
  readonly installedMs: number;
}

/** Small random facts: up to 8 dated versions, up to 3 advisories, optional coveredFrom. */
export const arbFactsCase: fc.Arbitrary<FactsCase> = fc
  .record({
    times: fc.array(arbMs, { minLength: 1, maxLength: 8 }),
    flags: fc.array(arbVersion, { minLength: 8, maxLength: 8 }),
    installedPick: fc.nat(),
    coveredPick: fc.option(fc.nat(), { nil: null }),
    advisories: fc.option(fc.array(arbAdvisory, { maxLength: 3 }), { nil: null }),
  })
  .map((r) => {
    const times = [...r.times].sort((a, b) => a - b);
    const versions = times.map((t, i) => version(`1.0.${i}`, t, r.flags[i]));
    const installedIndex = r.installedPick % versions.length;
    const coveredFrom = r.coveredPick === null ? null : iso(times[r.coveredPick % times.length] as number);
    const advisories = r.advisories === null ? null : r.advisories.map((a, i) => advisory(`A-${i}`, a.severity, a.at));
    return {
      facts: facts(versions, `1.0.${installedIndex}`, { coveredFrom, advisories }),
      installedMs: times[installedIndex] as number,
    };
  });

export const arbState: fc.Arbitrary<State> = fc.constantFrom(...STATE_ORDER);

/** The Segment in force at instant t, or undefined before the first Segment. */
export function segmentAt(segments: readonly TimelineSegment[], t: number): TimelineSegment | undefined {
  let found: TimelineSegment | undefined;
  for (const s of segments) {
    if (new Date(s.from).getTime() <= t) found = s;
    else break;
  }
  return found;
}
