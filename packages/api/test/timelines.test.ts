// Timelines in the scan response. Spec cemetery-time, requirements 8.11, 8.12, 8.14. No network.
import { InMemorySnapshotStore, MemoryCacheStore, type ClientContext, type HealthReport, type TimelineSinkInput, CachedFetcher } from "@sexton/engine";
import { describe, expect, it } from "vitest";
import { validateScanResponse } from "../../web/src/load/validate-scan-response.js";
import { runScan, scanWithInputs, type ScanDeps, type Summary } from "../src/scan.js";
import { buildTimelines } from "../src/timelines.js";
import { captureLogger } from "./support/capture-logger.js";
import { FIXTURE_NOW, fixturePackages, packageRoutes, PLAN_ROUTES, repoRoutes, routedTransport } from "./support/fixture-transport.js";

const POLICY_URL = "https://raw.githubusercontent.com/sexton-demo/fixture/HEAD/sexton.policy.yml";
const REPO_URL = "https://github.com/sexton-demo/fixture";

function routes() {
  const packages = fixturePackages();
  return [...repoRoutes("sexton-demo", "fixture", packages), ...packages.flatMap((p) => packageRoutes(p.name, p.installedVersion)), ...PLAN_ROUTES, { url: POLICY_URL, status: 404, text: "" }];
}

function deps() {
  const routed = routedTransport(routes());
  const log = captureLogger();
  const d: ScanDeps = {
    transport: routed.transport,
    cacheStore: new MemoryCacheStore(),
    snapshotStore: new InMemorySnapshotStore(),
    clock: () => FIXTURE_NOW,
    log,
    retry: { sleep: () => Promise.resolve() },
  };
  return { deps: d, calls: routed.calls, log };
}

const SUMMARY = (): Summary => ({ status: 500, packages: 0, capped: false, unlocked: false, policySource: "none" });

describe("timelines in the scan response", () => {
  it("scan adds timelines and sends no extra packument request", async () => {
    const withTimelines = deps();
    const outcome = await runScan(REPO_URL, withTimelines.deps);
    expect(outcome.ok).toBe(true);
    const without = deps();
    const plain = await scanWithInputs(REPO_URL, without.deps, SUMMARY());
    expect(plain.ok).toBe(true);
    const sorted = (calls: readonly { url: string }[]) => calls.map((c) => c.url).sort();
    expect(sorted(withTimelines.calls)).toEqual(sorted(without.calls));
    if (!outcome.ok || !plain.ok) return;
    expect(Object.keys(outcome.body.timelines ?? {}).sort()).toEqual(outcome.body.report.packages.map((p) => p.name).sort());
    expect(validateScanResponse(JSON.parse(JSON.stringify(outcome.body))).ok).toBe(true);
    // The report, the policy and the plans are the same with and without timelines (8.14).
    expect(outcome.body.report).toEqual(plain.body.report);
    expect(outcome.body.policy).toEqual(plain.body.policy);
    expect(outcome.body.remediations).toEqual(plain.body.remediations);
  });

  it("the evidence path (scanWithInputs by default) builds no timeline", async () => {
    const d = deps();
    const plain = await scanWithInputs(REPO_URL, d.deps, SUMMARY());
    expect(plain.ok && "timelines" in plain.body).toBe(false);
  });

  it("the last Segment of each timeline carries the scan state", async () => {
    const outcome = await runScan(REPO_URL, deps().deps);
    if (!outcome.ok) throw new Error("scan failed");
    for (const p of outcome.body.report.packages) {
      const segments = outcome.body.timelines?.[p.name]?.segments ?? [];
      expect(segments[segments.length - 1]?.state).toBe(p.state);
    }
  });

  it("a throwing build omits one entry and keeps the others", async () => {
    const d = deps();
    const outcome = await runScan(REPO_URL, d.deps);
    if (!outcome.ok) throw new Error("scan failed");
    const report: HealthReport = outcome.body.report;
    const ctx: ClientContext = { transport: d.deps.transport, clock: d.deps.clock, cache: new CachedFetcher({ store: new MemoryCacheStore(), clock: d.deps.clock }) };
    const good = (name: string, version: string): TimelineSinkInput => ({
      name,
      installedVersion: version,
      fullPackument: { time: { [version]: "2026-01-01T00:00:00.000Z" } },
      abbreviatedPackument: { versions: { [version]: {} } },
      provenance: { value: { present: false, predicateType: null }, source: "s", fetchedAt: FIXTURE_NOW.toISOString(), available: true },
    });
    const first = report.packages[0];
    const second = report.packages[1];
    if (first === undefined || second === undefined) throw new Error("fixture too small");
    const poisoned = { ...good(first.name, first.installedVersion), get fullPackument(): unknown { throw new Error("boom"); } };
    const inputs = new Map<string, TimelineSinkInput>([
      [first.name, poisoned],
      [second.name, good(second.name, second.installedVersion)],
    ]);
    const result = await buildTimelines(ctx, report, inputs, FIXTURE_NOW);
    expect(Object.keys(result)).toEqual([second.name]);
  });

  it("a package named __proto__ is a plain key", async () => {
    const d = deps();
    const outcome = await runScan(REPO_URL, d.deps);
    if (!outcome.ok) throw new Error("scan failed");
    const base = outcome.body.report.packages[0];
    if (base === undefined) throw new Error("fixture too small");
    const report: HealthReport = { ...outcome.body.report, packages: [{ ...base, name: "__proto__" }] };
    const ctx: ClientContext = { transport: d.deps.transport, clock: d.deps.clock, cache: new CachedFetcher({ store: new MemoryCacheStore(), clock: d.deps.clock }) };
    const input: TimelineSinkInput = {
      name: "__proto__",
      installedVersion: base.installedVersion,
      fullPackument: null,
      abbreviatedPackument: null,
      provenance: { value: null, source: "s", fetchedAt: FIXTURE_NOW.toISOString(), available: false, reason: "x" },
    };
    const result = await buildTimelines(ctx, report, new Map([["__proto__", input]]), FIXTURE_NOW);
    expect(Object.keys(result)).toEqual(["__proto__"]);
    expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
  });

  it("logs nothing about the repository from the timeline step", async () => {
    const d = deps();
    await runScan(REPO_URL, d.deps);
    expect(JSON.stringify(d.log.lines)).not.toContain("sexton-demo");
  });
});
