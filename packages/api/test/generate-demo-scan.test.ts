// Examples for the demo scan generator. Requirements 2.19, 2.20. No network.

import { cpSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
// @ts-expect-error plain JavaScript module without declarations
import { buildDemoScan, DEFAULT_FIXTURES_DIR, serialiseDemoScan } from "../scripts/generate-demo-scan.mjs";
import { validateScanResponse } from "../../web/src/load/validate-scan-response.js";
import type { ScanResponse } from "../src/contract.js";

const here = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(here, "..", "..", "engine", "test", "fixtures");

let scan: ScanResponse;
let firstText: string;

beforeAll(async () => {
  scan = (await buildDemoScan({ fixturesDir: FIXTURES_DIR })) as ScanResponse;
  firstText = serialiseDemoScan(scan) as string;
});

describe("demo scan generator", () => {
  it("scores eleven packages", () => {
    expect(scan.report.packages).toHaveLength(11);
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
  });

  it("passes the web contract validator", () => {
    const result = validateScanResponse(JSON.parse(firstText));
    expect(result.ok).toBe(true);
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
