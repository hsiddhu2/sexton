// The Plan stage guards. Spec: .kiro/specs/hosted-plans, Requirement 6. Property 57 (plan stage half).

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { CachedFetcher, MemoryCacheStore, type HealthReport, type PolicyResult } from "@sexton/engine";
import { ENGINE_PLAN_STEPS, MAX_BUMP_TARGETS, planStage, type PlanSteps } from "../src/plan-stage.js";

const clock = () => new Date("2026-11-12T00:00:00Z");
const ctx = { transport: () => Promise.reject(new Error("offline")), clock, cache: new CachedFetcher({ store: new MemoryCacheStore(), clock }) };

function pkg(name: string, state: "Dead" | "Alive") {
  return { name, installedVersion: "1.0.0", state, stateReason: "r" } as unknown as HealthReport["packages"][number];
}
const report = (names: readonly string[]) => ({ packages: names.map((n) => pkg(n, "Dead")) }) as unknown as HealthReport;
const policy = { passed: true, source: "default", results: [] } as unknown as PolicyResult;
const intake = (names: readonly string[]) =>
  names.map((name) => ({ name, installedVersion: "1.0.0", declaredRange: "^1.0.0", origin: "dependencies" as const, resolution: "locked" as const }));

const STEP_NAMES = Object.keys(ENGINE_PLAN_STEPS) as (keyof PlanSteps)[];

describe("planStage (6.2, 6.3, 6.6)", () => {
  it("gathers bump data for at most 25 targets, in report order", async () => {
    const names = Array.from({ length: 30 }, (_, i) => `p${String(i).padStart(2, "0")}`);
    let gathered: readonly { name: string }[] = [];
    await planStage({
      ctx,
      report: report(names),
      policy,
      intake: intake(names),
      packageJsonText: "{}",
      steps: {
        gatherBumpData: (_c, targets) => {
          gathered = targets;
          return Promise.resolve(new Map());
        },
        attachRemediations: () => [],
      },
    });
    expect(gathered.map((t) => t.name)).toEqual(names.slice(0, MAX_BUMP_TARGETS));
  });

  it("passes an empty importSites map, so no plan is remove", async () => {
    let sites: ReadonlyMap<string, number> | undefined;
    await planStage({
      ctx,
      report: report(["a"]),
      policy,
      intake: intake(["a"]),
      packageJsonText: "{}",
      steps: {
        planRemediation: (r, o) => {
          sites = o?.importSites;
          return ENGINE_PLAN_STEPS.planRemediation(r, o);
        },
      },
    });
    expect(sites?.size).toBe(0);
  });

  it("builds no File source when none is asked, and survives a builder that throws", async () => {
    const result = await planStage({
      ctx,
      report: report(["a"]),
      policy,
      intake: intake(["a"]),
      packageJsonText: "{}",
      files: () => {
        throw new Error("boom");
      },
      steps: { attachRemediations: () => [] },
    });
    expect(result.partial).toBe(true);
  });
});

describe("Feature: hosted-plans, Property 57 (plan stage): any throwing step still resolves", () => {
  it("resolves with partial true when a step throws, and false when none does", async () => {
    await fc.assert(
      fc.asyncProperty(fc.subarray(STEP_NAMES), async (throwing) => {
        // Stub baseline: each step answers an empty value, so only the chosen steps throw.
        const steps: Partial<PlanSteps> = {
          readPackageScripts: () => new Map(),
          bumpTargets: () => [],
          gatherBumpData: () => Promise.resolve(new Map()),
          gatherMigrationData: () => Promise.resolve(new Map()),
          runMigrations: () => Promise.resolve(new Map()),
          planRemediation: () => [],
          attachRemediations: () => [],
        };
        for (const name of throwing) {
          (steps as Record<string, unknown>)[name] = () => {
            throw new Error(`step ${name}`);
          };
        }
        const result = await planStage({ ctx, report: report(["a", "b"]), policy, intake: intake(["a", "b"]), packageJsonText: "{}", steps });
        expect(result.partial).toBe(throwing.length > 0);
        expect(Array.isArray(result.remediations)).toBe(true);
        if (throwing.includes("attachRemediations")) expect(result.remediations).toEqual([]);
      }),
      { numRuns: 100 },
    );
  });
});
