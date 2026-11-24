import type { ScanResponse } from "@sexton/api";
import { NOT_PUBLISHED, sameForm, type FormView } from "./form-at.js";
export const HOUR_MS = 3_600_000;
export interface Stops {
  /** Sorted, deduplicated instants in milliseconds: the Scrubber start, every Step mark and the Scan date. */
  readonly stops: readonly number[];
  readonly startMs: number;
  readonly scanMs: number;
  readonly hasTimelines: boolean;
}
const NONE: Stops = { stops: [], startMs: 0, scanMs: 0, hasTimelines: false };
/**
 * Pure. A Step mark is a Segment `from` whose Form (state, Ghost and version) differs from the previous Segment's.
 * The Form before the first Segment is Not-published unless coveredFrom is set. Marks after the Scan date are dropped.
 */
export function stopsFor(response: ScanResponse): Stops {
  const scanMs = Date.parse(response.report.generatedAt);
  const all = response.timelines;
  if (all === undefined || !Number.isFinite(scanMs)) return NONE;
  const marks = new Set<number>();
  let earliest = Number.POSITIVE_INFINITY;
  let earliestVersioned = false;
  let any = false;
  for (const key of Object.keys(all)) {
    const timeline = all[key];
    if (timeline === undefined || timeline.segments.length === 0) continue;
    any = true;
    let previous: FormView | null = timeline.coveredFrom === null ? NOT_PUBLISHED : null;
    for (const segment of timeline.segments) {
      const at = Date.parse(segment.from);
      if (!Number.isFinite(at)) continue;
      const form: FormView =
        segment.version === undefined
          ? { state: segment.state, reason: segment.reason, ghost: segment.ghost }
          : { state: segment.state, reason: segment.reason, ghost: segment.ghost, version: segment.version };
      if (previous === null) previous = form; // coveredFrom set: the first Segment is the Form before it
      else if (!sameForm(previous, form)) {
        marks.add(at);
        previous = form;
      }
      if (at < earliest) {
        earliest = at;
        earliestVersioned = segment.version !== undefined;
      } else if (at === earliest && segment.version !== undefined) earliestVersioned = true;
    }
  }
  if (!any || !Number.isFinite(earliest)) return NONE;
  const startMs = Math.min(earliestVersioned ? earliest : earliest - HOUR_MS, scanMs);
  const set = new Set<number>([startMs, scanMs]);
  for (const m of marks) if (m > startMs && m < scanMs) set.add(m);
  const stops = [...set].sort((a, b) => a - b);
  return { stops, startMs, scanMs, hasTimelines: true };
}
