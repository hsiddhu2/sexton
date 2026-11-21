// DynamoDB CacheStore. Spec: .kiro/specs/infra, Requirements 2.1, 2.2, 2.4 to 2.7, 6.3. Properties 1, 3 and 4.

import fc from "fast-check";
import { CachedFetcher, DEFAULT_CACHE_TTL_MS } from "@sexton/engine";
import { describe, expect, it } from "vitest";
import { encodeCacheItem } from "../../src/dynamo/cache-item.js";
import { DynamoCacheStore } from "../../src/dynamo/cache-store.js";
import { arbCacheKey, arbJsonValue, arbStoredAt } from "../arbitraries.js";
import { CACHE_TABLE, MemoryDynamo, type Operation } from "../fakes/memory-dynamo.js";
import { captureLogger } from "../support/capture-logger.js";

describe("Feature: infra, Property 1: Cache round trip", () => {
  it("get after set returns an entry deeply equal to what was set", async () => {
    await fc.assert(
      fc.asyncProperty(arbCacheKey, arbJsonValue, arbStoredAt, async (key, value, storedAt) => {
        const store = new DynamoCacheStore(new MemoryDynamo(), CACHE_TABLE, captureLogger());
        await store.set(key, { value, storedAt });
        expect(await store.get(key)).toEqual({ value, storedAt });
      }),
    );
  });
});

describe("Feature: infra, Property 3: Oversize values are never stored", () => {
  // Each value is 400 KB to 600 KB of random hex, so this property runs 20 times, not 100.
  const NUM_RUNS = 20;
  const arbIncompressible = fc.uint8Array({ minLength: 400 * 1024, maxLength: 600 * 1024 }).map((bytes) => Buffer.from(bytes).toString("hex"));

  it("set resolves, writes nothing, and leaves an earlier entry unchanged", async () => {
    await fc.assert(
      fc.asyncProperty(arbIncompressible, fc.boolean(), async (value, withPrior) => {
        const port = new MemoryDynamo();
        const log = captureLogger();
        const store = new DynamoCacheStore(port, CACHE_TABLE, log);
        const prior = { value: { small: true }, storedAt: 1 };
        if (withPrior) await store.set("k", prior);
        const writesBefore = port.writes.length;
        await expect(store.set("k", { value, storedAt: 2 })).resolves.toBeUndefined();
        expect(port.writes.length).toBe(writesBefore);
        expect(await store.get("k")).toEqual(withPrior ? prior : undefined);
        expect(log.lines.at(-1)?.fields).toMatchObject({ msg: "cache-skip", reason: "too-large" });
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it("logs one line, with no key, when a stored item cannot be decoded", async () => {
    const port = new MemoryDynamo();
    await port.putItem(CACHE_TABLE, { pk: { S: "KEY-corrupt" }, v: { B: new Uint8Array([1, 2]) }, storedAt: { N: "1" } });
    const log = captureLogger();
    expect(await new DynamoCacheStore(port, CACHE_TABLE, log).get("KEY-corrupt")).toBeUndefined();
    expect(log.lines).toEqual([{ level: "warn", fields: { msg: "cache-decode-failed" } }]);
  });

  it("skips an entry whose storedAt is not a safe integer", async () => {
    const port = new MemoryDynamo();
    const log = captureLogger();
    await new DynamoCacheStore(port, CACHE_TABLE, log).set("k", { value: 1, storedAt: 1.5 });
    expect(port.writes).toHaveLength(0);
    expect(log.lines[0]?.fields).toMatchObject({ msg: "cache-skip", reason: "invalid-entry" });
  });

  it("does not store a value that is not JSON", async () => {
    const port = new MemoryDynamo();
    await new DynamoCacheStore(port, CACHE_TABLE, captureLogger()).set("k", { value: 1n, storedAt: 0 });
    expect(port.writes).toHaveLength(0);
  });
});

describe("Feature: infra, Property 4: Store failures never reject", () => {
  type Op = { readonly kind: "get"; readonly key: string } | { readonly kind: "set"; readonly key: string; readonly value: string };
  const arbKey = fc.uuid().map((id) => `KEY-${id}`);
  const arbOp: fc.Arbitrary<Op> = fc.oneof(
    arbKey.map((key) => ({ kind: "get" as const, key })),
    fc.tuple(arbKey, fc.uuid()).map(([key, id]) => ({ kind: "set" as const, key, value: `VALUE-${id}` })),
  );
  const arbFailure = fc.constantFrom<(operation: Operation) => unknown>(
    () => new Error("boom"),
    () => Object.assign(new Error("throttled"), { name: "ProvisionedThroughputExceededException" }),
    () => "a string, not an Error",
    () => Promise.reject(new Error("async boom")),
  );

  it("every call resolves, get gives undefined, and one log line per failure has no key or value", async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(arbOp, { minLength: 1, maxLength: 20 }), arbFailure, async (ops, fail) => {
        const log = captureLogger();
        const store = new DynamoCacheStore(new MemoryDynamo(undefined, { fail }), CACHE_TABLE, log);
        for (const op of ops) {
          if (op.kind === "get") await expect(store.get(op.key)).resolves.toBeUndefined();
          else await expect(store.set(op.key, { value: op.value, storedAt: 1 })).resolves.toBeUndefined();
        }
        expect(log.lines).toHaveLength(ops.length);
        const text = JSON.stringify(log.lines);
        for (const op of ops) {
          expect(text).not.toContain(op.key);
          if (op.kind === "set") expect(text).not.toContain(op.value);
        }
        for (const line of log.lines) expect(["cache-get-failed", "cache-set-failed"]).toContain(line.fields["msg"]);
      }),
    );
  });
});

describe("DynamoCacheStore with CachedFetcher", () => {
  const T0 = Date.parse("2026-11-20T00:00:00.000Z");

  function setup() {
    let now = T0;
    const port = new MemoryDynamo();
    const store = new DynamoCacheStore(port, CACHE_TABLE, captureLogger());
    const fetcher = () => new CachedFetcher({ store, clock: () => new Date(now), ttlMs: DEFAULT_CACHE_TTL_MS });
    let fetches = 0;
    const fetch = () => {
      fetches += 1;
      return Promise.resolve({ n: fetches });
    };
    return { port, fetcher, fetch, fetches: () => fetches, advance: (ms: number) => (now += ms) };
  }

  it("makes no fetch inside 24 hours, across fetcher instances (containers)", async () => {
    const s = setup();
    expect(await s.fetcher().get("k", s.fetch)).toEqual({ n: 1 });
    s.advance(DEFAULT_CACHE_TTL_MS - 1);
    expect(await s.fetcher().get("k", s.fetch)).toEqual({ n: 1 });
    expect(s.fetches()).toBe(1);
  });

  it("refetches at 24 hours even though DynamoDB has not deleted the item yet", async () => {
    const s = setup();
    await s.fetcher().get("k", s.fetch);
    s.advance(DEFAULT_CACHE_TTL_MS);
    expect(s.port.items(CACHE_TABLE)).toHaveLength(1);
    expect(await s.fetcher().get("k", s.fetch)).toEqual({ n: 2 });
  });

  it("judges freshness by storedAt alone, not by expiresAt", async () => {
    const port = new MemoryDynamo();
    const encoded = encodeCacheItem("k", { value: "cached", storedAt: T0 }, 1);
    if (!encoded.ok) throw new Error("encode failed");
    await port.putItem(CACHE_TABLE, encoded.item);
    const store = new DynamoCacheStore(port, CACHE_TABLE, captureLogger());
    const fetcher = new CachedFetcher({ store, clock: () => new Date(T0 + 60_000) });
    expect(await fetcher.get("k", () => Promise.resolve("fresh"))).toBe("cached");
  });

  it("returns the fetched value when the store cannot write it", async () => {
    const port = new MemoryDynamo(undefined, { fail: (op) => (op === "putItem" ? new Error("down") : undefined) });
    const fetcher = new CachedFetcher({ store: new DynamoCacheStore(port, CACHE_TABLE, captureLogger()), clock: () => new Date(T0) });
    expect(await fetcher.get("k", () => Promise.resolve(42))).toBe(42);
  });
});
