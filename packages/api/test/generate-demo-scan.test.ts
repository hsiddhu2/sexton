// Examples for the demo scan generator. Requirements 2.19, 2.20. No network.

import { cpSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
// @ts-expect-error plain JavaScript module without declarations
import { buildDemoEvidence, buildDemoScan, DEFAULT_FIXTURES_DIR, serialiseDemoScan } from "../scripts/generate-demo-scan.mjs";
import { validateScanResponse } from "../../web/src/load/validate-scan-response.js";
import type { EvidencePack, ScanResponse } from "../src/contract.js";
import { COMMIT_NOTE, LOG_NOT_CONNECTED, renderEvidenceMarkdown, serialiseEvidencePack, verifyEvidencePack } from "@sexton/engine";

const here = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(here, "..", "..", "engine", "test", "fixtures");

let scan: ScanResponse;
let firstText: string;

beforeAll(async () => {
  scan = (await buildDemoScan({ fixturesDir: FIXTURES_DIR })) as ScanResponse;
  firstText = serialiseDemoScan(scan) as string;
});

describe("demo scan generator", () => {
  it("scores twelve packages (eleven fixtures and the seed)", () => {
    expect(scan.report.packages).toHaveLength(12);
  });

  it("matches expected-states.json for the ten fixture packages", () => {
    const expected = JSON.parse(readFileSync(join(FIXTURES_DIR, "expected-states.json"), "utf8")) as Record<
      string,
      { state: string; stateReason: string; missingSignals: string[] }
    >;
    const actual = Object.fromEntries(
      scan.report.packages
        .filter((p) => p.name !== "left-padder")
        .map((p) => [p.name, { state: p.state, stateReason: p.stateReason, missingSignals: p.missingSignals }]),
    );
    expect(actual).toEqual(expected);
  });

  it("scores left-padder as Possessed", () => {
    const p = scan.report.packages.find((x) => x.name === "left-padder");
    expect(p?.state).toBe("Possessed");
    expect(p?.stateReason).toBe("maintainer change in the last 90 days");
  });

  it("evaluates the default policy and fails it", () => {
    expect(scan.policy.source).toBe("default");
    expect(scan.policy.pass).toBe(false);
  });

  it("names the demo repository", () => {
    expect(scan.report.scan?.repo).toEqual({ owner: "sexton-demo", repo: "fixture", url: "https://github.com/sexton-demo/fixture" });
  });

  it("has one remediation per unhealthy package, and a title and body for a Dead package (spec remediation, 7.13)", () => {
    const unhealthy = scan.report.packages.filter((p) => ["Possessed", "Dead", "Haunted"].includes(p.state)).map((p) => p.name);
    expect(scan.remediations?.map((r) => r.packageName)).toEqual(unhealthy);
    const uuid = scan.remediations?.find((r) => r.packageName === "uuid");
    expect(uuid).toMatchObject({ kind: "bump", status: "proposed", chosenVersion: "11.1.1", majorUpgrade: true, title: "Sexton: bump uuid to 11.1.1" });
    expect(uuid?.prBody).toContain("Bump `uuid` from `9.0.1` to `11.1.1`.");
    expect(uuid?.intent?.files).toEqual([{ path: "package.json", op: "set-range", section: "dependencies", name: "uuid", range: "^11.1.1" }]);
    const request = scan.remediations?.find((r) => r.packageName === "request");
    expect(request).toMatchObject({ status: "no-safe-version", title: "Sexton: no change proposed for request" });
    expect(scan.remediations?.find((r) => r.packageName === "lodash")).toMatchObject({ status: "proposed", chosenVersion: "4.18.1", majorUpgrade: false });
    // Spec migration-node-sass, Requirement 7.3: node-sass stays Dead and shows the migration with its review list.
    const nodeSass = scan.remediations?.find((r) => r.packageName === "node-sass");
    expect(scan.report.packages.find((p) => p.name === "node-sass")?.state).toBe("Dead");
    expect(nodeSass).toMatchObject({ kind: "migrate", status: "proposed", title: "Sexton: migrate node-sass to sass" });
    expect(nodeSass?.intent?.files.map((f) => f.op)).toEqual(["remove-dependency", "add-dependency"]);
    expect(nodeSass?.intent?.reviewComments.map((c) => [c.path, c.line])).toEqual([
      ["package.json", null],
      ["scripts/compile.js", 3],
      ["scripts/compile.js", 8],
      ["src/styles/app.scss", 3],
    ]);
    expect(nodeSass?.prBody).toContain("## Review before merging");
  });

  it("passes the web contract validator", () => {
    const result = validateScanResponse(JSON.parse(firstText));
    expect(result.ok).toBe(true);
  });

  // Spec cemetery-time, 8.11, 8.14, 13.2.
  it("carries a timeline for each package, ending in the scan state, and the validator accepts it", () => {
    for (const p of scan.report.packages) {
      const segments = scan.timelines?.[p.name]?.segments ?? [];
      expect(segments.length).toBeGreaterThan(0);
      expect(segments[segments.length - 1]?.state).toBe(p.state);
      expect(segments.every((s) => s.version === undefined)).toBe(true);
    }
    expect(Object.keys(scan.timelines ?? {})).toEqual(scan.report.packages.map((p) => p.name));
  });
  it("gives byte-identical output on two runs", async () => {
    const again = serialiseDemoScan(await buildDemoScan({ fixturesDir: FIXTURES_DIR })) as string;
    expect(again).toBe(firstText);
  });

  it("DEFAULT_FIXTURES_DIR points at the engine fixtures", () => {
    expect(DEFAULT_FIXTURES_DIR).toBe(FIXTURES_DIR);
  });
});

describe("unrouted URL", () => {
  let copy = "";
  beforeAll(() => {
    copy = mkdtempSync(join(tmpdir(), "sexton-fixtures-"));
    cpSync(FIXTURES_DIR, copy, { recursive: true });
    // Remove one recorded response so its request has no route.
    rmSync(join(copy, "packages", "lodash", "deps-dev.json"), { force: true });
  });
  afterAll(() => {
    rmSync(copy, { recursive: true, force: true });
  });

  it("makes the build fail", async () => {
    await expect(buildDemoScan({ fixturesDir: copy })).rejects.toThrow(/unrouted URLs/);
  });
});

// Spec evidence-pack, Requirement 8.1.
describe("demo evidence pack", () => {
  it("is built from the same scan, verifies, and carries the demo remediations as plans with no log", async () => {
    const { pack, json, markdown } = (await buildDemoEvidence(scan)) as { pack: EvidencePack; json: string; markdown: string };
    expect(await verifyEvidencePack(JSON.parse(json))).toEqual({ ok: true });
    expect(json).toBe(serialiseEvidencePack(pack));
    expect(markdown).toBe(renderEvidenceMarkdown(pack));
    expect(markdown).toContain(LOG_NOT_CONNECTED);
    expect(pack.body.scan).toMatchObject({ repository: "https://github.com/sexton-demo/fixture", commit: null, commitNote: COMMIT_NOTE, totalDirect: 12 });
    expect(pack.body.packages).toHaveLength(scan.report.packages.length);
    expect(pack.body.remediation.log).toEqual({ available: false, entries: [] });
    expect(pack.body.remediation.plans.map((p) => p.packageName)).toEqual((scan.remediations ?? []).map((r) => r.packageName));
    expect(pack.body.remediation.plans.find((p) => p.packageName === "node-sass")).toMatchObject({ kind: "migrate", status: "proposed", title: "Sexton: migrate node-sass to sass" });
  });

  it("keeps the evidence digest recorded before timelines existed, with or without timelines", async () => {
    const { pack } = (await buildDemoEvidence(scan)) as { pack: EvidencePack };
    expect(pack.integrity.digest).toBe("c8fb6cab465d46ca92cf83dbc10022b6a662c8fad68ec8f64d827ef16f43344d");
    const { timelines: _timelines, ...without } = scan;
    void _timelines;
    const again = (await buildDemoEvidence(without as ScanResponse)) as { pack: EvidencePack };
    expect(again.pack.integrity.digest).toBe(pack.integrity.digest);
  });
  it("is deterministic", async () => {
    const a = (await buildDemoEvidence(scan)) as { json: string };
    const b = (await buildDemoEvidence(structuredClone(scan))) as { json: string };
    expect(b.json).toBe(a.json);
  });
});
