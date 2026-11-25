// The Halo: the strong part of the Possessed glow (spec cemetery-undead-2, requirement 3). The Possessed colour at
// HALO_ALPHA_BYTE, drawn only where nothing a contrast check guards can sit: every grave's Form box and name label,
// the cells of the selected and the Lantern grave, and the Art box of a grave whose burial, Vigil or Burst plays are
// cut out of it. One pure function, haloMask, gives the painter and the property test the same sources and cuts.
import { artRect, FORM_PARTS, formParts, intersects, labelRect, MARKER_BOX } from "./art-box.js";
import { PRIEST_BOX } from "./characters/priest.js";
import type { GravePlan, Rect, ScenePlan } from "./layout.js";
import { CELL_WIDTH } from "./layout.js";
import { STATE_BY_SHAPE } from "./characters/vector.js";

/** The Halo's radius, in cell widths of its grave. */
export const HALO_RADIUS = 2.4;
/** The soft edge of every cut, in scene pixels: the cut fades from full to none over this distance outside it. */
export const HALO_FEATHER = 32;
/**
 * The soft edge of every cut (spec cemetery-undead-fixes, bug 1): a copy of the cut grown by HALO_GROW, with corners
 * rounded by HALO_GROW, is cut through a Gaussian blur of HALO_BLUR CSS pixels. The grown copy reaches past the solid
 * cut (its margin, 8 px) by more than one and a quarter blurs, so the solid cut's edge falls where the Halo is already
 * almost gone and shows no step. Where the canvas has no filter, the linear HALO_FEATHER strips remain.
 */
export const HALO_GROW = 16;
export const HALO_BLUR = 6;
/** The selection ring's line, from 1 px outside the cell to 6 px inside it; the focus outline, 4 to 11 px inside. */
export const RING_BAND = { outside: 1, inside: 6 } as const;
export const OUTLINE_BAND = { from: 4, to: 11 } as const;
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
  /** Every cut: the graves' parts below, then the names, the bands and the playing Art boxes. */
  readonly cuts: readonly Rect[];
  /** The graves whose Part, Ghost and pennant boxes are among the cuts, for the painter's sprites. */
  readonly parted: readonly GravePlan[];
  /** The cuts that are not a grave's parts. */
  readonly others: readonly Rect[];
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

/** The four strips of the selection ring's line round a cell. */
export function ringBand(cell: Rect): Rect[] {
  const o = RING_BAND.outside;
  const t = RING_BAND.outside + RING_BAND.inside;
  return [
    { x: cell.x - o, y: cell.y - o, w: cell.w + 2 * o, h: t },
    { x: cell.x - o, y: cell.y + cell.h - RING_BAND.inside, w: cell.w + 2 * o, h: t },
    { x: cell.x - o, y: cell.y - o, w: t, h: cell.h + 2 * o },
    { x: cell.x + cell.w - RING_BAND.inside, y: cell.y - o, w: t, h: cell.h + 2 * o },
  ];
}

/** The four strips of the focus outline inside a cell. */
export function outlineBand(cell: Rect): Rect[] {
  const a = OUTLINE_BAND.from;
  const t = OUTLINE_BAND.to - OUTLINE_BAND.from;
  return [
    { x: cell.x + a, y: cell.y + a, w: cell.w - 2 * a, h: t },
    { x: cell.x + a, y: cell.y + cell.h - OUTLINE_BAND.to, w: cell.w - 2 * a, h: t },
    { x: cell.x + a, y: cell.y + a, w: t, h: cell.h - 2 * a },
    { x: cell.x + cell.w - OUTLINE_BAND.to, y: cell.y + a, w: t, h: cell.h - 2 * a },
  ];
}

/** The regions a burial or a Vigil may draw on, in scene pixels: each part to the plinth top, the mound, the Priest. */
export function buryingRegions(g: GravePlan): Rect[] {
  const scale = g.rect.w / CELL_WIDTH;
  const at = (r: Rect): Rect => ({ x: g.rect.x + r.x * scale, y: g.rect.y + r.y * scale, w: r.w * scale, h: r.h * scale });
  const out = FORM_PARTS[g.shape].map((p) => at({ x: p.x, y: p.y, w: p.w, h: Math.max(p.h, PLINTH_TOP - p.y) }));
  out.push(at(MOUND_BOX), at(PRIEST_BOX), labelRect(g));
  if (g.marker) out.push(at(MARKER_BOX));
  return out;
}

/** The burial mound at its widest, in cell units. */
export const MOUND_BOX: Rect = { x: 36, y: 154, w: 120, h: 28 };
const PLINTH_TOP = 168;

/** The box round every source's circle. */
export function sourceBox(sources: readonly HaloSource[]): Rect {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const s of sources) {
    x0 = Math.min(x0, s.cx - s.r);
    y0 = Math.min(y0, s.cy - s.r);
    x1 = Math.max(x1, s.cx + s.r);
    y1 = Math.max(y1, s.cy + s.r);
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
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
    // A Burst throws Possessed shards across its Art box: its grave's Halo waits until the Burst ends
    // (spec cemetery-undead-fixes, bug 1). A Burst plays only on a replay, whose one grave is the only source.
    if (plan.burst !== null && plan.burst.startMs !== null && plan.burst.index === g.index) continue;
    const s = g.rect.w / CELL_WIDTH;
    sources.push({ index: g.index, cx: g.rect.x + HALO_CX * s, cy: g.rect.y + HALO_CY * s, r: HALO_RADIUS * g.rect.w, colour: g.fill });
  }
  const cuts: Rect[] = [];
  const parted: GravePlan[] = [];
  let partCount = 0;
  if (sources.length > 0) {
    // Only what a source reaches is cut: outside the sources' box the Halo is already zero.
    const reach = sourceBox(sources);
    const add = (c: Rect): void => {
      if (intersects(c, reach)) cuts.push(c);
    };
    // Cut where a checked token can sit: each grave's drawn parts and name, the ring's line, the focus outline, and
    // the Art box of a grave whose burial, Vigil or Burst plays (spec cemetery-undead-fixes, bug 1).
    for (const g of plan.graves) {
      const parts = formParts(g);
      if (parts.some((p) => intersects(p, reach))) {
        parted.push(g);
        cuts.push(...parts);
      }
    }
    partCount = cuts.length;
    for (const g of plan.graves) add(labelRect(g));
    const selected = plan.selected === null ? undefined : plan.graves[plan.selected];
    if (selected !== undefined) for (const b of ringBand(selected.rect)) add(b);
    const lantern = plan.lantern === null ? undefined : plan.graves[plan.lantern];
    if (lantern !== undefined) for (const b of outlineBand(lantern.rect)) add(b);
    for (const i of playingGraves(plan)) {
      const g = plan.graves[i];
      if (g === undefined) continue;
      if (plan.burst !== null && plan.burst.startMs !== null && plan.burst.index === i) {
        add(artRect(g));
        continue;
      }
      // A burial or a Vigil: the stone sinks inside its own columns down to the plinth top, a mound shows and the
      // Priest walks and reads. Only those are cut, so the Halo's edge still follows the grave.
      for (const r of buryingRegions(g)) add(r);
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
  const mask: HaloMask = { sources, cuts, parted, others: cuts.slice(partCount), key };
  masks.set(plan, mask);
  return mask;
}

/** The distance from a point to a rectangle, 0 inside it. */
function distanceTo(c: Rect, x: number, y: number): number {
  const dx = Math.max(c.x - x, 0, x - (c.x + c.w));
  const dy = Math.max(c.y - y, 0, y - (c.y + c.h));
  return Math.hypot(dx, dy);
}

/** The standard normal distribution function (Abramowitz and Stegun 7.1.26, error under 1.5e-7). */
function phi(z: number): number {
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const erf = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return z >= 0 ? (1 + erf) / 2 : (1 - erf) / 2;
}

/** How much of the Halo a blurred, grown copy of a cut removes at a point, 0 to 1. */
function softCut(c: Rect, x: number, y: number): number {
  const g = HALO_GROW;
  const s = HALO_BLUR;
  const fx = phi((x - (c.x - g)) / s) - phi((x - (c.x + c.w + g)) / s);
  const fy = phi((y - (c.y - g)) / s) - phi((y - (c.y + c.h + g)) / s);
  return Math.min(1, Math.max(0, fx * fy));
}

/**
 * Pure. The Halo's alpha at a point, as the painter composites it: the sources over each other, then each cut removes
 * all of it inside the cut, and outside it what its soft edge removes: a blurred grown copy (`blur`, the browser path)
 * or a linear fade over HALO_FEATHER (`strips`, the fallback path).
 */
export function haloAlphaAt(mask: HaloMask, peak: number, x: number, y: number, edge: "blur" | "strips" = "blur"): number {
  let clear = 1;
  for (const s of mask.sources) {
    const d = Math.hypot(x - s.cx, y - s.cy);
    if (d < s.r) clear *= 1 - peak * (1 - d / s.r);
  }
  let alpha = 1 - clear;
  if (alpha === 0) return 0;
  for (const c of mask.cuts) {
    const d = distanceTo(c, x, y);
    if (d === 0) return 0;
    if (edge === "strips") {
      if (d < HALO_FEATHER) alpha *= d / HALO_FEATHER;
    } else if (d < HALO_GROW + 4 * HALO_BLUR) alpha *= 1 - softCut(c, x, y);
    if (alpha === 0) return 0;
  }
  return alpha;
}

/** Pure. The Halo's alpha at a point with no cut at all. */
export function uncutHaloAlphaAt(mask: HaloMask, peak: number, x: number, y: number): number {
  return haloAlphaAt({ ...mask, cuts: [] }, peak, x, y);
}
