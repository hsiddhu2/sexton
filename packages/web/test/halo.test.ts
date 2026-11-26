// Spec cemetery-undead-2, requirement 3: the Halo is strong, and paints nothing a contrast check guards.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { artRect, formParts, labelRect } from "../src/scene/art-box.js";
import { drawScene, type PaintContext2D } from "../src/scene/draw.js";
import { buryingRegions, HALO_BLUR, HALO_CX, HALO_CY, HALO_FEATHER, HALO_GROW, haloAlphaAt, haloMask, HALO_RADIUS, uncutHaloAlphaAt } from "../src/scene/halo.js";
import { CELL_WIDTH, planScene, type Rect, type ScenePlan } from "../src/scene/layout.js";
import { GLOW_ALPHA_BYTE, HALO_ALPHA_BYTE, PALETTE } from "../src/scene/palette.js";
import { STATES } from "../src/load/lists.js";
import { arbAdvisoryMode, arbSceneWidth, scenePackage } from "./arbitraries.js";
import { canvasCalls } from "./setup.js";

const NUM_RUNS = 100;
const PEAK = parseInt(HALO_ALPHA_BYTE, 16) / 255;

/** Points inside a rectangle: a 4 by 4 grid that includes its corners and edges. */
function pointsIn(r: Rect): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i <= 3; i += 1) for (let j = 0; j <= 3; j += 1) out.push([r.x + (r.w * i) / 3, r.y + (r.h * j) / 3]);
  return out;
}

interface Case {
  readonly plan: ScenePlan;
  readonly playing: readonly number[];
}

const arbCase: fc.Arbitrary<Case> = fc
  .integer({ min: 1, max: 60 })
  .chain((n) =>
    fc.record({
      rows: fc.array(fc.tuple(fc.constantFrom(...STATES), arbAdvisoryMode), { minLength: n, maxLength: n }),
      width: arbSceneWidth,
      selected: fc.option(fc.integer({ min: 0, max: n - 1 }), { nil: null }),
      lantern: fc.option(fc.integer({ min: 0, max: n - 1 }), { nil: null }),
      burial: fc.option(fc.record({ index: fc.integer({ min: 0, max: n - 1 }), phase: fc.double({ min: 0, max: 1, noNaN: true }) }), { nil: null }),
      priest: fc.option(fc.record({ index: fc.integer({ min: 0, max: n - 1 }), phase: fc.option(fc.double({ min: 0, max: 1, noNaN: true }), { nil: null }) }), { nil: null }),
      burst: fc.option(fc.record({ index: fc.integer({ min: 0, max: n - 1 }), startMs: fc.integer({ min: 0, max: 10_000 }) }), { nil: null }),
      reduced: fc.boolean(),
    }),
  )
  .map(({ rows, width, selected, lantern, burial, priest, burst, reduced }) => {
    const packages = rows.map(([state, mode], i) => scenePackage(`p${String(i)}`, state, mode));
    const plan = planScene({ packages, width, theme: "dark", selectedIndex: selected, ghostPhase: 0, lantern, burial, priest, burst, reducedMotion: reduced });
    const playing = new Set<number>();
    for (const g of plan.graves) if (g.burial !== null) playing.add(g.index);
    if (plan.priest !== null) playing.add(plan.priest.index);
    if (plan.burst !== null && plan.burst.startMs !== null) playing.add(plan.burst.index);
    return { plan, playing: [...playing] };
  });

describe("Feature: cemetery-undead-2, Property 3: The Halo paints nothing under a grave or a name", () => {
  it("is zero in every Part box, name label and the Art box of a playing grave, and uncut far from them, ring and outline included", () => {
    fc.assert(
      fc.property(arbCase, ({ plan, playing }) => {
        const mask = haloMask(plan);
        // The regions, worked out here from the plan, not read from the mask. Spec cemetery-undead-fixes, Deliberate
        // test change 1: each grave's Part, Ghost and pennant boxes, not its whole Form box. Spec judge-path, Deliberate
        // test change 3: the selection ring and the focus outline sit on their Ring casing and are not cut, so they are
        // not among the regions, and the far check below treats them as uncut ground.
        const regions: Rect[] = [];
        // A grave whose burial plays has no parts at rest among them: its burial regions below follow the stone.
        for (const g of plan.graves) regions.push(...(g.burial === null ? formParts(g) : []), labelRect(g));
        // A Burst's grave keeps its Art box cut (it has no Halo of its own while it plays); a burial or a Vigil cuts
        // its parts to the plinth top, the mound and the Priest (spec cemetery-undead-fixes, bug 1).
        for (const i of playing) {
          const g = plan.graves[i];
          if (g === undefined) continue;
          if (plan.burst !== null && plan.burst.startMs !== null && plan.burst.index === i) regions.push(artRect(g));
          // Spec judge-path, Deliberate test change 3: the burial regions at the burial's phase.
          else regions.push(...buryingRegions(g, g.burial));
        }
        for (const r of regions) {
          for (const [x, y] of pointsIn(r)) {
            expect(haloAlphaAt(mask, PEAK, x, y)).toBe(0);
            expect(haloAlphaAt(mask, PEAK, x, y, "strips")).toBe(0);
          }
        }
        // Feature: cemetery-undead-fixes, Property 1: far from every region the Halo is not cut. Sample a grid over
        // the reach of the sources and keep the points farther than the soft edge from every region.
        const far = HALO_GROW + 4 * HALO_BLUR;
        const distance = (r: Rect, x: number, y: number): number => Math.hypot(Math.max(r.x - x, 0, x - (r.x + r.w)), Math.max(r.y - y, 0, y - (r.y + r.h)));
        for (const src of mask.sources) {
          for (let i = -4; i <= 4; i += 1) {
            for (let j = -4; j <= 4; j += 1) {
              const x = src.cx + (i * src.r) / 5;
              const y = src.cy + (j * src.r) / 5;
              if (regions.some((r) => distance(r, x, y) <= far)) continue;
              const uncut = uncutHaloAlphaAt(mask, PEAK, x, y);
              expect(haloAlphaAt(mask, PEAK, x, y)).toBeGreaterThanOrEqual(0.99 * uncut);
            }
          }
        }
        // The Lantern grave has no Halo of its own: a grave has at most one glow.
        expect(mask.sources.some((s) => s.index === plan.lantern)).toBe(false);
        // Every Possessed grave that does not hold the Lantern glow has one.
        const bursting = plan.burst !== null && plan.burst.startMs !== null ? plan.burst.index : null;
        const possessed = plan.graves.filter((g) => g.shape === "open" && g.index !== plan.lantern && g.index !== bursting).map((g) => g.index);
        expect(mask.sources.map((s) => s.index)).toEqual(possessed);
      }),
      { numRuns: NUM_RUNS },
    );
  }, 60_000);

  it("reads strong outside the cuts: above a lone Possessed grave the Halo is stronger than the old glow", () => {
    const plan = planScene({ packages: [scenePackage("p", "Possessed", "none")], width: 1440, theme: "dark", selectedIndex: null, ghostPhase: 0, fitHeight: 900 });
    const g = plan.graves[0];
    expect(g).toBeDefined();
    if (g === undefined) return;
    const mask = haloMask(plan);
    const s = g.rect.w / CELL_WIDTH;
    // Above the grave, just past its cell top and the feather.
    const x = g.rect.x + HALO_CX * s;
    const y = g.rect.y - HALO_FEATHER - 4;
    expect(Math.abs(y - (g.rect.y + HALO_CY * s))).toBeLessThan(HALO_RADIUS * g.rect.w);
    expect(haloAlphaAt(mask, PEAK, x, y)).toBeGreaterThan(parseInt(GLOW_ALPHA_BYTE, 16) / 255);
  });

  it("uses HALO_ALPHA_BYTE only for the Halo: the layer's stops are the Possessed colour at that byte", () => {
    const before = canvasCalls().length;
    const plan = planScene({ packages: [scenePackage("q", "Possessed", "none"), scenePackage("r", "Dead", "some")], width: 977, theme: "dark", selectedIndex: 1, ghostPhase: 0 });
    const calls: string[] = [];
    const main = new Proxy({} as Record<string, unknown>, {
      get(obj, prop: string) {
        if (prop in obj) return obj[prop];
        // No grain: its tile would be painted on another canvas too.
        if (prop === "createPattern") return undefined;
        return (...args: unknown[]) => {
          calls.push(prop);
          if (prop === "createLinearGradient" || prop === "createRadialGradient") return { addColorStop() {} };
          void args;
          return undefined;
        };
      },
      set(obj, prop: string, value: unknown) {
        obj[prop] = value;
        return true;
      },
    }) as unknown as PaintContext2D;
    drawScene(main, plan, 1);
    expect(calls.filter((c) => c === "drawImage")).toHaveLength(1);
    // The layer was painted on its own canvas: one radial source, then the cuts with destination-out.
    const layer = canvasCalls().slice(before);
    const mask = haloMask(plan);
    expect(layer.filter((c) => c.method === "fillRect").length).toBe(mask.sources.length + mask.cuts.length * 9);
    expect(mask.sources.map((src) => src.colour)).toEqual([PALETTE.dark.states.Possessed]);
  });
});
