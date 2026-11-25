import { labelRect } from "./art-box.js";
import { BURST_MS } from "./burst.js";
import type { Rect, ScenePlan } from "./layout.js";

/** Test-only plan changes: the e2e paints the same frame with and without a mark to compare pixels. */
export interface PlanVariant {
  /** False paints every grave without its Ghost (spec cemetery-undead-2, task 2.4). */
  readonly ghosts?: boolean;
  /** Paints a Burst this far in, on the first open grave (task 6.4). */
  readonly burstElapsedMs?: number;
  /** Paints the Priest on a grave at a burial phase, or a null phase for the Vigil (task 7.3). */
  readonly priest?: { readonly index: number; readonly phase: number | null };
}

export interface SextonTiming {
  redraw(n: number): number[];
  /** The name label of every grave, in CSS pixels of the canvas. */
  labels(): Rect[];
  /** One synchronous paint of the current plan with the variant applied, at the page clock. */
  paintVariant(variant: PlanVariant): void;
  /** n synchronous paints with a Burst at n phases across its length, each timed. */
  redrawBurst(n: number): number[];
}

declare global {
  interface Window {
    __sextonTiming?: SextonTiming;
  }
}

/** Pure. The plan with the variant applied. */
export function planVariant(plan: ScenePlan, variant: PlanVariant, nowMs: number = Date.now()): ScenePlan {
  let out = plan;
  if (variant.ghosts === false) out = { ...out, graves: out.graves.map((g) => (g.ghost === null ? g : { ...g, ghost: null })) };
  if (variant.burstElapsedMs !== undefined) {
    const open = out.graves.find((g) => g.shape === "open");
    // No silent fallback: a timing without an open grave would time no Burst (review note, tasks 6 and 7).
    if (open === undefined) throw new Error("no open grave to play a Burst on");
    out = { ...out, burst: { index: open.index, startMs: nowMs - variant.burstElapsedMs } };
  }
  if (variant.priest !== undefined) {
    const { index, phase } = variant.priest;
    out = {
      ...out,
      priest: { index, phase },
      graves: out.graves.map((g) => (g.index === index && phase !== null ? { ...g, burial: phase } : g)),
    };
  }
  return out;
}

/** E2E builds only: n synchronous full paints, each timed, and the label probe. Returns an uninstall function. */
export function installTimingHook(repaint: () => void, current: () => ScenePlan, paint: (plan: ScenePlan) => void): () => void {
  window.__sextonTiming = {
    redraw(n: number): number[] {
      // The whole scene, every grave standing: a Load moment in progress would draw fewer graves and time less.
      const times: number[] = [];
      for (let i = 0; i < n; i += 1) {
        const plan = current();
        const start = performance.now();
        if (plan.riseStartMs === null) repaint();
        else paint({ ...plan, riseStartMs: null });
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
    redrawBurst(n: number): number[] {
      const times: number[] = [];
      for (let i = 0; i < n; i += 1) {
        const plan = { ...planVariant(current(), { burstElapsedMs: (BURST_MS * i) / n }), riseStartMs: null };
        const start = performance.now();
        paint(plan);
        times.push(performance.now() - start);
      }
      return times;
    },
  };
  return () => {
    delete window.__sextonTiming;
  };
}
