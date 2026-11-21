// Cache item encoding. Spec: .kiro/specs/infra, Requirements 2.2 to 2.4. Property 2.

import { gzipSync } from "node:zlib";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  CACHE_TTL_SECONDS,
  MAX_CACHE_KEY_BYTES,
  MAX_CACHE_VALUE_BYTES,
  decodeCacheItem,
  encodeCacheItem,
  expiresAtSeconds,
} from "../../src/dynamo/cache-item.js";
import { DynamoCacheStore } from "../../src/dynamo/cache-store.js";
import { isN, type Item } from "../../src/dynamo/port.js";
import { arbStoredAt, arbTtlSeconds } from "../arbitraries.js";
import { CACHE_TABLE, MemoryDynamo } from "../fakes/memory-dynamo.js";
import { captureLogger } from "../support/capture-logger.js";

function gz(text: string): Uint8Array {
  return new Uint8Array(gzipSync(Buffer.from(text, "utf8")));
}

describe("Feature: infra, Property 2: TTL arithmetic", () => {
  it("writes expiresAt as floor(storedAt / 1000) + ttlSeconds, an integer not before storedAt", async () => {
    await fc.assert(
      fc.asyncProperty(arbStoredAt, arbTtlSeconds, async (storedAt, ttl) => {
        const port = new MemoryDynamo();
        await new DynamoCacheStore(port, CACHE_TABLE, captureLogger(), ttl).set("k", { value: 1, storedAt });
        const raw = port.items(CACHE_TABLE)[0]?.["expiresAt"];
        expect(isN(raw)).toBe(true);
        const expiresAt = Number(isN(raw) ? raw.N : Number.NaN);
        expect(expiresAt).toBe(Math.floor(storedAt / 1000) + ttl);
        expect(Number.isInteger(expiresAt)).toBe(true);
        expect(expiresAt).toBeGreaterThanOrEqual(storedAt / 1000);
      }),
    );
  });

  it("expiresAtSeconds matches an example", () => {
    expect(expiresAtSeconds(1_795_132_800_999, CACHE_TTL_SECONDS)).toBe(1_795_132_800 + 86_400);
  });
});

describe("encodeCacheItem", () => {
  it("writes the four attributes of the data model", () => {
    const result = encodeCacheItem("npm-packument|express|*", { value: { a: 1 }, storedAt: 1000 }, 60);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Object.keys(result.item).sort()).toEqual(["expiresAt", "pk", "storedAt", "v"]);
    expect(result.item["pk"]).toEqual({ S: "npm-packument|express|*" });
    expect(result.item["storedAt"]).toEqual({ N: "1000" });
    expect(result.item["expiresAt"]).toEqual({ N: "61" });
  });

  it("returns not-json for a cycle, a BigInt, undefined and a function", () => {
    const cycle: Record<string, unknown> = {};
    cycle["self"] = cycle;
    for (const value of [cycle, 10n, undefined, () => 1]) {
      expect(encodeCacheItem("k", { value, storedAt: 0 })).toMatchObject({ ok: false, reason: "not-json" });
    }
  });

  it("returns too-large for a key over the key limit", () => {
    expect(encodeCacheItem("k".repeat(MAX_CACHE_KEY_BYTES + 1), { value: 1, storedAt: 0 })).toMatchObject({ ok: false, reason: "too-large" });
    expect(encodeCacheItem("k".repeat(MAX_CACHE_KEY_BYTES), { value: 1, storedAt: 0 }).ok).toBe(true);
  });

  it("measures the limit on compressed bytes, so a large repetitive value is stored", () => {
    const result = encodeCacheItem("k", { value: "a".repeat(2 * MAX_CACHE_VALUE_BYTES), storedAt: 0 });
    expect(result.ok).toBe(true);
  });
});

describe("decodeCacheItem", () => {
  const good: Item = { pk: { S: "k" }, v: { B: gz('{"a":1}') }, storedAt: { N: "5" }, expiresAt: { N: "0" } };

  it("decodes a good item and ignores an expiresAt in the past", () => {
    expect(decodeCacheItem(good)).toEqual({ value: { a: 1 }, storedAt: 5 });
  });

  it("returns undefined for corrupt gzip, a missing or non-numeric storedAt, non-JSON, invalid UTF-8 and a wrong type", () => {
    const bad: Item[] = [
      { ...good, v: { B: new Uint8Array([1, 2, 3]) } },
      { pk: { S: "k" }, v: { B: gz("1") } },
      { ...good, storedAt: { N: "abc" } },
      { ...good, storedAt: { N: "1e5" } },
      { ...good, storedAt: { S: "5" } },
      { ...good, v: { B: gz("{not json") } },
      { ...good, v: { B: new Uint8Array(gzipSync(Buffer.from([0xff, 0xfe]))) } },
      { ...good, v: { S: "x" } },
      { v: { B: gz("1") }, storedAt: { N: "5" } },
    ];
    for (const item of bad) expect(decodeCacheItem(item)).toBeUndefined();
  });
});
