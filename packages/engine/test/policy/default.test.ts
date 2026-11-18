import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { DEFAULT_POLICY } from "../../src/policy/default.js";
import { evaluatePolicy } from "../../src/policy/evaluate.js";
import { formatPolicy } from "../../src/policy/format.js";
import { parsePolicy } from "../../src/policy/parse.js";
import { validatePolicySchema } from "../../src/policy/schema.js";
import type { HealthReport, PolicySource } from "../../src/types.js";
import { arbReport } from "../arbitraries.js";

const BAD = new Set(["Possessed", "Dead"]);

describe("DEFAULT_POLICY", () => {
  it("Feature: policy, Property 16: The default policy fails exactly when a package is Possessed or Dead", () => {
    fc.assert(
      fc.property(arbReport, (report) => {
        const result = evaluatePolicy(DEFAULT_POLICY, report, "default");
        expect(result.pass).toBe(!report.packages.some((p) => BAD.has(p.state)));
        expect(result.source).toBe("default");
      }),
      { numRuns: 1000 },
    );
  });

  it("Property 16 variant: reports with only Alive, Restless and Haunted packages always pass", () => {
    const arbSafe = arbReport.map(
      (report): HealthReport => ({
        ...report,
        packages: report.packages.map((p) => (BAD.has(p.state) ? { ...p, state: "Alive" as const } : p)),
      }),
    );
    fc.assert(
      fc.property(arbSafe, (report) => {
        expect(evaluatePolicy(DEFAULT_POLICY, report, "default").pass).toBe(true);
      }),
      { numRuns: 1000 },
    );
  });

  it("validates against the schema", () => {
    expect(validatePolicySchema(DEFAULT_POLICY)).toBe(true);
  });

  it("has exactly one forbid_state rule for Possessed and Dead with no name or matchers", () => {
    expect(DEFAULT_POLICY).toEqual({ version: 1, rules: [{ type: "forbid_state", states: ["Possessed", "Dead"] }] });
    expect(Object.keys(DEFAULT_POLICY.rules[0] ?? {}).sort()).toEqual(["states", "type"]);
  });

  it("copies the source into the result", () => {
    fc.assert(
      fc.property(arbReport, fc.constantFrom<PolicySource>("default", "file"), (report, source) => {
        expect(evaluatePolicy(DEFAULT_POLICY, report, source).source).toBe(source);
      }),
    );
  });

  it("round trips through formatPolicy and parsePolicy with equal results (8.6)", () => {
    const parsed = parsePolicy(formatPolicy(DEFAULT_POLICY));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    fc.assert(
      fc.property(arbReport, fc.constantFrom<PolicySource>("default", "file"), (report, source) => {
        expect(evaluatePolicy(parsed.policy, report, source)).toEqual(evaluatePolicy(DEFAULT_POLICY, report, source));
      }),
    );
  });
});
