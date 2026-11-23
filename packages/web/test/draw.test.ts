import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { drawScene, type PaintContext2D } from "../src/scene/draw.js";
import { GRAVE_GEOMETRY, planScene, type ScenePlan } from "../src/scene/layout.js";
import {
  ALPHA_ZERO_BYTE,
  FOG_PEAK_ALPHA_BYTE,
  MOON_HALO_ALPHA_BYTE,
  PALETTE,
  SHADOW_ALPHA_BYTE,
  STONE_ALPHA_BYTE,
  type Theme,
} from "../src/scene/palette.js";
import { arbScenePackages, arbSceneWidth, arbTheme, scenePackage } from "./arbitraries.js";
import { STATES } from "../src/load/lists.js";
import { SOLID_BOXES, SPECKS } from "../src/scene/shapes.js";

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
  return out;
}

const SCENERY_METHODS = new Set([
  "setTransform",
  "clearRect",
  "createLinearGradient",
  "createRadialGradient",
  "beginPath",
  "arc",
  "fill",
  "fillRect",
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

          const firstGrave = names.indexOf("save");
          const sceneryEnd = firstGrave === -1 ? names.length : firstGrave;
          expect(names.slice(0, sceneryEnd).every((m) => SCENERY_METHODS.has(m) || (m === "strokeRect" && firstGrave === -1))).toBe(
            true,
          );
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
    expect(plan.scenery.skyHeight).toBe(80);
    expect(plan.scenery.moon).toEqual({ x: 83, y: 40, r: 20 });
  });

  it("draws the same Plinth path object for one Grave of each State", () => {
    const packages = STATES.map((s, i) => scenePackage(`p${String(i)}`, s, "none"));
    const plan = planScene({ packages, width: 1280, theme: "dark", selectedIndex: null, ghostPhase: 0 });
    const log = logger();
    drawScene(log.ctx, plan, 1);
    const withPath = log.calls.filter((c) => c.method === "fill" && c.args.length === 1).map((c) => c.args[0]);
    expect(withPath).toHaveLength(packages.length * 2);
    const plinths = withPath.filter((_, i) => i % 2 === 1);
    expect(new Set(plinths).size).toBe(1);
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
          expect(moon.x).toBeLessThanOrEqual(planA.width / 3);
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
          const firstSave = names.indexOf("save");
          const end = firstSave === -1 ? names.length : firstSave;
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
            const [, , w, h] = rectAt(i) as [number, number, number, number];
            if (w === 1 && h === 1) farIdx.push(i);
            else if (w === 2 && h === 2) nearIdx.push(i);
            else if (w === 2) grassIdx.push(i);
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
          let expectedTufts = 0;
          for (let tile = 0; s.skyHeight + tile * 224 < plan.height; tile += 1) {
            for (const t of s.grass) if (s.skyHeight + tile * 224 + t.y + t.h <= plan.height) expectedTufts += 1;
          }
          expect(grassIdx).toHaveLength(expectedTufts);
          const fogIdx = scenery.findIndex((c) => c.method === "fillRect" && c.args[1] === s.fog.y && c.args[3] === s.fog.h);
          expect(
            grassIdx.every((i) => {
              const [, y, , h] = rectAt(i) as [number, number, number, number];
              return i > fogIdx && y >= s.skyHeight && y + h <= plan.height;
            }),
          ).toBe(true);

          // shadow and texture
          const rest = calls.slice(end);
          const n = plan.graves.length;
          expect(rest.filter((c) => c.method === "scale" && c.args[0] === 72 && c.args[1] === 8)).toHaveLength(n);
          expect(rest.filter((c) => c.method === "arc" && c.args[2] === 1)).toHaveLength(n);
          expect(rest.filter((c) => c.method === "fill" && c.args.length === 0)).toHaveLength(n);
          expect(rest.filter((c) => c.method === "fill" && c.args.length === 1)).toHaveLength(
            n * 2 + plan.graves.filter((g) => g.ghost !== null).length,
          );
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
            const g = plan.graves[k];
            expect(names.slice(at, at + 7)).toEqual(["save", "translate", "scale", "beginPath", "arc", "fill", "restore"]);
            expect(calls[at + 1]?.args).toEqual([(g?.rect.x ?? 0) + 96, (g?.rect.y ?? 0) + 210]);
            // the next save after the shadow opens the shape: its stroke comes after its fill
            expect(names[at + 7]).toBe("save");
            let f = at + 8;
            while (f < calls.length && !(names[f] === "fill" && calls[f]?.args.length === 1)) f += 1;
            const k1 = SPECKS[g?.shape ?? "upright"].length;
            expect(names[f + 1]).toBe("stroke");
            expect(calls[f + 1]?.args[0]).toBe(calls[f]?.args[0]);
            expect(names.slice(f + 2, f + 2 + k1).every((m) => m === "fillRect")).toBe(true);
          });
          expect(log.assigned.some((a) => a.prop === "globalAlpha")).toBe(false);

          // colours: far stars starFar, near stars star, tones grassDark then grassLight, texture ink at the stone byte
          const c = PALETTE[theme];
          const fills = log.assigned.filter((a) => a.prop === "fillStyle").map((a) => a.value);
          const sceneryFills = fills.slice(0, fills.indexOf(c.moon) + 1);
          expect(sceneryFills.indexOf(c.starFar)).toBeGreaterThan(-1);
          expect(sceneryFills.indexOf(c.starFar)).toBeLessThan(sceneryFills.indexOf(c.star));
          const darkAt = fills.indexOf(c.grassDark);
          const lightAt = fills.indexOf(c.grassLight);
          expect(darkAt).toBeGreaterThan(fills.indexOf(c.moon));
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
        const plan = planFor(packages, Math.max(width, 448), theme, -1, 0);
        const log = logger();
        drawScene(log.ctx, plan, 1);
        const first = log.calls.findIndex((c) => c.method === "save");
        const body = log.calls.slice(first);
        const starts: number[] = [];
        body.forEach((c, i) => {
          if (c.method === "scale" && c.args[0] === 72) starts.push(i - 2);
        });
        expect(starts).toHaveLength(2);
        const [a, b] = plan.graves;
        const s0 = starts[0] ?? 0;
        const s1 = starts[1] ?? 0;
        expect(s1 - s0).toBe(body.length - s1);
        const dx = (b?.rect.x ?? 0) - (a?.rect.x ?? 0);
        const dy = (b?.rect.y ?? 0) - (a?.rect.y ?? 0);
        // Absolute moves (translate to the Cell, the Inscription position) shift by the Cell offset;
        // everything else, the shadow, texture and specks included, is identical.
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
            expect([(cb.args[1] as number) - dx, (cb.args[2] as number) - dy, cb.args[3]]).toEqual([ca.args[1], ca.args[2], ca.args[3]]);
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

  it("draws at most 4641 grass rectangles for 300 graves at width 1280", () => {
    const packages = Array.from({ length: 300 }, (_, i) => scenePackage(`p${String(i)}`, "Alive", "none"));
    const plan = planFor(packages, 1280, "dark", -1, 0);
    const log = logger();
    drawScene(log.ctx, plan, 1);
    const first = log.calls.findIndex((c) => c.method === "save");
    const grass = log.calls.slice(0, first).filter((c) => c.method === "fillRect" && c.args[2] === 2 && c.args[3] !== 2);
    expect(grass.length).toBeLessThanOrEqual(51 * 91);
    expect(grass.length).toBeGreaterThan(0);
  });
});
