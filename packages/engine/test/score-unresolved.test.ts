import { describe, expect, it } from "vitest";
import { ABBREVIATED_ACCEPT, NPM_REGISTRY, packumentUrl } from "../src/clients/npm.js";
import { UNRESOLVED_VERSION } from "../src/intake/resolve.js";
import { scorePackages } from "../src/score.js";
import { SIGNAL_NAMES, type PackageRef } from "../src/types.js";
import { NOW, routedTransport, type Route } from "./helpers.js";

const noSleep = { sleep: () => Promise.resolve() };
const REAL: PackageRef = { name: "real", installedVersion: "1.0.0" };
const url = "https://registry.npmjs.org/real";
const realRoutes: Route[] = [
  { url, accept: "application/json", json: { time: { "1.0.0": "2026-10-01T00:00:00Z" }, versions: { "1.0.0": {} } } },
  { url, accept: ABBREVIATED_ACCEPT, json: { versions: { "1.0.0": {} } } },
  {
    url: "https://api.osv.dev/v1/querybatch",
    body: JSON.stringify({ queries: [{ package: { name: "real", ecosystem: "npm" }, version: "1.0.0" }] }),
    json: { results: [{}] },
  },
];

function unresolved(name: string): PackageRef {
  return { name, installedVersion: UNRESOLVED_VERSION };
}

async function score(packages: readonly PackageRef[]) {
  const { transport, calls } = routedTransport(realRoutes);
  const report = await scorePackages(packages, { transport, clock: () => NOW, retry: noSleep });
  return { report, calls };
}

function missingGraphs(report: Awaited<ReturnType<typeof score>>["report"], name: string): number | undefined {
  const signal = report.packages.find((p) => p.name === name)?.signals.transitiveReach;
  return signal?.available === true ? signal.value.graphsMissing : undefined;
}

describe("scorePackages with an unresolved package", () => {
  it.each([
    ["plain", "ghost"],
    ["scoped", "@scope/ghost"],
    ["lone surrogate", "ghost-\uD800"],
  ])("makes no request and gives ten unavailable signals for a %s name", async (_label, name) => {
    const baseline = await score([REAL]);
    const { report, calls } = await score([REAL, unresolved(name)]);
    expect(calls.every((c) => !c.url.includes("ghost"))).toBe(true);
    expect(calls.length).toBe(baseline.calls.length);

    const ghost = report.packages[1];
    expect(ghost?.name).toBe(name);
    expect(ghost?.installedVersion).toBe(UNRESOLVED_VERSION);
    expect(ghost?.state).toBeDefined();
    expect(ghost?.missingSignals).toEqual([...SIGNAL_NAMES]);
    const expectedSource = name === "ghost-\uD800" ? NPM_REGISTRY : packumentUrl(name);
    for (const signalName of SIGNAL_NAMES) {
      const signal = ghost?.signals[signalName];
      expect(signal?.available).toBe(false);
      expect(signal?.reason).toBe("unresolvable range");
      expect(signal?.source).toBe(expectedSource);
    }

    expect(missingGraphs(report, "real")).toBe((missingGraphs(baseline.report, "real") ?? NaN) + 1);
  });

  it.each([
    ["first", 0],
    ["middle", 1],
    ["last", 2],
  ])("preserves order with the unresolved package %s", async (_label, index) => {
    const list = [REAL, { name: "real", installedVersion: "1.0.0" }];
    list.splice(index, 0, unresolved("ghost"));
    const { report } = await score(list);
    expect(report.packages.map((p) => p.name)).toEqual(list.map((p) => p.name));
    expect(report.packages[index]?.installedVersion).toBe(UNRESOLVED_VERSION);
  });

  it("a list with no sentinel scores each package as it does alone", async () => {
    const alone = await score([REAL]);
    const again = await score([REAL]);
    expect(again.report).toStrictEqual(alone.report);
    expect(alone.report.packages[0]?.missingSignals).not.toContain("lastPublish");
    expect(missingGraphs(alone.report, "real")).toBe(1);
  });
});
