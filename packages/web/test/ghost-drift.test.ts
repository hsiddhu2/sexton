import { act, cleanup, renderHook } from "@testing-library/react";
import fc from "fast-check";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useGhostPhase } from "../src/hooks/use-ghost-phase.js";
import {
  GHOST_HEIGHT,
  GHOST_STEPS,
  GHOST_STEP_MS,
  GHOST_WIDTH,
  ghostOffset,
  planScene,
  type GravePlan,
} from "../src/scene/layout.js";
import { arbScenePackages, arbSceneWidth, arbTheme } from "./arbitraries.js";

const NUM_RUNS = 100;

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const withoutGhost = (g: GravePlan): Omit<GravePlan, "ghost"> => ({
  index: g.index,
  name: g.name,
  state: g.state,
  rect: g.rect,
  shape: g.shape,
  fill: g.fill,
  inscription: g.inscription,
  pending: g.pending,
  marker: g.marker,
  burial: g.burial,
});

describe("Feature: cemetery-theme, Property 6: Ghost offset function", () => {
  it("gives every ghost the same bounded offset and moves nothing else", () => {
    fc.assert(
      fc.property(
        arbScenePackages([0, 1, 5, 20, 61]),
        arbSceneWidth,
        arbTheme,
        fc.integer({ min: 0, max: 200 }),
        (packages, width, theme, phase) => {
          const plan = planScene({ packages, width, theme, selectedIndex: null, ghostPhase: phase });
          const base = planScene({ packages, width, theme, selectedIndex: null, ghostPhase: 0 });
          const offset = ghostOffset(phase);
          expect(Math.abs(offset)).toBeLessThanOrEqual(6);
          for (const g of plan.graves) {
            if (g.ghost === null) continue;
            expect(g.ghost.y).toBe(g.rect.y + 12 + offset);
            expect(g.ghost.x).toBe(g.rect.x + 84);
            expect(g.ghost.x).toBeGreaterThanOrEqual(g.rect.x);
            expect(g.ghost.y).toBeGreaterThanOrEqual(g.rect.y);
            expect(g.ghost.x + GHOST_WIDTH).toBeLessThanOrEqual(g.rect.x + g.rect.w);
            expect(g.ghost.y + GHOST_HEIGHT).toBeLessThanOrEqual(g.rect.y + g.rect.h);
          }
          expect(plan.graves.map(withoutGhost)).toEqual(base.graves.map(withoutGhost));
          expect(plan.graves.map((g) => g.ghost === null)).toEqual(base.graves.map((g) => g.ghost === null));
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it("is 0 at phase 0 and periodic in 48", () => {
    expect(ghostOffset(0)).toBe(0);
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 200 }), (p) => {
        expect(ghostOffset(p)).toBe(ghostOffset(p + GHOST_STEPS));
      }),
      { numRuns: NUM_RUNS },
    );
  });
});

type Event = { kind: "advance"; steps: number } | { kind: "reduced"; on: boolean };

const arbEvent: fc.Arbitrary<Event> = fc.oneof(
  fc.integer({ min: 1, max: 120 }).map((steps): Event => ({ kind: "advance", steps })),
  fc.boolean().map((on): Event => ({ kind: "reduced", on })),
);

describe("Feature: cemetery-theme, Property 7: Ghost timer", () => {
  it("follows elapsed steps while motion is allowed and holds no timer otherwise", () => {
    fc.assert(
      fc.property(fc.array(arbEvent, { maxLength: 20 }), fc.boolean(), (events, anyGhost) => {
        vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "setTimeout", "clearTimeout"] });
        const view = renderHook(({ reduced }) => useGhostPhase(anyGhost, reduced), {
          initialProps: { reduced: false },
        });
        let reduced = false;
        let steps = 0;
        for (const event of events) {
          if (event.kind === "advance") {
            act(() => {
              vi.advanceTimersByTime(event.steps * GHOST_STEP_MS);
            });
            if (anyGhost && !reduced) steps += event.steps;
          } else {
            act(() => {
              view.rerender({ reduced: event.on });
            });
            if (event.on !== reduced) steps = 0;
            reduced = event.on;
          }
          if (anyGhost && !reduced) {
            expect(view.result.current).toBe(steps % GHOST_STEPS);
            expect(vi.getTimerCount()).toBe(1);
          } else {
            expect(view.result.current).toBe(0);
            expect(vi.getTimerCount()).toBe(0);
          }
        }
        view.unmount();
        vi.useRealTimers();
      }),
      { numRuns: NUM_RUNS },
    );
  });
});
