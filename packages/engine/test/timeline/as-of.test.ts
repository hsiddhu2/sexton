// Spec cemetery-time, tasks 3.7 and 3.8. Properties 6 to 11 and the examples. No network.

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { evaluateState, healthRank } from "../../src/state.js";
import { currentForm, seenTimes, stateAsOf } from "../../src/timeline/as-of.js";
import type { TimelineFacts } from "../../src/timeline/types.js";
import type { Advisory } from "../../src/types.js";
import { advisory, arbFactsCase, arbState, DAY, facts, healthOf, iso, SCAN, version, type FactsCase } from "./support.js";

const SCAN_MS = SCAN.getTime();

/** An As-of instant at or after the installed Seen time and before the scan date. */
const arbAsOfAfter = (c: FactsCase): fc.Arbitrary<number> =>
  fc.double({ min: 0, max: 1, noNaN: true }).map((f) => c.installedMs + Math.floor(f * (SCAN_MS - 1 - c.installedMs)));

const arbCaseWithAsOf = arbFactsCase.chain((c) => arbAsOfAfter(c).map((asOf) => ({ c, asOf })));

const health = healthOf("Alive", false);

function plain(c: FactsCase): TimelineFacts {
  return {
    ...c.facts,
    coveredFrom: null,
    versions: c.facts.versions.map((v) => ({ ...v, installScript: null, provenance: null, maintainers: null })),
  };
}

describe("stateAsOf properties", () => {
  it("Feature: cemetery-time, Property 6: State as of agrees with evaluateState on the same dated facts", () => {
    fc.assert(
      fc.property(arbCaseWithAsOf, ({ c, asOf }) => {
        const f = plain(c);
        const seen = seenTimes(f.versions, SCAN);
        const published = seen.filter((s) => s <= asOf);
        const advisories: Advisory[] | undefined =
          f.advisories === null
            ? undefined
            : f.advisories.filter((a) => new Date(a.publishedAt).getTime() <= asOf).map((a) => ({ id: a.id, severity: a.severity, summary: a.summary }));
        const expected = evaluateState(
          { lastPublish: new Date(Math.max(...published)), ...(advisories === undefined ? {} : { advisories }) },
          new Date(asOf),
        );
        const got = stateAsOf(f, health, SCAN, new Date(asOf)).form;
        expect(got.state).toBe(expected.state);
        expect(got.reason).toBe(expected.stateReason);
        expect(got.ghost).toBe(f.advisories !== null && f.advisories.some((a) => new Date(a.publishedAt).getTime() <= asOf));
      }),
      { numRuns: 100 },
    );
  });

  it("Feature: cemetery-time, Property 7: A later fact is never seen", () => {
    fc.assert(
      fc.property(arbCaseWithAsOf, fc.integer({ min: 1, max: 5 * DAY }), ({ c, asOf }, gap) => {
        const lastMs = Math.max(...seenTimes(c.facts.versions, SCAN));
        const later = Math.max(asOf, lastMs) + gap;
        const extended: TimelineFacts = {
          ...c.facts,
          versions: [
            ...c.facts.versions,
            version("9.9.9", later, { installScript: true, provenance: false, maintainers: ["z"] }),
          ],
          advisories: c.facts.advisories === null ? null : [...c.facts.advisories, advisory("LATE", "Critical", later)],
        };
        const at = new Date(asOf);
        expect(stateAsOf(extended, health, SCAN, at)).toEqual(stateAsOf(c.facts, health, SCAN, at));
      }),
      { numRuns: 100 },
    );
  });

  it("Feature: cemetery-time, Property 8: As of the scan date is the current state", () => {
    fc.assert(
      fc.property(arbFactsCase, arbState, fc.boolean(), fc.integer({ min: 0, max: 400 * DAY }), (c, state, ghost, offset) => {
        const h = healthOf(state, ghost);
        const result = stateAsOf(c.facts, h, SCAN, new Date(SCAN_MS + offset));
        expect(result.form).toEqual(currentForm(h));
        expect(result.unavailable).toEqual([]);
      }),
      { numRuns: 100 },
    );
  });

  it("Feature: cemetery-time, Property 9: State as of is deterministic", () => {
    fc.assert(
      fc.property(arbFactsCase, fc.integer({ min: 0, max: SCAN_MS - 1 }), (c, asOf) => {
        const first = stateAsOf(c.facts, health, SCAN, new Date(asOf));
        const second = stateAsOf(structuredClone(c.facts), health, SCAN, new Date(asOf));
        expect(second).toEqual(first);
      }),
      { numRuns: 100 },
    );
  });

  it("Feature: cemetery-time, Property 10: State as of is monotonic in age", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 3000 }),
        fc.integer({ min: 1, max: 1500 }),
        fc.array(fc.constantFrom("Critical", "High", "Moderate", "Low", "Unknown"), { maxLength: 3 }),
        fc.integer({ min: 0, max: 2000 }),
        (older, delta, severities, after) => {
          const t1 = Date.UTC(2016, 0, 1) + older * DAY;
          const t2 = t1 + delta * DAY;
          const asOf = new Date(t2 + after * DAY);
          if (asOf.getTime() >= SCAN_MS) return;
          const advisories = severities.map((s, i) => advisory(`A-${i}`, s, Date.UTC(2015, 0, 1)));
          const one = (t: number) => stateAsOf(facts([version("1.0.0", t)], "1.0.0", { advisories }), health, SCAN, asOf).form.state;
          const s1 = one(t1);
          const s2 = one(t2);
          expect(s1 !== null && s2 !== null && healthRank(s1) <= healthRank(s2)).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("Feature: cemetery-time, Property 11: Not-published exactly before the installed version is seen", () => {
    fc.assert(
      fc.property(arbFactsCase, fc.integer({ min: 0, max: SCAN_MS - 1 }), (c, asOf) => {
        const installedIndex = c.facts.versions.findIndex((v) => v.version === c.facts.installed);
        const seen = seenTimes(c.facts.versions, SCAN)[installedIndex] as number;
        const form = stateAsOf(c.facts, health, SCAN, new Date(asOf)).form;
        expect(form.state === null).toBe(seen > asOf);
        if (form.state === null) expect(form.ghost).toBe(false);
      }),
      { numRuns: 100 },
    );
  });
});

describe("stateAsOf examples", () => {
  const day = (y: number, m: number, d: number, h = 0): number => Date.UTC(y, m - 1, d, h);

  it("gives Possessed for a new install script inside 90 days, and not after", () => {
    const f = facts(
      [version("1.0.0", day(2026, 5, 1), { installScript: false }), version("1.1.0", day(2026, 6, 1), { installScript: true })],
      "1.1.0",
    );
    const inside = stateAsOf(f, health, SCAN, new Date(day(2026, 7, 1))).form;
    expect(inside.state).toBe("Possessed");
    expect(inside.reason).toBe("install script added in 1.1.0");
    expect(stateAsOf(f, health, SCAN, new Date(day(2026, 10, 1))).form.state).toBe("Alive");
  });

  it("gives Possessed for a provenance regression from the installed version on", () => {
    const f = facts(
      [version("1.0.0", day(2025, 1, 1), { provenance: true }), version("1.1.0", day(2025, 6, 1), { provenance: false })],
      "1.1.0",
    );
    expect(stateAsOf(f, health, SCAN, new Date(day(2025, 5, 31))).form.state).toBeNull();
    const after = stateAsOf(f, health, SCAN, new Date(day(2025, 6, 2))).form;
    expect(after.state).toBe("Possessed");
    expect(after.reason).toContain("provenance regression");
    expect(stateAsOf(f, health, SCAN, new Date(day(2026, 6, 2))).form.state).toBe("Possessed");
  });

  it("gives Possessed for a maintainer change between consecutive versions inside 90 days", () => {
    const f = facts(
      [version("1.0.0", day(2026, 3, 1), { maintainers: ["a"] }), version("1.1.0", day(2026, 6, 1), { maintainers: ["a", "b"] })],
      "1.1.0",
    );
    const form = stateAsOf(f, health, SCAN, new Date(day(2026, 6, 15))).form;
    expect(form.state).toBe("Possessed");
    expect(form.reason).toBe("maintainer change in the last 90 days");
    expect(stateAsOf(f, health, SCAN, new Date(day(2026, 10, 15))).form.state).toBe("Alive");
  });

  it("handles a 29 February threshold in a leap year", () => {
    const scan = new Date(day(2028, 6, 1));
    const f = facts([version("1.0.0", day(2026, 3, 1, 6))], "1.0.0");
    const at = (ms: number) => stateAsOf(f, health, scan, new Date(ms)).form;
    expect(at(day(2028, 2, 29, 12)).state).toBe("Restless");
    expect(at(day(2028, 3, 1)).state).toBe("Alive");
    expect(at(day(2028, 3, 1, 7)).state).toBe("Restless");
  });

  it("lists last publish as unavailable when coveredFrom lies after the As-of date", () => {
    const f = facts([version("1.0.0", day(2015, 1, 1))], "1.0.0", { coveredFrom: iso(day(2025, 1, 1)) });
    const result = stateAsOf(f, health, SCAN, new Date(day(2020, 1, 1)));
    expect(result.form.state).toBe("Alive");
    expect(result.unavailable).toContain("last publish");
    expect(result.unavailable).toContain("deprecated flag");
    const covered = stateAsOf(f, health, SCAN, new Date(day(2025, 2, 1)));
    expect(covered.form.state).toBe("Restless");
  });
});
