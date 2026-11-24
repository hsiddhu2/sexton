import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { drawScene, type PaintContext2D } from "../src/scene/draw.js";
import { GRAVE_GEOMETRY, planScene, type ScenePlan } from "../src/scene/layout.js";
import {
  ALPHA_ZERO_BYTE,
  FOG_PEAK_ALPHA_BYTE,
  GLOW_ALPHA_BYTE,
  GRAIN_ALPHA_BYTE,
  LANTERN_ALPHA_BYTE,
  MOON_HALO_ALPHA_BYTE,
  PALETTE,
  SHADOW_ALPHA_BYTE,
  STONE_ALPHA_BYTE,
  VIGNETTE_ALPHA_BYTE,
  type Theme,
} from "../src/scene/palette.js";
import { arbScenePackages, arbSceneWidth, arbTheme, scenePackage } from "./arbitraries.js";
import { STATES } from "../src/load/lists.js";
import { plinthPath, SOLID_BOXES, SPECKS } from "../src/scene/shapes.js";

const NUM_RUNS = 100;

interface Logged {
  readonly method: string;
  readonly args: readonly unknown[];
}

interface Log {
  readonly ctx: PaintContext2D;
  readonly calls: Logged[];
  readonly assigned: { readonly prop: string; readonly value: unknown }[];
}

function logger(): Log {
  const calls: Logged[] = [];
  const assigned: { prop: string; value: unknown }[] = [];
  const target: Record<string, unknown> = {};
  const ctx = new Proxy(target, {
    get(obj, prop: string) {
      if (prop in obj) return obj[prop];
      return (...args: unknown[]) => {
        calls.push({ method: prop, args });
        if (prop === "createLinearGradient" || prop === "createRadialGradient") return { addColorStop() {} };
        return undefined;
      };
    },
    set(obj, prop: string, value: unknown) {
      assigned.push({ prop, value });
      obj[prop] = value;
      return true;
    },
  }) as unknown as PaintContext2D;
  return { ctx, calls, assigned };
}

function tokens(theme: Theme): Set<string> {
  const p = PALETTE[theme];
  const out = new Set<string>();
  for (const [key, value] of Object.entries(p)) if (key !== "states" && typeof value === "string") out.add(value);
  for (const value of Object.values(p.states)) out.add(value);
  for (const value of Object.values(p.costume)) out.add(value);
  return out;
}

/**
 * Spec cemetery-undead: graves are painted back Tier first, each in its own cell frame that opens with
 * save, translate(rect.x, rect.y), scale(tier scale). The index of that first save ends the scenery.
 */
function graveStart(calls: readonly Logged[], plan: ScenePlan): number {
  const first = plan.graves[plan.paintOrder[0] ?? -1];
  if (first === undefined) return calls.length;
  const at = calls.findIndex((c, i) => c.method === "translate" && c.args[0] === first.rect.x && c.args[1] === first.rect.y && calls[i - 1]?.method === "save");
  return at === -1 ? calls.length : at - 1;
}

const SCENERY_METHODS = new Set([
  "setTransform",
  "clearRect",
  "createLinearGradient",
  "createRadialGradient",
  "createPattern",
  "beginPath",
  "arc",
  "fill",
  "fillRect",
  "save",
  "translate",
  "scale",
  "restore",
]);

function planFor(
  packages: Parameters<typeof planScene>[0]["packages"],
  width: number,
  theme: Theme,
  sel: number,
  phase: number,
): ScenePlan {
  const selectedIndex = packages.length === 0 || sel < 0 ? null : sel % packages.length;
  return planScene({ packages, width, theme, selectedIndex, ghostPhase: phase });
}

describe("Feature: cemetery-theme, Property 4: Painter call discipline", () => {
  it("keeps order, call counts, colours and no globalAlpha", () => {
    fc.assert(
      fc.property(
        arbScenePackages([0, 1, 5, 59, 60, 61, 70]),
        arbSceneWidth,
        arbTheme,
        fc.integer({ min: -1, max: 100 }),
        fc.integer({ min: 0, max: 47 }),
        (packages, width, theme, sel, phase) => {
          const plan = planFor(packages, width, theme, sel, phase);
          const log = logger();
          drawScene(log.ctx, plan, 1);
          const names = log.calls.map((c) => c.method);
          const clear = names.indexOf("clearRect");
          expect(clear).toBeGreaterThanOrEqual(0);
          expect(names.slice(0, clear).every((m) => m === "setTransform")).toBe(true);

          // Spec cemetery-undead, Deliberate test change 8: the scenery now also translates, scales and fills paths
          // (church, tree, bats), so it is bounded by the first grave frame rather than by the first save.
          const sceneryEnd = graveStart(log.calls, plan);
          expect(names.slice(0, sceneryEnd).every((m) => SCENERY_METHODS.has(m) || m === "strokeRect")).toBe(true);
          expect(names.slice(0, sceneryEnd).filter((m) => m === "strokeRect")).toHaveLength(plan.graves.length === 0 && plan.ring !== null ? 1 : 0);
          expect(names.slice(0, sceneryEnd)).not.toContain("fillText");

          const texts = log.calls.filter((c) => c.method === "fillText");
          expect(texts).toHaveLength(plan.graves.filter((g) => g.inscription !== null).length);
          for (const t of texts) expect(t.args[3]).toBe(GRAVE_GEOMETRY.inscription.maxWidth);
          expect(names.filter((m) => m === "strokeRect")).toHaveLength(plan.ring === null ? 0 : 1);
          if (plan.ring !== null) expect(names[names.length - 1]).toBe("strokeRect");

          expect(log.assigned.some((a) => a.prop === "globalAlpha")).toBe(false);
          const allowed = tokens(theme);
          const alphaTokens = [
            ...[...allowed].map((t) => t + FOG_PEAK_ALPHA_BYTE),
            ...[...allowed].map((t) => t + ALPHA_ZERO_BYTE),
            ...[...allowed].map((t) => t + MOON_HALO_ALPHA_BYTE),
            ...[...allowed].map((t) => t + SHADOW_ALPHA_BYTE),
            ...[LANTERN_ALPHA_BYTE, GLOW_ALPHA_BYTE, VIGNETTE_ALPHA_BYTE, GRAIN_ALPHA_BYTE].flatMap((b) => [...allowed].map((t) => t + b)),
          ];
          const ok = new Set([...allowed, ...alphaTokens]);
          for (const a of log.assigned) {
            if (a.prop === "fillStyle" || a.prop === "strokeStyle") {
              if (typeof a.value === "string") expect(ok.has(a.value)).toBe(true);
            }
          }
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it("gives a plan for zero packages Scenery", () => {
    const plan = planScene({ packages: [], width: 500, theme: "dark", selectedIndex: null, ghostPhase: 0 });
    // Spec cemetery-undead, Deliberate test change 12: a taller sky and the harvest moon on the right.
    expect(plan.scenery.skyHeight).toBe(160);
    expect(plan.scenery.moon).toEqual({ x: 400, y: 84, r: 64 });
  });

  it("draws the same Plinth path object for one Grave of each State", () => {
    const packages = STATES.map((s, i) => scenePackage(`p${String(i)}`, s, "none"));
    const plan = planScene({ packages, width: 1280, theme: "dark", selectedIndex: null, ghostPhase: 0 });
    const log = logger();
    drawScene(log.ctx, plan, 1);
    // Spec cemetery-undead, Deliberate test change 9: the scenery fills six paths (church, tree, four bats) first.
    const withPath = log.calls.slice(graveStart(log.calls, plan)).filter((c) => c.method === "fill" && c.args.length === 1).map((c) => c.args[0]);
    expect(withPath).toHaveLength(packages.length * 2);
    expect(withPath.filter((p) => p === plinthPath())).toHaveLength(packages.length);
    expect(log.calls.slice(0, graveStart(log.calls, plan)).filter((c) => c.method === "fill" && c.args.length === 1)).toHaveLength(6);
  });
});

describe("Feature: cemetery-theme, Property 5: Scenery depends on the width only", () => {
  it("is equal for any two package lists and keeps the moon inside the sky", () => {
    fc.assert(
      fc.property(
        arbScenePackages([0, 1, 5, 61]),
        arbScenePackages([0, 2, 7, 60]),
        arbSceneWidth,
        arbTheme,
        fc.integer({ min: -1, max: 100 }),
        fc.integer({ min: 0, max: 47 }),
        (a, b, width, theme, sel, phase) => {
          const planA = planFor(a, width, theme, sel, phase);
          const planB = planFor(b, width, theme, 0, 0);
          expect(planA.scenery).toEqual(planB.scenery);
          const { moon, skyHeight } = planA.scenery;
          expect(planA.width).toBeGreaterThanOrEqual(224);
          expect(moon.x - moon.r).toBeGreaterThanOrEqual(0);
          expect(moon.x + moon.r).toBeLessThanOrEqual(planA.width);
          expect(moon.y - moon.r).toBeGreaterThanOrEqual(0);
          expect(moon.y + moon.r).toBeLessThanOrEqual(skyHeight);
          // Spec cemetery-undead, Deliberate test change 12: the moon is on the right.
          expect(moon.x).toBeGreaterThanOrEqual(planA.width - planA.width / 3);
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });
});

describe("Feature: cemetery-polish, Property 3: Scenery depends on the width only", () => {
  it("gives equal scenery for any packages, phases, selections and themes at one width", () => {
    fc.assert(
      fc.property(
        arbScenePackages([0, 1, 5, 61]),
        arbScenePackages([0, 1, 5, 61]),
        arbSceneWidth,
        arbTheme,
        arbTheme,
        fc.integer({ min: 0, max: 47 }),
        fc.integer({ min: 0, max: 47 }),
        fc.integer({ min: -1, max: 100 }),
        fc.integer({ min: -1, max: 100 }),
        (packagesA, packagesB, width, themeA, themeB, phaseA, phaseB, selA, selB) => {
          const a = planFor(packagesA, width, themeA, selA, phaseA);
          const b = planFor(packagesB, width, themeB, selB, phaseB);
          expect(b.scenery).toEqual(a.scenery);
          expect(b.scenery.stars).toEqual(a.scenery.stars);
          expect(b.scenery.grass).toEqual(a.scenery.grass);
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });
});

describe("Feature: cemetery-polish, Property 4: Painter call discipline for stars, grass, shadow and texture", () => {
  it("draws stars and grass in order, then one shadow and one texture per grave", () => {
    fc.assert(
      fc.property(
        arbScenePackages([0, 1, 5, 59, 61]),
        arbSceneWidth,
        arbTheme,
        fc.integer({ min: -1, max: 100 }),
        fc.integer({ min: 0, max: 47 }),
        (packages, width, theme, sel, phase) => {
          const plan = planFor(packages, width, theme, sel, phase);
          const log = logger();
          drawScene(log.ctx, plan, 1);
          const calls = log.calls;
          const names = calls.map((c) => c.method);
          // Spec cemetery-undead, Deliberate test change 8: the scenery ends at the first grave frame.
          const end = graveStart(calls, plan);
          const s = plan.scenery;
          const rectAt = (i: number): number[] => calls[i]?.args as number[];
          const scenery = calls.slice(0, end);

          // stars
          const far = s.stars.filter((x) => x.layer === "far").length;
          const near = s.stars.filter((x) => x.layer === "near").length;
          const farIdx: number[] = [];
          const nearIdx: number[] = [];
          const grassIdx: number[] = [];
          scenery.forEach((c, i) => {
            if (c.method !== "fillRect") return;
            const [, y, w, h] = rectAt(i) as [number, number, number, number];
            if (y >= s.horizonY && w === 1) grassIdx.push(i);
            else if (w === 1 && h === 1 && y < s.horizonY) farIdx.push(i);
            else if (w === 2 && h === 2 && y < s.horizonY) nearIdx.push(i);
          });
          expect(farIdx).toHaveLength(far);
          expect(nearIdx).toHaveLength(near);
          const radial = names.indexOf("createRadialGradient");
          const skyFill = scenery.findIndex((c) => c.method === "fillRect");
          const starIdx = [...farIdx, ...nearIdx];
          expect(starIdx.every((i) => i > skyFill && i < radial)).toBe(true);
          expect(Math.max(-1, ...farIdx)).toBeLessThan(Math.min(Number.MAX_SAFE_INTEGER, ...nearIdx));
          expect(s.stars.every((st) => st.y >= 0 && st.y + st.size <= s.skyHeight)).toBe(true);

          // grass
          const extra = plan.groundHeight - plan.height >= 10 ? 1 : 0;
          const perLine = s.grass.reduce((sum, t) => sum + t.rects.length, 0);
          expect(grassIdx).toHaveLength((plan.rows + extra) * perLine);
          const fogIdx = scenery.findIndex((c) => c.method === "fillRect" && c.args[1] === s.fog.y && c.args[3] === s.fog.h);
          expect(
            grassIdx.every((i) => {
              const [, y, , h] = rectAt(i) as [number, number, number, number];
              return i > fogIdx && y >= s.horizonY && y + h <= plan.groundHeight;
            }),
          ).toBe(true);

          // shadow and texture
          const rest = calls.slice(end);
          const n = plan.graves.length;
          const ghosts = plan.graves.filter((g) => g.ghost !== null).length;
          expect(rest.filter((c) => c.method === "scale" && c.args[0] === 72 && c.args[1] === 8)).toHaveLength(n);
          // Each ghost adds two eye and two blush ovals (a unit arc and an argument-less fill each).
          expect(rest.filter((c) => c.method === "arc" && c.args[2] === 1)).toHaveLength(n + 4 * ghosts);
          expect(rest.filter((c) => c.method === "fill" && c.args.length === 0)).toHaveLength(n + 4 * ghosts);
          expect(rest.filter((c) => c.method === "fill" && c.args.length === 1)).toHaveLength(n * 2 + ghosts);
          const pit = PALETTE[theme].pit + SHADOW_ALPHA_BYTE;
          expect(log.assigned.filter((a) => a.prop === "fillStyle" && a.value === pit)).toHaveLength(n);
          expect(log.assigned.filter((a) => a.prop === "lineWidth" && a.value === 0.5)).toHaveLength(n);
          let specks = 0;
          for (const g of plan.graves) specks += SPECKS[g.shape].length;
          const textureRects = rest.filter((c) => c.method === "fillRect" && c.args[2] === 1 && c.args[3] === 1);
          expect(textureRects).toHaveLength(specks);

          // each grave: shadow first, then the shape fill, then stroke, then its specks
          const shadowStarts = calls.flatMap((c, i) => (c.method === "scale" && c.args[0] === 72 ? [i - 2] : []));
          expect(shadowStarts).toHaveLength(n);
          shadowStarts.forEach((at, k) => {
            // Painted back Tier first: the k-th shadow belongs to the k-th grave of the paint order.
            const g = plan.graves[plan.paintOrder[k] ?? -1];
            expect(names.slice(at, at + 7)).toEqual(["save", "translate", "scale", "beginPath", "arc", "fill", "restore"]);
            // Cell-relative inside the grave frame.
            expect(calls[at + 1]?.args).toEqual([96, 210]);
            // the next save after the shadow opens the shape: its stroke comes after its fill
            expect(names[at + 7]).toBe("save");
            let f = at + 8;
            while (f < calls.length && !(names[f] === "fill" && calls[f]?.args.length === 1)) f += 1;
            const k1 = SPECKS[g?.shape ?? "rounded"].length;
            expect(names[f + 1]).toBe("stroke");
            expect(calls[f + 1]?.args[0]).toBe(calls[f]?.args[0]);
            expect(names.slice(f + 2, f + 2 + k1).every((m) => m === "fillRect")).toBe(true);
          });
          expect(log.assigned.some((a) => a.prop === "globalAlpha")).toBe(false);

          // colours: far stars starFar, near stars star, tones grassDark then grassLight, texture ink at the stone byte
          const c = PALETTE[theme];
          const fills = log.assigned.filter((a) => a.prop === "fillStyle").map((a) => a.value);
          // The moon is a gradient now; the first silhouette fill (the church) follows the stars and the moon.
          const haloAt = fills.indexOf(c.silhouette);
          const sceneryFills = fills.slice(0, haloAt + 1);
          expect(sceneryFills.indexOf(c.starFar)).toBeGreaterThan(-1);
          expect(sceneryFills.indexOf(c.starFar)).toBeLessThan(sceneryFills.indexOf(c.star));
          const darkAt = fills.indexOf(c.grassDark);
          const lightAt = fills.indexOf(c.grassLight);
          expect(darkAt).toBeGreaterThan(haloAt);
          expect(lightAt).toBe(darkAt + 1);
          expect(fills.filter((v) => v === c.grassDark || v === c.grassLight)).toHaveLength(2);
          const stone = c.ink + STONE_ALPHA_BYTE;
          expect(fills.filter((v) => v === stone)).toHaveLength(n);
          expect(log.assigned.filter((a) => a.prop === "strokeStyle" && a.value === stone)).toHaveLength(n);
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it("paints equal decoration for two graves of one State relative to the Cell origin", () => {
    fc.assert(
      fc.property(arbSceneWidth, arbTheme, fc.constantFrom(...STATES), (width, theme, state) => {
        const packages = [scenePackage("a", state, "none"), scenePackage("b", state, "none")];
        // Spec cemetery-undead, Deliberate test change 10: both graves share one Tier; Reduced motion holds every
        // Character in its still Pose, since only the animation phase may differ between two graves of a State.
        const plan = planScene({ packages, width: Math.max(width, 448), theme, selectedIndex: null, ghostPhase: 0, reducedMotion: true });
        const log = logger();
        drawScene(log.ctx, plan, 1);
        const first = graveStart(log.calls, plan);
        const body = log.calls.slice(first);
        // Each grave opens its frame with save, translate(rect.x, rect.y).
        const starts: number[] = [];
        body.forEach((c, i) => {
          if (c.method === "translate" && plan.graves.some((g) => g.rect.x === c.args[0] && g.rect.y === c.args[1]) && body[i - 1]?.method === "save") starts.push(i - 1);
        });
        expect(starts).toHaveLength(2);
        const [a, b] = plan.graves;
        const s0 = starts[0] ?? 0;
        const s1 = starts[1] ?? 0;
        expect(s1 - s0).toBe(body.length - s1);
        const dx = (b?.rect.x ?? 0) - (a?.rect.x ?? 0);
        const dy = (b?.rect.y ?? 0) - (a?.rect.y ?? 0);
        // The only absolute move is the translate to the Cell, which shifts by the Cell offset;
        // everything else, the shadow, texture, specks, Character and inscription included, is identical.
        for (let i = 0; i < s1 - s0; i += 1) {
          const ca = body[s0 + i];
          const cb = body[s1 + i];
          expect(cb?.method).toBe(ca?.method);
          if (ca === undefined || cb === undefined) continue;
          if (ca.method === "translate") {
            const same = ca.args[0] === cb.args[0] && ca.args[1] === cb.args[1];
            const shifted = (cb.args[0] as number) - (ca.args[0] as number) === dx && (cb.args[1] as number) - (ca.args[1] as number) === dy;
            expect(same || shifted).toBe(true);
          } else if (ca.method === "fillText") {
            // The inscription is cell-relative inside the frame: the same position, a different name.
            expect(cb.args.slice(1)).toEqual(ca.args.slice(1));
          } else {
            expect(cb.args).toEqual(ca.args);
          }
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });
});

describe("cemetery-polish: stone texture and grass examples", () => {
  const ids = Object.keys(SPECKS) as (keyof typeof SPECKS)[];

  it("keeps each speck inside a solid box of its shape", () => {
    for (const id of ids) {
      for (const sp of SPECKS[id]) {
        const inside = SOLID_BOXES[id].some((b) => sp.x >= b.x && sp.y >= b.y && sp.x + 1 <= b.x + b.w && sp.y + 1 <= b.y + b.h);
        expect(inside, `${id} ${String(sp.x)},${String(sp.y)}`).toBe(true);
      }
    }
  });

  it("keeps the cracked specks 3 units from the crack", () => {
    const crack: [number, number][] = [
      [30, 24],
      [26, 38],
      [34, 46],
      [30, 60],
    ];
    const dist = (px: number, py: number, a: [number, number], b: [number, number]): number => {
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      const t = Math.max(0, Math.min(1, ((px - a[0]) * dx + (py - a[1]) * dy) / (dx * dx + dy * dy)));
      return Math.hypot(px - (a[0] + t * dx), py - (a[1] + t * dy));
    };
    for (const sp of SPECKS.cracked) {
      for (const [cx, cy] of [
        [sp.x, sp.y],
        [sp.x + 1, sp.y + 1],
      ] as const) {
        for (let i = 0; i < crack.length - 1; i += 1) {
          const a = crack[i];
          const b = crack[i + 1];
          if (a !== undefined && b !== undefined) expect(dist(cx, cy, a, b)).toBeGreaterThanOrEqual(3);
        }
      }
    }
  });

  it.each([
    [1280, 12000],
    [224, 13000],
  ])("draws at most the bounded grass rectangles for 300 graves at width %i", (width, bound) => {
    const packages = Array.from({ length: 300 }, (_, i) => scenePackage(`p${String(i)}`, "Alive", "none"));
    const plan = planFor(packages, width, "dark", -1, 0);
    const log = logger();
    drawScene(log.ctx, plan, 1);
    const first = graveStart(log.calls, plan);
    const grass = log.calls.slice(0, first).filter((c) => c.method === "fillRect" && (c.args[1] as number) >= plan.scenery.horizonY && c.args[2] === 1);
    expect(grass.length).toBeLessThanOrEqual(bound);
    expect(grass.length).toBeGreaterThan(0);
  });
});

describe("Feature: cemetery-time, Property 2: Painter call discipline for tufts and the ground", () => {
  it("draws tufts after the fog, inside the ground, once per line, with one fillStyle per tone", () => {
    fc.assert(
      fc.property(
        arbScenePackages([0, 1, 5, 59, 61]),
        arbSceneWidth,
        arbTheme,
        fc.integer({ min: -50, max: 3000 }),
        (packages, width, theme, minHeight) => {
          const plan = planScene({ packages, width, theme, selectedIndex: null, ghostPhase: 0, minHeight });
          const log = logger();
          drawScene(log.ctx, plan, 1);
          const names = log.calls.map((c) => c.method);
          const end = graveStart(log.calls, plan);
          expect(names.length).toBeGreaterThan(0);
          const fogIdx = log.calls.findIndex((c) => c.method === "fillRect" && c.args[1] === plan.scenery.fog.y && c.args[3] === plan.scenery.fog.h);
          const tufts = log.calls
            .map((c, i) => ({ c, i }))
            .filter(({ c, i }) => i < end && c.method === "fillRect" && (c.args[1] as number) >= plan.scenery.horizonY && c.args[2] === 1);
          const extra = plan.groundHeight - plan.height >= 10 ? 1 : 0;
          const perLine = plan.scenery.grass.reduce((sum, t) => sum + t.rects.length, 0);
          expect(tufts).toHaveLength((plan.rows + extra) * perLine);
          for (const { c, i } of tufts) {
            const [x, y, w, h] = c.args as [number, number, number, number];
            expect(i).toBeGreaterThan(fogIdx);
            expect(w).toBe(1);
            expect(y + h).toBeLessThanOrEqual(plan.groundHeight);
            expect(x).toBeGreaterThanOrEqual(0);
            expect(x).toBeLessThanOrEqual(plan.width - 1);
          }
          expect(log.calls.filter((c) => c.method === "fillRect" && (c.args[1] as number) < 80 && c.args[2] === 1 && c.args[3] !== 1)).toHaveLength(0);
          const p = PALETTE[theme];
          expect(log.assigned.filter((a) => a.prop === "fillStyle" && (a.value === p.grassDark || a.value === p.grassLight))).toHaveLength(2);
          if (plan.graves.length > 0) {
            const ground = log.calls.find((c) => c.method === "fillRect" && c.args[1] === plan.scenery.horizonY && c.args[3] !== 2);
            expect(ground?.args[3]).toBe(plan.groundHeight - plan.scenery.horizonY);
          }
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });
});
