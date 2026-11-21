import { act, cleanup, render, renderHook } from "@testing-library/react";
import fc from "fast-check";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Cemetery } from "../src/Cemetery.js";
import { useGhostPhase } from "../src/hooks/use-ghost-phase.js";
import { useMediaQuery } from "../src/hooks/use-media-query.js";
import { drawScene, type PaintContext2D } from "../src/scene/draw.js";
import { planScene, type ScenePlan } from "../src/scene/layout.js";
import { PALETTE } from "../src/scene/palette.js";
import { Scene } from "../src/scene/Scene.js";
import { arbBigScanResponse, arbScanResponse, arbTheme, cheapScan, scenePackage } from "./arbitraries.js";
import { flushFrame, paintCount, setMedia, triggerResize } from "./setup.js";

const NUM_RUNS = 100;

interface Recorder {
  readonly ctx: PaintContext2D;
  readonly calls: string[];
  readonly fills: string[];
}

function recorder(): Recorder {
  const calls: string[] = [];
  const fills: string[] = [];
  const target: Record<string, unknown> = {};
  const ctx = new Proxy(target, {
    get(obj, prop: string) {
      if (prop in obj) return obj[prop];
      return () => {
        calls.push(prop);
        if (prop === "createLinearGradient" || prop === "createRadialGradient") return { addColorStop() {} };
        return undefined;
      };
    },
    set(obj, prop: string, value: unknown) {
      if (prop === "fillStyle" && typeof value === "string") fills.push(value);
      obj[prop] = value;
      return true;
    },
  }) as unknown as PaintContext2D;
  return { ctx, calls, fills };
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("Feature: cemetery-ui, Property 9: Rendering never throws for 0 to 300 packages", () => {
  it("renders Cemetery and draws for any valid response", () => {
    fc.assert(
      fc.property(fc.oneof(arbScanResponse, arbBigScanResponse), arbTheme, (response, theme) => {
        const view = render(<Cemetery response={response} theme={theme} reducedMotion={false} />);
        act(() => {
          flushFrame();
        });
        view.unmount();
        const plan = planScene({ packages: response.report.packages, width: 640, theme, selectedIndex: null, ghostPhase: 0 });
        const rec = recorder();
        drawScene(rec.ctx, plan, 1);
        if (plan.graves.length > 0) expect(rec.calls.indexOf("clearRect")).toBeGreaterThanOrEqual(0);
      }),
      { numRuns: NUM_RUNS },
    );
  });
});

describe("Feature: cemetery-ui, Property 17: Redraws happen once per frame, and only for a change", () => {
  it("noise events paint nothing and a change paints once per frame", () => {
    const packages = [...cheapScan(6).report.packages];
    const make = (theme: "light" | "dark", phase: 0 | 1): ScenePlan =>
      planScene({ packages, width: 500, theme, selectedIndex: null, ghostPhase: phase });
    fc.assert(
      fc.property(fc.array(fc.constantFrom("change", "noise", "frame"), { maxLength: 40 }), (events) => {
        cleanup();
        flushFrame();
        const base = paintCount();
        let plan = make("light", 0);
        let flip = 0;
        const view = render(<Scene plan={plan} />);
        let changed = true;
        let expected = 0;
        for (const event of events) {
          if (event === "change") {
            flip += 1;
            plan = make(flip % 2 === 0 ? "light" : "dark", 0);
            view.rerender(<Scene plan={plan} />);
            changed = true;
          } else if (event === "noise") {
            const canvas = view.container.querySelector("canvas");
            act(() => {
              canvas?.dispatchEvent(new FocusEvent("focus"));
              canvas?.dispatchEvent(new FocusEvent("blur"));
              canvas?.dispatchEvent(new MouseEvent("pointermove"));
            });
            view.rerender(<Scene plan={plan} />);
          } else {
            act(() => {
              flushFrame();
            });
            if (changed) expected += 1;
            changed = false;
          }
          expect(paintCount() - base).toBe(expected);
        }
        view.unmount();
      }),
      { numRuns: NUM_RUNS },
    );
  });
});

describe("scene examples", () => {
  it("renders an aria-hidden canvas with a backing size", () => {
    const view = render(<Cemetery response={cheapScan(3)} theme="light" reducedMotion={false} />);
    const canvas = view.container.querySelector("canvas");
    expect(canvas?.getAttribute("aria-hidden")).toBe("true");
    expect(Number(canvas?.getAttribute("width"))).toBeGreaterThan(0);
    expect(Number(canvas?.getAttribute("height"))).toBeGreaterThan(0);
  });

  it("follows the container width through the resize observer", () => {
    const view = render(<Cemetery response={cheapScan(3)} theme="light" reducedMotion={false} />);
    act(() => {
      triggerResize(1000);
      triggerResize(900);
      flushFrame();
    });
    expect(view.container.querySelector("canvas")?.style.width).toBe("900px");
  });

  it("repaints with the other palette after a theme change", () => {
    const rec = recorder();
    const spy = vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(rec.ctx as unknown as CanvasRenderingContext2D);
    const response = cheapScan(2);
    const view = render(<Cemetery response={response} theme="light" reducedMotion={false} />);
    act(() => {
      flushFrame();
    });
    expect(rec.calls.filter((c) => c === "clearRect")).toHaveLength(1);
    view.rerender(<Cemetery response={response} theme="dark" reducedMotion={false} />);
    act(() => {
      flushFrame();
    });
    expect(rec.calls.filter((c) => c === "clearRect")).toHaveLength(2);
    spy.mockRestore();
  });

  it("shows the empty text and no canvas for zero packages", () => {
    const view = render(<Cemetery response={cheapScan(0)} theme="light" reducedMotion={false} />);
    expect(view.container.textContent).toContain("no direct dependencies in this scan");
    expect(view.container.querySelector("canvas")).toBeNull();
  });

  it("draws a ghost only for graves with advisories", () => {
    const plan = planScene({
      packages: [scenePackage("a", "Alive", "some"), scenePackage("b", "Alive", "none")],
      width: 400,
      theme: "light",
      selectedIndex: 1,
      ghostPhase: 0,
    });
    const rec = recorder();
    drawScene(rec.ctx, plan, 2);
    expect(rec.calls.filter((c) => c === "fillText")).toHaveLength(2);
    expect(rec.fills).toContain(PALETTE.light.ghost);
    expect(rec.calls.filter((c) => c === "strokeRect")).toHaveLength(1);
  });
});

describe("ghost phase timer", () => {
  const fake = () => vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "setTimeout", "clearTimeout"] });

  it("steps every 100 ms when a ghost exists and motion is allowed", () => {
    fake();
    const { result } = renderHook(() => useGhostPhase(true, false));
    expect(result.current).toBe(0);
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(result.current).toBe(1);
    act(() => {
      vi.advanceTimersByTime(4700);
    });
    expect(result.current).toBe(0);
  });

  it("holds 0 and runs no timer under Reduced motion or without a ghost", () => {
    fake();
    const reduced = renderHook(() => useGhostPhase(true, true));
    const none = renderHook(() => useGhostPhase(false, false));
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect([reduced.result.current, none.result.current]).toEqual([0, 0]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("starts and stops without a reload when the media query changes", () => {
    fake();
    const query = "(prefers-reduced-motion: reduce)";
    const { result } = renderHook(() => useGhostPhase(true, useMediaQuery(query)));
    expect(vi.getTimerCount()).toBe(1);
    act(() => {
      setMedia(query, true);
    });
    expect(vi.getTimerCount()).toBe(0);
    expect(result.current).toBe(0);
    act(() => {
      setMedia(query, false);
    });
    expect(vi.getTimerCount()).toBe(1);
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(result.current).toBe(1);
  });
});
