// Spec cemetery-undead, task 5.4: depth Tiers by urgency (requirement 5). Property 1.
import type { PackageHealth } from "@sexton/api";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { planScene, type Rect } from "../src/scene/layout.js";
import { TIER_OF, TIER_SCALE } from "../src/scene/tiers.js";
import type { FormView } from "../src/time/form-at.js";
import { triageOrder } from "../src/triage/triage.js";
import { arbScenePackages, arbState, arbTheme, scenePackage } from "./arbitraries.js";

const overlap = (a: Rect, b: Rect): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const RANK = { back: 0, middle: 1, front: 2 } as const;

const arbForms = (n: number): fc.Arbitrary<(FormView | undefined)[]> =>
  fc.array(
    fc.option(
      fc.record({ state: fc.option(arbState, { nil: null }), reason: fc.constant("r"), ghost: fc.boolean() }),
      { nil: undefined },
    ),
    { minLength: n, maxLength: n },
  );

describe("Feature: cemetery-undead, Property 1: Tiers keep triage order and never overlap", () => {
  it("Feature: cemetery-undead, Property 1: Tiers keep triage order and never overlap", () => {
    fc.assert(
      fc.property(
        arbScenePackages([0, 1, 5, 12, 61, 300]).chain((pkgs) => fc.tuple(fc.constant(pkgs), arbForms(pkgs.length))),
        fc.integer({ min: 0, max: 4000 }),
        arbTheme,
        ([raw, forms], width, theme) => {
          const packages = triageOrder(raw);
          const plan = planScene({ packages, width, theme, selectedIndex: null, ghostPhase: 0 });
          const withForms = planScene({ packages, width, theme, selectedIndex: null, ghostPhase: 0, forms });
          expect(withForms.graves.map((g) => g.rect)).toEqual(plan.graves.map((g) => g.rect));
          const n = packages.length;
          expect(plan.paintOrder.slice().sort((a, b) => a - b)).toEqual(Array.from({ length: n }, (_, i) => i));
          const effective = Math.max(224, width);
          plan.graves.forEach((g, i) => {
            const pkg = packages[i] as PackageHealth;
            const tier = TIER_OF[pkg.state];
            expect(g.rect.w).toBe(Math.round(192 * TIER_SCALE[tier]));
            expect(g.rect.h).toBe(Math.round(224 * TIER_SCALE[tier]));
            expect(g.rect.x).toBeGreaterThanOrEqual(0);
            expect(g.rect.x + g.rect.w).toBeLessThanOrEqual(effective);
            expect(g.rect.y).toBeGreaterThanOrEqual(plan.scenery.skyHeight);
            expect(g.rect.y + g.rect.h).toBeLessThanOrEqual(plan.height);
          });
          // In triage order the graves of each Tier are contiguous, and fill rows left to right in index order.
          for (let i = 1; i < n; i += 1) {
            const a = plan.graves[i - 1] as (typeof plan.graves)[number];
            const b = plan.graves[i] as (typeof plan.graves)[number];
            const ta = TIER_OF[(packages[i - 1] as PackageHealth).state];
            const tb = TIER_OF[(packages[i] as PackageHealth).state];
            expect(RANK[ta]).toBeGreaterThanOrEqual(RANK[tb]);
            if (ta === tb) expect(b.rect.y > a.rect.y || (b.rect.y === a.rect.y && b.rect.x > a.rect.x)).toBe(true);
            // The back Tier lies above the middle, the middle above the front.
            else expect(b.rect.y + b.rect.h).toBeLessThanOrEqual(a.rect.y);
          }
          const limit = Math.min(n, 61);
          for (let i = 0; i < limit; i += 1) {
            for (let j = i + 1; j < n; j += 1) expect(overlap(plan.graves[i]?.rect as Rect, plan.graves[j]?.rect as Rect)).toBe(false);
          }
          // Paint order runs back to front.
          const tiersPainted = plan.paintOrder.map((i) => RANK[TIER_OF[(packages[i] as PackageHealth).state]]);
          for (let k = 1; k < tiersPainted.length; k += 1) expect(tiersPainted[k]).toBeGreaterThanOrEqual(tiersPainted[k - 1] as number);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("lays the demo's mix as 6 front, 4 middle and 2 back graves", () => {
    const states = ["Possessed", "Dead", "Dead", "Dead", "Dead", "Dead", "Haunted", "Restless", "Restless", "Restless", "Alive", "Alive"] as const;
    const packages = states.map((s, i) => scenePackage(`p${String(i)}`, s, "none"));
    for (const width of [224, 390, 1440]) {
      const plan = planScene({ packages, width, theme: "dark", selectedIndex: null, ghostPhase: 0 });
      const widths = plan.graves.map((g) => g.rect.w);
      expect(widths.filter((w) => w === 192)).toHaveLength(6);
      expect(widths.filter((w) => w === 154)).toHaveLength(4);
      expect(widths.filter((w) => w === 123)).toHaveLength(2);
    }
  });

  it("changes columns per Tier at its own cell width (Deliberate test change 5)", () => {
    const cols = (state: "Dead" | "Restless" | "Alive", width: number): number => {
      const packages = Array.from({ length: 5 }, (_, i) => scenePackage(`p${String(i)}`, state, "none"));
      const plan = planScene({ packages, width, theme: "dark", selectedIndex: null, ghostPhase: 0 });
      return new Set(plan.graves.map((g) => g.rect.y)).size === 5 ? 1 : new Set(plan.graves.filter((g) => g.rect.y === plan.graves[0]?.rect.y).map((g) => g.rect.x)).size;
    };
    expect([cols("Dead", 415), cols("Dead", 416)]).toEqual([1, 2]);
    expect([cols("Restless", 339), cols("Restless", 340)]).toEqual([1, 2]);
    expect([cols("Alive", 277), cols("Alive", 278)]).toEqual([1, 2]);
  });
});
