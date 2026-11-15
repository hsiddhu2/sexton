// Two-phase scoring with the ten-signal entry. Requirements 3.2, 3.6, 6.9, 7.8, 10.1, 10.3, 10.4, 10.5, 10.8, 10.9, 10.12.

import { describe, expect, it } from "vitest";
import { attestationsUrl } from "../src/clients/attestations.js";
import { dependenciesUrl } from "../src/clients/deps-dev.js";
import { ABBREVIATED_ACCEPT } from "../src/clients/npm.js";
import type { Transport } from "../src/http.js";
import { buildHealth, scorePackages } from "../src/score.js";
import { available } from "../src/signal.js";
import { InMemorySnapshotStore, RECENT_WINDOW_MS, type Snapshot, type SnapshotStore } from "../src/snapshot.js";
import { NEW_SIGNAL_NAMES, SIGNAL_NAMES, type HealthReport, type PackageHealth, type PackageRef } from "../src/types.js";
import { NOW, routedTransport, type Route } from "./helpers.js";

const QB = "https://api.osv.dev/v1/querybatch";
const VERSION = "1.0.0";
const noSleep = { sleep: () => Promise.resolve() };

interface PkgOptions {
  readonly graph?: unknown;
  readonly attestations?: "error";
  readonly maintainers?: readonly string[];
}

function graphBody(names: readonly string[], edges: readonly (readonly [number, number])[]): unknown {
  return {
    nodes: names.map((name) => ({ versionKey: { system: "NPM", name, version: VERSION } })),
    edges: edges.map(([fromNode, toNode]) => ({ fromNode, toNode })),
  };
}

function pkgRoutes(name: string, options: PkgOptions = {}): Route[] {
  const url = `https://registry.npmjs.org/${name}`;
  const routes: Route[] = [
    {
      url,
      accept: "application/json",
      json: {
        time: { [VERSION]: "2026-10-01T00:00:00Z" },
        versions: { [VERSION]: {} },
        maintainers: (options.maintainers ?? ["alice"]).map((n) => ({ name: n })),
      },
    },
    { url, accept: ABBREVIATED_ACCEPT, json: { versions: { [VERSION]: {} } } },
    { url: QB, body: JSON.stringify({ queries: [{ package: { name, ecosystem: "npm" }, version: VERSION }] }), json: { results: [{}] } },
  ];
  if (options.graph !== undefined) routes.push({ url: dependenciesUrl(name, VERSION), json: options.graph });
  if (options.attestations === "error") routes.push({ url: attestationsUrl(name, VERSION), status: 500, json: {} });
  return routes;
}

const ref = (name: string): PackageRef => ({ name, installedVersion: VERSION });

async function run(routes: readonly Route[], names: readonly string[], store?: SnapshotStore): Promise<HealthReport> {
  const { transport } = routedTransport(routes);
  return scorePackages(names.map(ref), { transport, clock: () => NOW, retry: noSleep, ...(store !== undefined ? { snapshotStore: store } : {}) });
}

function entry(report: HealthReport, index: number): PackageHealth {
  const found = report.packages[index];
  if (found === undefined) throw new Error(`no entry ${index}`);
  return found;
}

function without(health: PackageHealth, omit: readonly string[]): unknown {
  return Object.fromEntries(Object.entries(health.signals).filter(([k]) => !omit.includes(k)));
}

/** Spy and failure-injecting wrapper over the in-memory store. */
class SpyStore implements SnapshotStore {
  appends = 0;
  readonly seen: { name: string; at: number }[] = [];
  readonly inner = new InMemorySnapshotStore();
  historyThrows = false;
  seenThrows = false;
  append(snapshot: Snapshot): Promise<void> {
    this.appends += 1;
    return this.inner.append(snapshot);
  }
  history(name: string): Promise<readonly Snapshot[]> {
    return this.historyThrows ? Promise.reject(new Error("history down")) : this.inner.history(name);
  }
  recordSeen(name: string, at: Date): Promise<void> {
    this.seen.push({ name, at: at.getTime() });
    return this.seenThrows ? Promise.reject(new Error("seen down")) : this.inner.recordSeen(name, at);
  }
  listSeenWithin(reference: Date, windowMs: number): Promise<readonly string[]> {
    return this.inner.listSeenWithin(reference, windowMs);
  }
}

describe("two-phase scoring", () => {
  const names = Array.from({ length: 20 }, (_, i) => `pkg-${String(i).padStart(2, "0")}`);
  const allRoutes = names.flatMap((n) => pkgRoutes(n, { graph: graphBody([n], []) }));

  it("completes phase one before any phase-two request (3.2)", async () => {
    const { transport, calls } = routedTransport(allRoutes);
    await scorePackages(names.map(ref), { transport, clock: () => NOW, retry: noSleep });
    const isGraph = (url: string): boolean => url.startsWith("https://api.deps.dev");
    const lastGraph = calls.map((c) => isGraph(c.url)).lastIndexOf(true);
    const firstOther = calls.findIndex((c) => !isGraph(c.url));
    expect(lastGraph).toBeGreaterThanOrEqual(0);
    expect(firstOther).toBeGreaterThan(lastGraph);
  });

  it("never has more than 8 packages in flight in either phase (10.5)", async () => {
    const { transport: inner } = routedTransport(allRoutes);
    const peak = { deps: 0, other: 0 };
    const active = { deps: new Map<string, number>(), other: new Map<string, number>() };
    const transport: Transport = async (url, request) => {
      const phase = url.startsWith("https://api.deps.dev") ? "deps" : "other";
      const key = /pkg-\d\d/.exec(url + (request.body ?? ""))?.[0] ?? url;
      const map = active[phase];
      map.set(key, (map.get(key) ?? 0) + 1);
      peak[phase] = Math.max(peak[phase], map.size);
      await new Promise((resolve) => setTimeout(resolve, 1));
      try {
        return await inner(url, request);
      } finally {
        const left = (map.get(key) ?? 1) - 1;
        if (left === 0) map.delete(key);
        else map.set(key, left);
      }
    };
    await scorePackages(names.map(ref), { transport, clock: () => NOW, retry: noSleep });
    expect(peak.deps).toBeGreaterThan(1);
    expect(peak.deps).toBeLessThanOrEqual(8);
    expect(peak.other).toBeGreaterThan(1);
    expect(peak.other).toBeLessThanOrEqual(8);
  });
});

describe("failed graph (3.6)", () => {
  const trio = ["pkg-a", "pkg-b", "pkg-c"];
  const routesWith = (cGraph: boolean): Route[] => [
    ...pkgRoutes("pkg-a", { graph: graphBody(["pkg-a", "pkg-b"], [[0, 1]]) }),
    ...pkgRoutes("pkg-b", { graph: graphBody(["pkg-b"], []) }),
    ...pkgRoutes("pkg-c", cGraph ? { graph: graphBody(["pkg-c"], []) } : {}),
  ];

  it("counts the miss everywhere and changes nothing else", async () => {
    const ok = await run(routesWith(true), trio);
    const failed = await run(routesWith(false), trio);
    trio.forEach((_, i) => {
      const before = entry(ok, i);
      const after = entry(failed, i);
      expect(after.signals.transitiveReach.available).toBe(true);
      expect(after.signals.transitiveReach.value).toEqual({ reach: before.signals.transitiveReach.value?.reach, graphsMissing: 1 });
      expect(before.signals.transitiveReach.value?.graphsMissing).toBe(0);
      expect(without(after, ["transitiveReach"])).toEqual(without(before, ["transitiveReach"]));
      expect(after.state).toBe(before.state);
      expect(after.missingSignals).toEqual(before.missingSignals);
    });
    expect(entry(failed, 1).signals.transitiveReach.value?.reach).toBe(1);
  });

  it("uses the package's own deps.dev URL as source, also when its fetch failed", async () => {
    const report = await run(routesWith(false), trio);
    trio.forEach((name, i) => {
      expect(entry(report, i).signals.transitiveReach.source).toBe(dependenciesUrl(name, VERSION));
    });
  });
});

describe("missingSignals over ten names (10.3, 10.4)", () => {
  const routes = [...pkgRoutes("pkg-a", { graph: graphBody(["pkg-a"], []) })];

  it("equals exactly the unavailable names, and history-insufficient is not missing", async () => {
    const report = await run(routes, ["pkg-a"], new InMemorySnapshotStore());
    const health = entry(report, 0);
    expect(health.signals.maintainerChange.available).toBe(true);
    expect(health.signals.maintainerChange.value?.status).toBe("history-insufficient");
    expect(health.missingSignals).not.toContain("maintainerChange");
    expect(health.missingSignals).not.toContain("provenanceRegression");
    expect(health.missingSignals).toEqual(SIGNAL_NAMES.filter((n) => !health.signals[n].available));
    expect(Object.keys(health.signals)).toHaveLength(10);
  });

  it("treats history as empty when no store is supplied (10.3, 10.13)", async () => {
    const health = entry(await run(routes, ["pkg-a"]), 0);
    expect(health.missingSignals).not.toContain("maintainerChange");
    expect(health.missingSignals).not.toContain("provenanceRegression");
    expect(health.signals.maintainerChange.available).toBe(true);
    expect(health.signals.maintainerChange.value?.status).toBe("history-insufficient");
    expect(health.signals.provenanceRegression.available).toBe(true);
    expect(health.signals.provenanceRegression.value?.status).toBe("history-insufficient");
    expect(health.missingSignals).toEqual(SIGNAL_NAMES.filter((n) => !health.signals[n].available));
  });

  it("a throwing history() degrades only maintainerChange and provenanceRegression (6.9)", async () => {
    const healthy = entry(await run(routes, ["pkg-a"], new SpyStore()), 0);
    const broken = new SpyStore();
    broken.historyThrows = true;
    const degraded = entry(await run(routes, ["pkg-a"], broken), 0);
    expect(degraded.signals.maintainerChange.available).toBe(false);
    expect(degraded.signals.provenanceRegression.available).toBe(false);
    expect(without(degraded, ["maintainerChange", "provenanceRegression"])).toEqual(
      without(healthy, ["maintainerChange", "provenanceRegression"]),
    );
    expect(degraded.state).toBe(healthy.state);
    expect(degraded.missingSignals).toEqual(["maintainerChange", "provenanceRegression"]);
  });

  it("provenance unavailable wins over a store failure (7.8)", async () => {
    const broken = new SpyStore();
    broken.historyThrows = true;
    const health = entry(await run(pkgRoutes("pkg-a", { attestations: "error" }), ["pkg-a"], broken), 0);
    expect(health.signals.provenanceRegression.available).toBe(false);
    expect(health.signals.provenanceRegression.reason).toBe("provenance unavailable");
  });
});

describe("store interaction (10.8, 10.9, 10.12)", () => {
  const names = ["pkg-a", "pkg-b"];
  const routes = names.flatMap((n) => pkgRoutes(n, { graph: graphBody([n], []) }));

  it("never appends and records a Seen record per package at the Reference time", async () => {
    const store = new SpyStore();
    await run(routes, names, store);
    expect(store.appends).toBe(0);
    expect(store.seen.map((s) => s.name).sort()).toEqual(names);
    expect(store.seen.every((s) => s.at === NOW.getTime())).toBe(true);
    expect([...(await store.listSeenWithin(NOW, 0))].sort()).toEqual(names);
    expect([...(await store.listSeenWithin(NOW, RECENT_WINDOW_MS))].sort()).toEqual(names);
  });

  it("a throwing recordSeen leaves every entry identical", async () => {
    const good = await run(routes, names, new SpyStore());
    const broken = new SpyStore();
    broken.seenThrows = true;
    const bad = await run(routes, names, broken);
    expect(bad.packages).toEqual(good.packages);
  });
});

describe("buildHealth and seeded history", () => {
  it("fills missing new signals with unavailable 'not evaluated' and lists them", () => {
    const health = buildHealth(
      ref("pkg-a"),
      {
        lastPublish: available("2026-10-01T00:00:00.000Z", "src", NOW),
        deprecated: available(false, "src", NOW),
        hasInstallScript: available(false, "src", NOW),
        advisories: available([], "src", NOW),
      },
      NOW,
    );
    for (const name of NEW_SIGNAL_NAMES) {
      expect(health.signals[name].available).toBe(false);
      expect(health.signals[name].reason).toBe("not evaluated");
    }
    expect(health.missingSignals).toEqual([...NEW_SIGNAL_NAMES]);
    expect(health.state).toBe("Alive");
  });

  it("a recent maintainer change in seeded History makes the package Possessed", async () => {
    const store = new InMemorySnapshotStore();
    const versions = [{ version: VERSION, publishTime: "2026-09-01T00:00:00.000Z", hasInstallScript: false, provenance: null }];
    await store.append({ name: "pkg-a", captureTime: "2026-10-01T00:00:00.000Z", maintainers: ["alice", "bob"], versions });
    await store.append({ name: "pkg-a", captureTime: "2026-10-31T00:00:00.000Z", maintainers: ["alice", "mallory"], versions });
    const routes = pkgRoutes("pkg-a", { graph: graphBody(["pkg-a"], []), maintainers: ["alice", "mallory"] });
    const health = entry(await run(routes, ["pkg-a"], store), 0);
    expect(health.state).toBe("Possessed");
    expect(health.stateReason).toBe("maintainer change in the last 90 days");
  });
});
