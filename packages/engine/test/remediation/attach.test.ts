// Spec: .kiro/specs/remediation, Requirement 7.2 to 7.9, property 18.

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { attachRemediations } from "../../src/remediation/attach.js";
import { planRemediation } from "../../src/remediation/plan.js";
import { buildPrBody } from "../../src/remediation/pr-body.js";
import { buildPrContext } from "../../src/remediation/pr-context.js";
import { buildPrIntent } from "../../src/remediation/pr-intent.js";
import type { RemediationPlan } from "../../src/types.js";
import { arbPolicyResultFor, arbReportAndOptions, deepFreeze, healthySignals } from "./arbitraries.js";

function hasUndefined(value: unknown): boolean {
  if (value === undefined) return true;
  if (typeof value !== "object" || value === null) return false;
  return Object.values(value).some(hasUndefined);
}

describe("attachRemediations", () => {
  it("Feature: remediation, Property 18: attachRemediations round trip and consistency", () => {
    fc.assert(
      fc.property(arbReportAndOptions, arbPolicyResultFor("a"), ({ report, options }, policy) => {
        const planned = planRemediation(report, options);
        const extra: RemediationPlan[] = [
          { packageName: "absent-pkg", installedVersion: "1.0.0", state: "Dead", stateReason: "r", kind: "bump", status: "unavailable", reason: "x" },
          ...planned.slice(0, 1),
        ];
        const plans = [...planned, ...extra];
        const before = structuredClone({ report, policy, plans });
        deepFreeze(report);
        deepFreeze(policy);
        const entries = attachRemediations(report, policy, plans);
        expect({ report, policy, plans }).toEqual(before);
        expect(entries.map((e) => e.packageName)).toEqual(planned.map((p) => p.packageName));
        entries.forEach((entry, i) => {
          const plan = planned[i] as RemediationPlan;
          const ctx = buildPrContext(report, policy, plan.packageName);
          if (ctx === null) throw new Error("context");
          const intent = buildPrIntent(plan, ctx);
          expect([entry.kind, entry.status]).toEqual([plan.kind, plan.status]);
          expect(entry.prBody).toBe(buildPrBody(plan, ctx));
          if (intent !== null) expect(entry.title).toBe(intent.title);
          else expect(entry.title.startsWith("Sexton: no change proposed for ")).toBe(true);
          expect("chosenVersion" in entry).toBe(plan.chosenVersion !== undefined);
          expect("majorUpgrade" in entry).toBe(plan.majorUpgrade !== undefined);
          expect("intent" in entry).toBe(intent !== null);
          expect(entry.summary.includes("\n")).toBe(false);
          expect(Array.from(entry.summary).length).toBeLessThanOrEqual(201);
        });
        expect(JSON.parse(JSON.stringify(entries))).toEqual(entries);
        expect(hasUndefined(entries)).toBe(false);
      }),
      { numRuns: 100 },
    );
  });

  it("titles a no-change entry and cleans an invalid name", () => {
    const report = {
      generatedAt: "g",
      packages: [{ name: "bad\nname", installedVersion: "1", state: "Dead" as const, stateReason: "r", signals: healthySignals(), missingSignals: [] }],
    };
    const plans = planRemediation(report, {});
    const [entry] = attachRemediations(report, { source: "default", pass: true, rules: [] }, plans.map((p) => p));
    expect(entry?.title).toBe("Sexton: no change proposed for bad name");
    expect(entry?.summary).toBe("No change proposed for bad name: package name is not a valid npm package name");
  });
});
