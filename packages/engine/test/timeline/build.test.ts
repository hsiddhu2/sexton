// Spec cemetery-time, task 3.9. Property 13 and the engine half of Property 12. No network.

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { currentForm, stateAsOf } from "../../src/timeline/as-of.js";
import { buildTimeline } from "../../src/timeline/build.js";
import { TIMELINE_MAX_SEGMENTS } from "../../src/timeline/types.js";
import { arbFactsCase, arbState, DAY, facts, healthOf, iso, SCAN, segmentAt, version } from "./support.js";

const SCAN_MS = SCAN.getTime();

describe("buildTimeline", () => {
  it("Feature: cemetery-time, Property 13: Segments agree with state as of at every instant", () => {
    fc.assert(
      fc.property(arbFactsCase, arbState, fc.boolean(), fc.array(fc.integer({ min: 0, max: SCAN_MS - 1 }), { maxLength: 12 }), (c, state, ghost, randoms) => {
        const health = healthOf(state, ghost);
        const timeline = buildTimeline(c.facts, health, SCAN);
        const firstMs = new Date((timeline.segments[0] as { from: string }).from).getTime();
        const instants = new Set<number>(randoms);
        for (const v of c.facts.versions) {
          const t = new Date(v.publishedAt as string).getTime();
          instants.add(t);
          instants.add(t - 1);
          instants.add(t + 90 * DAY);
          instants.add(t + 90 * DAY + 1);
        }
        for (const a of c.facts.advisories ?? []) {
          const t = new Date(a.publishedAt).getTime();
          instants.add(t);
          instants.add(t - 1);
        }
        let mismatches = 0;
        for (const t of instants) {
          if (t < firstMs || t >= SCAN_MS) continue;
          const seg = segmentAt(timeline.segments, t);
          const form = stateAsOf(c.facts, health, SCAN, new Date(t)).form;
          if (seg === undefined || seg.state !== form.state || seg.ghost !== form.ghost) mismatches += 1;
        }
        expect(mismatches).toBe(0);
      }),
      { numRuns: 100 },
    );
  });

  it("Feature: cemetery-time, Property 12: Built timelines respect the size cap and the contract", () => {
    fc.assert(
      fc.property(arbFactsCase, arbState, fc.boolean(), (c, state, ghost) => {
        const health = healthOf(state, ghost, "r".repeat(300));
        const t = buildTimeline(c.facts, health, SCAN);
        const froms = t.segments.map((s) => new Date(s.from).getTime());
        const increasing = froms.every((f, i) => i === 0 || (froms[i - 1] as number) < f);
        const merged = t.segments.every((s, i) => i === 0 || s.state !== t.segments[i - 1]?.state || s.ghost !== t.segments[i - 1]?.ghost);
        const last = t.segments[t.segments.length - 1];
        const scan = currentForm(health);
        expect(t.segments.length >= 1 && t.segments.length <= TIMELINE_MAX_SEGMENTS).toBe(true);
        expect(increasing && merged).toBe(true);
        expect(t.segments.every((s) => s.reason.length <= 200 && !("version" in s))).toBe(true);
        expect(last?.state === scan.state && last.ghost === scan.ghost).toBe(true);
        expect(t.installed).toBe(c.facts.installed);
        expect(t.coveredFrom).toBe(c.facts.coveredFrom);
      }),
      { numRuns: 100 },
    );
  });

  it("caps 70 distinct possession windows at 64 Segments and sets coveredFrom to the oldest kept from", () => {
    const start = Date.UTC(1985, 0, 1);
    const versions = Array.from({ length: 140 }, (_, i) => version(`1.0.${i}`, start + i * 100 * DAY, { installScript: i % 2 === 1 }));
    // The installed version is the oldest, so every later install script window counts.
    const f = facts(versions, "1.0.0");
    const scan = new Date(start + 141 * 100 * DAY);
    const t = buildTimeline(f, healthOf("Alive", false), scan);
    expect(t.segments).toHaveLength(TIMELINE_MAX_SEGMENTS);
    expect(t.coveredFrom).toBe((t.segments[0] as { from: string }).from);
    expect(t.segments.some((s) => s.state === "Possessed")).toBe(true);
    expect(t.segments[t.segments.length - 1]?.state).toBe("Alive");
  });

  it("writes no version key on any Segment", () => {
    const f = facts([version("1.0.0", Date.UTC(2020, 0, 1)), version("1.1.0", Date.UTC(2026, 5, 1), { installScript: true })], "1.1.0");
    const t = buildTimeline(f, healthOf("Possessed", false), SCAN);
    expect(t.segments.length).toBeGreaterThan(1);
    for (const s of t.segments) expect(Object.keys(s)).not.toContain("version");
  });

  it("gives one scan Segment when there are no facts", () => {
    const t = buildTimeline(facts([], "1.0.0", { advisories: null }), healthOf("Restless", true), SCAN);
    expect(t.segments).toEqual([{ from: iso(SCAN_MS), state: "Restless", reason: "scan reason", ghost: true }]);
  });

  it("follows a 29 February threshold that makes staleness non-monotone", () => {
    const scan = new Date(Date.UTC(2028, 5, 1));
    const f = facts([version("1.0.0", Date.UTC(2026, 2, 1, 6))], "1.0.0");
    const t = buildTimeline(f, healthOf("Restless", false), scan);
    const at = (ms: number) => segmentAt(t.segments, ms)?.state;
    expect(at(Date.UTC(2028, 1, 29, 12))).toBe("Restless");
    expect(at(Date.UTC(2028, 2, 1))).toBe("Alive");
    expect(at(Date.UTC(2028, 2, 1, 7))).toBe("Restless");
  });
});
