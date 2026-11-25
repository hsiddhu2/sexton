// Spec cemetery-undead, task 5.2: Character motion and the clock (requirement 4). Property 3.
import { act, cleanup, render } from "@testing-library/react";
import fc from "fast-check";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DANCE_LENGTH_MS, DANCE_PERIOD_MS, dancers, FRAME_MS, inDanceWindow, poseAt, seedOf, STILL_POSE } from "../src/scene/motion.js";
import { planScene } from "../src/scene/layout.js";
import { Scene } from "../src/scene/Scene.js";
import { canvasCalls } from "./setup.js";
import { scenePackage } from "./arbitraries.js";

const arbName = fc.string({ minLength: 1, maxLength: 20 });

describe("Feature: cemetery-undead, Property 3: Motion is a pure function of time, seed and Reduced motion", () => {
  it("Feature: cemetery-undead, Property 3: Motion is a pure function of time, seed and Reduced motion", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 10_000_000 }), fc.integer({ min: 1, max: 24 }), fc.nat(), (now, count, offset) => {
        const pose = poseAt(now, count, false, offset);
        expect(pose).toBeGreaterThanOrEqual(0);
        expect(pose).toBeLessThan(count);
        expect(poseAt(now, count, true, offset)).toBe(STILL_POSE);
        expect(poseAt(now + FRAME_MS, count, false, offset)).toBe((pose + 1) % count);
        expect(poseAt(now, count, false, offset)).toBe(pose);
      }),
      { numRuns: 100 },
    );
    fc.assert(
      fc.property(fc.uniqueArray(arbName, { maxLength: 40 }), fc.integer({ min: 0, max: 1000 }), (names, shuffleSeed) => {
        const chosen = dancers(names);
        expect(chosen.size).toBe(names.length === 0 ? 0 : Math.max(1, Math.floor(names.length / 5)));
        for (const d of chosen) expect(names).toContain(d);
        const shuffled = names.slice().sort((a, b) => ((seedOf(a) ^ shuffleSeed) >>> 0) - ((seedOf(b) ^ shuffleSeed) >>> 0));
        expect([...dancers(shuffled)].sort()).toEqual([...chosen].sort());
      }),
      { numRuns: 100 },
    );
    fc.assert(
      fc.property(arbName, fc.integer({ min: 0, max: 1_000_000 }), (name, base) => {
        // Over one full period, the window covers exactly DANCE_LENGTH_MS milliseconds.
        let inside = 0;
        for (let t = base; t < base + DANCE_PERIOD_MS; t += 100) if (inDanceWindow(name, t)) inside += 100;
        expect(inside).toBe(DANCE_LENGTH_MS);
      }),
      { numRuns: 100 },
    );
  });

  it("is the same schedule for the same name on every call", () => {
    expect(seedOf("event-stream")).toBe(seedOf("event-stream"));
    expect([...dancers(["a", "b", "c", "d", "e", "f"])]).toEqual([...dancers(["f", "e", "d", "c", "b", "a"])]);
  });
});

describe("the Character clock in Scene.tsx", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });
  const plan = (reducedMotion: boolean) =>
    planScene({ packages: [scenePackage("left-padder", "Possessed", "none")], width: 400, theme: "dark", selectedIndex: null, ghostPhase: 0, reducedMotion });

  // React keeps its own timer in jsdom, so the clock is measured as the difference from a still Scene.
  const timersWith = (reduced: boolean): number => {
    render(<Scene plan={plan(reduced)} />);
    const count = vi.getTimerCount();
    cleanup();
    return count;
  };

  it("sets one timer of FRAME_MS while motion is allowed, and none under Reduced motion", () => {
    const still = timersWith(true);
    expect(timersWith(false)).toBe(still + 1);
  });

  it("repaints on each step, stops while the page is hidden and restarts when visible", () => {
    render(<Scene plan={plan(false)} />);
    const paints = (): number => canvasCalls().filter((c) => c.method === "clearRect").length;
    const before = paints();
    act(() => {
      vi.advanceTimersByTime(FRAME_MS * 3 + 1);
    });
    // Three clock steps, each asking for a repaint frame that fake timers run.
    expect(paints()).toBeGreaterThanOrEqual(before + 3);
    const running = vi.getTimerCount();
    expect(running).toBeGreaterThanOrEqual(1);
    const hidden = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    act(() => {
      vi.advanceTimersByTime(FRAME_MS + 1);
    });
    // Hidden: the clock does not set its next timer.
    const whileHidden = vi.getTimerCount();
    expect(whileHidden).toBeLessThan(running);
    act(() => {
      vi.advanceTimersByTime(FRAME_MS * 5);
    });
    expect(vi.getTimerCount()).toBe(whileHidden);
    hidden.mockReturnValue("visible");
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    // Visible again: the clock restarts (its timer, and the repaint frame it asks for; fake timers count both).
    expect(vi.getTimerCount()).toBeGreaterThan(whileHidden);
    hidden.mockRestore();
  });
});
