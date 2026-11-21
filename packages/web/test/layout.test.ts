import type { PackageHealth } from "@sexton/api";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { backingStore, GHOST_HEIGHT, GHOST_WIDTH, ghostOffset, inscriptionFor, planScene, type Rect } from "../src/scene/layout.js";
import { arbScenePackages, at, arbSceneName, arbSceneWidth, arbTheme, cheapScan } from "./arbitraries.js";

const NUM_RUNS = 100;
const packagesOf = (n: number): PackageHealth[] => [...cheapScan(n).report.packages];
const overlap = (a: Rect, b: Rect): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

describe("Feature: cemetery-ui, Property 8: Layout is deterministic and no two graves overlap", () => {
  it("holds for any width and 0 to 300 packages", () => {
    fc.assert(
      fc.property(arbSceneWidth, fc.integer({ min: 0, max: 300 }), arbTheme, (rawWidth, n, theme) => {
        const input = { packages: packagesOf(n), width: rawWidth, theme, selectedIndex: null, ghostPhase: 0 as const };
        const plan = planScene(input);
        expect(planScene(input)).toEqual(plan);
        const width = Number.isFinite(rawWidth) ? Math.max(224, Math.floor(rawWidth)) : 224;
        expect(plan.width).toBe(width);
        if (n === 0) {
          expect(plan.columns).toBe(0);
          expect(plan.height).toBe(0);
          expect(plan.graves).toEqual([]);
          return;
        }
        const columns = Math.max(1, Math.floor((width - 32) / 192));
        expect(plan.columns).toBe(columns);
        expect(plan.height).toBe(80 + 32 + Math.ceil(n / columns) * 224);
        const seen = new Set<string>();
        plan.graves.forEach((g, i) => {
          expect(g.rect.x).toBe(16 + (i % columns) * 192);
          expect(g.rect.y).toBe(96 + Math.floor(i / columns) * 224);
          expect(g.rect.x).toBeGreaterThanOrEqual(0);
          expect(g.rect.y).toBeGreaterThanOrEqual(0);
          expect(g.rect.x + g.rect.w).toBeLessThanOrEqual(plan.width);
          expect(g.rect.y + g.rect.h).toBeLessThanOrEqual(plan.height);
          const key = `${g.rect.x},${g.rect.y}`;
          expect(seen.has(key)).toBe(false);
          seen.add(key);
        });
        if (n <= 60) {
          for (let i = 0; i < n; i += 1) {
            for (let j = i + 1; j < n; j += 1) expect(overlap(at(plan.graves, i).rect, at(plan.graves, j).rect)).toBe(false);
          }
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it("puts the first package top-left", () => {
    const plan = planScene({ packages: packagesOf(3), width: 1280, theme: "light", selectedIndex: null, ghostPhase: 0 });
    expect(plan.graves[0]?.rect).toEqual({ x: 16, y: 96, w: 192, h: 224 });
  });

  it("changes columns at width 415 and 416", () => {
    const at = (width: number) => planScene({ packages: packagesOf(5), width, theme: "light", selectedIndex: null, ghostPhase: 0 }).columns;
    expect(at(415)).toBe(1);
    expect(at(416)).toBe(2);
  });

  it("lays out 300 graves at width 224 in one column", () => {
    const plan = planScene({ packages: packagesOf(300), width: 224, theme: "dark", selectedIndex: null, ghostPhase: 0 });
    expect(plan.columns).toBe(1);
    expect(plan.height).toBe(67312);
  });

  it("gives zero columns and height for no packages", () => {
    const plan = planScene({ packages: [], width: 800, theme: "light", selectedIndex: null, ghostPhase: 0 });
    expect([plan.columns, plan.height, plan.ring]).toEqual([0, 0, null]);
  });
});

const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;
const GRAVE_KEYS = ["fill", "ghost", "index", "inscription", "name", "rect", "shape", "state"];

describe("Feature: cemetery-ui, Property 19: Scene plan invariants", () => {
  it("holds for any packages, theme, phase and selection", () => {
    fc.assert(
      fc.property(
        arbScenePackages(),
        arbTheme,
        fc.constantFrom<0 | 1>(0, 1),
        fc.option(fc.integer({ min: -1, max: 301 }), { nil: null }),
        fc.integer({ min: 100, max: 2000 }),
        (packages, theme, phase, selectedIndex, width) => {
          const n = packages.length;
          const plan = planScene({ packages, width, theme, selectedIndex, ghostPhase: phase });
          expect(plan.graves).toHaveLength(n);
          plan.graves.forEach((g, i) => {
            const pkg = at(packages, i);
            expect(g.index).toBe(i);
            expect(g.name).toBe(pkg.name);
            expect(g.state).toBe(pkg.state);
            expect(Object.keys(g).sort()).toEqual(GRAVE_KEYS);
            expect([g.rect.w, g.rect.h]).toEqual([192, 224]);
            if (g.ghost !== null) {
              expect(g.ghost.x).toBeGreaterThanOrEqual(g.rect.x);
              expect(g.ghost.x + GHOST_WIDTH).toBeLessThanOrEqual(g.rect.x + g.rect.w);
              expect(g.ghost.y).toBeGreaterThanOrEqual(g.rect.y);
              expect(g.ghost.y + GHOST_HEIGHT).toBeLessThanOrEqual(g.rect.y + g.rect.h);
            }
            if (n > 60) expect(g.inscription).toBeNull();
            else {
              const expected = pkg.name.length <= 16 ? pkg.name : null;
              if (expected !== null) expect(g.inscription).toBe(expected);
              else {
                const text = g.inscription ?? "";
                expect(text.endsWith("…")).toBe(true);
                expect(text.length).toBeLessThanOrEqual(16);
                expect(pkg.name.startsWith(text.slice(0, -1))).toBe(true);
              }
              expect(LONE_SURROGATE.test(g.inscription ?? "")).toBe(false);
            }
          });
          const other = planScene({ packages, width, theme, selectedIndex, ghostPhase: phase === 0 ? 1 : 0 });
          const stripGhostY = (p: typeof plan) =>
            p.graves.map((g) => ({ ...g, ghost: g.ghost === null ? null : { x: g.ghost.x } }));
          expect(stripGhostY(other)).toEqual(stripGhostY(plan));
          plan.graves.forEach((g, i) => {
            const o = at(other.graves, i);
            if (g.ghost !== null) expect(Math.abs((o.ghost?.y ?? Number.NaN) - g.ghost.y)).toBeCloseTo(Math.abs(ghostOffset(1) - ghostOffset(0)), 9);
          });
          const valid = selectedIndex !== null && selectedIndex >= 0 && selectedIndex < n;
          if (valid) {
            const r = at(plan.graves, selectedIndex).rect;
            expect(plan.ring).toEqual({ x: r.x + 2, y: r.y + 2, w: r.w - 4, h: r.h - 4 });
          } else expect(plan.ring).toBeNull();
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it("cuts inscriptions at 60 and 61 packages", () => {
    expect(inscriptionFor("short", 60)).toBe("short");
    expect(inscriptionFor("short", 61)).toBeNull();
    expect(inscriptionFor("abcdefghijklmnopqrst", 1)).toBe("abcdefghijklmno…");
  });

  it("drops a high surrogate at the cut", () => {
    const name = `${"a".repeat(14)}😀tail`;
    expect(inscriptionFor(name, 1)).toBe(`${"a".repeat(14)}…`);
  });
});

describe("Feature: cemetery-ui, Property 20: The canvas backing store respects the caps", () => {
  it("holds for any size and device pixel ratio", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 128, max: 5000 }),
        fc.integer({ min: 0, max: 40000 }),
        fc.oneof(fc.double({ min: 0, max: 5, noNaN: true }), fc.constantFrom(0, NaN, Infinity)),
        (w, h, dpr) => {
          const b = backingStore(w, h, dpr);
          expect(Number.isInteger(b.width) && Number.isInteger(b.height)).toBe(true);
          expect(b.width).toBeGreaterThanOrEqual(1);
          expect(b.height).toBeGreaterThanOrEqual(1);
          expect(b.width).toBeLessThanOrEqual(16384);
          expect(b.height).toBeLessThanOrEqual(16384);
          expect(b.scale).toBeLessThanOrEqual(2);
          if (dpr > 0) expect(b.scale).toBeLessThanOrEqual(dpr);
          expect(b.scale).toBeLessThanOrEqual(16384 / w);
          expect(b.scale).toBeLessThanOrEqual(16384 / Math.max(h, 1));
          if (w <= 8192 && h <= 8192 && dpr >= 1 && dpr <= 2) expect(b.scale).toBe(dpr);
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });
});

describe("Feature: cemetery-theme, Property 2: Layout formulas, containment and determinism", () => {
  it("holds for any width and 0 to 300 packages", () => {
    fc.assert(
      fc.property(arbSceneWidth, fc.integer({ min: 0, max: 300 }), arbTheme, (rawWidth, n, theme) => {
        const input = { packages: packagesOf(n), width: rawWidth, theme, selectedIndex: null, ghostPhase: 0 };
        const plan = planScene(input);
        expect(planScene(input)).toEqual(plan);
        const width = Number.isFinite(rawWidth) ? Math.max(224, Math.floor(rawWidth)) : 224;
        expect(plan.width).toBe(width);
        if (n === 0) {
          expect([plan.columns, plan.height, plan.graves.length]).toEqual([0, 0, 0]);
          return;
        }
        const columns = Math.max(1, Math.floor((width - 32) / 192));
        expect(plan.columns).toBe(columns);
        expect(plan.height).toBe(80 + 16 + Math.ceil(n / columns) * 224 + 16);
        expect(plan.graves).toHaveLength(n);
        plan.graves.forEach((g, i) => {
          expect(g.index).toBe(i);
          expect(g.rect).toEqual({ x: 16 + (i % columns) * 192, y: 96 + Math.floor(i / columns) * 224, w: 192, h: 224 });
          expect(g.rect.x + g.rect.w).toBeLessThanOrEqual(plan.width);
          expect(g.rect.y + g.rect.h).toBeLessThanOrEqual(plan.height);
        });
        const limit = n <= 60 ? n : 60;
        for (let i = 0; i < limit; i += 1) {
          for (let j = i + 1; j < n; j += n <= 60 ? 1 : 7) expect(overlap(at(plan.graves, i).rect, at(plan.graves, j).rect)).toBe(false);
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it("matches the 300-grave examples", () => {
    const tall = planScene({ packages: packagesOf(300), width: 224, theme: "dark", selectedIndex: null, ghostPhase: 0 });
    expect([tall.columns, tall.height]).toEqual([1, 67312]);
    const b = backingStore(224, 67312, 2);
    expect(b.scale).toBe(16384 / 67312);
    expect(b.height).toBeLessThanOrEqual(16384);
    const wide = planScene({ packages: packagesOf(300), width: 1280, theme: "dark", selectedIndex: null, ghostPhase: 0 });
    expect([wide.columns, wide.height]).toEqual([6, 11312]);
  });
});

describe("Feature: cemetery-theme, Property 3: Inscription truncation", () => {
  it("holds for any name and package count", () => {
    fc.assert(
      fc.property(arbSceneName, fc.constantFrom(0, 1, 59, 60, 61, 300), (name, count) => {
        const text = inscriptionFor(name, count);
        if (count > 60) {
          expect(text).toBeNull();
          return;
        }
        if (name.length <= 16) {
          expect(text).toBe(name);
          return;
        }
        const out = text ?? "";
        expect(out.length).toBeLessThanOrEqual(16);
        expect(out.endsWith("…")).toBe(true);
        expect(name.startsWith(out.slice(0, -1))).toBe(true);
        expect(LONE_SURROGATE.test(out)).toBe(false);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it("gives 60 inscriptions for 60 packages and none for 61", () => {
    const count = (n: number): number =>
      planScene({ packages: packagesOf(n), width: 1280, theme: "dark", selectedIndex: null, ghostPhase: 0 }).graves.filter((g) => g.inscription !== null).length;
    expect([count(60), count(61)]).toEqual([60, 0]);
  });
});
