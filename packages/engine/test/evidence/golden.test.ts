// The golden evidence pack and report from the fixture scan. Spec: .kiro/specs/evidence-pack, Requirements 9.2, 9.3.
// Notes on how they were made and checked are in test/fixtures/evidence/README.md.
// To rewrite them after a deliberate change: SEXTON_WRITE_GOLDEN=1 npx vitest run test/evidence/golden.test.ts, then check by hand.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildEvidencePack, serialiseEvidencePack } from "../../src/evidence/build-pack.js";
import { renderEvidenceMarkdown } from "../../src/evidence/render-markdown.js";
import { verifyEvidencePack } from "../../src/evidence/verify-pack.js";
import { attachScan } from "../../src/intake/scan.js";
import { DEFAULT_POLICY } from "../../src/policy/default.js";
import { evaluatePolicy } from "../../src/policy/evaluate.js";
import { scorePackages } from "../../src/score.js";
import type { EvidencePack, IntakePackage, PackageRef } from "../../src/types.js";
import { FIXTURES_DIR, fixtureDirFor, fixtureRoutes, NOW, routedTransport } from "../helpers.js";
import { validateBom } from "./schema.js";

const DIR = join(FIXTURES_DIR, "evidence");
const PACK_PATH = join(DIR, "expected-pack.json");
const REPORT_PATH = join(DIR, "expected-report.md");
const manifest = JSON.parse(readFileSync(join(FIXTURES_DIR, "packages.json"), "utf8")) as PackageRef[];
const recorded = manifest.every((p) => existsSync(join(fixtureDirFor(p.name), "packument.json")));

async function fixturePack(): Promise<EvidencePack> {
  const { transport } = routedTransport(manifest.flatMap((p) => fixtureRoutes(p.name, p.installedVersion)));
  const scored = await scorePackages(manifest, { transport, clock: () => NOW, retry: { sleep: () => Promise.resolve() } });
  const report = attachScan(scored, {
    repo: { owner: "sexton-demo", repo: "fixture", url: "https://github.com/sexton-demo/fixture" },
    unlocked: false,
    unlockedPackages: [],
    lockfileVersion: 3,
    capped: false,
    totalDirect: manifest.length,
    skipped: { peer: 0, optional: 0, invalidName: 0 },
    unresolved: [],
  });
  const dependencies: IntakePackage[] = manifest.map((p) => ({
    name: p.name,
    installedVersion: p.installedVersion,
    declaredRange: `^${p.installedVersion}`,
    origin: "dependencies",
    resolution: "locked",
  }));
  const result = await buildEvidencePack({
    report,
    dependencies,
    policyResult: evaluatePolicy(DEFAULT_POLICY, report, "default"),
    policyDigest: null,
    commit: null,
    manifestDigests: { packageJson: null, packageLock: null },
    remediations: [],
    remediationLog: null,
  });
  if (!result.ok) throw new Error(result.reason);
  return result.pack;
}

describe.skipIf(!recorded)("golden evidence pack", () => {
  it("equals expected-pack.json and expected-report.md", async () => {
    const pack = await fixturePack();
    const json = serialiseEvidencePack(pack);
    const md = renderEvidenceMarkdown(pack);
    if (process.env["SEXTON_WRITE_GOLDEN"] === "1") {
      mkdirSync(DIR, { recursive: true });
      writeFileSync(PACK_PATH, json);
      writeFileSync(REPORT_PATH, md);
    }
    expect(json).toBe(readFileSync(PACK_PATH, "utf8"));
    expect(md).toBe(readFileSync(REPORT_PATH, "utf8"));
  });

  it("verifies, and an edited copy fails with digest-mismatch", async () => {
    const golden = JSON.parse(readFileSync(PACK_PATH, "utf8")) as EvidencePack;
    expect(await verifyEvidencePack(golden)).toEqual({ ok: true });
    const edited = structuredClone(golden) as { body: { packages: { state: string }[] } };
    const first = edited.body.packages[0];
    if (first === undefined) throw new Error("no packages");
    first.state = first.state === "Alive" ? "Dead" : "Alive";
    expect(await verifyEvidencePack(edited)).toEqual({ ok: false, reason: "digest-mismatch" });
  });

  it("holds an SBOM that validates against the CycloneDX 1.5 schema", () => {
    const golden = JSON.parse(readFileSync(PACK_PATH, "utf8")) as EvidencePack;
    expect(validateBom(golden.body.sbom), JSON.stringify(validateBom.errors)).toBe(true);
    expect(golden.body.sbom.components).toHaveLength(manifest.length);
  });
});
