// Spec cemetery-undead-2, requirement 10: the burial Priest and the Vigil.
import { act, renderHook } from "@testing-library/react";
import fc from "fast-check";
import { describe, expect, it, vi } from "vitest";
import { ART_BOX } from "../src/scene/art-box.js";
import { drawPriest, PRIEST_PARTS, PRIEST_AT_X, PRIEST_BOX, PRIEST_FROM_X, PRIEST_H, PRIEST_W, priestPose, WALK_END } from "../src/scene/characters/priest.js";
import { BURIAL_CUT_STEPS, buryingRegions } from "../src/scene/halo.js";
import { FORM_PARTS } from "../src/scene/art-box.js";
import { BURIAL_SINK_PX, burialFrame } from "../src/time/burial.js";
import { drawGrave } from "../src/scene/draw.js";
import { CELL_HEIGHT, CELL_WIDTH, type GravePlan } from "../src/scene/layout.js";
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

describe("the burial's regions (spec cemetery-undead-fixes, bug 1)", () => {
  it("keeps every mark of the Priest inside PRIEST_BOX at every phase and the Vigil", () => {
    for (const phase of [null, 0, 0.1, 0.2, 0.3, 0.4, 0.6, 0.8, 1]) {
      const ctx = new BoundsContext();
      drawPriest(ctx, PALETTE.dark, phase);
      for (const m of ctx.marks) {
        expect(m.box.minX, String(phase)).toBeGreaterThanOrEqual(PRIEST_BOX.x - 1e-6);
        expect(m.box.maxX).toBeLessThanOrEqual(PRIEST_BOX.x + PRIEST_BOX.w + 1e-6);
        expect(m.box.minY).toBeGreaterThanOrEqual(PRIEST_BOX.y - 1e-6);
        expect(m.box.maxY).toBeLessThanOrEqual(PRIEST_BOX.y + PRIEST_BOX.h + 1e-6);
      }
    }
  });

  it("keeps every point of every mark of a burial or a Vigil, the shadow aside, inside the burial regions", () => {
    for (const shape of ["rounded", "tilted", "cross", "cracked", "open"] as const) {
      for (const phase of [null, 0, 0.2, 0.35, 0.5, 0.65, 0.8, 1]) {
        const pkg = scenePackage("b", "Dead", "none");
        const base = planScene({ packages: [pkg], width: 1440, theme: "dark", selectedIndex: null, ghostPhase: 0 });
        const grave = { ...(base.graves[0] as GravePlan), rect: { x: 0, y: 0, w: CELL_WIDTH, h: CELL_HEIGHT }, shape, marker: true, burial: phase, ghost: null, inscription: null };
        const plan = { ...base, graves: [grave], priest: { index: 0, phase } };
        const ctx = new BoundsContext();
        drawGrave(ctx, grave, plan, { shadow: "#05030a80", stone: "#140f2240" }, 0);
        // Spec judge-path, Deliberate test change 5: the regions at the burial's phase, which follow the sinking stone.
        const regions = buryingRegions(grave, phase);
        const inAny = (x: number, y: number): boolean => regions.some((r) => x >= r.x - 0.5 && x <= r.x + r.w + 0.5 && y >= r.y - 0.5 && y <= r.y + r.h + 0.5);
        for (const m of ctx.marks) {
          if (m.style === "#05030a80") continue;
          for (const [px, py] of m.poly) {
            // A sinking stone is clipped at the plinth top: points below it are not drawn.
            if (py > 168 && m.kind !== "fillText" && m.box.maxY <= 168) continue;
            expect(inAny(px, Math.min(py, m.box.maxY)), `${shape} ${String(phase)} ${String(px)},${String(py)}`).toBe(true);
          }
        }
      }
    }
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

describe("Feature: judge-path, Property 5: The burial regions hold every mark of a burial at its phase", () => {
  const SHAPES_ = ["rounded", "tilted", "cross", "cracked", "open"] as const;
  it("holds every point drawn at any phase, and each part's region starts at most one cut step above the sunk stone", () => {
    // The most the stone moves in one cut step: the whole sink happens over the first 0.35 of the phase.
    const stepMove = BURIAL_SINK_PX / (BURIAL_CUT_STEPS * 0.35);
    fc.assert(
      fc.property(fc.constantFrom(...SHAPES_), fc.double({ min: 0, max: 1, noNaN: true }), (shape, phase) => {
        const pkg = scenePackage("b", "Dead", "none");
        const base = planScene({ packages: [pkg], width: 1440, theme: "dark", selectedIndex: null, ghostPhase: 0 });
        const grave = { ...(base.graves[0] as GravePlan), rect: { x: 0, y: 0, w: CELL_WIDTH, h: CELL_HEIGHT }, shape, marker: true, burial: phase, ghost: null, inscription: null };
        const plan = { ...base, graves: [grave], priest: { index: 0, phase } };
        const ctx = new BoundsContext();
        drawGrave(ctx, grave, plan, { shadow: "#05030a80", stone: "#140f2240" }, 0);
        const regions = buryingRegions(grave, phase);
        const inAny = (x: number, y: number): boolean => regions.some((r) => x >= r.x - 0.5 && x <= r.x + r.w + 0.5 && y >= r.y - 0.5 && y <= r.y + r.h + 0.5);
        for (const m of ctx.marks) {
          if (m.style === "#05030a80") continue;
          for (const [px, py] of m.poly) {
            if (py > 168 && m.kind !== "fillText" && m.box.maxY <= 168) continue;
            expect(inAny(px, Math.min(py, m.box.maxY))).toBe(true);
          }
        }
        // The part regions come first; the mound, the Priest's parts, the name and the pennant follow. Each part region starts
        // within one cut step of where its part sits on the sinking stone, so no column stays above the stone.
        const sunk = burialFrame(phase).sink * BURIAL_SINK_PX;
        for (const region of regions.slice(0, -(3 + PRIEST_PARTS.length))) {
          const match = FORM_PARTS[shape].some((p) => p.x === region.x && p.w === region.w && region.y >= p.y + sunk - stepMove - 1e-9 && region.y <= p.y + sunk + stepMove + 1e-9);
          expect(match, `${shape} ${String(phase)} ${String(region.y)}`).toBe(true);
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });
});
