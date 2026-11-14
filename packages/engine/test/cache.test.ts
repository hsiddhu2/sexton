// Cache. Requirement 7.

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { CachedFetcher, MemoryCacheStore, cacheKey, DEFAULT_CACHE_TTL_MS } from "../src/cache.js";

function fixedClock(start: number): { clock: () => Date; advance: (ms: number) => void } {
  let t = start;
  return { clock: () => new Date(t), advance: (ms) => (t += ms) };
}

describe("CachedFetcher", () => {
  it("serves the second request from the cache within the TTL (7.2)", async () => {
    const { clock } = fixedClock(0);
    const fetcher = new CachedFetcher({ store: new MemoryCacheStore(), clock });
    let calls = 0;
    const fetch = () => Promise.resolve(++calls);
    expect(await fetcher.get("k", fetch)).toBe(1);
    expect(await fetcher.get("k", fetch)).toBe(1);
    expect(calls).toBe(1);
  });

  it("refetches once the TTL has elapsed (7.5)", async () => {
    const { clock, advance } = fixedClock(0);
    const fetcher = new CachedFetcher({ store: new MemoryCacheStore(), clock, ttlMs: 1000 });
    let calls = 0;
    const fetch = () => Promise.resolve(++calls);
    await fetcher.get("k", fetch);
    advance(999);
    expect(await fetcher.get("k", fetch)).toBe(1);
    advance(1);
    expect(await fetcher.get("k", fetch)).toBe(2);
  });

  it("shares an in-flight fetch for the same key (7.3)", async () => {
    const { clock } = fixedClock(0);
    const fetcher = new CachedFetcher({ store: new MemoryCacheStore(), clock });
    let calls = 0;
    let release: (v: string) => void = () => undefined;
    const fetch = () => {
      calls++;
      return new Promise<string>((resolve) => (release = resolve));
    };
    const a = fetcher.get("k", fetch);
    const b = fetcher.get("k", fetch);
    await new Promise((r) => setTimeout(r, 0));
    release("v");
    expect(await Promise.all([a, b])).toEqual(["v", "v"]);
    expect(calls).toBe(1);
  });

  it("does not store a failed fetch (7.4)", async () => {
    const { clock } = fixedClock(0);
    const store = new MemoryCacheStore();
    const fetcher = new CachedFetcher({ store, clock });
    await expect(fetcher.get("k", () => Promise.reject(new Error("boom")))).rejects.toThrow("boom");
    expect(store.size).toBe(0);
    expect(await fetcher.get("k", () => Promise.resolve("ok"))).toBe("ok");
  });

  it("defaults to a 24 hour TTL (7.1)", () => {
    expect(DEFAULT_CACHE_TTL_MS).toBe(86_400_000);
  });

  it("keys combine source, package and version", () => {
    expect(cacheKey("npm", "@scope/pkg", "1.0.0")).toBe("npm|@scope/pkg|1.0.0");
  });
});

describe("cache properties", () => {
  it("single fetch: outbound calls equal distinct keys for any request sequence (7.2)", async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(fc.integer({ min: 0, max: 20 }), { maxLength: 50 }), async (keys) => {
        const { clock } = fixedClock(0);
        const fetcher = new CachedFetcher({ store: new MemoryCacheStore(), clock });
        let calls = 0;
        await Promise.all(keys.map((k) => fetcher.get(`key-${k}`, () => Promise.resolve(++calls))));
        expect(calls).toBe(new Set(keys).size);
      }),
      { numRuns: 200 },
    );
  });

  it("round trip: a stored value reads back deeply equal before the TTL (7.6)", async () => {
    await fc.assert(
      fc.asyncProperty(fc.string(), fc.jsonValue(), async (key, value) => {
        const { clock } = fixedClock(0);
        const fetcher = new CachedFetcher({ store: new MemoryCacheStore(), clock });
        await fetcher.get(key, () => Promise.resolve(value));
        expect(await fetcher.get(key, () => Promise.reject(new Error("must not fetch")))).toEqual(value);
      }),
      { numRuns: 200 },
    );
  });
});
