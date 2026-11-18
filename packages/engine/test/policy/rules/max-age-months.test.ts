// max_age_months rule. Requirements 6.1 to 6.10 of the policy spec.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { evaluateMaxAgeMonths } from "../../../src/policy/rules/max-age-months.js";
import { monthsBefore } from "../../../src/state.js";
import type { HealthReport, MaxAgeMonthsRule } from "../../../src/types.js";
import { arbReport, arbRule } from "../../arbitraries.js";
import { GENERATED_AT, SRC, FETCHED, gone, makePackage, makeReport, matchersOf, ok, referenceOf } from "./make-package.js";

function run(rule: MaxAgeMonthsRule, report: HealthReport) {
  return evaluateMaxAgeMonths(rule, report, referenceOf(report));
}

describe("evaluateMaxAgeMonths properties", () => {
  it("Feature: policy, Property 8: Monotonic in months", () => {
    fc.assert(
      fc.property(
        arbReport,
        arbRule,
        fc.integer({ min: 1, max: 600 }),
        fc.integer({ min: 1, max: 600 }),
        (report, base, a, gap) => {
          const b = a + gap;
          const m = matchersOf(base);
          const failA = run({ type: "max_age_months", months: a, ...m }, report).failures.map((f) => f.name);
          const failB = run({ type: "max_age_months", months: b, ...m }, report).failures.map((f) => f.name);
          for (const n of failB) {
            expect(failA).toContain(n);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe("evaluateMaxAgeMonths examples", () => {
  const rule: MaxAgeMonthsRule = { type: "max_age_months", months: 12 };
  const boundary = monthsBefore(new Date(GENERATED_AT), 12);

  it("does not fail a publish exactly at the boundary, and fails one millisecond earlier", () => {
    const at = boundary.toISOString();
    const before = new Date(boundary.getTime() - 1).toISOString();
    const report = makeReport([
      makePackage({ name: "at", lastPublish: ok(at) }),
      makePackage({ name: "before", lastPublish: ok(before) }),
    ]);
    const out = run(rule, report);
    expect(out.failures.map((f) => f.name)).toEqual(["before"]);
    expect(out.unevaluated).toEqual([]);
  });

  it("records value, source, fetchedAt and boundary as evidence", () => {
    const old = "2020-01-01T00:00:00.000Z";
    const out = run(rule, makeReport([makePackage({ name: "old", lastPublish: ok(old) })]));
    expect(out.failures).toEqual([
      {
        name: "old",
        installedVersion: "1.0.0",
        signal: "lastPublish",
        value: old,
        source: SRC,
        fetchedAt: FETCHED.toISOString(),
        reason: `last published ${old}, earlier than ${boundary.toISOString()} (12 months before ${GENERATED_AT})`,
        boundary: boundary.toISOString(),
      },
    ]);
  });

  it("does not fail a publish later than the reference time", () => {
    const out = run(rule, makeReport([makePackage({ name: "future", lastPublish: ok("2030-01-01T00:00:00.000Z") })]));
    expect(out).toEqual({ failures: [], unevaluated: [], notFound: [] });
  });

  it("records null and unparseable lastPublish as unevaluated", () => {
    const out = run(
      rule,
      makeReport([makePackage({ name: "n", lastPublish: ok(null) }), makePackage({ name: "u", lastPublish: ok("garbage") })]),
    );
    expect(out.failures).toEqual([]);
    expect(out.unevaluated.map((u) => [u.name, u.signal, u.reason])).toEqual([
      ["n", "lastPublish", "no usable publish date exists"],
      ["u", "lastPublish", "no usable publish date exists"],
    ]);
  });

  it("records an unavailable signal with its reason", () => {
    const out = run(rule, makeReport([makePackage({ name: "x", lastPublish: gone("HTTP 503") })]));
    expect(out.unevaluated).toEqual([{ name: "x", installedVersion: "1.0.0", signal: "lastPublish", reason: "HTTP 503" }]);
    expect(out.failures).toEqual([]);
  });

  it("marks every in-scope package unevaluated when generatedAt is unparseable, before any other check", () => {
    const report = makeReport(
      [
        makePackage({ name: "a", lastPublish: ok("2000-01-01T00:00:00.000Z") }),
        makePackage({ name: "b", lastPublish: gone("HTTP 503") }),
        makePackage({ name: "c", lastPublish: ok(null) }),
      ],
      "not-a-date",
    );
    const out = evaluateMaxAgeMonths({ ...rule, excludePackageNames: ["c"] }, report, null);
    expect(out.failures).toEqual([]);
    expect(out.unevaluated.map((u) => [u.name, u.reason])).toEqual([
      ["a", "reference time invalid"],
      ["b", "reference time invalid"],
    ]);
  });

  it("gives no failures and does not throw when months pushes the boundary out of Date range", () => {
    const report = makeReport([makePackage({ name: "old", lastPublish: ok("1990-01-01T00:00:00.000Z") })]);
    const out = run({ type: "max_age_months", months: 10_000_000_000 }, report);
    expect(out.failures).toEqual([]);
  });

  it("depends on the reference only through generatedAt", () => {
    const report = makeReport([makePackage({ name: "old", lastPublish: ok("2020-01-01T00:00:00.000Z") })]);
    expect(run(rule, structuredClone(report))).toEqual(run(rule, report));
  });
});
