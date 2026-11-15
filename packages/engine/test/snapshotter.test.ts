// Snapshotter example tests. Requirements 5.1, 5.2, 5.3, 5.4, 5.6, 5.9. Properties live in task 6.3.

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { attestationsUrl } from "../src/clients/attestations.js";
import { ABBREVIATED_ACCEPT, packumentUrl } from "../src/clients/npm.js";
import { runSnapshotter } from "../src/snapshotter.js";
import { InMemorySnapshotStore, RECENT_WINDOW_MS, type Snapshot, type SnapshotStore } from "../src/snapshot.js";
import { makeContext, NOW, routedTransport, type Route } from "./helpers.js";

/** Store wrapper that records appends and can throw on append or listing. */
class SpyStore implements SnapshotStore {
  readonly inner = new InMemorySnapshotStore();
  readonly appended: Snapshot[] = [];
  listCalls = 0;
  constructor(
    private readonly options: { readonly failAppendFor?: readonly string[]; readonly listThrows?: boolean } = {},
  ) {}

  append(snapshot: Snapshot): Promise<void> {
    if (this.options.failAppendFor?.includes(snapshot.name) === true) {
      return Promise.reject(new Error("disk full"));
    }
    this.appended.push(structuredClone(snapshot));
    return this.inner.append(snapshot);
  }
  history(name: string): Promise<readonly Snapshot[]> {
    return this.inner.history(name);
  }
  recordSeen(name: string, at: Date): Promise<void> {
    return this.inner.recordSeen(name, at);
  }
  listSeenWithin(reference: Date, windowMs: number): Promise<readonly string[]> {
    this.listCalls += 1;
    if (this.options.listThrows === true) return Promise.reject(new Error("store offline"));
    return this.inner.listSeenWithin(reference, windowMs);
  }
}

/** Store whose listSeenWithin must never be called. */
class NoListStore extends SpyStore {
  override listSeenWithin(): Promise<readonly string[]> {
    throw new Error("listSeenWithin must not be called");
  }
}

function versionList(count: number): string[] {
  return Array.from({ length: count }, (_, i) => `1.${i}.0`);
}

function publishTime(index: number): string {
  return new Date(Date.UTC(2025, 0, 1 + index, 10)).toISOString();
}

function fullPackument(versions: readonly string[], maintainers: readonly string[] = ["alice"]): unknown {
  const time: Record<string, string> = { created: publishTime(0) };
  const entries: Record<string, object> = {};
  versions.forEach((v, i) => {
    time[v] = publishTime(i);
    entries[v] = {};
  });
  return { name: "x", maintainers: maintainers.map((name) => ({ name })), time, versions: entries };
}

function abbreviated(versions: readonly string[], withScript: readonly string[] = []): unknown {
  const entries: Record<string, object> = {};
  for (const v of versions) entries[v] = withScript.includes(v) ? { hasInstallScript: true } : {};
  return { name: "x", versions: entries };
}

function packageRoutes(name: string, versions: readonly string[], withScript: readonly string[] = []): Route[] {
  return [
    { url: packumentUrl(name), accept: "application/json", json: fullPackument(versions) },
    { url: packumentUrl(name), accept: ABBREVIATED_ACCEPT, json: abbreviated(versions, withScript) },
    ...versions.map((v) => ({ url: attestationsUrl(name, v), json: { attestations: [] } })),
  ];
}

describe("runSnapshotter empty seen list (5.1)", () => {
  it("names [] gives empty lists and no appends", async () => {
    const store = new NoListStore();
    const { transport, calls } = routedTransport([]);
    const result = await runSnapshotter(store, makeContext(transport), []);
    expect(result).toEqual({ snapshotted: [], failed: [] });
    expect(store.appended).toHaveLength(0);
    expect(calls).toHaveLength(0);
  });

  it("a store with no Seen records gives empty lists and no appends", async () => {
    const store = new SpyStore();
    const { transport, calls } = routedTransport([]);
    const result = await runSnapshotter(store, makeContext(transport));
    expect(result).toEqual({ snapshotted: [], failed: [] });
    expect(store.listCalls).toBe(1);
    expect(store.appended).toHaveLength(0);
    expect(calls).toHaveLength(0);
  });
});

describe("runSnapshotter seen list sources", () => {
  it("a listing failure returns an error result with no reads and no appends (5.9)", async () => {
    const store = new SpyStore({ listThrows: true });
    const { transport, calls } = routedTransport(packageRoutes("a", ["1.0.0"]));
    const result = await runSnapshotter(store, makeContext(transport));
    expect(result.snapshotted).toEqual([]);
    expect(result.failed).toEqual([]);
    expect(result.error).toContain("listing seen packages failed");
    expect(calls).toHaveLength(0);
    expect(store.appended).toHaveLength(0);
  });

  it("the store path snapshots packages with a Recent Seen record", async () => {
    const store = new SpyStore();
    await store.recordSeen("a", NOW);
    const { transport } = routedTransport(packageRoutes("a", ["1.0.0"]));
    const result = await runSnapshotter(store, makeContext(transport));
    expect(result).toEqual({ snapshotted: ["a"], failed: [] });
  });

  it("the names path never calls listSeenWithin and snapshots duplicates once (5.1)", async () => {
    const store = new NoListStore();
    const { transport } = routedTransport(packageRoutes("a", ["1.0.0"]));
    const result = await runSnapshotter(store, makeContext(transport), ["a", "a", "a"]);
    expect(result).toEqual({ snapshotted: ["a"], failed: [] });
    expect(result.error).toBeUndefined();
    expect(store.appended).toHaveLength(1);
  });
});

describe("runSnapshotter snapshot content", () => {
  it("records the 20 greatest of 21 versions and requests exactly 20 attestations (5.2)", async () => {
    const versions = versionList(21);
    const store = new SpyStore();
    const { transport, calls } = routedTransport(packageRoutes("x", versions));
    await runSnapshotter(store, makeContext(transport), ["x"]);

    const snapshot = store.appended[0];
    expect(snapshot?.versions).toHaveLength(20);
    expect(snapshot?.versions.map((v) => v.version)).toEqual(versions.slice(1));
    const attestationCalls = calls.filter((c) => c.url.includes("/-/npm/v1/attestations/"));
    expect(attestationCalls).toHaveLength(20);
    expect(attestationCalls.some((c) => c.url === attestationsUrl("x", versions[0] ?? ""))).toBe(false);
  });

  it("records a failed attestation as null and still appends (5.4, 5.6)", async () => {
    const versions = ["1.0.0", "1.1.0"];
    const routes = packageRoutes("x", versions).filter((r) => r.url !== attestationsUrl("x", "1.1.0"));
    routes.push({ url: attestationsUrl("x", "1.1.0"), status: 500, json: {} });
    const store = new SpyStore();
    const { transport } = routedTransport(routes);
    const result = await runSnapshotter(store, makeContext(transport), ["x"]);

    expect(result).toEqual({ snapshotted: ["x"], failed: [] });
    expect(store.appended[0]?.versions.map((v) => v.provenance)).toEqual([false, null]);
  });

  it("records a 404 attestation as false, not null (5.6)", async () => {
    const routes = packageRoutes("x", ["1.0.0"]).filter((r) => r.url !== attestationsUrl("x", "1.0.0"));
    routes.push({ url: attestationsUrl("x", "1.0.0"), status: 404, json: { error: "Not found" } });
    const store = new SpyStore();
    const { transport } = routedTransport(routes);
    await runSnapshotter(store, makeContext(transport), ["x"]);
    expect(store.appended[0]?.versions[0]?.provenance).toBe(false);
  });

  it("records a present SLSA attestation as true", async () => {
    const routes = packageRoutes("x", ["1.0.0"]).filter((r) => r.url !== attestationsUrl("x", "1.0.0"));
    routes.push({
      url: attestationsUrl("x", "1.0.0"),
      json: { attestations: [{ predicateType: "https://slsa.dev/provenance/v1" }] },
    });
    const store = new SpyStore();
    const { transport } = routedTransport(routes);
    await runSnapshotter(store, makeContext(transport), ["x"]);
    expect(store.appended[0]?.versions[0]?.provenance).toBe(true);
  });

  it("records an omitted hasInstallScript as false and a present one as true (5.2)", async () => {
    const versions = ["1.0.0", "1.1.0"];
    const store = new SpyStore();
    const { transport } = routedTransport(packageRoutes("x", versions, ["1.1.0"]));
    await runSnapshotter(store, makeContext(transport), ["x"]);
    expect(store.appended[0]?.versions.map((v) => v.hasInstallScript)).toEqual([false, true]);
  });

  it("records maintainers and the clock time as ISO UTC capture time (5.3)", async () => {
    const store = new SpyStore();
    const { transport } = routedTransport(packageRoutes("x", ["1.0.0"]));
    await runSnapshotter(store, makeContext(transport), ["x"]);
    expect(store.appended[0]?.captureTime).toBe(NOW.toISOString());
    expect(store.appended[0]?.captureTime).toMatch(/Z$/);
    expect(store.appended[0]?.maintainers).toEqual(["alice"]);
  });
});

describe("runSnapshotter failures (5.4)", () => {
  it("a full packument failure fails the package, names the read, appends nothing", async () => {
    const store = new SpyStore();
    const routes: Route[] = [
      { url: packumentUrl("x"), accept: "application/json", status: 500, json: {} },
      { url: packumentUrl("x"), accept: ABBREVIATED_ACCEPT, json: abbreviated(["1.0.0"]) },
    ];
    const { transport } = routedTransport(routes);
    const result = await runSnapshotter(store, makeContext(transport), ["x"]);
    expect(result.snapshotted).toEqual([]);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0]?.name).toBe("x");
    expect(result.failed[0]?.reason).toContain("full packument read failed");
    expect(store.appended).toHaveLength(0);
  });

  it("an abbreviated packument failure fails the package, names the read, appends nothing", async () => {
    const store = new SpyStore();
    const routes: Route[] = [
      { url: packumentUrl("x"), accept: "application/json", json: fullPackument(["1.0.0"]) },
      { url: packumentUrl("x"), accept: ABBREVIATED_ACCEPT, status: 500, json: {} },
    ];
    const { transport } = routedTransport(routes);
    const result = await runSnapshotter(store, makeContext(transport), ["x"]);
    expect(result.snapshotted).toEqual([]);
    expect(result.failed[0]?.reason).toContain("abbreviated packument read failed");
    expect(store.appended).toHaveLength(0);
  });

  it("an append that throws lists the package as failed and does not stop others", async () => {
    const store = new SpyStore({ failAppendFor: ["bad"] });
    const { transport } = routedTransport([...packageRoutes("bad", ["1.0.0"]), ...packageRoutes("good", ["1.0.0"])]);
    const result = await runSnapshotter(store, makeContext(transport), ["bad", "good"]);
    expect(result.snapshotted).toEqual(["good"]);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0]?.name).toBe("bad");
    expect(result.failed[0]?.reason).toContain("snapshot append failed");
    expect(store.appended.map((s) => s.name)).toEqual(["good"]);
  });

  it("results are sorted and the two lists are disjoint", async () => {
    const store = new SpyStore({ failAppendFor: ["d", "b"] });
    const names = ["d", "c", "b", "a"];
    const { transport } = routedTransport(names.flatMap((n) => packageRoutes(n, ["1.0.0"])));
    const result = await runSnapshotter(store, makeContext(transport), names);
    expect(result.snapshotted).toEqual(["a", "c"]);
    expect(result.failed.map((f) => f.name)).toEqual(["b", "d"]);
    const failedNames = new Set(result.failed.map((f) => f.name));
    expect(result.snapshotted.some((n) => failedNames.has(n))).toBe(false);
  });
});

// Feature: history-signals, Property 10: Snapshotter result lists are disjoint and complete
// Validates: Requirements 5.1, 5.5, 5.7
type FailureMode = "none" | "full-read" | "abbreviated-read" | "append";
interface PackageSpec {
  readonly mode: FailureMode;
  readonly versions: number;
}

const POOL = ["a", "b", "c", "d", "e", "f", "g", "h"] as const;

function routesFor(name: string, spec: PackageSpec): Route[] {
  const versions = versionList(spec.versions);
  const routes = packageRoutes(name, versions);
  if (spec.mode === "full-read") {
    return [{ url: packumentUrl(name), accept: "application/json", status: 500, json: {} }, ...routes];
  }
  if (spec.mode === "abbreviated-read") {
    return [{ url: packumentUrl(name), accept: ABBREVIATED_ACCEPT, status: 500, json: {} }, ...routes];
  }
  return routes;
}

function byName(snapshots: readonly Snapshot[]): string[] {
  return snapshots.map((s) => JSON.stringify(s)).sort();
}

describe("Property 10: snapshotter result lists are disjoint and complete", () => {
  const specArb = fc.record({
    mode: fc.constantFrom<FailureMode>("none", "full-read", "abbreviated-read", "append"),
    versions: fc.integer({ min: 0, max: 3 }),
  });
  const specsArb = fc.array(specArb, { minLength: POOL.length, maxLength: POOL.length });
  const keysArb = fc.array(fc.integer(), { minLength: POOL.length, maxLength: POOL.length });
  // Milliseconds before NOW. Includes the exact window boundary, one past it, and NOW itself.
  const offsetArb = fc.constantFrom(0, 1000, RECENT_WINDOW_MS - 1, RECENT_WINDOW_MS, RECENT_WINDOW_MS + 1, 2 * RECENT_WINDOW_MS);
  const seenArb = fc.array(fc.array(offsetArb, { maxLength: 3 }), { minLength: POOL.length, maxLength: POOL.length });

  async function verify(
    seen: readonly string[],
    specs: readonly PackageSpec[],
    keys: readonly number[],
    run: (store: SpyStore, ctxRoutes: Route[]) => ReturnType<typeof runSnapshotter>,
    store: SpyStore,
    assertNoListing: boolean,
  ): Promise<void> {
    const specOf = (name: string): PackageSpec => specs[POOL.indexOf(name as (typeof POOL)[number])] ?? { mode: "none", versions: 0 };
    const result = await run(store, POOL.flatMap((n) => routesFor(n, specOf(n))));

    expect(result.error).toBeUndefined();
    if (assertNoListing) expect(store.listCalls).toBe(0);
    const expected = [...new Set(seen)].sort();
    const failedNames = result.failed.map((f) => f.name);
    expect(result.snapshotted.filter((n) => failedNames.includes(n))).toEqual([]);
    expect([...result.snapshotted, ...failedNames].sort()).toEqual(expected);
    expect(new Set(failedNames)).toEqual(new Set(expected.filter((n) => specOf(n).mode !== "none")));

    // Second run: failing names removed, shuffled order, fresh cache and store.
    const survivors = expected.filter((n) => specOf(n).mode === "none").sort((x, y) => (keys[POOL.indexOf(x as (typeof POOL)[number])] ?? 0) - (keys[POOL.indexOf(y as (typeof POOL)[number])] ?? 0));
    const second = new SpyStore();
    const { transport } = routedTransport(POOL.flatMap((n) => routesFor(n, specOf(n))));
    await runSnapshotter(second, makeContext(transport), survivors);
    expect(byName(store.appended)).toEqual(byName(second.appended));
  }

  it("holds on the store path (names omitted)", async () => {
    await fc.assert(
      fc.asyncProperty(specsArb, seenArb, keysArb, async (specs, seenOffsets, keys) => {
        const failAppendFor = POOL.filter((_, i) => specs[i]?.mode === "append");
        const store = new SpyStore({ failAppendFor });
        const seen: string[] = [];
        for (const [i, name] of POOL.entries()) {
          const offsets = seenOffsets[i] ?? [];
          for (const offset of offsets) await store.recordSeen(name, new Date(NOW.getTime() - offset));
          if (offsets.some((o) => o <= RECENT_WINDOW_MS)) seen.push(name);
        }
        await verify(
          seen,
          specs,
          keys,
          (s, routes) => runSnapshotter(s, makeContext(routedTransport(routes).transport)),
          store,
          false,
        );
      }),
      { numRuns: 100 },
    );
  });

  it("holds on the names path (duplicates, listSeenWithin never called)", async () => {
    await fc.assert(
      fc.asyncProperty(
        specsArb,
        fc.array(fc.constantFrom(...POOL), { maxLength: 12 }),
        keysArb,
        async (specs, names, keys) => {
          const failAppendFor = POOL.filter((_, i) => specs[i]?.mode === "append");
          const store = new SpyStore({ failAppendFor, listThrows: true });
          await verify(
            names,
            specs,
            keys,
            (s, routes) => runSnapshotter(s, makeContext(routedTransport(routes).transport), names),
            store,
            true,
          );
        },
      ),
      { numRuns: 100 },
    );
  });
});
