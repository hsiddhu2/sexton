// Spec home-page, tasks 2.1 and 2.2: the scan cache (design C4, Properties 3 to 5) and its guarded storage edge.
import type { ScanResponse } from "@sexton/api";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  addScan,
  ageText,
  CACHE_KEY,
  freshResponse,
  isFresh,
  MAX_CHARS,
  MAX_ENTRIES,
  parseStore,
  repoKey,
  scannedText,
  serialise,
  TTL_MS,
  type Entry,
} from "../src/cache/scan-cache.js";
import { clearCache, readCache, saveScan, type CacheStorage } from "../src/cache/scan-store.js";
import { cheapScan } from "./arbitraries.js";

const LABELS = ["a/b", "A/b", "expressjs/express", "facebook/react", "hsiddhu2/sexton-demo", "o/r1", "o/r2", "o/r3", "o/r4", "o/r5", "o/r6", "o/r7", "x/y"];
const SMALL = cheapScan(1);
/** A scan response of about `chars` characters of JSON: one package whose source holds the padding. */
function sized(chars: number): ScanResponse {
  const scan = cheapScan(1) as unknown as { report: { packages: { name: string }[] } };
  const pkg = scan.report.packages[0] as { name: string };
  return { ...scan, report: { ...scan.report, packages: [{ ...pkg, name: "p".repeat(Math.max(1, Math.min(chars, 214))) }] }, pad: "x".repeat(chars) } as unknown as ScanResponse;
}

const arbStep = fc.record({
  label: fc.constantFrom(...LABELS),
  size: fc.oneof(fc.constant(0), fc.integer({ min: 0, max: 900_000 }), fc.constant(MAX_CHARS + 10)),
  dt: fc.integer({ min: -60_000, max: 2 * TTL_MS }),
});

describe("Feature: home-page, Property 3: The cache keeps at most 10 Entries within the size limit", () => {
  it("holds at most 10 Entries, one per key, newest first, within MAX_CHARS, keeping the newest response when it fits", () => {
    fc.assert(
      fc.property(fc.array(arbStep, { minLength: 1, maxLength: 16 }), (steps) => {
        let entries: Entry[] = [];
        let now = 1_795_000_000_000;
        for (const step of steps) {
          now += step.dt;
          const response = step.size === 0 ? SMALL : sized(step.size);
          entries = addScan(entries, step.label, response, now);
          expect(entries.length).toBeLessThanOrEqual(MAX_ENTRIES);
          expect(new Set(entries.map((e) => e.key)).size).toBe(entries.length);
          expect(entries[0]?.key).toBe(repoKey(step.label));
          expect(entries[0]?.savedAt).toBe(now);
          expect(serialise(entries).length).toBeLessThanOrEqual(MAX_CHARS);
          const alone = serialise([{ key: repoKey(step.label), label: step.label, savedAt: now, response }]).length;
          if (alone <= MAX_CHARS) expect(entries[0]?.response).toBe(response);
          else expect(entries[0]?.response).toBeNull();
        }
      }),
      { numRuns: 100 },
    );
  });

  it("drops the oldest response first to meet the size limit", () => {
    const big = sized(800_000);
    let entries = addScan([], "o/r1", big, 1000);
    entries = addScan(entries, "o/r2", big, 2000);
    entries = addScan(entries, "o/r3", big, 3000);
    expect(entries.map((e) => [e.label, e.response !== null])).toEqual([
      ["o/r3", true],
      ["o/r2", true],
      ["o/r1", false],
    ]);
  });

  it("keys a repository in lower case, so a/b and A/b are one Entry", () => {
    const entries = addScan(addScan([], "a/b", SMALL, 1), "A/b", SMALL, 2);
    expect(entries.map((e) => [e.key, e.label])).toEqual([["a/b", "A/b"]]);
  });
});

describe("Feature: home-page, Property 4: Only Fresh Entries are served", () => {
  it("serves a response exactly when it is not null and 0 <= now - savedAt < 15 minutes", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 2e12 }), fc.integer({ min: -2 * TTL_MS, max: 3 * TTL_MS }), fc.boolean(), (savedAt, age, has) => {
        const entry: Entry = { key: "a/b", label: "a/b", savedAt, response: has ? SMALL : null };
        const now = savedAt + age;
        const want = has && age >= 0 && age < TTL_MS;
        expect(isFresh(entry, now)).toBe(want);
        expect(freshResponse([entry], "a/b", now)).toEqual(want ? { response: SMALL, savedAt } : null);
        expect(freshResponse([entry], "c/d", now)).toBeNull();
      }),
      { numRuns: 100 },
    );
  });

  it("keeps no response past 15 minutes after a write, and keeps the Entry for Recent scans", () => {
    fc.assert(
      fc.property(fc.array(fc.tuple(fc.constantFrom(...LABELS), fc.integer({ min: 0, max: 3 * TTL_MS })), { minLength: 1, maxLength: 12 }), (steps) => {
        let entries: Entry[] = [];
        let now = 0;
        for (const [label, dt] of steps) {
          now += dt;
          entries = addScan(entries, label, SMALL, now);
          for (const e of entries) if (!isFresh({ ...e, response: SMALL }, now)) expect(e.response).toBeNull();
        }
        expect(entries.length).toBe(Math.min(new Set(steps.map(([l]) => repoKey(l))).size, MAX_ENTRIES));
      }),
      { numRuns: 100 },
    );
  });

  it("does not serve a response saved in the future (13.11)", () => {
    expect(freshResponse([{ key: "a/b", label: "a/b", savedAt: 2000, response: SMALL }], "a/b", 1999)).toBeNull();
  });
});

describe("Feature: home-page, Property 5: The store reads back what it wrote, and nothing it cannot trust", () => {
  it("reads back every list addScan writes", () => {
    fc.assert(
      fc.property(fc.array(fc.tuple(fc.constantFrom(...LABELS), fc.integer({ min: 0, max: TTL_MS })), { maxLength: 14 }), (steps) => {
        let entries: Entry[] = [];
        let now = 1_795_000_000_000;
        for (const [label, dt] of steps) {
          now += dt;
          entries = addScan(entries, label, SMALL, now);
        }
        expect(parseStore(serialise(entries))).toEqual(entries);
      }),
      { numRuns: 1000 },
    );
  });

  it("never throws on any text, and keeps at most 10 Entries with accepted keys", () => {
    const arbEntry = fc.record({
      key: fc.oneof(fc.constantFrom(...LABELS.map(repoKey)), fc.string()),
      label: fc.oneof(fc.constantFrom(...LABELS), fc.string()),
      savedAt: fc.oneof(fc.integer(), fc.double(), fc.string()),
      response: fc.oneof(fc.constant(null), fc.constant(SMALL), fc.anything()),
    });
    const arbText = fc.oneof(
      fc.string(),
      fc.json(),
      fc.array(arbEntry, { maxLength: 14 }).map((entries) => JSON.stringify({ v: 1, entries })),
      fc.array(arbEntry, { maxLength: 3 }).map((entries) => JSON.stringify({ v: 2, entries })),
    );
    fc.assert(
      fc.property(arbText, (text) => {
        const entries = parseStore(text);
        expect(entries.length).toBeLessThanOrEqual(MAX_ENTRIES);
        for (const e of entries) {
          expect(LABELS.map(repoKey)).toContain(e.key);
          expect(e.key).toBe(repoKey(e.label));
          expect(Number.isFinite(e.savedAt)).toBe(true);
        }
      }),
      { numRuns: 1000 },
    );
  });

  it("keeps the older responses when a new response alone is over the limit", () => {
    const entries = addScan(addScan([], "a/b", SMALL, 1), "c/d", sized(MAX_CHARS + 10), 2);
    expect(entries.map((e) => [e.label, e.response !== null])).toEqual([
      ["c/d", false],
      ["a/b", true],
    ]);
  });

  it("ignores another version, text that is not JSON, and a response that fails validation (13.8)", () => {
    expect(parseStore(null)).toEqual([]);
    expect(parseStore("{")).toEqual([]);
    expect(parseStore(JSON.stringify({ v: 2, entries: [{ key: "a/b", label: "a/b", savedAt: 1, response: null }] }))).toEqual([]);
    expect(parseStore(JSON.stringify({ v: 1, entries: [{ key: "a/b", label: "a/b", savedAt: 1, response: { report: 1 } }] }))).toEqual([
      { key: "a/b", label: "a/b", savedAt: 1, response: null },
    ]);
    expect(parseStore(JSON.stringify({ v: 1, entries: [{ key: "x/y", label: "a/b", savedAt: 1, response: null }] }))).toEqual([]);
  });
});

describe("the ages (13.3, 14.1)", () => {
  it("reads just now, minutes, hours and days", () => {
    expect(ageText(-5)).toBe("just now");
    expect(ageText(59_999)).toBe("just now");
    expect(ageText(60_000)).toBe("1 min ago");
    expect(ageText(14 * 60_000 + 59_000)).toBe("14 min ago");
    expect(ageText(3_600_000)).toBe("1 h ago");
    expect(ageText(86_400_000 * 3)).toBe("3 d ago");
    expect(scannedText(120_000)).toBe("Scanned 2 min ago");
    expect(scannedText(0)).toBe("Scanned just now");
  });
});

/** A Storage stand-in. */
function memory(): CacheStorage & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => {
      map.set(k, v);
    },
    removeItem: (k) => {
      map.delete(k);
    },
  };
}
const throwing: CacheStorage = {
  getItem: () => {
    throw new Error("blocked");
  },
  setItem: () => {
    throw new Error("blocked");
  },
  removeItem: () => {
    throw new Error("blocked");
  },
};

describe("the storage edge (13.9, 14.4)", () => {
  it("saves, reads and clears under sexton:scans", () => {
    const store = memory();
    expect(saveScan("a/b", SMALL, 10, store).map((e) => e.label)).toEqual(["a/b"]);
    expect(readCache(store).map((e) => e.label)).toEqual(["a/b"]);
    expect(store.map.has(CACHE_KEY)).toBe(true);
    clearCache(store);
    expect(store.map.has(CACHE_KEY)).toBe(false);
    expect(readCache(store)).toEqual([]);
  });

  it("reads as empty and writes nothing when storage throws or is missing", () => {
    expect(readCache(throwing)).toEqual([]);
    expect(saveScan("a/b", SMALL, 10, throwing)).toEqual([]);
    expect(() => {
      clearCache(throwing);
    }).not.toThrow();
    expect(readCache(null)).toEqual([]);
    expect(saveScan("a/b", SMALL, 10, null)).toEqual([]);
  });

  it("keeps the Entries it read when a write fails, as on a full store", () => {
    const store = memory();
    saveScan("a/b", SMALL, 10, store);
    const full: CacheStorage = { ...store, setItem: () => {
      throw new Error("QuotaExceededError");
    } };
    expect(saveScan("c/d", SMALL, 20, full).map((e) => e.label)).toEqual(["a/b"]);
  });
});
