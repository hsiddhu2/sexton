// The two new signals on the Timeline. Spec new-signals, Requirement 4. Property 3.

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { evaluateState } from "../../src/state.js";
import { currentForm, NOT_PUBLISHED_FORM, stateAsOf, stateInputsAsOf, seenTimes } from "../../src/timeline/as-of.js";
import type { NewDependencyValue, PublisherChangeValue } from "../../src/types.js";
import { newDependencyValueArb, publisherChangeValueArb } from "../arbitraries.js";
import { arbFactsCase, arbState, facts, healthOf, SCAN, version } from "./support.js";

const TRUSTED_TO_TOKEN: PublisherChangeValue = {
  status: "changed",
  earlier: { version: "1.0.0", publisher: "GitHub Actions", method: "trusted-publisher", publishTime: "2026-03-01T00:00:00.000Z" },
  installed: { version: "1.0.1", publisher: "someone", method: "token", publishTime: "2026-03-31T00:00:00.000Z" },
};

describe("stateAsOf with the new signals", () => {
  const f = facts(
    [version("1.0.0", Date.parse("2026-03-01T00:00:00.000Z")), version("1.0.1", Date.parse("2026-03-31T00:00:00.000Z"))],
    "1.0.1",
    { advisories: null, publisherChange: TRUSTED_TO_TOKEN },
  );
  const health = healthOf("Possessed", false, "publisher changed in 1.0.1: GitHub Actions to someone");

  it("reads Possessed from the installed version's publish on, with the scan's reason (4.2)", () => {
    expect(stateAsOf(f, health, SCAN, new Date("2026-03-31T00:00:00.000Z")).form).toEqual({
      state: "Possessed",
      reason: "publisher changed in 1.0.1: GitHub Actions to someone",
      ghost: false,
    });
  });

  it("is Not-published before it (4.3)", () => {
    expect(stateAsOf(f, health, SCAN, new Date("2026-03-30T23:59:59.999Z")).form).toEqual(NOT_PUBLISHED_FORM);
  });

  it("ignores null values (4.1)", () => {
    const none = { ...f, publisherChange: null, newDependency: null };
    expect(stateInputsAsOf(none, SCAN, new Date("2026-04-01T00:00:00.000Z"))?.publisherChange).toBeUndefined();
  });

  it("Feature: new-signals, Property 3: As-of equals the scan", () => {
    // Validates: Requirements 4.2, 4.4, 4.5
    fc.assert(
      fc.property(
        arbFactsCase,
        fc.option(publisherChangeValueArb, { nil: null }),
        fc.option(newDependencyValueArb, { nil: null }),
        fc.integer({ min: 0, max: 4000 }),
        arbState,
        (c, pc, nd, offsetDays, state) => {
          const withNew = { ...c.facts, publisherChange: pc, newDependency: nd };
          const seen = seenTimes(withNew.versions, SCAN)[withNew.versions.findIndex((v) => v.version === withNew.installed)] as number;
          const asOf = new Date(Math.min(seen + offsetDays * 86_400_000, SCAN.getTime() - 1));
          if (asOf.getTime() < seen) return;
          const inputs = stateInputsAsOf(withNew, SCAN, asOf);
          expect(inputs).not.toBeNull();
          expect(inputs?.publisherChange ?? null).toEqual(pc);
          expect(inputs?.newDependency ?? null).toEqual(nd as NewDependencyValue | null);
          const form = stateAsOf(withNew, healthOf(state, false), SCAN, asOf).form;
          if (inputs !== null) expect(form.state).toBe(evaluateState(inputs, asOf).state);
          expect(stateAsOf(withNew, healthOf(state, false), SCAN, SCAN).form).toEqual(currentForm(healthOf(state, false)));
        },
      ),
      { numRuns: 100 },
    );
  });
});
