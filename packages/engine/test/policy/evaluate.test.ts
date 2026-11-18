// Policy evaluator. Requirements 8.2 to 8.4, 9.2 to 9.15 of the policy spec.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { evaluatePolicy } from "../../src/policy/evaluate.js";
import { inScope } from "../../src/policy/match.js";
import { unavailable } from "../../src/signal.js";
import type { HealthReport, PackageHealth, Policy, PolicyResult, PolicySource, Rule } from "../../src/types.js";
import { arbPackage, arbReport, arbValidPolicy } from "../arbitraries.js";

const arbSource = fc.constantFrom<PolicySource>("default", "file");
const SECURITY_RUNS = 1000;

function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value)) {
      deepFreeze(v);
    }
  }
  return value;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

/** A report in which package names may repeat. */
const arbReportWithRepeats: fc.Arbitrary<HealthReport> = fc
  .tuple(arbReport, fc.array(arbPackage, { maxLength: 4 }))
  .map(([r, extra]) => ({ ...r, packages: [...r.packages, ...extra, ...r.packages.slice(0, 2)] }));

function unavailableSignals(pkg: PackageHealth): PackageHealth {
  const at = new Date("2026-01-01T00:00:00Z");
  return {
    ...pkg,
    signals: {
      ...pkg.signals,
      hasInstallScript: unavailable("down", "https://example.test/x", at),
      lastPublish: unavailable("down", "https://example.test/x", at),
      provenance: unavailable("down", "https://example.test/x", at),
    },
  };
}

function names(list: readonly { readonly name: string }[]): string[] {
  return list.map((x) => x.name);
}

function pkgPolicy(rules: readonly Rule[]): Policy {
  return { version: 1, rules };
}

describe("evaluatePolicy", () => {
  it("Feature: policy, Property 1: Evaluator determinism and non-mutation", () => {
    fc.assert(
      fc.property(arbValidPolicy, arbReport, arbSource, (policy, report, source) => {
        const policyCopy = clone(policy);
        const reportCopy = clone(report);
        deepFreeze(policy);
        deepFreeze(report);
        const a = evaluatePolicy(policy, report, source);
        const b = evaluatePolicy(policy, report, source);
        expect(b).toEqual(a);
        expect(policy).toEqual(policyCopy);
        expect(report).toEqual(reportCopy);
      }),
      { numRuns: 100 },
    );
  });

  it("Feature: policy, Property 9: Unevaluated never fails", () => {
    fc.assert(
      fc.property(arbValidPolicy, arbReport, arbSource, (policy, report, source) => {
        const result = evaluatePolicy(policy, report, source);
        for (const r of result.rules) {
          const failed = new Set(names(r.failures));
          for (const u of r.unevaluated) {
            expect(failed.has(u.name)).toBe(false);
          }
          expect(r.pass).toBe(r.failures.length === 0);
        }
        // With every judged signal unavailable, signal-based rules cannot fail.
        const blind: HealthReport = { ...report, packages: report.packages.map(unavailableSignals) };
        const blindResult = evaluatePolicy(policy, blind, source);
        blindResult.rules.forEach((r) => {
          if (r.type !== "forbid_state") {
            expect(r.pass).toBe(true);
          }
        });
      }),
      { numRuns: SECURITY_RUNS },
    );
  });

  it("Feature: policy, Property 10: Pass is exactly the absence of failures, overall and per rule", () => {
    fc.assert(
      fc.property(arbValidPolicy, arbReport, arbSource, (policy, report, source) => {
        const result = evaluatePolicy(policy, report, source);
        expect(result.rules).toHaveLength(policy.rules.length);
        for (const r of result.rules) {
          expect(r.pass).toBe(r.failures.length === 0);
        }
        expect(result.pass).toBe(result.rules.every((r) => r.pass));
        if (policy.rules.length === 0) {
          expect(result.pass).toBe(true);
          expect(result.rules).toEqual([]);
        }
      }),
      { numRuns: 100 },
    );
  });

  it("Feature: policy, Property 11: Disjointness of failures and unevaluated", () => {
    fc.assert(
      fc.property(arbValidPolicy, arbReportWithRepeats, arbSource, (policy, report, source) => {
        const result = evaluatePolicy(policy, report, source);
        for (const r of result.rules) {
          const f = names(r.failures);
          const u = names(r.unevaluated);
          expect(new Set(f).size).toBe(f.length);
          expect(new Set(u).size).toBe(u.length);
          expect(f.filter((n) => u.includes(n))).toEqual([]);
        }
      }),
      { numRuns: 100 },
    );
  });

  it("Feature: policy, Property 12: Scope containment", () => {
    fc.assert(
      fc.property(arbValidPolicy, arbReport, arbSource, (policy, report, source) => {
        const result = evaluatePolicy(policy, report, source);
        const order = report.packages.map((p) => p.name);
        result.rules.forEach((r, i) => {
          const rule = policy.rules[i] as Rule;
          for (const list of [names(r.failures), names(r.unevaluated)]) {
            expect(list.every((n) => inScope(rule, n))).toBe(true);
            const positions = list.map((n) => order.indexOf(n));
            expect(positions.every((p) => p >= 0)).toBe(true);
            expect(positions).toEqual([...positions].sort((x, y) => x - y));
          }
        });
      }),
      { numRuns: 100 },
    );
  });

  it("Feature: policy, Property 13: Rule isolation", () => {
    fc.assert(
      fc.property(
        arbValidPolicy.filter((p) => p.rules.length > 0),
        arbReport,
        fc.nat(),
        arbSource,
        (policy, report, k, source) => {
          const removed = k % policy.rules.length;
          const smaller = pkgPolicy(policy.rules.filter((_, i) => i !== removed));
          const full = evaluatePolicy(policy, report, source);
          const small = evaluatePolicy(smaller, report, source);
          const expected = full.rules.filter((_, i) => i !== removed).map((r, i) => ({ ...r, index: i }));
          expect(small.rules).toEqual(expected);
          expect(small.pass).toBe(small.rules.every((r) => r.pass));
        },
      ),
      { numRuns: 100 },
    );
  });

  describe("examples", () => {
    const report: HealthReport = { generatedAt: "2026-11-12T00:00:00.000Z", packages: [] };

    it("passes an empty policy with no rule results", () => {
      const result: PolicyResult = evaluatePolicy({ version: 1, rules: [] }, report, "default");
      expect(result).toEqual({ source: "default", pass: true, rules: [] });
    });

    it("copies name only when the rule has one", () => {
      const result = evaluatePolicy(
        pkgPolicy([
          { type: "forbid_state", states: ["Dead"], name: "no dead" },
          { type: "forbid_state", states: ["Dead"] },
        ]),
        report,
        "file",
      );
      expect(result.rules[0]?.name).toBe("no dead");
      expect(result.rules[1]).toBeDefined();
      expect("name" in (result.rules[1] ?? {})).toBe(false);
    });

    it("copies source unchanged", () => {
      expect(evaluatePolicy({ version: 1, rules: [] }, report, "default").source).toBe("default");
      expect(evaluatePolicy({ version: 1, rules: [] }, report, "file").source).toBe("file");
    });

    it("keeps the first entry for a repeated package name", () => {
      const first = fc.sample(arbPackage, { seed: 1, numRuns: 1 })[0] as PackageHealth;
      const a: PackageHealth = { ...first, name: "a", state: "Dead", installedVersion: "1.0.0" };
      const b: PackageHealth = { ...first, name: "a", state: "Dead", installedVersion: "2.0.0" };
      const result = evaluatePolicy(pkgPolicy([{ type: "forbid_state", states: ["Dead"] }]), { ...report, packages: [a, b] }, "file");
      expect(result.rules[0]?.failures.map((f) => f.installedVersion)).toEqual(["1.0.0"]);
    });

    it("removing out-of-scope packages changes nothing except notFound", () => {
      fc.assert(
        fc.property(arbReport, (r) => {
          const rule: Rule = { type: "forbid_state", states: ["Possessed", "Dead", "Haunted"], matchPackageNames: ["a"] };
          const trimmed: HealthReport = { ...r, packages: r.packages.filter((p) => p.name === "a") };
          expect(evaluatePolicy(pkgPolicy([rule]), trimmed, "file")).toEqual(evaluatePolicy(pkgPolicy([rule]), r, "file"));
        }),
        { numRuns: 100 },
      );
    });

    it("returns the result shape for each rule type", () => {
      const rules: Rule[] = [
        { type: "forbid_state", states: ["Dead"] },
        { type: "forbid_install_scripts" },
        { type: "max_age_months", months: 12 },
        { type: "require_provenance", packages: ["*"] },
      ];
      const result = evaluatePolicy(pkgPolicy(rules), report, "file");
      expect(result.rules.map((r) => [r.index, r.type])).toEqual([
        [0, "forbid_state"],
        [1, "forbid_install_scripts"],
        [2, "max_age_months"],
        [3, "require_provenance"],
      ]);
    });
  });
});
