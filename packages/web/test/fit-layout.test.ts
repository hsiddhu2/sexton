// Spec clean-site, task 11 (design C13, requirements 15.2, 15.3): the fit scale and the front-first Narrow layout.
import type { PackageHealth } from "@sexton/api";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { MIN_SCENE_HEIGHT } from "../src/Cemetery.js";
import { panelOverflows } from "../src/panel/use-panel-scroll.js";
import { CELL_HEIGHT, CELL_WIDTH, fitScale, MIN_FIT_SCALE, NARROW_FRONT_COLUMNS, NARROW_MIN_FIT_SCALE, planScene, REPLAY_MIN_SCENE_HEIGHT, replayCell, type Rect } from "../src/scene/layout.js";
import { OVERLAY_BAND } from "../src/scene/overlay-band.js";
import { TIER_OF, TIER_SCALE, type TierId } from "../src/scene/tiers.js";
import { triageOrder } from "../src/triage/triage.js";
import { arbScenePackages, scenePackage } from "./arbitraries.js";

const overlap = (a: Rect, b: Rect): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const RANK: Readonly<Record<TierId, number>> = { back: 0, middle: 1, front: 2 };
const DEMO_STATES = ["Possessed", "Dead", "Dead", "Dead", "Dead", "Dead", "Haunted", "Restless", "Restless", "Restless", "Alive", "Alive"] as const;
const demo = (): PackageHealth[] => DEMO_STATES.map((s, i) => scenePackage(`p${String(i)}`, s, "none"));

describe("Feature: clean-site, the fit scale and the front-first layout (15.3)", () => {
  it("keeps every Tier's own scale, triage order, no overlap and the rows inside the width, front first or not", () => {
    fc.assert(
      fc.property(
        arbScenePackages([1, 5, 12, 61, 300]),
        fc.integer({ min: 320, max: 1600 }),
        fc.integer({ min: 0, max: 1200 }),
        fc.boolean(),
        (raw, width, fit, frontFirst) => {
          const packages = triageOrder(raw);
          const plan = planScene({ packages, width, theme: "dark", selectedIndex: null, ghostPhase: 0, fitHeight: fit, frontFirst });
          const front = plan.graves.find((g) => TIER_OF[g.state] === "front");
          const scale = front === undefined ? null : front.rect.w / 192;
          for (const g of plan.graves) {
            const tier = TIER_OF[g.state];
            if (front !== undefined) expect(Math.abs(g.rect.w - Math.round(front.rect.w * TIER_SCALE[tier]))).toBeLessThanOrEqual(1);
            expect(g.rect.x).toBeGreaterThanOrEqual(0);
            expect(g.rect.x + g.rect.w).toBeLessThanOrEqual(Math.max(224, width));
            expect(g.rect.y).toBeGreaterThanOrEqual(plan.scenery.skyHeight);
          }
          if (scale !== null) expect(scale).toBeGreaterThanOrEqual(MIN_FIT_SCALE - 0.01);
          const n = plan.graves.length;
          for (let i = 1; i < n; i += 1) {
            const a = plan.graves[i - 1] as (typeof plan.graves)[number];
            const b = plan.graves[i] as (typeof plan.graves)[number];
            const ta = TIER_OF[a.state];
            const tb = TIER_OF[b.state];
            if (ta === tb) expect(b.rect.y > a.rect.y || (b.rect.y === a.rect.y && b.rect.x > a.rect.x)).toBe(true);
            // Front first: the front Tier lies above the middle, the middle above the back; else the other way.
            else if (frontFirst) expect(a.rect.y + a.rect.h).toBeLessThanOrEqual(b.rect.y);
            else expect(b.rect.y + b.rect.h).toBeLessThanOrEqual(a.rect.y);
            expect(RANK[ta]).toBeGreaterThanOrEqual(RANK[tb]);
          }
          const limit = Math.min(n, 61);
          for (let i = 0; i < limit; i += 1) {
            for (let j = i + 1; j < n; j += 1) expect(overlap(plan.graves[i]?.rect as Rect, plan.graves[j]?.rect as Rect)).toBe(false);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it("fits the demo's graves in a 1440 by 900 Scene of about 560 px, above the Footer bar, at a scale under 1 that fits", () => {
    const packages = demo();
    const width = 986;
    for (const fit of [520, 560, 600]) {
      const plan = planScene({ packages, width, theme: "dark", selectedIndex: null, ghostPhase: 0, fitHeight: fit, minHeight: fit });
      expect(plan.height).toBeLessThanOrEqual(fit);
      expect(plan.scenery.skyHeight).toBeGreaterThanOrEqual(OVERLAY_BAND);
      const s = fitScale({ front: 6, middle: 4, back: 2 }, width, fit, false);
      expect(s).toBeLessThan(1);
      expect(s).toBeGreaterThanOrEqual(MIN_FIT_SCALE);
      // At full size they do not fit.
      const larger = planScene({ packages, width, theme: "dark", selectedIndex: null, ghostPhase: 0 });
      expect(larger.height).toBeGreaterThan(fit);
    }
  });

  it("keeps scale 1 when the graves fit, with no fit height, for a Replay, and when even the smallest scale does not fit", () => {
    expect(fitScale({ front: 6, middle: 4, back: 2 }, 1600, 2000, false)).toBe(1);
    expect(fitScale({ front: 6, middle: 4, back: 2 }, 986, 0, false)).toBe(1);
    expect(fitScale({ front: 300, middle: 0, back: 0 }, 986, 560, false)).toBe(1);
    expect(fitScale({ front: 6, middle: 4, back: 2 }, Number.NaN, 560, true)).toBe(1);
    const one = planScene({ packages: [scenePackage("axios", "Possessed", "none")], width: 986, theme: "dark", selectedIndex: null, ghostPhase: 0, fitHeight: 300, replay: true });
    expect(one.graves[0]?.rect.w).toBeGreaterThanOrEqual(192);
  });

  it("stands two front graves to a row in the Narrow layout at 390 and 360, with the front Tier on top", () => {
    for (const width of [362, 332, 671]) {
      const plan = planScene({ packages: triageOrder(demo()), width, theme: "dark", selectedIndex: null, ghostPhase: 0, frontFirst: true });
      const fronts = plan.graves.filter((g) => TIER_OF[g.state] === "front");
      const firstRow = fronts.filter((g) => g.rect.y === fronts[0]?.rect.y);
      expect(firstRow.length).toBeGreaterThanOrEqual(NARROW_FRONT_COLUMNS);
      const top = Math.min(...plan.graves.map((g) => g.rect.y));
      expect(plan.graves.filter((g) => g.rect.y === top).every((g) => TIER_OF[g.state] === "front")).toBe(true);
      expect(plan.graves[0]?.state).toBe("Possessed");
      expect(plan.graves[0]?.rect.y).toBe(top);
    }
  });

  it("keeps the Wide layout's order and sizes when frontFirst is false", () => {
    const packages = triageOrder(demo());
    const a = planScene({ packages, width: 1440, theme: "dark", selectedIndex: null, ghostPhase: 0 });
    const b = planScene({ packages, width: 1440, theme: "dark", selectedIndex: null, ghostPhase: 0, frontFirst: false });
    expect(b.graves.map((g) => g.rect)).toEqual(a.graves.map((g) => g.rect));
  });

  // Spec clean-site, 3.29 (owner decision, 27 Nov): the floor is 0.4 in the Wide and Middle layouts, so short laptop
  // screens fit the demo; the Narrow layout keeps 0.6.
  it("fits the demo below the old floor of 0.6 in short Scenes, and never under the new floor", () => {
    expect(MIN_FIT_SCALE).toBe(0.4);
    expect(NARROW_MIN_FIT_SCALE).toBe(0.6);
    // 1366 by 768 with the Welcome bar open leaves a Scene of about 400 px, 912 px wide.
    for (const [width, fit] of [[912, 400], [826, 432], [912, 447], [826, 479]] as const) {
      const s = fitScale({ front: 6, middle: 4, back: 2 }, width, fit, false);
      expect(s).toBeLessThan(0.6);
      expect(s).toBeGreaterThanOrEqual(MIN_FIT_SCALE);
      const plan = planScene({ packages: triageOrder(demo()), width, theme: "dark", selectedIndex: null, ghostPhase: 0, fitHeight: fit, minHeight: fit });
      expect(plan.height).toBeLessThanOrEqual(fit);
    }
  });

  it("keeps the shortest Scene tall enough for the demo at the floor", () => {
    expect(fitScale({ front: 6, middle: 4, back: 2 }, 912, MIN_SCENE_HEIGHT, false)).toBeGreaterThanOrEqual(MIN_FIT_SCALE);
    expect(fitScale({ front: 6, middle: 4, back: 2 }, 912, MIN_SCENE_HEIGHT, false)).toBeLessThan(1);
  });

  it("keeps the Narrow layout's floor at 0.6 however narrow", () => {
    fc.assert(
      fc.property(fc.integer({ min: 224, max: 699 }), fc.integer({ min: 0, max: 2000 }), (width, fit) => {
        expect(fitScale({ front: 6, middle: 4, back: 2 }, width, fit, true)).toBeGreaterThanOrEqual(NARROW_MIN_FIT_SCALE);
      }),
      { numRuns: 100 },
    );
  });

  it("scrolls the Panel only when its content is taller than its box by more than a rounding", () => {
    expect(panelOverflows(722, 594)).toBe(true);
    expect(panelOverflows(726, 726)).toBe(false);
    expect(panelOverflows(726.4, 726)).toBe(false);
    expect(panelOverflows(100, 0)).toBe(false);
    expect(panelOverflows(Number.NaN, 100)).toBe(false);
  });
});

describe("Replay Scene on short screens (3.29)", () => {
  it("is never shorter than the Replay's grave at full size, which still fits it", () => {
    expect(REPLAY_MIN_SCENE_HEIGHT).toBe(376);
    expect(REPLAY_MIN_SCENE_HEIGHT).toBeLessThan(MIN_SCENE_HEIGHT);
    expect(replayCell(1000, REPLAY_MIN_SCENE_HEIGHT)).toEqual({ w: CELL_WIDTH, h: CELL_HEIGHT });
    expect(REPLAY_MIN_SCENE_HEIGHT - CELL_HEIGHT).toBeGreaterThanOrEqual(120 + 32);
  });
});
