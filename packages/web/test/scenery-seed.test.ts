import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { sceneryFor } from "../src/scene/layout.js";
import { mulberry32, SCENERY_SEED, unitStars, unitTufts } from "../src/scene/scenery-seed.js";

const NUM_RUNS = 100;

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sourceFiles(path));
    else out.push(path);
  }
  return out;
}

describe("Feature: cemetery-polish, Property 2: Seeded scenery is deterministic and bounded", () => {
  it("is deterministic, counted and bounded for any width of at least 224", () => {
    fc.assert(
      fc.property(fc.integer({ min: 224, max: 5000 }), (width) => {
        const a = sceneryFor(width);
        const b = sceneryFor(width);
        expect(b).toEqual(a);
        expect(a.stars).toHaveLength(Math.floor((width * 80) / 800));
        expect(a.grass).toHaveLength(Math.floor(width / 14));
        a.stars.forEach((s, i) => {
          expect(s.x).toBeGreaterThanOrEqual(0);
          expect(s.x).toBeLessThanOrEqual(width - 2);
          expect(s.y).toBeGreaterThanOrEqual(4);
          expect(s.y).toBeLessThanOrEqual(72);
          expect(s.size).toBe(i % 3 === 0 ? 2 : 1);
          expect(s.layer).toBe(i % 3 === 0 ? "near" : "far");
        });
        for (const t of a.grass) {
          expect(t.x).toBeGreaterThanOrEqual(0);
          expect(t.x).toBeLessThanOrEqual(width - 2);
          expect(t.h).toBeGreaterThanOrEqual(4);
          expect(t.h).toBeLessThanOrEqual(10);
          expect(t.y).toBeGreaterThanOrEqual(0);
          expect(t.y + t.h).toBeLessThanOrEqual(224);
          expect(["dark", "light"]).toContain(t.tone);
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it("gives deeply equal results from a fresh computation (cache is invisible)", () => {
    fc.assert(
      fc.property(fc.integer({ min: 224, max: 3000 }), (width) => {
        const first = sceneryFor(width);
        sceneryFor(width + 1);
        expect(sceneryFor(width)).toEqual(first);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it("has unitStars and unitTufts prefixes for any n at most m", () => {
    fc.assert(
      fc.property(fc.nat(150), fc.nat(150), (x, y) => {
        const n = Math.min(x, y);
        const m = Math.max(x, y);
        expect(unitStars(m).slice(0, n)).toEqual(unitStars(n));
        expect(unitTufts(m).slice(0, n)).toEqual(unitTufts(n));
        for (const s of unitStars(m)) {
          expect(s.u).toBeGreaterThanOrEqual(0);
          expect(s.u).toBeLessThan(1);
          expect(s.v).toBeGreaterThanOrEqual(0);
          expect(s.v).toBeLessThan(1);
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it("gives the same mulberry32 sequence for the same seed", () => {
    fc.assert(
      fc.property(fc.integer(), (seed) => {
        const a = mulberry32(seed);
        const b = mulberry32(seed);
        for (let i = 0; i < 20; i += 1) {
          const x = a();
          expect(x).toBe(b());
          expect(x).toBeGreaterThanOrEqual(0);
          expect(x).toBeLessThan(1);
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it("uses the documented seed and no Math.random anywhere under src", () => {
    expect(SCENERY_SEED).toBe(0x5e7701c3);
    const src = join(import.meta.dirname, "..", "src");
    const offenders = sourceFiles(src).filter((path) => readFileSync(path, "utf8").includes("Math.random"));
    expect(offenders).toEqual([]);
  });
});
