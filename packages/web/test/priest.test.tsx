// Spec cemetery-undead-2, requirement 10: the burial Priest and the Vigil.
import { act, renderHook } from "@testing-library/react";
import fc from "fast-check";
import { describe, expect, it, vi } from "vitest";
import { ART_BOX } from "../src/scene/art-box.js";
import { bellKey, drawPriest, PRIEST_AT_X, PRIEST_FROM_X, PRIEST_H, PRIEST_W, priestPose, WALK_END } from "../src/scene/characters/priest.js";
import { GRAVE_GEOMETRY } from "../src/scene/layout.js";
import { PALETTE } from "../src/scene/palette.js";
import { SHAPES } from "../src/scene/shapes.js";
import { TIER_SCALE } from "../src/scene/tiers.js";
import { pathPoints, unionOf } from "./bounds-context.js";
import { drawScene } from "../src/scene/draw.js";
import { planScene } from "../src/scene/layout.js";
import { BURIAL_MS } from "../src/time/burial.js";
import { useBurial } from "../src/time/use-burial.js";
import { inside, probeGrave, PROBE_SCALES } from "./art-box.test.js";
import { scenePackage } from "./arbitraries.js";
import { BoundsContext } from "./bounds-context.js";

const NUM_RUNS = 100;

describe("the Priest's path (requirement 10.1)", () => {
  it("walks in from the right over phases 0 to 0.4, then reads at his place", () => {
    fc.assert(
      fc.property(fc.double({ min: 0, max: 1, noNaN: true }), (phase) => {
        const pose = priestPose(phase);
        expect(pose.x).toBeGreaterThanOrEqual(PRIEST_AT_X);
        expect(pose.x).toBeLessThanOrEqual(PRIEST_FROM_X);
        expect(pose.x + PRIEST_W).toBeLessThanOrEqual(ART_BOX.x + ART_BOX.w);
        expect(pose.reading).toBe(phase >= WALK_END);
        if (phase >= WALK_END) expect(pose.x).toBe(PRIEST_AT_X);
      }),
      { numRuns: NUM_RUNS },
    );
    expect(priestPose(0).x).toBe(PRIEST_FROM_X);
    expect(priestPose(null)).toEqual({ x: PRIEST_AT_X, step: 0, reading: true });
  });

  it("draws inside the Art box at every sampled phase, the Vigil and every scale (Property 2, Priest phases)", () => {
    const pkg = scenePackage("p", "Haunted", "some");
    const base = planScene({ packages: [pkg], width: 1440, theme: "dark", selectedIndex: null, ghostPhase: 0 });
    for (const scale of PROBE_SCALES) {
      for (const phase of [null, 0, 0.1, 0.2, 0.3, 0.39, 0.4, 0.5, 0.65, 0.8, 1]) {
        const plan = { ...base, priest: { index: 0, phase } };
        for (const box of probeGrave({ shape: "cross", scale, ghostPhase: 0, marker: true, burial: phase }, 0, plan)) {
          expect(inside(box, ART_BOX), `phase ${String(phase)} at ${String(scale)}`).toBe(true);
        }
      }
    }
  });

  it("is drawn only while a burial or a Vigil plays on its grave, and never changes the grave (10.5)", () => {
    const pkgs = [scenePackage("a", "Haunted", "some"), scenePackage("b", "Dead", "none")];
    const still = planScene({ packages: pkgs, width: 900, theme: "dark", selectedIndex: null, ghostPhase: 0 });
    const withPriest = planScene({ packages: pkgs, width: 900, theme: "dark", selectedIndex: null, ghostPhase: 0, priest: { index: 1, phase: 0.5 } });
    expect(withPriest.graves).toEqual(still.graves);
    // The collar notch is the ghost token in a rectangle 6 by 3 figure units: only the Priest draws one.
    const count = (plan: typeof still): number => {
      const ctx = new BoundsContext();
      drawScene(ctx, plan, 1);
      const s = (still.graves[1]?.rect.w ?? 192) / 192;
      return ctx.marks.filter((m) => m.kind === "fillRect" && m.style === "#f4f0fa" && Math.abs(m.box.maxX - m.box.minX - 6 * 1.45 * s) < 0.5 && Math.abs(m.box.maxY - m.box.minY - 3 * 1.45 * s) < 0.5).length;
    };
    expect(count(still)).toBe(0);
    expect(count(withPriest)).toBe(1);
  });
});

describe("the Priest's size (the owner's fix of 25 Nov)", () => {
  it("draws him PRIEST_H tall: at least half of every stone's height, and at least 48 px in every row at 1440 by 900", () => {
    for (const phase of [null, 0, 0.2, 0.5, 1]) {
      const ctx = new BoundsContext();
      drawPriest(ctx, PALETTE.dark, phase);
      const u = unionOf(ctx.marks.map((m) => m.box));
      expect(u).not.toBeNull();
      if (u === null) continue;
      expect(u.maxY - u.minY).toBeCloseTo(PRIEST_H, 0);
    }
    for (const shape of ["rounded", "tilted", "cross", "cracked"] as const) {
      const ys = pathPoints(SHAPES[shape].d).map(([, y]) => y);
      const stone = (Math.max(...ys) - Math.min(...ys)) * GRAVE_GEOMETRY.shapeScale;
      expect(PRIEST_H, shape).toBeGreaterThanOrEqual(stone / 2);
    }
    // At 1440 by 900 every Tier is drawn at its own scale; the back row is the smallest.
    for (const scale of Object.values(TIER_SCALE)) expect(PRIEST_H * scale).toBeGreaterThanOrEqual(48);
  });
});

describe("the bell (requirement 10.2)", () => {
  it("rings once per burial, from the phase the Priest reads, and once at each Vigil's start", () => {
    expect(bellKey({ name: "a", phase: 0.1 }, null)).toBeNull();
    const keys = [0.4, 0.5, 0.9, 1].map((phase) => bellKey({ name: "a", phase }, null));
    expect(new Set(keys).size).toBe(1);
    expect(keys[0]).not.toBeNull();
    expect(bellKey(null, { name: "a", startMs: 1 })).not.toBe(bellKey(null, { name: "a", startMs: 2 }));
    expect(bellKey(null, null)).toBeNull();
  });
});

describe("the Vigil (requirement 10.3, 10.4)", () => {
  it("lasts BURIAL_MS under Reduced motion with no burial, and waits for the drawer to close", () => {
    vi.useFakeTimers();
    try {
      const { result, rerender } = renderHook(({ open }) => useBurial({ reducedMotion: true, drawerOpen: open }), { initialProps: { open: true } });
      act(() => {
        result.current.request("lodash");
      });
      // The pennant shows at once, no burial plays, and the Vigil waits for the drawer.
      expect(result.current.shown.has("lodash")).toBe(true);
      expect(result.current.burial).toBeNull();
      expect(result.current.vigil).toBeNull();
      rerender({ open: false });
      expect(result.current.vigil?.name).toBe("lodash");
      act(() => {
        vi.advanceTimersByTime(BURIAL_MS - 1);
      });
      expect(result.current.vigil?.name).toBe("lodash");
      act(() => {
        vi.advanceTimersByTime(1);
      });
      expect(result.current.vigil).toBeNull();
      // Once per package.
      act(() => {
        result.current.request("lodash");
      });
      expect(result.current.vigil).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("plays no Vigil without Reduced motion", () => {
    const { result } = renderHook(() => useBurial({ reducedMotion: false, drawerOpen: false }));
    act(() => {
      result.current.request("lodash");
    });
    expect(result.current.vigil).toBeNull();
  });
});
