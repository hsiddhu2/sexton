// Spec: .kiro/specs/remediation, Requirement 4, properties 15 (intent arm) and 16.

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { isValidBranchName } from "../../src/remediation/is-valid-branch-name.js";
import { planRemediation } from "../../src/remediation/plan.js";
import { buildPrContext } from "../../src/remediation/pr-context.js";
import { BASE_REF_DEFAULT, buildPrIntent } from "../../src/remediation/pr-intent.js";
import type { PolicyResult, RemediationPlan } from "../../src/types.js";
import { arbReportAndOptions, healthySignals } from "./arbitraries.js";

const POLICY: PolicyResult = { source: "default", pass: true, rules: [] };

describe("buildPrIntent", () => {
  it("Feature: remediation, Property 16: PR intent invariants", () => {
    fc.assert(
      fc.property(arbReportAndOptions, ({ report, options }) => {
        const plans = planRemediation(report, options);
        const branches: string[] = [];
        for (const plan of plans) {
          const ctx = buildPrContext(report, POLICY, plan.packageName);
          if (ctx === null) continue;
          const intent = buildPrIntent(plan, ctx);
          const expected = plan.status === "proposed" && (plan.kind === "bump" || plan.kind === "remove");
          expect(intent !== null).toBe(expected);
          if (intent === null) continue;
          expect(intent.baseRef).toBe(BASE_REF_DEFAULT);
          expect(intent.branch.startsWith("sexton/")).toBe(true);
          expect(isValidBranchName(intent.branch)).toBe(true);
          expect(intent.branch).not.toBe(intent.baseRef);
          expect(intent.title.length).toBeLessThanOrEqual(200);
          expect(intent.title).toBe(
            plan.kind === "bump" ? `Sexton: bump ${plan.packageName} to ${plan.chosenVersion ?? ""}` : `Sexton: remove unused ${plan.packageName}`,
          );
          // Property 15, intent arm.
          expect(intent.files).toEqual([plan.edit]);
          expect(Object.keys(intent.files[0])).not.toContain("content");
          expect(intent.files[0].path).toBe("package.json");
          expect(buildPrIntent(plan, ctx)).toEqual(intent);
          branches.push(intent.branch);
        }
        expect(new Set(branches).size).toBe(branches.length);
      }),
      { numRuns: 100 },
    );
  });

  it("returns null for hand-built plans that cannot be carried out, and never throws", () => {
    const entry = { name: "x", installedVersion: "1.0.0", state: "Dead" as const, stateReason: "r", signals: healthySignals(), missingSignals: [] };
    const ctx = { entry, failingRules: [], generatedAt: "g", engineVersion: "0.1.0" };
    const base = { packageName: "x", installedVersion: "1.0.0", state: "Dead" as const, stateReason: "r" };
    const plans: RemediationPlan[] = [
      { ...base, kind: "migrate", status: "proposed" },
      { ...base, kind: "bump", status: "proposed" },
      { ...base, kind: "bump", status: "no-safe-version", reason: "n" },
      { ...base, packageName: "Bad Name", kind: "remove", status: "proposed", edit: { path: "package.json", op: "remove-dependency", section: "dependencies", name: "Bad Name" } },
    ];
    for (const p of plans) expect(buildPrIntent(p, ctx)).toBeNull();
  });
});
