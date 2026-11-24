import type { PackageTimeline, ScanResponse, State, TimelineSegment } from "@sexton/api";
import fc from "fast-check";
import { cheapScan } from "../arbitraries.js";
export const T0 = Date.parse("2020-01-01T00:00:00.000Z");
export const DAY = 86_400_000;
const STATES_OR_NULL: readonly (State | null)[] = [null, "Alive", "Restless", "Haunted", "Dead", "Possessed"];
export interface ArbTimelineOptions {
  readonly versioned?: boolean | "mixed";
}
/** A timeline with strictly increasing `from` values, offsets in days from T0. */
export function arbTimeline(options: ArbTimelineOptions = {}): fc.Arbitrary<PackageTimeline> {
  const mode = options.versioned ?? false;
  const arbSegment = fc.record({
    gap: fc.integer({ min: 1, max: 400 }),
    state: fc.constantFrom(...STATES_OR_NULL),
    ghost: fc.boolean(),
    version: fc.constantFrom("1.0.0", "1.1.0", "2.0.0"),
    hasVersion: fc.boolean(),
  });
  return fc
    .record({ segs: fc.array(arbSegment, { minLength: 1, maxLength: 12 }), covered: fc.boolean() })
    .map(({ segs, covered }): PackageTimeline => {
      let at = T0;
      const segments: TimelineSegment[] = segs.map((s) => {
        at += s.gap * DAY;
        const withVersion = mode === true || (mode === "mixed" && s.hasVersion);
        const base = { from: new Date(at).toISOString(), state: s.state, reason: `r-${String(s.gap)}`, ghost: s.state === null ? false : s.ghost };
        return withVersion ? { ...base, version: s.version } : base;
      });
      const first = segments[0];
      return { installed: "1.0.0", coveredFrom: covered && first !== undefined ? first.from : null, segments };
    });
}
/** A response with the given timelines, one package per entry, generated one day after the last Segment. */
export function responseWith(timelines: readonly PackageTimeline[]): ScanResponse {
  const base = cheapScan(timelines.length);
  let last = T0;
  for (const t of timelines) for (const s of t.segments) last = Math.max(last, Date.parse(s.from));
  const record: Record<string, PackageTimeline> = {};
  base.report.packages.forEach((p, i) => {
    const t = timelines[i];
    if (t !== undefined) record[p.name] = t;
  });
  return { ...base, report: { ...base.report, generatedAt: new Date(last + DAY).toISOString() }, timelines: record };
}
