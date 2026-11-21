// Spec: .kiro/specs/migration-node-sass, Requirements 3.1, 3.5, 3.6, 9.2, property 29.

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { gatherMigrationData } from "../../src/remediation/gather-migration-data.js";
import type { BumpDataResult, IntakePackage, PackageJsonView } from "../../src/types.js";
import { MARKER } from "./arbitraries.js";
import { contextFor, FAULTS, scriptedUpstream, type Call, type Fault, type PackageModel, type VulnRecord } from "./routes.js";

const dep = (name: string, installedVersion: string): IntakePackage => ({ name, installedVersion, declaredRange: `^${installedVersion}`, origin: "devDependencies", resolution: "locked" });

const model = (name: string, fault: Fault | "none", extra: number): PackageModel => ({
  name,
  versions: { "1.0.0": "", "7.1.0": "", "7.2.0": "", "8.0.0": "deprecated", "9.0.0": "" },
  ids: { "7.2.0": [`GHSA-${name.length === 4 ? "s" : "l"}aaa`], "9.0.0": [] },
  extraPages: { "7.2.0": extra },
  ...(fault === "none" ? {} : { fault }),
});

function vulnsFor(models: readonly PackageModel[]): Map<string, VulnRecord> {
  const out = new Map<string, VulnRecord>();
  for (const m of models) for (const id of Object.values(m.ids).flat()) out.set(id, { id, summary: `s ${MARKER}`, database_specific: { severity: "LOW" } });
  return out;
}

const perPackage = (calls: readonly Call[], name: string): { packument: number; batch: number } => ({
  packument: calls.filter((c) => c.url === `https://registry.npmjs.org/${name}`).length,
  batch: calls.filter((c) => c.url.endsWith("/querybatch") && (c.body ?? "").includes(`"name":"${name}"`)).length,
});

const VIEWS: Record<string, PackageJsonView> = {
  both: { packages: [dep("node-sass", "7.0.3"), dep("sass-loader", "7.1.0")], scripts: new Map() },
  compatible: { packages: [dep("node-sass", "7.0.3"), dep("sass-loader", "8.0.0")], scripts: new Map() },
  sassListed: { packages: [dep("node-sass", "7.0.3"), dep("sass", "1.0.0")], scripts: new Map() },
  noNodeSass: { packages: [dep("sass-loader", "7.1.0")], scripts: new Map() },
};

describe("gatherMigrationData", () => {
  it("Feature: migration-node-sass, Property 29: Migration data bound and isolation", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom<Fault | "none">("none", ...FAULTS),
        fc.constantFrom<Fault | "none">("none", ...FAULTS),
        fc.nat(3),
        fc.constantFrom(...Object.keys(VIEWS)),
        async (sassFault, loaderFault, extra, viewName) => {
          const view = VIEWS[viewName] as PackageJsonView;
          const models = [model("sass", sassFault, extra), model("sass-loader", loaderFault, extra)];
          const vulns = vulnsFor(models);
          const { transport, calls } = scriptedUpstream(models, vulns);
          const data = await gatherMigrationData(contextFor(transport), view);
          const wantSass = viewName !== "noNodeSass" && viewName !== "sassListed";
          const wantLoader = viewName === "both";
          expect([...data.keys()].sort()).toEqual([...(wantSass ? ["sass"] : []), ...(wantLoader ? ["sass-loader"] : [])].sort());
          for (const [name, fault] of [["sass", sassFault], ["sass-loader", loaderFault]] as const) {
            const c = perPackage(calls, name);
            // One packument request; a 503 is retried at most three times by requestWithRetry.
            expect(c.packument).toBeLessThanOrEqual(fault === "packument-503" ? 4 : 1);
            expect(c.batch).toBeLessThanOrEqual(10);
          }
          if (!wantLoader) expect(perPackage(calls, "sass-loader")).toEqual({ packument: 0, batch: 0 });
          if (!wantSass) expect(perPackage(calls, "sass")).toEqual({ packument: 0, batch: 0 });
          expect(calls.filter((c) => c.url.includes("/v1/vulns/")).length).toBeLessThanOrEqual(400);
          // Isolation: each package's data equals a run where the other one succeeded.
          for (const [i, name] of ["sass", "sass-loader"].entries()) {
            const got = data.get(name);
            if (got === undefined) continue;
            const clean = models.map((m, j) => (j === i ? m : model(m.name, "none", extra)));
            const alone = await gatherMigrationData(contextFor(scriptedUpstream(clean, vulnsFor(clean)).transport), view);
            expect(got).toEqual(alone.get(name) as BumpDataResult);
            if (!got.ok) expect(got.reason).not.toContain(MARKER);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it("sass candidates are the newest releases, sass-loader candidates start at 7.2.0", async () => {
    const models = [model("sass", "none", 0), model("sass-loader", "none", 0)];
    const { transport, calls } = scriptedUpstream(models, vulnsFor(models));
    await gatherMigrationData(contextFor(transport), VIEWS["both"] as PackageJsonView);
    const versionsFor = (name: string): string[] => {
      const body = calls.find((c) => c.url.endsWith("/querybatch") && (c.body ?? "").includes(`"name":"${name}"`))?.body ?? "{}";
      return (JSON.parse(body) as { queries: { version: string }[] }).queries.map((q) => q.version);
    };
    expect(versionsFor("sass")).toEqual(["9.0.0", "8.0.0", "7.2.0", "7.1.0", "1.0.0"]);
    expect(versionsFor("sass-loader")).toEqual(["7.2.0", "8.0.0", "9.0.0"]);
  });

  it("never rejects when the view is malformed", async () => {
    const { transport } = scriptedUpstream([], new Map());
    const bad = { packages: null, scripts: new Map() } as unknown as PackageJsonView;
    await expect(gatherMigrationData(contextFor(transport), bad)).resolves.toEqual(new Map());
  });
});
