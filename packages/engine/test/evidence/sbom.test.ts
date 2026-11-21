// Spec: .kiro/specs/evidence-pack, Requirements 2.1 to 2.7. Properties 35, 36 and 38.

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { buildSbom } from "../../src/evidence/sbom.js";
import { ENGINE_VERSION, REPO_URL } from "../../src/version.js";
import type { IntakePackage, PackageHealth } from "../../src/types.js";
import { healthySignals } from "../remediation/arbitraries.js";
import { AT, arbIntakeFor, arbPackages, arbRepoRef } from "./arbitraries.js";
import { validateBom } from "./schema.js";

const REPO = { owner: "acme", repo: "app", url: "https://github.com/acme/app" };
const SERIAL = /^urn:uuid:[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function pkg(name: string, installedVersion: string, state: PackageHealth["state"] = "Alive"): PackageHealth {
  return { name, installedVersion, state, stateReason: "r", signals: healthySignals(), missingSignals: [] };
}
function dep(name: string, origin: IntakePackage["origin"], resolution: IntakePackage["resolution"] = "locked"): IntakePackage {
  return { name, installedVersion: "1.0.0", declaredRange: "^1.0.0", origin, resolution };
}

describe("buildSbom", () => {
  it("writes exactly the documented fields", async () => {
    const bom = await buildSbom({
      repo: REPO,
      commit: "a".repeat(40),
      generatedAt: AT.toISOString(),
      packages: [pkg("zeta", "2.0.0", "Dead"), pkg("@types/node", "22.10.2"), pkg("loose", "unresolved"), pkg("zeta", "9.9.9")],
      dependencies: [dep("@types/node", "devDependencies"), dep("zeta", "dependencies"), dep("zeta", "devDependencies")],
    });
    expect(validateBom(bom)).toBe(true);
    expect(Object.keys(bom)).toEqual(["bomFormat", "specVersion", "version", "serialNumber", "metadata", "components", "dependencies", "compositions"]);
    expect(bom.metadata).toEqual({
      timestamp: AT.toISOString(),
      tools: { components: [{ type: "application", name: "sexton", version: ENGINE_VERSION, externalReferences: [{ type: "vcs", url: REPO_URL }] }] },
      component: { type: "application", name: "acme/app", "bom-ref": REPO.url, version: "a".repeat(40), externalReferences: [{ type: "vcs", url: REPO.url }] },
      properties: [{ name: "sexton:sbom:scope", value: "direct-dependencies" }],
    });
    expect(bom.components).toEqual([
      {
        type: "library",
        group: "@types",
        name: "node",
        version: "22.10.2",
        purl: "pkg:npm/%40types/node@22.10.2",
        "bom-ref": "pkg:npm/%40types/node@22.10.2",
        scope: "excluded",
        properties: [
          { name: "sexton:state", value: "Alive" },
          { name: "sexton:resolution", value: "locked" },
          { name: "cdx:npm:package:development", value: "true" },
        ],
      },
      { type: "library", name: "loose", purl: "pkg:npm/loose", "bom-ref": "pkg:npm/loose", properties: [{ name: "sexton:state", value: "Alive" }] },
      {
        type: "library",
        name: "zeta",
        version: "2.0.0",
        purl: "pkg:npm/zeta@2.0.0",
        "bom-ref": "pkg:npm/zeta@2.0.0",
        properties: [
          { name: "sexton:state", value: "Dead" },
          { name: "sexton:resolution", value: "locked" },
        ],
      },
    ]);
    expect(bom.dependencies).toEqual([{ ref: REPO.url, dependsOn: ["pkg:npm/%40types/node@22.10.2", "pkg:npm/loose", "pkg:npm/zeta@2.0.0"] }]);
    expect(bom.compositions).toEqual([{ aggregate: "incomplete", assemblies: [REPO.url], dependencies: [REPO.url] }]);
    expect(JSON.stringify(bom)).not.toMatch(/licen[cs]e|hashes/);
  });

  it("omits the repository version when the commit is unknown, and accepts zero packages", async () => {
    const bom = await buildSbom({ repo: REPO, commit: null, generatedAt: AT.toISOString(), packages: [], dependencies: [] });
    expect(validateBom(bom)).toBe(true);
    expect("version" in bom.metadata.component).toBe(false);
    expect(bom.components).toEqual([]);
    expect(bom.dependencies).toEqual([{ ref: REPO.url, dependsOn: [] }]);
  });
});

const arbSbomInput = fc.tuple(arbRepoRef, arbPackages, fc.option(fc.stringMatching(/^[0-9a-f]{40}$/), { nil: null })).chain(([repo, packages, commit]) =>
  arbIntakeFor(packages).map((dependencies) => ({ repo, commit, generatedAt: AT.toISOString(), packages, dependencies })),
);

describe("Feature: evidence-pack, Property 35: The SBOM validates for any package set", () => {
  it("validates against the vendored CycloneDX 1.5 schema", async () => {
    await fc.assert(
      fc.asyncProperty(arbSbomInput, async (input) => {
        const bom = await buildSbom(input);
        expect(validateBom(bom), JSON.stringify(validateBom.errors)).toBe(true);
      }),
      { numRuns: 100 },
    );
  });
});

describe("Feature: evidence-pack, Property 36: SBOM references", () => {
  it("has unique bom-refs, dependsOn equal to the component refs and one component per package", async () => {
    await fc.assert(
      fc.asyncProperty(arbSbomInput, async (input) => {
        const bom = await buildSbom(input);
        const refs = bom.components.map((c) => c["bom-ref"]);
        expect(new Set(refs).size).toBe(refs.length);
        expect(bom.components.length).toBe(input.packages.length);
        expect([...(bom.dependencies[0]?.dependsOn ?? [])].sort()).toEqual([...refs].sort());
      }),
      { numRuns: 100 },
    );
  });
});

describe("Feature: evidence-pack, Property 38: Serial number", () => {
  it("matches the schema pattern with version 8 and variant 10, and is equal for equal input", async () => {
    await fc.assert(
      fc.asyncProperty(arbSbomInput, async (input) => {
        const a = await buildSbom(input);
        const b = await buildSbom(structuredClone(input));
        expect(a.serialNumber).toMatch(SERIAL);
        expect(b.serialNumber).toBe(a.serialNumber);
      }),
      { numRuns: 100 },
    );
  });
});
