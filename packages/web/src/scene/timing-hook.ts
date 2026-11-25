import { labelRect } from "./art-box.js";
import type { Rect, ScenePlan } from "./layout.js";

/** Test-only plan changes: the e2e paints the same frame with and without a mark to compare pixels. */
export interface PlanVariant {
  /** False paints every grave without its Ghost (spec cemetery-undead-2, task 2.4). */
  readonly ghosts?: boolean;
}

export interface SextonTiming {
  redraw(n: number): number[];
  /** The name label of every grave, in CSS pixels of the canvas. */
  labels(): Rect[];
  /** One synchronous paint of the current plan with the variant applied, at the page clock. */
  paintVariant(variant: PlanVariant): void;
}

declare global {
  interface Window {
    __sextonTiming?: SextonTiming;
  }
}

/** Pure. The plan with the variant applied. */
export function planVariant(plan: ScenePlan, variant: PlanVariant): ScenePlan {
  if (variant.ghosts !== false) return plan;
  return { ...plan, graves: plan.graves.map((g) => (g.ghost === null ? g : { ...g, ghost: null })) };
}

/** E2E builds only: n synchronous full paints, each timed, and the label probe. Returns an uninstall function. */
export function installTimingHook(repaint: () => void, current: () => ScenePlan, paint: (plan: ScenePlan) => void): () => void {
  window.__sextonTiming = {
    redraw(n: number): number[] {
      const times: number[] = [];
      for (let i = 0; i < n; i += 1) {
        const start = performance.now();
        repaint();
        times.push(performance.now() - start);
      }
      return times;
    },
    labels(): Rect[] {
      return current().graves.map((g) => labelRect(g));
    },
    paintVariant(variant: PlanVariant): void {
      paint(planVariant(current(), variant));
    },
  };
  return () => {
    delete window.__sextonTiming;
  };
}
