// Spec state-age-rule. Bug condition exploration (Properties 1 and 2) and preservation (Properties 3 to 9).
// Requirements 1.1, 1.2, 1.4, 2.1, 2.2, 2.3, 3.1 to 3.7.
// On the unfixed state.ts the exploration tests fail. That failure shows age alone gives Dead.

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { evaluateState, healthRank, monthsBefore, type StateInputs } from "../src/state.js";
import { SEVERITIES, type Advisory } from "../src/types.js";
import {
  advisoryArb,
  dateArb,
  inertNewInputsArb,
  MAX_DATE,
  MIN_DATE,
  stateInputsArb,
  tenSignalInputsArb,
} from "./arbitraries.js";

const NOW = new Date("2026-11-12T00:00:00Z");
const STALE_REASON = "no release in 24 months";
const STALE_ADVISORY_REASON = "no release in 24 months and an open advisory";

// Strictly more than 24 calendar months (UTC) before NOW.
const staleMax = new Date(monthsBefore(NOW, 24).getTime() - 1);
const staleDateArb: fc.Arbitrary<Date> = fc.date({ min: MIN_DATE, max: staleMax, noInvalidDate: true });

const noAdvisoryArb: fc.Arbitrary<readonly Advisory[] | undefined> = fc.constantFrom<readonly Advisory[] | undefined>([], undefined);
const notDeprecatedArb: fc.Arbitrary<boolean | undefined> = fc.constantFrom<boolean | undefined>(false, undefined);

function build(lastPublish: Date, deprecated: boolean | undefined, advisories: readonly Advisory[] | undefined): StateInputs {
  return {
    lastPublish,
    ...(deprecated === undefined ? {} : { deprecated }),
    ...(advisories === undefined ? {} : { advisories }),
  };
}

describe("state-age-rule exploration: Property 1, age alone never gives Dead", () => {
  it("any stale, not deprecated, no-advisory input gives Restless", () => {
    fc.assert(
      fc.property(staleDateArb, notDeprecatedArb, noAdvisoryArb, (lastPublish, deprecated, advisories) => {
        const result = evaluateState(build(lastPublish, deprecated, advisories), NOW);
        expect(result.state).not.toBe("Dead");
        expect(result).toEqual({ state: "Restless", stateReason: STALE_REASON });
      }),
      { numRuns: 1000 },
    );
  });

  it("depd-like input with advisories empty gives Restless", () => {
    const input: StateInputs = { lastPublish: new Date("2018-10-01T00:00:00Z"), deprecated: false, advisories: [] };
    expect(evaluateState(input, NOW)).toEqual({ state: "Restless", stateReason: STALE_REASON });
  });

  it("depd-like input with advisories unavailable gives Restless", () => {
    const input: StateInputs = { lastPublish: new Date("2018-10-01T00:00:00Z"), deprecated: false };
    expect(evaluateState(input, NOW)).toEqual({ state: "Restless", stateReason: STALE_REASON });
  });
});

describe("state-age-rule exploration: Property 2, stale with any advisory gives Dead", () => {
  for (const severity of SEVERITIES) {
    it(`stale with one ${severity} advisory gives Dead with the advisory reason`, () => {
      const input: StateInputs = {
        lastPublish: new Date("2018-10-01T00:00:00Z"),
        deprecated: false,
        advisories: [{ id: "GHSA-0000-0000-0000", severity, summary: "test" }],
      };
      expect(evaluateState(input, NOW)).toEqual({ state: "Dead", stateReason: STALE_ADVISORY_REASON });
    });
  }

  it("any stale, not deprecated input with at least one advisory gives Dead with the advisory reason", () => {
    fc.assert(
      fc.property(staleDateArb, notDeprecatedArb, fc.array(advisoryArb, { minLength: 1, maxLength: 5 }), (lastPublish, deprecated, advisories) => {
        expect(evaluateState(build(lastPublish, deprecated, advisories), NOW)).toEqual({
          state: "Dead",
          stateReason: STALE_ADVISORY_REASON,
        });
      }),
      { numRuns: 1000 },
    );
  });
});

// Preservation, Properties 3 to 9. Requirements 2.4, 3.1 to 3.7.
// Written on the UNFIXED state.ts. Each domain excludes the bug condition and the two changed-by-design groups
// (12 to 24 months Restless band, stale with an advisory), so each property holds before and after the fix.

type Severity = Advisory["severity"];

function advisoryOf(severities: readonly Severity[]): fc.Arbitrary<Advisory> {
  return fc.tuple(advisoryArb, fc.constantFrom(...severities)).map(([a, severity]) => ({ ...a, severity }));
}

/** 1 or more advisories drawn only from the given severities. */
function advisoriesOf(severities: readonly Severity[]): fc.Arbitrary<readonly Advisory[]> {
  return fc.array(advisoryOf(severities), { minLength: 1, maxLength: 5 });
}

/** Advisories holding at least one of the required severities, others from any severity, in any position. */
function advisoriesWith(required: readonly Severity[]): fc.Arbitrary<readonly Advisory[]> {
  return fc
    .tuple(fc.array(advisoryArb, { maxLength: 4 }), advisoryOf(required), fc.nat(10))
    .map(([rest, one, at]) => {
      const out = [...rest];
      out.splice(at % (out.length + 1), 0, one);
      return out;
    });
}

type LastPublish = Date | null | undefined;

function withSignals(lastPublish: LastPublish, deprecated: boolean | undefined, advisories: readonly Advisory[] | undefined): StateInputs {
  return {
    ...(lastPublish === undefined ? {} : { lastPublish }),
    ...(deprecated === undefined ? {} : { deprecated }),
    ...(advisories === undefined ? {} : { advisories }),
  };
}

const staleBefore = monthsBefore(NOW, 24);
const youngerThan12 = new Date(monthsBefore(NOW, 12).getTime() + 1);

/** Not stale: exactly 24 months ago or newer (12 to 24 months band included), a future date, null or undefined. */
const notStaleArb: fc.Arbitrary<LastPublish> = fc.oneof(
  fc.date({ min: staleBefore, max: MAX_DATE, noInvalidDate: true }),
  fc.constant(null),
  fc.constant(undefined),
);

/** Not stale and not in the 12 to 24 months band: strictly younger than 12 months, a future date, null or undefined. */
const freshArb: fc.Arbitrary<LastPublish> = fc.oneof(
  fc.date({ min: youngerThan12, max: MAX_DATE, noInvalidDate: true }),
  fc.constant(null),
  fc.constant(undefined),
);

describe("state-age-rule preservation", () => {
  it("Property 3: a Possessed trigger wins over any age, deprecated and advisories", () => {
    // Validates: Requirements 3.1
    const reasonOf = (i: StateInputs): string | null => {
      if (i.maintainerChange?.events.some((e) => e.recent) === true) return "maintainer change in the last 90 days";
      const r = i.provenanceRegression;
      if (r?.status === "regression") return `provenance regression: ${r.installedVersion} has no provenance, ${r.earlierVersion} had it`;
      const added = i.newInstallScript?.[0];
      if (added !== undefined) return `install script added in ${added.version}`;
      return null;
    };
    fc.assert(
      fc.property(
        tenSignalInputsArb.filter((i) => reasonOf(i) !== null),
        dateArb,
        (inputs, now) => {
          expect(evaluateState(inputs, now)).toEqual({ state: "Possessed", stateReason: reasonOf(inputs) });
        },
      ),
      { numRuns: 1000 },
    );
  });

  it("Property 4: deprecated true gives Dead with the deprecated reason, whatever the age and advisories", () => {
    // Validates: Requirements 3.2
    fc.assert(
      fc.property(stateInputsArb, dateArb, (base, now) => {
        const inputs: StateInputs = { ...base, deprecated: true };
        expect(evaluateState(inputs, now)).toEqual({ state: "Dead", stateReason: "installed version is deprecated" });
      }),
      { numRuns: 1000 },
    );
  });

  it("Property 5: a High or Critical advisory on a package that is not stale gives Haunted", () => {
    // Validates: Requirements 3.3
    // The 12 to 24 months band stays in the domain: the old Haunted rule comes before the old Restless band.
    fc.assert(
      fc.property(notStaleArb, notDeprecatedArb, advisoriesWith(["High", "Critical"]), (lastPublish, deprecated, advisories) => {
        expect(evaluateState(withSignals(lastPublish, deprecated, advisories), NOW)).toEqual({
          state: "Haunted",
          stateReason: "advisory of severity High or Critical",
        });
      }),
      { numRuns: 1000 },
    );
  });

  it("Property 6: Moderate or Low gives Restless with the advisory reason, Unknown alone gives Alive", () => {
    // Validates: Requirements 3.4
    // The domain is not stale AND not within 12 to 24 months, because the old code gives Restless by age in that band.
    fc.assert(
      fc.property(freshArb, notDeprecatedArb, advisoriesWith(["Moderate", "Low"]), (lastPublish, deprecated, withModLow) => {
        const advisories = withModLow.filter((a) => a.severity !== "High" && a.severity !== "Critical");
        expect(evaluateState(withSignals(lastPublish, deprecated, advisories), NOW)).toEqual({
          state: "Restless",
          stateReason: "advisory of severity Moderate or Low",
        });
      }),
      { numRuns: 1000 },
    );
    fc.assert(
      fc.property(freshArb, notDeprecatedArb, advisoriesOf(["Unknown"]), (lastPublish, deprecated, advisories) => {
        expect(evaluateState(withSignals(lastPublish, deprecated, advisories), NOW)).toEqual({
          state: "Alive",
          stateReason: "no rule matched",
        });
      }),
      { numRuns: 1000 },
    );
  });

  it("Property 7: all three state signals unavailable and no Possessed rule gives Restless", () => {
    // Validates: Requirements 3.5
    fc.assert(
      fc.property(inertNewInputsArb, dateArb, (inert, now) => {
        expect(evaluateState({ ...inert }, now)).toEqual({ state: "Restless", stateReason: "all state signals unavailable" });
      }),
      { numRuns: 1000 },
    );
  });

  it("Property 8: equal inputs and equal reference time give equal results", () => {
    // Validates: Requirements 3.6
    fc.assert(
      fc.property(tenSignalInputsArb, dateArb, (inputs, now) => {
        expect(evaluateState(structuredClone(inputs), new Date(now.getTime()))).toEqual(evaluateState(inputs, now));
      }),
      { numRuns: 1000 },
    );
  });

  it("Property 10: every last publish that is not stale gives the same result", () => {
    // Validates: Requirements 2.4
    const band = fc.date({ min: staleBefore, max: monthsBefore(NOW, 12), noInvalidDate: true });
    const future = fc.date({ min: new Date(NOW.getTime() + 1), max: MAX_DATE, noInvalidDate: true });
    const adv = fc.option(fc.array(advisoryArb, { maxLength: 5 }), { nil: undefined });
    fc.assert(
      fc.property(band, future, adv, (inBand, ahead, advisories) => {
        const results = [inBand, staleBefore, null, ahead].map((lastPublish) =>
          evaluateState(withSignals(lastPublish, false, advisories), NOW),
        );
        for (const r of results) expect(r).toEqual(results[0]);
      }),
      { numRuns: 1000 },
    );
  });

  it("Property 9: an older last publish is never healthier, three-signal and ten-signal inputs", () => {
    // Validates: Requirements 3.7
    for (const arb of [stateInputsArb, tenSignalInputsArb]) {
      fc.assert(
        fc.property(arb, dateArb, dateArb, dateArb, (inputs, d1, d2, now) => {
          const older = d1.getTime() <= d2.getTime() ? d1 : d2;
          const newer = d1.getTime() <= d2.getTime() ? d2 : d1;
          const rankOlder = healthRank(evaluateState({ ...inputs, lastPublish: older }, now).state);
          const rankNewer = healthRank(evaluateState({ ...inputs, lastPublish: newer }, now).state);
          expect(rankOlder).toBeLessThanOrEqual(rankNewer);
        }),
        { numRuns: 1000 },
      );
    }
  });
});
