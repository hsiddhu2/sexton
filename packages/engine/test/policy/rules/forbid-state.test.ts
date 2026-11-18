// forbid_state rule. Requirements 4.2 to 4.7 of the policy spec.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { inScope } from "../../../src/policy/match.js";
import { evaluateForbidState } from "../../../src/policy/rules/forbid-state.js";
import { STATE_ORDER, type ForbidStateRule, type HealthReport } from "../../../src/types.js";
import { arbReport, arbRule } from "../../arbitraries.js";
import { gone, makePackage, makeReport, matchersOf, GENERATED_AT } from "./make-package.js";

const arbStates = fc.uniqueArray(fc.constantFrom(...STATE_ORDER), { minLength: 1 });

function failNames(rule: ForbidStateRule, report: HealthReport): string[] {
  return evaluateForbidState(rule, report).failures.map((f) => f.name);
}

describe("evaluateForbidState properties", () => {
  it("Feature: policy, Property 5: forbid_state exactness", () => {
    fc.assert(
      fc.property(arbReport, arbRule, arbStates, (report, base, states) => {
        const rule: ForbidStateRule = { type: "forbid_state", states, ...matchersOf(base) };
        const out = evaluateForbidState(rule, report);
        const expected = report.packages.filter((p) => inScope(rule, p.name) && states.includes(p.state)).map((p) => p.name);
        expect(out.failures.map((f) => f.name)).toEqual(expected);
        expect(out.unevaluated).toEqual([]);
      }),
      { numRuns: 100 },
    );
  });

  it("Feature: policy, Property 6: Monotonic in states", () => {
    fc.assert(
      fc.property(arbReport, arbRule, arbStates, arbStates, (report, base, small, extra) => {
        const large = [...new Set([...small, ...extra])];
        const m = matchersOf(base);
        const inSmall = failNames({ type: "forbid_state", states: small, ...m }, report);
        const inLarge = new Set(failNames({ type: "forbid_state", states: large, ...m }, report));
        expect(inSmall.every((n) => inLarge.has(n))).toBe(true);
      }),
      { numRuns: 100 },
    );
  });
});

describe("evaluateForbidState examples", () => {
  const rule: ForbidStateRule = { type: "forbid_state", states: ["Dead", "Possessed"] };

  it("records state, stateReason, null source and generatedAt as evidence", () => {
    const report = makeReport([makePackage({ name: "old", state: "Dead", stateReason: "deprecated", installedVersion: "2.3.4" })]);
    const out = evaluateForbidState(rule, report);
    expect(out.failures).toEqual([
      {
        name: "old",
        installedVersion: "2.3.4",
        signal: "state",
        value: "Dead",
        source: null,
        fetchedAt: GENERATED_AT,
        reason: "state is Dead: deprecated",
      },
    ]);
  });

  it("does not fail unlisted states or out-of-scope packages", () => {
    const report = makeReport([makePackage({ name: "ok", state: "Haunted" }), makePackage({ name: "skip", state: "Dead" })]);
    const out = evaluateForbidState({ ...rule, excludePackageNames: ["skip"] }, report);
    expect(out.failures).toEqual([]);
  });

  it("returns no unevaluated entries when every signal is unavailable", () => {
    const report = makeReport([
      makePackage({ name: "x", state: "Possessed", hasInstallScript: gone(), lastPublish: gone(), provenance: gone() }),
    ]);
    const out = evaluateForbidState(rule, report);
    expect(out.failures).toHaveLength(1);
    expect(out.unevaluated).toEqual([]);
    expect(out.notFound).toEqual([]);
  });
});
