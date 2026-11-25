import type { PackageHealth } from "@sexton/api";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { backingStore, GHOST_HEIGHT, GHOST_WIDTH, ghostOffset, inscriptionFor, planScene, type Rect } from "../src/scene/layout.js";
import { colourFor, PALETTE } from "../src/scene/palette.js";
import { SHAPE_BY_STATE } from "../src/scene/shapes.js";
import type { FormView } from "../src/time/form-at.js";
import { arbScenePackages, at, arbSceneName, arbSceneWidth, arbTheme, cheapScan } from "./arbitraries.js";

const NUM_RUNS = 100;
const packagesOf = (n: number): PackageHealth[] => [...cheapScan(n).report.packages];
const overlap = (a: Rect, b: Rect): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const allOf = (n: number, state: PackageHealth["state"]): PackageHealth[] => packagesOf(n).map((p) => ({ ...p, state }));

/**
 * Spec cemetery-undead, Deliberate test changes 3 to 6: an independent model of the Tier layout. Back Tier first
 * (Alive, 0.64), middle (Haunted and Restless, 0.8), front (Possessed and Dead, 1); no gap between Tiers; every row
 * centred in the drawable width; sky 120 and padding 16 (design.md, decisions 6 and 11). K2d fix 1, Deliberate test
 * change 30: the graves of a row spread apart up to 1.07, 1.2 and 1.4 cell widths (front, middle, back) to fill it.
 */
function tierModel(packages: readonly PackageHealth[], width: number): { rects: Rect[]; height: number; rows: number } {
  const tierOf = (s: string): number => (s === "Alive" ? 0 : s === "Haunted" || s === "Restless" ? 1 : 2);
  const scales = [0.64, 0.8, 1];
  const caps = [1.4, 1.2, 1.07];
  const rects: Rect[] = [];
  let y = 120 + 16;
  let rows = 0;
  let first = true;
  for (let t = 0; t < 3; t += 1) {
    const members = packages.map((p, i) => [p, i] as const).filter(([p]) => tierOf(p.state) === t).map(([, i]) => i);
    if (members.length === 0) continue;
    if (!first) y += 0;
    first = false;
    const w = Math.round(192 * (scales[t] ?? 1));
    const h = Math.round(224 * (scales[t] ?? 1));
    const cols = Math.max(1, Math.floor((width - 32) / w));
    const tierRows = Math.ceil(members.length / cols);
    members.forEach((index, k) => {
      const row = Math.floor(k / cols);
      const inRow = Math.min(cols, members.length - row * cols);
      const span = Math.min(width, 16384) - 32;
      const pitch = Math.max(w, Math.min(Math.floor(w * (caps[t] ?? 1)), Math.floor(span / inRow)));
      const left = 16 + Math.max(0, Math.floor((span - ((inRow - 1) * pitch + w)) / 2));
      rects[index] = { x: left + (k % cols) * pitch, y: y + row * h, w, h };
    });
    rows += tierRows;
    y += tierRows * h;
  }
  return { rects, height: y + 16, rows };
}

// Spec cemetery-undead, Deliberate test change 3: the formulas now come from the Tier model (Feature: cemetery-undead, Property 1).
describe("Feature: cemetery-ui, Property 8: Layout is deterministic and no two graves overlap (Feature: cemetery-undead, Property 1: Tiers keep triage order and never overlap)", () => {
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
        const model = tierModel(input.packages, width);
        expect(plan.height).toBe(model.height);
        const seen = new Set<string>();
        plan.graves.forEach((g, i) => {
          expect(g.rect).toEqual(model.rects[i]);
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

  it("puts the first package at the left of its Tier's first row, at the Tier's scale", () => {
    const plan = planScene({ packages: allOf(3, "Dead"), width: 1280, theme: "light", selectedIndex: null, ghostPhase: 0 });
    // Three front cells of 192, 205 apart (192 times 1.07, floored), centred in 1248: left = 16 + (1248 - 602) / 2.
    expect(plan.graves[0]?.rect).toEqual({ x: 339, y: 136, w: 192, h: 224 });
    expect(plan.graves[1]?.rect.x).toBe(339 + 205);
    const back = planScene({ packages: allOf(3, "Alive"), width: 1280, theme: "light", selectedIndex: null, ghostPhase: 0 });
    // Back cells of 123, 172 apart (123 times 1.4, floored).
    expect(back.graves[0]?.rect).toEqual({ x: 16 + Math.floor((1248 - (2 * 172 + 123)) / 2), y: 136, w: 123, h: 143 });
  });

  it("changes columns at width 415 and 416", () => {
    const at = (width: number) => planScene({ packages: packagesOf(5), width, theme: "light", selectedIndex: null, ghostPhase: 0 }).columns;
    expect(at(415)).toBe(1);
    expect(at(416)).toBe(2);
  });

  it("lays out 300 front-Tier graves at width 224 in one column", () => {
    const plan = planScene({ packages: allOf(300, "Dead"), width: 224, theme: "dark", selectedIndex: null, ghostPhase: 0 });
    expect(plan.columns).toBe(1);
    expect(plan.height).toBe(67352);
  });

  it("gives zero columns and height for no packages", () => {
    const plan = planScene({ packages: [], width: 800, theme: "light", selectedIndex: null, ghostPhase: 0 });
    expect([plan.columns, plan.height, plan.ring]).toEqual([0, 0, null]);
  });
});

const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;
const GRAVE_KEYS = ["burial", "fill", "ghost", "index", "inscription", "marker", "name", "pending", "rect", "shape", "state"];

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
            expect([[192, 224], [154, 179], [123, 143]]).toContainEqual([g.rect.w, g.rect.h]);
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
        const model = tierModel(input.packages, width);
        expect(plan.height).toBe(model.height);
        expect(plan.graves).toHaveLength(n);
        plan.graves.forEach((g, i) => {
          expect(g.index).toBe(i);
          expect(g.rect).toEqual(model.rects[i]);
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
    // Spec cemetery-undead: 300 front-Tier graves, worked by hand in design.md (Deliberate test change 6).
    const tall = planScene({ packages: allOf(300, "Dead"), width: 224, theme: "dark", selectedIndex: null, ghostPhase: 0 });
    expect([tall.columns, tall.height]).toEqual([1, 67352]);
    const b = backingStore(224, 67352, 2);
    expect(b.scale).toBe(16384 / 67352);
    expect(b.height).toBeLessThanOrEqual(16384);
    const wide = planScene({ packages: allOf(300, "Dead"), width: 1280, theme: "dark", selectedIndex: null, ghostPhase: 0 });
    expect([wide.columns, wide.height]).toEqual([6, 11352]);
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

describe("Feature: cemetery-time, Property 3: Ground height", () => {
  it("keeps the layout formulas and sets groundHeight from minHeight", () => {
    fc.assert(
      fc.property(
        arbScenePackages([0, 1, 5, 61]),
        arbSceneWidth,
        arbTheme,
        fc.oneof(fc.integer({ min: -500, max: 5000 }), fc.constantFrom(Number.NaN, Infinity, -Infinity)),
        (packages, width, theme, minHeight) => {
          const plan = planScene({ packages, width, theme, selectedIndex: null, ghostPhase: 0, minHeight });
          const base = planScene({ packages, width, theme, selectedIndex: null, ghostPhase: 0 });
          expect(plan.height).toBe(base.height);
          expect(plan.columns).toBe(base.columns);
          expect(plan.graves.map((g) => g.rect)).toEqual(base.graves.map((g) => g.rect));
          const free = Number.isFinite(minHeight) ? Math.max(0, Math.floor(minHeight)) : 0;
          expect(plan.groundHeight).toBe(packages.length === 0 ? 0 : Math.max(plan.height, free));
          expect(base.groundHeight).toBe(base.height);
          expect(plan.rows).toBe(packages.length === 0 ? 0 : tierModel(packages, plan.width).rows);
          for (const g of plan.graves) expect(g.rect.y + g.rect.h).toBeLessThanOrEqual(plan.height);
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });
});

const arbFormView: fc.Arbitrary<FormView | undefined> = fc.oneof(
  fc.constant(undefined),
  fc.record({
    state: fc.constantFrom<FormView["state"]>(null, "Alive", "Restless", "Haunted", "Dead", "Possessed"),
    reason: fc.constant("r"),
    ghost: fc.boolean(),
  }),
  fc.record({
    state: fc.constantFrom<FormView["state"]>(null, "Alive", "Dead"),
    reason: fc.constant("r"),
    ghost: fc.boolean(),
    version: fc.constantFrom("1.0.0", "2.3.4"),
  }),
);
describe("Feature: cemetery-time, Property 16: A plan with Forms keeps the cemetery rules", () => {
  it("keeps positions and order, encodes state by shape and colour, and draws no Ghost or marker on the Not-published form", () => {
    fc.assert(
      fc.property(
        arbScenePackages([0, 1, 12, 59, 61]),
        arbSceneWidth,
        arbTheme,
        fc.array(arbFormView, { minLength: 61, maxLength: 61 }),
        fc.array(fc.boolean(), { minLength: 61, maxLength: 61 }),
        fc.integer({ min: 0, max: 60 }),
        (packages, width, theme, forms, marks, burialIndex) => {
          const base = { packages, width, theme, selectedIndex: null, ghostPhase: 0 as const };
          const plain = planScene(base);
          const plan = planScene({ ...base, forms, marks, burial: { index: burialIndex, phase: 0.5 } });
          expect(plan.graves).toHaveLength(plain.graves.length);
          expect(plan.height).toBe(plain.height);
          plan.graves.forEach((g, i) => {
            const p = at(plain.graves, i);
            const form = forms[i];
            expect([g.index, g.name, g.state, g.rect]).toEqual([p.index, p.name, p.state, p.rect]);
            expect(Object.keys(g).sort()).toEqual(GRAVE_KEYS);
            if (form !== undefined && form.state === null) {
              expect([g.pending, g.shape, g.fill, g.ghost, g.marker, g.burial]).toEqual([true, "unmarked", PALETTE[theme].border, null, false, null]);
            } else if (form !== undefined && form.state !== null) {
              expect(g.pending).toBe(false);
              expect(g.shape).toBe(SHAPE_BY_STATE[form.state]);
              expect(g.fill).toBe(colourFor(form.state, theme));
              expect(g.ghost !== null).toBe(form.ghost);
              expect(g.marker).toBe(marks[i] === true);
            } else {
              expect(g).toEqual({ ...p, marker: marks[i] === true, burial: burialIndex === i ? 0.5 : null });
            }
            if (form?.version !== undefined && g.inscription !== null) expect(g.inscription.startsWith(g.name.slice(0, 8))).toBe(true);
          });
        },
      ),
      { numRuns: 100 },
    );
  });
});
