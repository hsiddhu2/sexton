import { artRect, formParts, labelRect } from "./art-box.js";
import { haloMask, uncutHaloAlphaAt } from "./halo.js";
import { HALO_ALPHA_BYTE } from "./palette.js";
import { BURST_MS } from "./burst.js";
import { setSpritesEnabled } from "./sprites.js";
import { haloLayerAlphaAt, resetHaloLayer } from "./draw.js";
import type { Rect, ScenePlan } from "./layout.js";

/** Test-only plan changes: the e2e paints the same frame with and without a mark to compare pixels. */
export interface PlanVariant {
  /** False paints every grave without its Ghost (spec cemetery-undead-2, task 2.4). */
  readonly ghosts?: boolean;
  /** Paints a Burst this far in, on the first open grave (task 6.4). */
  readonly burstElapsedMs?: number;
  /** False paints without sprites: the direct drawing, to compare with the sprites (owner fix, 25 Nov). */
  readonly sprites?: boolean;
  /** Paints the Load moment this far in (review note: a rising grave is drawn directly). */
  readonly riseElapsedMs?: number;
  /** Paints at this instant instead of the page clock (spec cemetery-undead-fixes, bug 2). */
  readonly nowMs?: number;
  /** Paints the Priest on a grave at a burial phase, or a null phase for the Vigil (task 7.3). */
  readonly priest?: { readonly index: number; readonly phase: number | null };
}

export interface SextonTiming {
  redraw(n: number): number[];
  /** The name label of every grave, in CSS pixels of the canvas. */
  labels(): Rect[];
  /** Every grave's Art box, in CSS pixels of the canvas (spec clean-site, 3.15). */
  artBoxes(): Rect[];
  /** One synchronous paint of the current plan with the variant applied, at the page clock. */
  paintVariant(variant: PlanVariant): void;
  /** n full paints, each with the Halo layer painted afresh, each timed (spec cemetery-undead-fixes, 2.9). */
  redrawHalo(n: number): number[];
  /** n full paints, each with the Halo layer and its sources painted afresh: a Cold Halo repaint (spec judge-path, 5.1). */
  redrawHaloCold(n: number): number[];
  /** The Halo layer's alpha, 0 to 255, at a scene point, or null (spec cemetery-undead-fixes, bug 1). */
  haloAlpha(x: number, y: number): number | null;
  /** n synchronous paints with a Burst at n phases across its length, each timed. */
  redrawBurst(n: number): number[];
  /** n synchronous paints with a burial on grave `index` at n phases across it, each timed (spec judge-path, 6.3). */
  redrawBurial(n: number, index: number): number[];
  /** Every grave's Part, Ghost and pennant boxes and every Name label, in CSS pixels of the canvas. */
  guarded(): Rect[];
  /** The selection ring's rectangle, or null. */
  ring(): Rect | null;
  /** The model's uncut Halo alpha, 0 to 255, at a scene point of the current plan. */
  uncutHalo(x: number, y: number): number;
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
export function installTimingHook(repaint: () => void, current: () => ScenePlan, paint: (plan: ScenePlan, nowMs?: number) => void): () => void {
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
    artBoxes(): Rect[] {
      return current().graves.map((g) => artRect(g));
    },
    paintVariant(variant: PlanVariant): void {
      const now = variant.nowMs ?? Date.now();
      const plan = { ...planVariant(current(), variant, now), riseStartMs: variant.riseElapsedMs === undefined ? null : now - variant.riseElapsedMs };
      if (variant.sprites === false) setSpritesEnabled(false);
      try {
        paint(plan, now);
      } finally {
        setSpritesEnabled(true);
      }
    },
    redrawHalo(n: number): number[] {
      const times: number[] = [];
      for (let i = 0; i < n; i += 1) {
        const plan = { ...current(), riseStartMs: null };
        resetHaloLayer();
        const start = performance.now();
        paint(plan);
        times.push(performance.now() - start);
      }
      return times;
    },
    redrawHaloCold(n: number): number[] {
      const times: number[] = [];
      for (let i = 0; i < n; i += 1) {
        const plan = { ...current(), riseStartMs: null };
        resetHaloLayer(true);
        const start = performance.now();
        paint(plan);
        times.push(performance.now() - start);
      }
      return times;
    },
    haloAlpha(x: number, y: number): number | null {
      return haloLayerAlphaAt(x, y);
    },
    redrawBurial(n: number, index: number): number[] {
      const times: number[] = [];
      for (let i = 0; i < n; i += 1) {
        const plan = { ...planVariant(current(), { priest: { index, phase: i / n } }), riseStartMs: null };
        const start = performance.now();
        paint(plan);
        times.push(performance.now() - start);
      }
      return times;
    },
    guarded(): Rect[] {
      return current().graves.flatMap((g) => [...formParts(g), labelRect(g)]);
    },
    ring(): Rect | null {
      return current().ring;
    },
    uncutHalo(x: number, y: number): number {
      return 255 * uncutHaloAlphaAt(haloMask(current()), parseInt(HALO_ALPHA_BYTE, 16) / 255, x, y);
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
