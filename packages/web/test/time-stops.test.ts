import type { PackageTimeline, TimelineSegment } from "@sexton/api";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { formAt, NOT_PUBLISHED, sameForm, timelineOf } from "../src/time/form-at.js";
import { HOUR_MS, stopsFor } from "../src/time/stops.js";
import { arbTimeline, DAY, responseWith, T0 } from "./support/timelines.js";
const SCAN_FORM = { state: "Alive", reason: "scan", ghost: false } as const;
const seg = (from: number, state: TimelineSegment["state"], extra: Partial<TimelineSegment> = {}): TimelineSegment => ({
  from: new Date(from).toISOString(),
  state,
  reason: "r",
  ghost: false,
  ...extra,
});
describe("Feature: cemetery-time, Property 15: Step marks are exactly the dates where some Form changes", () => {
  it("is sound and complete for any set of timelines", () => {
    fc.assert(
      fc.property(
        fc.array(arbTimeline({ versioned: "mixed" }), { minLength: 1, maxLength: 5 }),
        fc.array(fc.double({ min: 0, max: 1, noNaN: true }), { minLength: 5, maxLength: 5 }),
        (timelines, unit) => {
          const response = responseWith(timelines);
          const info = stopsFor(response);
          expect(info.hasTimelines).toBe(true);
          const names = response.report.packages.map((p) => p.name);
          const forms = (ms: number) => names.map((n) => formAt(timelineOf(response, n), ms, SCAN_FORM));
          // Sorted and without duplicates.
          expect([...info.stops]).toEqual([...new Set(info.stops)].sort((a, b) => a - b));
          // Soundness: a Step mark differs from the Form one millisecond earlier for some package.
          for (const stop of info.stops) {
            if (stop === info.startMs || stop === info.scanMs) continue;
            const now = forms(stop);
            const before = forms(stop - 1);
            expect(now.some((f, i) => !sameForm(f, before[i] ?? f)), String(stop)).toBe(true);
          }
          // Completeness: every instant from the start to the scan date has the Form of the latest Stop not later than it.
          for (const u of unit) {
            const t = Math.floor(info.startMs + u * (info.scanMs - info.startMs));
            let latest = info.stops[0] ?? t;
            for (const s of info.stops) if (s <= t) latest = s;
            const a = forms(t);
            const b = forms(latest);
            a.forEach((f, i) => {
              expect(sameForm(f, b[i] ?? f)).toBe(true);
            });
          }
        },
      ),
      { numRuns: 100 },
    );
  });
  it("computes the Stops for 300 packages with 64 Segments each in at most 200 ms", () => {
    const segments: TimelineSegment[] = Array.from({ length: 64 }, (_, i) => seg(T0 + (i + 1) * DAY, i % 2 === 0 ? "Alive" : "Dead"));
    const timeline: PackageTimeline = { installed: "1.0.0", coveredFrom: null, segments };
    const response = responseWith(Array.from({ length: 300 }, () => timeline));
    const began = performance.now();
    const info = stopsFor(response);
    expect(performance.now() - began).toBeLessThanOrEqual(200);
    expect(info.stops.length).toBe(66);
  });
  it("starts one hour before the earliest Segment, or at it when that Segment carries a version", () => {
    const plain = responseWith([{ installed: "1", coveredFrom: null, segments: [seg(T0 + DAY, "Alive"), seg(T0 + 3 * DAY, "Dead")] }]);
    expect(stopsFor(plain).startMs).toBe(T0 + DAY - HOUR_MS);
    const versioned = responseWith([
      { installed: "1", coveredFrom: null, segments: [seg(T0 + DAY, "Alive", { version: "1.0.0" }), seg(T0 + 3 * DAY, "Dead", { version: "1.0.0" })] },
    ]);
    const v = stopsFor(versioned);
    expect(v.startMs).toBe(T0 + DAY);
    expect(v.stops[0]).toBe(T0 + DAY);
  });
  it("makes a change of version alone a Step mark", () => {
    const response = responseWith([
      {
        installed: "2",
        coveredFrom: null,
        segments: [seg(T0 + DAY, "Alive", { version: "1" }), seg(T0 + 2 * DAY, "Alive", { version: "2" }), seg(T0 + 3 * DAY, "Alive", { version: "2" })],
      },
    ]);
    expect(stopsFor(response).stops).toContain(T0 + 2 * DAY);
    expect(stopsFor(response).stops).not.toContain(T0 + 3 * DAY);
  });
  it("has no Stops without a Timeline", () => {
    const response = responseWith([]);
    expect(stopsFor(response).hasTimelines).toBe(false);
  });
});
describe("formAt", () => {
  const timeline: PackageTimeline = { installed: "1", coveredFrom: null, segments: [seg(1000, null), seg(2000, "Alive", { version: "1.2.3" }), seg(3000, "Dead")] };
  it("returns the scan Form without a timeline, Not-published before the first Segment, and the last Segment at or before the instant", () => {
    expect(formAt(undefined, 5, SCAN_FORM)).toEqual(SCAN_FORM);
    expect(formAt(timeline, 999, SCAN_FORM)).toBe(NOT_PUBLISHED);
    expect(formAt(timeline, 1000, SCAN_FORM).state).toBeNull();
    expect(formAt(timeline, 2500, SCAN_FORM)).toEqual({ state: "Alive", reason: "r", ghost: false, version: "1.2.3" });
    expect(formAt(timeline, 9999, SCAN_FORM).state).toBe("Dead");
  });
  it("returns the first Segment before it when coveredFrom is set", () => {
    expect(formAt({ ...timeline, coveredFrom: new Date(1000).toISOString() }, 1, SCAN_FORM).state).toBeNull();
    const covered: PackageTimeline = { installed: "1", coveredFrom: new Date(1000).toISOString(), segments: [seg(1000, "Dead")] };
    expect(formAt(covered, 1, SCAN_FORM).state).toBe("Dead");
  });
  it("does not read Object.prototype for a package named __proto__", () => {
    const response = responseWith([]);
    expect(timelineOf(response, "__proto__")).toBeUndefined();
    expect(timelineOf(response, "constructor")).toBeUndefined();
  });
});
