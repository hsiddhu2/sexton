// Builds the compact Timeline of one package. Spec cemetery-time, requirement 8.7 to 8.10, 8.15. Pure.

import { RECENT_WINDOW_MS } from "../snapshot.js";
import { monthsBefore, STALE_AFTER_MONTHS } from "../state.js";
import type { PackageHealth } from "../types.js";
import { currentForm, seenTimes, stateAsOf } from "./as-of.js";
import {
  TIMELINE_MAX_SEGMENTS,
  type Form,
  type PackageTimeline,
  type TimelineFacts,
  type TimelineSegment,
} from "./types.js";

const DAY_MS = 24 * 60 * 60 * 1000;
export const MAX_REASON_LENGTH = 200;

/** Adds calendar months in UTC, as monthsBefore subtracts them. */
function addMonthsUtc(ms: number, months: number): number {
  return monthsBefore(new Date(ms), -months).getTime();
}

function clip(reason: string): string {
  if (reason.length <= MAX_REASON_LENGTH) return reason;
  // Cut by code point so a surrogate pair is never split, and stay within 200 UTF-16 units.
  let out = "";
  for (const ch of reason) {
    if (out.length + ch.length > MAX_REASON_LENGTH) break;
    out += ch;
  }
  return out;
}

function sameForm(a: TimelineSegment, b: { state: Form["state"]; ghost: boolean; version?: string | undefined }): boolean {
  return a.state === b.state && a.ghost === b.ghost && a.version === b.version;
}

function candidateInstants(facts: TimelineFacts, scanDate: Date): { first: number | null; list: number[] } {
  const scanMs = scanDate.getTime();
  const seen = seenTimes(facts.versions, scanDate);
  const set = new Set<number>();
  let first = Number.POSITIVE_INFINITY;
  const add = (ms: number): void => {
    if (Number.isFinite(ms)) set.add(ms);
  };
  facts.versions.forEach((v, i) => {
    const s = seen[i] as number;
    if (s < first) first = s;
    add(s);
    add(s + RECENT_WINDOW_MS + 1);
    if (v.publishedAt === null) return;
    // The last publish is this version until the next dated version is seen.
    let nextSeen = Number.POSITIVE_INFINITY;
    for (let j = i + 1; j < facts.versions.length; j += 1) {
      if ((facts.versions[j] as { publishedAt: string | null }).publishedAt !== null) {
        nextSeen = seen[j] as number;
        break;
      }
    }
    const stale = addMonthsUtc(s, STALE_AFTER_MONTHS);
    const timeOfDay = ((s % DAY_MS) + DAY_MS) % DAY_MS;
    const midnight = stale - (((stale % DAY_MS) + DAY_MS) % DAY_MS);
    const keep = (c: number): void => {
      if (c < nextSeen) add(c);
    };
    keep(stale + 1);
    for (let d = -3; d <= 3; d += 1) {
      const day = midnight + d * DAY_MS;
      keep(day);
      keep(day + timeOfDay);
      keep(day + timeOfDay + 1);
    }
  });
  for (const a of facts.advisories ?? []) {
    const ms = new Date(a.publishedAt).getTime();
    if (Number.isFinite(ms)) {
      if (ms < first) first = ms;
      add(ms);
    }
  }
  if (facts.coveredFrom !== null) add(new Date(facts.coveredFrom).getTime());
  if (!Number.isFinite(first)) return { first: null, list: [] };
  add(first);
  const list = [...set].filter((c) => c >= first && c < scanMs).sort((a, b) => a - b);
  return { first, list };
}

/**
 * The Timeline of one package: Segments in time order with strictly increasing `from`, at most 64.
 * The last Segment carries the state, reason and Ghost of the scan. Writes no `version`.
 */
export function buildTimeline(facts: TimelineFacts, health: PackageHealth, scanDate: Date): PackageTimeline {
  const segments: TimelineSegment[] = [];
  const { list } = candidateInstants(facts, scanDate);
  for (const c of list) {
    const form = stateAsOf(facts, health, scanDate, new Date(c)).form;
    const last = segments[segments.length - 1];
    if (last !== undefined && sameForm(last, { state: form.state, ghost: form.ghost })) continue;
    segments.push({ from: new Date(c).toISOString(), state: form.state, reason: clip(form.reason), ghost: form.ghost });
  }

  const scanForm = currentForm(health);
  const last = segments[segments.length - 1];
  if (last === undefined || !sameForm(last, { state: scanForm.state, ghost: scanForm.ghost })) {
    segments.push({ from: scanDate.toISOString(), state: scanForm.state, reason: clip(scanForm.reason), ghost: scanForm.ghost });
  } else {
    segments[segments.length - 1] = { ...last, reason: clip(scanForm.reason) };
  }

  let coveredFrom = facts.coveredFrom;
  let kept = segments;
  if (segments.length > TIMELINE_MAX_SEGMENTS) {
    kept = segments.slice(segments.length - TIMELINE_MAX_SEGMENTS);
    coveredFrom = (kept[0] as TimelineSegment).from;
  }
  return { installed: facts.installed, coveredFrom, segments: kept };
}
