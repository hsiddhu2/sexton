import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { drawScene, type PaintContext2D } from "../src/scene/draw.js";
import { GRAVE_GEOMETRY, planScene, type ScenePlan } from "../src/scene/layout.js";
import { ALPHA_ZERO_BYTE, FOG_PEAK_ALPHA_BYTE, MOON_HALO_ALPHA_BYTE, PALETTE, type Theme } from "../src/scene/palette.js";
import { arbScenePackages, arbSceneWidth, arbTheme, scenePackage } from "./arbitraries.js";
import { STATES } from "../src/load/lists.js";

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
