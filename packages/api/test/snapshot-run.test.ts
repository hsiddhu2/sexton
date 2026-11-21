// The snapshot job and its handler. Spec: .kiro/specs/infra, Requirements 7.3 to 7.6. Property 12.

import fc from "fast-check";
import { InMemorySnapshotStore, MemoryCacheStore, CachedFetcher, RECENT_WINDOW_MS, type ClientContext, type SnapshotStore, type SnapshotterResult } from "@sexton/engine";
import { describe, expect, it } from "vitest";
import { CHUNK_SIZE, planChunks, runSnapshotJob, SAFETY_MARGIN_MS, type SnapshotJobDeps } from "../src/snapshot-run.js";
import { createSnapshotterHandler, emfLine } from "../src/snapshotter-handler.js";
import { arbPackageName } from "./arbitraries.js";
import { CACHE_TABLE, MemoryDynamo, SEEN_INDEX, SNAPSHOTS_TABLE } from "./fakes/memory-dynamo.js";
import { captureLogger } from "./support/capture-logger.js";
import { routedTransport } from "./support/fixture-transport.js";

const NOW = new Date("2026-11-20T03:17:00Z");
const CTX: ClientContext = { transport: () => Promise.reject(new Error("no network")), clock: () => NOW, cache: new CachedFetcher({ store: new MemoryCacheStore(), clock: () => NOW }) };

function listingStore(names: readonly string[] | Error): SnapshotStore {
  const store = new InMemorySnapshotStore();
  store.listSeenWithin = () => (names instanceof Error ? Promise.reject(names) : Promise.resolve(names));
  return store;
}

function deps(overrides: Partial<SnapshotJobDeps> & Pick<SnapshotJobDeps, "store">): SnapshotJobDeps {
  return { ctx: CTX, remainingMs: () => 600_000, log: captureLogger(), reference: NOW, run: (_s, _c, names) => Promise.resolve({ snapshotted: [...(names ?? [])], failed: [] }), ...overrides };
}

describe("Feature: infra, Property 12: Snapshot job accounting", () => {
  it("snapshotted + failed + deferred = listed, deferred is whole chunks plus a final partial one, and no chunk starts at 90 s or less", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uniqueArray(arbPackageName, { maxLength: 200 }),
        fc.integer({ min: 1, max: 30 }),
        fc.array(fc.integer({ min: 0, max: 600_000 }), { maxLength: 15 }),
        fc.func(fc.constantFrom<"ok" | "fail" | "throw">("ok", "ok", "fail", "throw")),
        async (names, chunkSize, readings, outcome) => {
          const script = [...readings];
          const startedWith: number[] = [];
          let lastReading = 0;
          const remainingMs = () => {
            lastReading = script.shift() ?? 0;
            return lastReading;
          };
          const run = (_s: SnapshotStore, _c: ClientContext, chunk?: readonly string[]): Promise<SnapshotterResult> => {
            startedWith.push(lastReading);
            const ok: string[] = [];
            const failed: { name: string; reason: string }[] = [];
            for (const name of chunk ?? []) {
              const kind = outcome(name);
              if (kind === "throw") return Promise.reject(new Error("chunk failed"));
              if (kind === "ok") ok.push(name);
              else failed.push({ name, reason: "x" });
            }
            return Promise.resolve({ snapshotted: ok, failed });
          };
          const result = await runSnapshotJob(deps({ store: listingStore(names), remainingMs, run, chunkSize }));
          expect(result.listed).toBe(names.length);
          expect(result.snapshotted + result.failed + result.deferred).toBe(result.listed);
          for (const reading of startedWith) expect(reading).toBeGreaterThan(SAFETY_MARGIN_MS);
          expect(result.deferred).toBe(Math.max(0, names.length - startedWith.length * chunkSize));
          const startedAll = startedWith.length === Math.ceil(names.length / chunkSize);
          if (!startedAll) expect(result.deferred).toBeGreaterThan(0);
        },
      ),
    );
  });
});

describe("runSnapshotJob examples", () => {
  it("lists once, over the 90-day window", async () => {
    const calls: number[] = [];
    const store = new InMemorySnapshotStore();
    store.listSeenWithin = (_ref, windowMs) => {
      calls.push(windowMs);
      return Promise.resolve(["a"]);
    };
    await runSnapshotJob(deps({ store }));
    expect(calls).toEqual([RECENT_WINDOW_MS]);
  });

  it("a listing failure gives error and zero counts", async () => {
    const log = captureLogger();
    const result = await runSnapshotJob(deps({ store: listingStore(new TypeError("down")), log }));
    expect(result).toEqual({ listed: 0, snapshotted: 0, failed: 0, deferred: 0, error: "TypeError" });
    expect(log.lines.at(-1)?.fields).toMatchObject({ msg: "snapshot-run", error: "TypeError" });
  });

  it("with plenty of time defers nothing and calls the engine on chunks of 25", async () => {
    const names = Array.from({ length: 60 }, (_, i) => `p${String(i).padStart(2, "0")}`);
    const chunks: number[] = [];
    const result = await runSnapshotJob(
      deps({ store: listingStore(names), run: (_s, _c, chunk) => (chunks.push(chunk?.length ?? 0), Promise.resolve({ snapshotted: [...(chunk ?? [])], failed: [] })) }),
    );
    expect(result).toEqual({ listed: 60, snapshotted: 60, failed: 0, deferred: 0 });
    expect(chunks).toEqual([CHUNK_SIZE, CHUNK_SIZE, 10]);
  });

  it("writes one summary line with counts and no names", async () => {
    const log = captureLogger();
    await runSnapshotJob(deps({ store: listingStore(["secret-name"]), log }));
    const summary = log.lines.filter((l) => l.fields["msg"] === "snapshot-run");
    expect(summary).toHaveLength(1);
    expect(JSON.stringify(log.lines)).not.toContain("secret-name");
  });

  it("planChunks keeps order and sizes", () => {
    expect(planChunks(["a", "b", "c"], 2)).toEqual([["a", "b"], ["c"]]);
    expect(planChunks([], 25)).toEqual([]);
    expect(planChunks(["a"], 0)).toEqual([["a"]]);
  });
});

describe("emfLine", () => {
  it("parses as JSON and declares the three metrics in namespace Sexton with no dimensions", () => {
    const line = JSON.parse(emfLine({ listed: 5, snapshotted: 2, failed: 1, deferred: 2 }, NOW)) as Record<string, unknown>;
    expect(line).toMatchObject({ SnapshotterFailed: 1, SnapshotterDeferred: 2, SnapshotterError: 0 });
    const aws = line["_aws"] as { Timestamp: number; CloudWatchMetrics: { Namespace: string; Dimensions: unknown; Metrics: { Name: string }[] }[] };
    expect(aws.Timestamp).toBe(NOW.getTime());
    expect(aws.CloudWatchMetrics[0]?.Namespace).toBe("Sexton");
    expect(aws.CloudWatchMetrics[0]?.Dimensions).toEqual([[]]);
    expect(aws.CloudWatchMetrics[0]?.Metrics.map((m) => m.Name)).toEqual(["SnapshotterFailed", "SnapshotterDeferred", "SnapshotterError"]);
    expect(JSON.parse(emfLine({ listed: 0, snapshotted: 0, failed: 0, deferred: 0, error: "X" }, NOW))).toMatchObject({ SnapshotterError: 1 });
  });
});

describe("stdoutLine", () => {
  it("writes the line alone, with a newline and no prefix", async () => {
    const { stdoutLine } = await import("../src/snapshotter-handler.js");
    const written: string[] = [];
    const original = process.stdout.write.bind(process.stdout);
    process.stdout.write = ((chunk: string) => (written.push(chunk), true)) as typeof process.stdout.write;
    try {
      stdoutLine('{"a":1}');
    } finally {
      process.stdout.write = original;
    }
    expect(written).toEqual(['{"a":1}\n']);
  });
});

describe("createSnapshotterHandler", () => {
  const environment = { cacheTable: CACHE_TABLE, snapshotsTable: SNAPSHOTS_TABLE, seenIndex: SEEN_INDEX };
  const context = { awsRequestId: "r1", getRemainingTimeInMillis: () => 600_000 };

  it("resolves and publishes an error metric when runSnapshotter throws", async () => {
    const lines: string[] = [];
    const port = new MemoryDynamo();
    await port.putItem(SNAPSHOTS_TABLE, { pk: { S: "seen#a" }, sk: { S: "x" }, gpk: { S: "seen" }, seenAt: { N: String(NOW.getTime()) }, name: { S: "a" } });
    const handler = createSnapshotterHandler({
      environment,
      port,
      transport: routedTransport([]).transport,
      clock: () => NOW,
      sink: (line) => lines.push(line),
      run: () => Promise.reject(new Error("engine blew up")),
    });
    const result = await handler({}, context);
    expect(result).toEqual({ listed: 1, snapshotted: 0, failed: 1, deferred: 0 });
    const emf = lines.map((l) => JSON.parse(l) as Record<string, unknown>).find((l) => "_aws" in l);
    expect(emf).toMatchObject({ SnapshotterFailed: 1, SnapshotterDeferred: 0, SnapshotterError: 0 });
    expect(lines.map((l) => (JSON.parse(l) as { correlationId?: string }).correlationId).filter(Boolean)).toContain("snap-r1");
  });

  it("never throws: a failing listing gives SnapshotterError 1, and a throwing sink is swallowed", async () => {
    const port = new MemoryDynamo(undefined, { fail: () => new Error("dynamo down") });
    const lines: string[] = [];
    const ok = await createSnapshotterHandler({ environment, port, transport: routedTransport([]).transport, clock: () => NOW, sink: (l) => lines.push(l) })({}, context);
    expect(ok.error).toBe("Error");
    expect(lines.map((l) => JSON.parse(l) as Record<string, unknown>).find((l) => "_aws" in l)).toMatchObject({ SnapshotterError: 1 });
    const throwing = createSnapshotterHandler({ environment, port, transport: routedTransport([]).transport, clock: () => NOW, sink: () => { throw new Error("sink"); } });
    await expect(throwing({}, context)).resolves.toMatchObject({ error: expect.any(String) as unknown });
  });

  it("snapshots a Seen package through the engine with the real stores and appends to snap#", async () => {
    const port = new MemoryDynamo();
    await port.putItem(SNAPSHOTS_TABLE, { pk: { S: "seen#left-pad" }, sk: { S: "x" }, gpk: { S: "seen" }, seenAt: { N: String(NOW.getTime() - 1000) }, name: { S: "left-pad" } });
    const { packageRoutes } = await import("./support/fixture-transport.js");
    const routed = routedTransport(packageRoutes("left-pad", "1.3.0"));
    const handler = createSnapshotterHandler({ environment, port, transport: routed.transport, clock: () => NOW, sink: () => undefined, retry: { sleep: () => Promise.resolve() } });
    const result = await handler({}, context);
    expect(result).toEqual({ listed: 1, snapshotted: 1, failed: 0, deferred: 0 });
    expect(port.items(SNAPSHOTS_TABLE).filter((i) => "S" in (i["pk"] ?? { N: "" }) && (i["pk"] as { S: string }).S === "snap#left-pad")).toHaveLength(1);
  });
});
