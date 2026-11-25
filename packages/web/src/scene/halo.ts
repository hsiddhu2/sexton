// The Halo: the strong part of the Possessed glow (spec cemetery-undead-2, requirement 3). The Possessed colour at
// HALO_ALPHA_BYTE, drawn only where nothing a contrast check guards can sit: every grave's Form box and name label,
// the cells of the selected and the Lantern grave, and the Art box of a grave whose burial, Vigil or Burst plays are
// cut out of it. One pure function, haloMask, gives the painter and the property test the same sources and cuts.
import { artRect, formRects, labelRect } from "./art-box.js";
import type { Rect, ScenePlan } from "./layout.js";
import { CELL_WIDTH } from "./layout.js";
import { STATE_BY_SHAPE } from "./characters/vector.js";

/** The Halo's radius, in cell widths of its grave. */
export const HALO_RADIUS = 2.4;
/** The soft edge of every cut, in scene pixels: the cut fades from full to none over this distance outside it. */
export const HALO_FEATHER = 32;
/**
 * The Halo's centre in cell units: above the zombie's head, so most of the bloom rises into the open ground and sky
 * behind the grave, where nothing is cut (visual critic round 1).
 */
export const HALO_CX = 96;
export const HALO_CY = -40;

export interface HaloSource {
  readonly index: number;
  readonly cx: number;
  readonly cy: number;
  readonly r: number;
  readonly colour: string;
}

export interface HaloMask {
  readonly sources: readonly HaloSource[];
  readonly cuts: readonly Rect[];
  /** Equal for two masks that paint the same layer. */
  readonly key: string;
}

/** The graves whose burial, Vigil or Burst plays now. Their Art boxes are cut whole. */
export function playingGraves(plan: ScenePlan): readonly number[] {
  const out = new Set<number>();
  for (const g of plan.graves) if (g.burial !== null) out.add(g.index);
  if (plan.burst !== null && plan.burst.startMs !== null) out.add(plan.burst.index);
  if (plan.priest !== null) out.add(plan.priest.index);
  return [...out].sort((a, b) => a - b);
}

const masks = new WeakMap<ScenePlan, HaloMask>();

/** Pure, and cached per plan. */
export function haloMask(plan: ScenePlan): HaloMask {
  const cached = masks.get(plan);
  if (cached !== undefined) return cached;
  const sources: HaloSource[] = [];
  for (const g of plan.graves) {
    // A grave has at most one glow: the Lantern grave shows the Lantern glow alone.
    if (STATE_BY_SHAPE[g.shape] !== "Possessed" || plan.lantern === g.index) continue;
    const s = g.rect.w / CELL_WIDTH;
    sources.push({ index: g.index, cx: g.rect.x + HALO_CX * s, cy: g.rect.y + HALO_CY * s, r: HALO_RADIUS * g.rect.w, colour: g.fill });
  }
  const cuts: Rect[] = [];
  if (sources.length > 0) {
    for (const g of plan.graves) cuts.push(...formRects(g), labelRect(g));
    const selected = plan.selected === null ? undefined : plan.graves[plan.selected];
    if (selected !== undefined) cuts.push(selected.rect);
    const lantern = plan.lantern === null ? undefined : plan.graves[plan.lantern];
    if (lantern !== undefined) cuts.push(lantern.rect);
    for (const i of playingGraves(plan)) {
      const g = plan.graves[i];
      if (g !== undefined) cuts.push(artRect(g));
    }
  }
  const r = (v: number): string => String(Math.round(v * 100) / 100);
  const key = [
    r(plan.width),
    r(plan.groundHeight),
    ...sources.map((s) => `${r(s.cx)},${r(s.cy)},${r(s.r)},${s.colour}`),
    "|",
    ...cuts.map((c) => `${r(c.x)},${r(c.y)},${r(c.w)},${r(c.h)}`),
  ].join(";");
  const mask: HaloMask = { sources, cuts, key };
  masks.set(plan, mask);
  return mask;
}

/** The distance from a point to a rectangle, 0 inside it. */
function distanceTo(c: Rect, x: number, y: number): number {
  const dx = Math.max(c.x - x, 0, x - (c.x + c.w));
  const dy = Math.max(c.y - y, 0, y - (c.y + c.h));
  return Math.hypot(dx, dy);
}

/**
 * Pure. The Halo's alpha at a point, from 0 to HALO_ALPHA_BYTE / 255 per source, as the painter composites it: the
 * sources over each other, then each cut removes 1 inside it and 1 - d / HALO_FEATHER at a distance d outside it.
 */
export function haloAlphaAt(mask: HaloMask, peak: number, x: number, y: number): number {
  let clear = 1;
  for (const s of mask.sources) {
    const d = Math.hypot(x - s.cx, y - s.cy);
    if (d < s.r) clear *= 1 - peak * (1 - d / s.r);
  }
  let alpha = 1 - clear;
  if (alpha === 0) return 0;
  for (const c of mask.cuts) {
    const d = distanceTo(c, x, y);
    if (d < HALO_FEATHER) alpha *= d / HALO_FEATHER;
    if (alpha === 0) return 0;
  }
  return alpha;
}
