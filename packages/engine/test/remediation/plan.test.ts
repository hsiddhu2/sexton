// Spec: .kiro/specs/remediation, Requirements 1, 3, 4.13, 4.14, 8.2, properties 1, 9, 15 and 17.

import fc from "fast-check";
import semver from "semver";
import { describe, expect, it } from "vitest";
import { planRemediation, type PlanOptions } from "../../src/remediation/plan.js";
import { rangeStyle, styledRange } from "../../src/remediation/range-style.js";
import { EMPTY_RECIPE_REGISTRY } from "../../src/remediation/recipes.js";
import type { HealthReport, PackageHealth, State } from "../../src/types.js";
import { arbReportAndOptions, arbSelectInput, deepFreeze, healthySignals, stubRecipe } from "./arbitraries.js";

const UNHEALTHY = new Set<State>(["Possessed", "Dead", "Haunted"]);

function firstUnhealthyNames(report: HealthReport): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of report.packages) {
    if (seen.has(p.name)) continue;
    seen.add(p.name);
    if (UNHEALTHY.has(p.state)) out.push(p.name);
  }
  return out;
}

const pkg = (name: string, state: State = "Dead", installedVersion = "1.0.0"): PackageHealth => ({
  name,
  installedVersion,
  state,
  stateReason: "deprecated",
  signals: healthySignals(),
  missingSignals: [],
});
const report = (...packages: PackageHealth[]): HealthReport => ({ generatedAt: "2026-11-12T00:00:00.000Z", packages });
const intake = (name: string, declaredRange = "^1.0.0", origin: "dependencies" | "devDependencies" = "dependencies") => ({
  name,
  installedVersion: "1.0.0",
  declaredRange,
  origin,
  resolution: "locked" as const,
});

describe("planRemediation", () => {
  it("Feature: remediation, Property 1: One plan per unhealthy package", () => {
    fc.assert(
      fc.property(arbReportAndOptions, ({ report: r, options }) => {
        const plans = planRemediation(r, options);
        expect(plans.map((p) => p.packageName)).toEqual(firstUnhealthyNames(r));
        expect(new Set(plans.map((p) => p.packageName)).size).toBe(plans.length);
      }),
      { numRuns: 100 },
    );
  });

  it("Feature: remediation, Property 9: Remove needs import sites", () => {
    fc.assert(
      fc.property(arbReportAndOptions, ({ report: r, options }) => {
        const plans = planRemediation(r, options);
        const intakeByName = new Map((options.intake ?? []).map((i) => [i.name, i]));
        for (const plan of plans) {
          const hasRecipe = options.recipes?.has(plan.packageName) ?? false;
          const zero = options.importSites?.get(plan.packageName) === 0;
          expect(plan.kind === "migrate").toBe(hasRecipe);
          expect(plan.kind === "remove").toBe(!hasRecipe && zero);
          if (!hasRecipe && !zero) expect(plan.kind).toBe("bump");
          if (plan.kind === "remove" && plan.status === "proposed") {
            expect(plan.edit).toEqual({ path: "package.json", op: "remove-dependency", section: intakeByName.get(plan.packageName)?.origin, name: plan.packageName });
            expect(plan.edit !== undefined && "range" in plan.edit).toBe(false);
          }
          if (plan.kind === "migrate" && plan.status === "proposed") expect(plan.edit).toBeUndefined();
          if (plan.kind === "remove") {
            const sites = new Map(options.importSites);
            sites.set(plan.packageName, 1);
            const swapped = planRemediation(r, { ...options, importSites: sites }).find((p) => p.packageName === plan.packageName);
            expect(swapped?.kind).toBe("bump");
            expect([swapped?.packageName, swapped?.installedVersion, swapped?.state, swapped?.stateReason]).toEqual([
              plan.packageName,
              plan.installedVersion,
              plan.state,
              plan.stateReason,
            ]);
          }
        }
      }),
      { numRuns: 100 },
    );
  });

  it("Feature: remediation, Property 15: Edit shape (plan arm)", () => {
    fc.assert(
      fc.property(arbSelectInput, fc.constantFrom("dependencies" as const, "devDependencies" as const), (input, origin) => {
        const r = report(pkg("target", "Haunted", input.installedVersion));
        const options: PlanOptions = {
          intake: [{ ...intake("target", input.declaredRange ?? "latest", origin), installedVersion: input.installedVersion }],
          bumpData: new Map([["target", { ok: true as const, published: input.published, deprecated: input.deprecated, advisories: input.advisories }]]),
        };
        const [plan] = planRemediation(r, options);
        if (plan?.status !== "proposed") return;
        const v = plan.chosenVersion as string;
        expect(plan.edit).toEqual({
          path: "package.json",
          op: "set-range",
          section: origin,
          name: "target",
          range: styledRange(rangeStyle(input.declaredRange ?? "latest"), v),
        });
        const range = plan.edit?.op === "set-range" ? plan.edit.range : "";
        expect(semver.validRange(range)).not.toBeNull();
        expect(semver.minVersion(range)?.version).toBe(v);
      }),
      { numRuns: 100 },
    );
  });

  it("Feature: remediation, Property 17: Planner locality, determinism and non-mutation", () => {
    fc.assert(
      fc.property(arbReportAndOptions, fc.nat(), ({ report: r, options }, seed) => {
        const before = structuredClone({ r, intake: options.intake, sites: [...(options.importSites ?? [])] });
        deepFreeze(r);
        deepFreeze(options.intake);
        const plans = planRemediation(r, options);
        expect(planRemediation(r, options)).toEqual(plans);
        expect({ r, intake: options.intake, sites: [...(options.importSites ?? [])] }).toEqual(before);
        // Locality: a package's plan alone equals its plan within the report.
        for (const plan of plans) {
          const own = r.packages.find((p) => p.name === plan.packageName) as PackageHealth;
          const alone = planRemediation(report(own), {
            intake: (options.intake ?? []).filter((i) => i.name === plan.packageName),
            importSites: new Map([...(options.importSites ?? [])].filter(([n]) => n === plan.packageName)),
            recipes: new Map([...(options.recipes ?? EMPTY_RECIPE_REGISTRY)].filter(([n]) => n === plan.packageName)),
            bumpData: new Map([...(options.bumpData ?? [])].filter(([n]) => n === plan.packageName)),
            migrations: new Map([...(options.migrations ?? [])].filter(([n]) => n === plan.packageName)),
          });
          expect(alone).toEqual([plan]);
        }
        // Reordering the report keeps each plan.
        const k = r.packages.length === 0 ? 0 : seed % r.packages.length;
        const firsts = new Map<string, PackageHealth>();
        for (const p of r.packages) if (!firsts.has(p.name)) firsts.set(p.name, p);
        const unique = [...firsts.values()];
        const rotated = report(...unique.slice(k), ...unique.slice(0, k));
        const again = planRemediation(rotated, options);
        for (const plan of plans) expect(again.find((p) => p.packageName === plan.packageName)).toEqual(plan);
      }),
      { numRuns: 100 },
    );
  });
});

describe("planRemediation examples", () => {
  it("every status and fixed reason", () => {
    const r = report(pkg("bad name"), pkg("no-intake"), pkg(`a${"_".repeat(150)}`), pkg("unres", "Dead", "unresolved"), pkg("missing"), pkg("failed"), pkg("none"), pkg("ok"), pkg("alive", "Alive"));
    const plans = planRemediation(r, {
      intake: [`a${"_".repeat(150)}`, "unres", "missing", "failed", "none", "ok"].map((n) => intake(n)),
      bumpData: new Map([
        ["failed", { ok: false as const, reason: "packument request failed (HTTP 500)" }],
        ["none", { ok: true as const, published: ["1.0.0", "1.1.0"], deprecated: new Set(["1.1.0"]), advisories: new Map([["1.1.0", []]]) }],
        ["ok", { ok: true as const, published: ["1.0.0", "1.1.0"], deprecated: new Set<string>(), advisories: new Map([["1.1.0", []]]) }],
      ]),
    });
    expect(plans.map((p) => [p.packageName.slice(0, 10), p.status, p.reason ?? ""])).toEqual([
      ["bad name", "unavailable", "package name is not a valid npm package name"],
      ["no-intake", "unavailable", "no intake entry for this package, so the section of package.json is unknown"],
      ["a_________", "unavailable", "branch name too long"],
      ["unres", "unavailable", "installed version is not a valid semver version"],
      ["missing", "unavailable", "bump data was not gathered"],
      ["failed", "unavailable", "bump data unavailable: packument request failed (HTTP 500)"],
      ["none", "no-safe-version", "no safe version found among 1 evaluated candidate versions"],
      ["ok", "proposed", ""],
    ]);
    expect(plans.at(-1)).toMatchObject({ kind: "bump", chosenVersion: "1.1.0", majorUpgrade: false, edit: { range: "^1.1.0", section: "dependencies" } });
  });

  it("a recipe gives migrate whatever the import sites; without a recipe outcome it is unavailable", () => {
    const options = { intake: [intake("node-sass")], importSites: new Map([["node-sass", 0]]), recipes: new Map([["node-sass", stubRecipe("sass", "node-sass", "sass")]]) };
    const base = { packageName: "node-sass", installedVersion: "1.0.0", state: "Dead", stateReason: "deprecated", kind: "migrate" };
    expect(planRemediation(report(pkg("node-sass")), options)).toEqual([{ ...base, status: "unavailable", reason: "migration was not run" }]);
    const edit = { path: "package.json" as const, op: "remove-dependency" as const, section: "dependencies" as const, name: "node-sass" };
    const scan = { performed: false, listed: 0, read: 0, skipped: 0, capped: false };
    const migrations = new Map([["node-sass", { ok: true as const, result: { edits: [edit], reviewSites: [], filesChanged: ["package.json"], scan, notes: [] } }]]);
    const [plan] = planRemediation(report(pkg("node-sass")), { ...options, migrations });
    expect(plan).toEqual({
      ...base,
      status: "proposed",
      edits: [edit],
      migration: { recipeId: "sass", from: "node-sass", to: "sass", reviewSites: [], filesChanged: ["package.json"], scan, notes: [] },
    });
    expect(plan?.edit).toBeUndefined();
    expect(EMPTY_RECIPE_REGISTRY.size).toBe(0);
  });

  it("a remove applies to the intake origin and carries no range", () => {
    const [plan] = planRemediation(report(pkg("@scope/name")), { intake: [intake("@scope/name", "^1.0.0", "devDependencies")], importSites: new Map([["@scope/name", 0]]) });
    expect(plan?.edit).toEqual({ path: "package.json", op: "remove-dependency", section: "devDependencies", name: "@scope/name" });
  });

  it("range style is preserved for exact and tilde ranges", () => {
    const data = { ok: true as const, published: ["1.0.0", "1.2.5"], deprecated: new Set<string>(), advisories: new Map([["1.2.5", []]]) };
    for (const [declared, expected] of [["1.0.0", "1.2.5"], ["~1.0.0", "~1.2.5"], [">=1.0.0", "^1.2.5"]] as const) {
      const [plan] = planRemediation(report(pkg("x")), { intake: [intake("x", declared)], bumpData: new Map([["x", data]]) });
      expect(plan?.edit).toMatchObject({ op: "set-range", range: expected });
    }
  });

  it("does not throw for all signals unavailable and an unresolved version", () => {
    const p = { ...pkg("x", "Possessed", "unresolved") };
    expect(() => planRemediation(report(p), {})).not.toThrow();
  });
});
