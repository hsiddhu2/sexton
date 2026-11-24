// The burial. Spec cemetery-time, requirement 15. No network, no real animation frames.
import { act, cleanup, renderHook } from "@testing-library/react";
import fc from "fast-check";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { drawScene, type PaintContext2D } from "../src/scene/draw.js";
import { planScene } from "../src/scene/layout.js";
import { BURIAL_MS, burialFrame } from "../src/time/burial.js";
import { useBurial } from "../src/time/use-burial.js";
import { arbScenePackages, arbTheme, cheapScan } from "./arbitraries.js";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Feature: cemetery-time, Property 19: The burial never changes a state", () => {
  it("has the specified frames for every phase", () => {
    fc.assert(
      fc.property(fc.double({ min: 0, max: 1, noNaN: true }), (phase) => {
        const f = burialFrame(phase);
        expect(f.sink).toBeGreaterThanOrEqual(0);
        expect(f.sink).toBeLessThanOrEqual(1);
        expect(f.mound).toBeGreaterThanOrEqual(0);
        expect(f.mound).toBeLessThanOrEqual(1);
        expect(f.marker).toBe(phase >= 0.65);
        if (phase < 0.35) expect(f.mound).toBe(0);
        if (phase >= 0.35 && phase < 0.65) expect(f.sink).toBe(1);
      }),
      { numRuns: 100 },
    );
    expect(burialFrame(0)).toEqual({ sink: 0, mound: 0, marker: false });
    expect(burialFrame(1)).toEqual({ sink: 0, mound: 0, marker: true });
    expect(burialFrame(0.35)).toEqual({ sink: 1, mound: 0, marker: false });
    expect(burialFrame(0.65)).toEqual({ sink: 1, mound: 1, marker: true });
    expect(burialFrame(Number.NaN).sink).toBe(0);
    expect(burialFrame(7).marker).toBe(true);
  });

  it("keeps state, shape and fill of every grave equal to the plan with no burial", () => {
    fc.assert(
      fc.property(arbScenePackages([1, 5, 61]), arbTheme, fc.double({ min: 0, max: 1, noNaN: true }), fc.nat({ max: 100 }), (packages, theme, phase, pick) => {
        const base = { packages, width: 1200, theme, selectedIndex: null, ghostPhase: 0 };
        const index = pick % packages.length;
        const plain = planScene(base);
        const buried = planScene({ ...base, burial: { index, phase } });
        buried.graves.forEach((g, i) => {
          const p = plain.graves[i];
          expect([g.state, g.shape, g.fill, g.rect, g.ghost, g.inscription]).toEqual([p?.state, p?.shape, p?.fill, p?.rect, p?.ghost, p?.inscription]);
          expect(g.burial).toBe(i === index ? phase : null);
        });
        expect(buried.scenery).toBe(plain.scenery);
      }),
      { numRuns: 100 },
    );
  });

  it("paints the same calls for the same plan and hides the ghost while it plays", () => {
    const calls = (phase: number | null): string[] => {
      const out: string[] = [];
      const target: Record<string, unknown> = {};
      const ctx = new Proxy(target, {
        get(obj, prop: string) {
          if (prop in obj) return obj[prop];
          return (...args: unknown[]) => {
            out.push(`${prop}:${JSON.stringify(args.filter((a) => typeof a === "number"))}`);
            return { addColorStop: () => undefined };
          };
        },
        set(obj, prop: string, value: unknown) {
          obj[prop] = value;
          return true;
        },
      }) as unknown as PaintContext2D;
      const pkgs = cheapScan(2).report.packages;
      drawScene(ctx, planScene({ packages: pkgs, width: 400, theme: "dark", selectedIndex: null, ghostPhase: 0, ...(phase === null ? {} : { burial: { index: 0, phase } }) }), 1);
      return out;
    };
    expect(calls(0.5)).toEqual(calls(0.5));
    expect(calls(null).some((c) => c.startsWith("clip"))).toBe(false);
    expect(calls(0.5).filter((c) => c.startsWith("clip"))).toHaveLength(1);
  });
});

// A manual animation frame queue.
function installFrames(): { readonly run: (ms: number) => void } {
  let next = 1;
  const queue = new Map<number, FrameRequestCallback>();
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback): number => {
    const id = next;
    next += 1;
    queue.set(id, cb);
    return id;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number): void => {
    queue.delete(id);
  });
  return {
    run: (ms) => {
      const due = [...queue.entries()];
      queue.clear();
      for (const [, cb] of due) cb(ms);
    },
  };
}

describe("useBurial", () => {
  let frames: ReturnType<typeof installFrames>;
  beforeEach(() => {
    frames = installFrames();
  });

  it("plays once per package and scan, from phase 0 to the end, with the marker held until 0.65", () => {
    const { result } = renderHook(() => useBurial({ reducedMotion: false, drawerOpen: false }));
    act(() => {
      result.current.request("a");
    });
    expect(result.current.burial?.name).toBe("a");
    expect(result.current.held.has("a")).toBe(true);
    act(() => frames.run(1000));
    act(() => frames.run(1000 + BURIAL_MS * 0.5));
    expect(result.current.burial?.phase).toBeCloseTo(0.5, 5);
    expect(result.current.shown.has("a")).toBe(false);
    act(() => frames.run(1000 + BURIAL_MS * 0.8));
    expect(result.current.shown.has("a")).toBe(true);
    act(() => frames.run(1000 + BURIAL_MS * 1.1));
    expect(result.current.burial).toBeNull();
    expect(result.current.shown.has("a")).toBe(true);
    act(() => {
      result.current.request("a");
    });
    expect(result.current.burial).toBeNull();
    expect(result.current.session.has("a")).toBe(true);
  });

  it("holds a burial while the drawer is open and starts it when the drawer closes", () => {
    const { result, rerender } = renderHook((props: { open: boolean }) => useBurial({ reducedMotion: false, drawerOpen: props.open }), { initialProps: { open: true } });
    act(() => {
      result.current.request("a");
    });
    expect(result.current.burial).toBeNull();
    expect(result.current.held.has("a")).toBe(true);
    expect(result.current.session.has("a")).toBe(true);
    rerender({ open: false });
    expect(result.current.burial?.name).toBe("a");
  });

  it("plays no burial under Reduced motion and shows the marker at once", () => {
    const { result } = renderHook(() => useBurial({ reducedMotion: true, drawerOpen: false }));
    act(() => {
      result.current.request("a");
    });
    expect(result.current.burial).toBeNull();
    expect(result.current.shown.has("a")).toBe(true);
    expect(result.current.held.size).toBe(0);
  });
});
