// Spec clean-site, 2.7 and 3.13 (design C3): a filter draws the graves of another State at one fixed dim alpha, leaves
// a dimmed Possessed grave out of the Halo, and the grave under the pointer gets the hover ring on its casing.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { drawScene, type PaintContext2D } from "../src/scene/draw.js";
import { haloMask } from "../src/scene/halo.js";
import { planScene } from "../src/scene/layout.js";
import { DIM_ALPHA_BYTE, dimAlpha, PALETTE } from "../src/scene/palette.js";
import { scenePackage } from "./arbitraries.js";
import { STATES } from "../src/load/lists.js";

interface Entry {
  readonly kind: "call" | "set";
  readonly name: string;
  readonly args: readonly unknown[];
}

/** Records calls and assignments, and tracks globalAlpha through save and restore as a canvas does. */
function recorder(): { ctx: PaintContext2D; log: Entry[]; alphaAt: number[] } {
  const log: Entry[] = [];
  const alphaAt: number[] = [];
  const stack: number[] = [];
  let alpha = 1;
  const target: Record<string, unknown> = {};
  const ctx = new Proxy(target, {
    get(obj, prop: string) {
      if (prop === "globalAlpha") return alpha;
      if (prop in obj) return obj[prop];
      return (...args: unknown[]) => {
        if (prop === "save") stack.push(alpha);
        if (prop === "restore") alpha = stack.pop() ?? 1;
        log.push({ kind: "call", name: prop, args });
        alphaAt.push(alpha);
        if (prop === "createLinearGradient" || prop === "createRadialGradient") return { addColorStop() {} };
        return undefined;
      };
    },
    set(obj, prop: string, value: unknown) {
      if (prop === "globalAlpha") alpha = value as number;
      else obj[prop] = value;
      log.push({ kind: "set", name: prop, args: [value] });
      alphaAt.push(alpha);
      return true;
    },
  }) as unknown as PaintContext2D;
  return { ctx, log, alphaAt };
}

const packages = STATES.map((s, i) => scenePackage(`p${String(i)}`, s, "none"));

describe("filter dimming (2.7)", () => {
  it("is one fixed alpha", () => {
    expect(DIM_ALPHA_BYTE).toMatch(/^[0-9a-f]{2}$/);
    expect(dimAlpha()).toBe(parseInt(DIM_ALPHA_BYTE, 16) / 255);
    expect(dimAlpha()).toBeGreaterThan(0);
    expect(dimAlpha()).toBeLessThan(1);
  });

  it("marks exactly the named graves and draws each one's own draws at the dim alpha, and no other grave's", () => {
    fc.assert(
      fc.property(fc.subarray(packages.map((p) => p.name)), (names) => {
        const dimmed = new Set(names);
        const plan = planScene({ packages, width: 1440, theme: "dark", selectedIndex: null, ghostPhase: 0, reducedMotion: true, dimmed });
        for (const g of plan.graves) expect(g.dimmed).toBe(dimmed.has(g.name));
        const { ctx, log, alphaAt } = recorder();
        drawScene(ctx, plan, 1, 0);
        // Each grave opens its own frame with translate(rect.x, rect.y); its draws until the matching restore carry its alpha.
        for (const g of plan.graves) {
          const start = log.findIndex((e) => e.name === "translate" && e.args[0] === g.rect.x && e.args[1] === g.rect.y);
          expect(start).toBeGreaterThan(-1);
          expect(alphaAt[start]).toBe(dimmed.has(g.name) ? dimAlpha() : 1);
        }
        // The rings and everything after the graves are drawn at full alpha.
        expect(alphaAt[alphaAt.length - 1]).toBe(1);
      }),
      { numRuns: 100 },
    );
  });

  it("dims a grave that has risen during the Load moment, and a grave still rising", () => {
    const dimmed = new Set(packages.map((p) => p.name));
    const plan = planScene({ packages, width: 1440, theme: "dark", selectedIndex: null, ghostPhase: 0, dimmed, rise: { startMs: 0 } });
    for (const now of [150, 400, 700]) {
      const { ctx, log, alphaAt } = recorder();
      drawScene(ctx, plan, 1, now);
      const frames = log.map((e, i) => (e.name === "translate" && plan.graves.some((g) => g.rect.x === e.args[0] && g.rect.y === e.args[1]) ? i : -1)).filter((i) => i >= 0);
      expect(frames.length).toBeGreaterThan(0);
      for (const i of frames) expect(alphaAt[i]).toBe(dimAlpha());
    }
  });

  it("leaves a dimmed Possessed grave out of the Halo's sources", () => {
    const possessed = packages.find((p) => p.state === "Possessed")?.name as string;
    const plain = planScene({ packages, width: 1440, theme: "dark", selectedIndex: null, ghostPhase: 0 });
    const dimmed = planScene({ packages, width: 1440, theme: "dark", selectedIndex: null, ghostPhase: 0, dimmed: new Set([possessed]) });
    expect(haloMask(plain).sources).toHaveLength(1);
    expect(haloMask(dimmed).sources).toHaveLength(0);
  });
});

describe("the hover ring (3.13, 3.14)", () => {
  it("rings the hovered grave in ringHover on its ink casing, and not when it is the Selected grave", () => {
    const hovered = planScene({ packages, width: 1440, theme: "dark", selectedIndex: 0, ghostPhase: 0, hover: 2 });
    const g = hovered.graves[2];
    expect(hovered.hoverRing).toEqual({ x: (g?.rect.x ?? 0) + 2, y: (g?.rect.y ?? 0) + 2, w: (g?.rect.w ?? 0) - 4, h: (g?.rect.h ?? 0) - 4 });
    const { ctx, log } = recorder();
    drawScene(ctx, hovered, 1, 0);
    const strokes = log.filter((e) => e.name === "strokeStyle");
    // The hover ring, then the selection ring as the last stroke.
    expect(strokes.slice(-2).map((e) => e.args[0])).toEqual([PALETTE.dark.ringHover, PALETTE.dark.ring]);
    const ringRects = log.filter((e) => e.name === "strokeRect");
    expect(ringRects.slice(-2).map((e) => e.args)).toEqual([
      [hovered.hoverRing?.x, hovered.hoverRing?.y, hovered.hoverRing?.w, hovered.hoverRing?.h],
      [hovered.ring?.x, hovered.ring?.y, hovered.ring?.w, hovered.ring?.h],
    ]);
    expect(planScene({ packages, width: 1440, theme: "dark", selectedIndex: 2, ghostPhase: 0, hover: 2 }).hoverRing).toBeNull();
    expect(planScene({ packages, width: 1440, theme: "dark", selectedIndex: 0, ghostPhase: 0 }).hoverRing).toBeNull();
    expect(planScene({ packages, width: 1440, theme: "dark", selectedIndex: 0, ghostPhase: 0, hover: 99 }).hoverRing).toBeNull();
  });
});
