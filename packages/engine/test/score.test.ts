// Scoring entry point. Requirements 10, 14.

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { buildHealth, mapWithConcurrency, PACKAGE_CONCURRENCY, scorePackages } from "../src/score.js";
import { ABBREVIATED_ACCEPT } from "../src/clients/npm.js";
import { SIGNAL_NAMES, STATE_ORDER } from "../src/types.js";
import { packageSignalsArb } from "./arbitraries.js";
import { NOW, routedTransport, type Route } from "./helpers.js";

const QB = "https://api.osv.dev/v1/querybatch";
const noSleep = { sleep: () => Promise.resolve() };

function npmRoutes(name: string, version: string, opts: { publish: string; deprecated?: string; install?: boolean }): Route[] {
  const url = `https://registry.npmjs.org/${name}`;
  return [
    { url, accept: "application/json", json: { time: { [version]: opts.publish }, versions: { [version]: opts.deprecated === undefined ? {} : { deprecated: opts.deprecated } } } },
    { url, accept: ABBREVIATED_ACCEPT, json: { versions: { [version]: opts.install === undefined ? {} : { hasInstallScript: opts.install } } } },
  ];
}

function osvRoute(name: string, version: string, ids: string[]): Route {
  return { url: QB, body: JSON.stringify({ queries: [{ package: { name, ecosystem: "npm" }, version }] }), json: { results: [{ vulns: ids.map((id) => ({ id })) }] } };
}

describe("scorePackages", () => {
  it("returns one entry per package in input order with generatedAt from the clock (10.1, 10.4)", async () => {
    const { transport } = routedTransport([
      ...npmRoutes("fresh", "1.0.0", { publish: "2026-10-01T00:00:00Z" }),
      osvRoute("fresh", "1.0.0", []),
      ...npmRoutes("old", "1.0.0", { publish: "2020-01-01T00:00:00Z", install: true }),
      osvRoute("old", "1.0.0", []),
    ]);
    const report = await scorePackages(
      [
        { name: "fresh", installedVersion: "1.0.0" },
        { name: "old", installedVersion: "1.0.0" },
      ],
      { transport, clock: () => NOW, retry: noSleep },
    );
    expect(report.generatedAt).toBe("2026-11-12T00:00:00.000Z");
    expect(report.packages.map((p) => [p.name, p.state])).toEqual([
      ["fresh", "Alive"],
      ["old", "Dead"],
    ]);
    expect(report.packages[1]?.signals.hasInstallScript.value).toBe(true);
    expect(report.packages[0]?.missingSignals).toEqual([]);
  });

  it("a failing package does not affect another, and still gets a state (10.6, 14.3)", async () => {
    const { transport } = routedTransport([...npmRoutes("good", "1.0.0", { publish: "2026-10-01T00:00:00Z" }), osvRoute("good", "1.0.0", [])]);
    const report = await scorePackages(
      [
        { name: "good", installedVersion: "1.0.0" },
        { name: "gone", installedVersion: "1.0.0" },
      ],
      { transport, clock: () => NOW, retry: noSleep },
    );
    expect(report.packages[0]?.state).toBe("Alive");
    const gone = report.packages[1];
    expect(gone?.state).toBe("Restless");
    expect(gone?.missingSignals).toEqual([...SIGNAL_NAMES]);
    expect(gone?.stateReason).toBe("all state signals unavailable");
  });

  it("the report serialises to JSON without loss", async () => {
    const { transport } = routedTransport([...npmRoutes("p", "1.0.0", { publish: "2026-10-01T00:00:00Z" }), osvRoute("p", "1.0.0", [])]);
    const report = await scorePackages([{ name: "p", installedVersion: "1.0.0" }], { transport, clock: () => NOW, retry: noSleep });
    expect(JSON.parse(JSON.stringify(report))).toEqual(report);
  });

  it("limits package concurrency to 8 (10.2)", async () => {
    let inFlight = 0;
    let peak = 0;
    const items = Array.from({ length: 30 }, (_, i) => i);
    await mapWithConcurrency(items, PACKAGE_CONCURRENCY, async (i) => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 1));
      inFlight--;
      return i;
    });
    expect(peak).toBeLessThanOrEqual(8);
    expect(peak).toBeGreaterThan(1);
  });

  it("mapWithConcurrency preserves order", async () => {
    const out = await mapWithConcurrency([3, 1, 2], 2, (n) => new Promise<number>((r) => setTimeout(() => r(n * 10), n)));
    expect(out).toEqual([30, 10, 20]);
  });
});

describe("buildHealth properties (14.2)", () => {
  it("missingSignals lists exactly the unavailable signals and the state is always allowed", () => {
    fc.assert(
      fc.property(packageSignalsArb, (signals) => {
        const h = buildHealth({ name: "p", installedVersion: "1.0.0" }, signals, NOW);
        const expected = SIGNAL_NAMES.filter((n) => !signals[n].available);
        expect(h.missingSignals).toEqual(expected);
        expect(STATE_ORDER).toContain(h.state);
        expect(h.state).not.toBe("Possessed");
      }),
      { numRuns: 500 },
    );
  });
});
