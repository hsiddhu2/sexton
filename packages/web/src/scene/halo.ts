// The Halo: the strong part of the Possessed glow (spec cemetery-undead-2, requirement 3). The Possessed colour at
// HALO_ALPHA_BYTE, drawn only where nothing a contrast check guards can sit: every grave's Form box and name label,
// the cells of the selected and the Lantern grave, and the Art box of a grave whose burial, Vigil or Burst plays are
// cut out of it. One pure function, haloMask, gives the painter and the property test the same sources and cuts.
import { artRect, FORM_PARTS, formParts, intersects, labelRect, MARKER_BOX } from "./art-box.js";
import { PRIEST_PARTS } from "./characters/priest.js";
import type { GravePlan, Rect, ScenePlan } from "./layout.js";
import { CELL_WIDTH } from "./layout.js";
import { STATE_BY_SHAPE } from "./characters/vector.js";
import { BURIAL_SINK_PX, burialFrame } from "../time/burial.js";

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
export const HALO_GROW = 12;
export const HALO_BLUR = 3;
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
  /** Every cut: the graves' parts below, then the names and the playing Art boxes. */
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

/** The burial's phase is cut in this many steps, so the Halo layer is repainted about once per Pose frame. */
export const BURIAL_CUT_STEPS = 24;

/**
 * Pure. The regions a burial or a Vigil may draw on, in scene pixels, at a burial phase (null for the Vigil): each part
 * where the sinking stone is over the whole step of BURIAL_CUT_STEPS that holds the phase, clipped at the plinth top;
 * the mound and the ground it sits on; the Priest; the name; the pennant. Following the stone leaves no column above it
 * (spec judge-path, requirement 6).
 */
export function buryingRegions(g: GravePlan, phase: number | null): Rect[] {
  const scale = g.rect.w / CELL_WIDTH;
  const at = (r: Rect): Rect => ({ x: g.rect.x + r.x * scale, y: g.rect.y + r.y * scale, w: r.w * scale, h: r.h * scale });
  let sinkLo = 0;
  let sinkHi = 0;
  if (phase !== null) {
    const p = Number.isFinite(phase) ? Math.min(1, Math.max(0, phase)) : 0;
    const k = Math.min(BURIAL_CUT_STEPS - 1, Math.floor(p * BURIAL_CUT_STEPS));
    const p0 = k / BURIAL_CUT_STEPS;
    const p1 = (k + 1) / BURIAL_CUT_STEPS;
    // The sink is piecewise linear in the phase: its extremes over the step lie at the step's ends or at a bend.
    const samples = [p0, p1, ...BURIAL_BENDS.filter((b) => b > p0 && b < p1)].map(burialFrame);
    sinkLo = Math.min(...samples.map((f) => f.sink));
    sinkHi = Math.max(...samples.map((f) => f.sink));
  }
  const out: Rect[] = [];
  for (const part of FORM_PARTS[g.shape]) {
    const top = part.y + sinkLo * BURIAL_SINK_PX;
    // A burial clips its stone at the plinth top; a Vigil draws the stone where it stands, unclipped.
    const bottom = phase === null ? part.y + part.h : Math.min(part.y + part.h + sinkHi * BURIAL_SINK_PX, PLINTH_TOP);
    if (bottom > top) out.push(at({ x: part.x, y: top, w: part.w, h: bottom - top }));
  }
  out.push(at(MOUND_BOX), ...PRIEST_PARTS.map(at), labelRect(g));
  if (g.marker) out.push(at(MARKER_BOX));
  return out;
}

/** The phases where the burial's sink bends: it reaches the bottom, then starts back up. */
const BURIAL_BENDS = [0.35, 0.65] as const;

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
    // A dimmed Possessed grave is left out of the Halo while a filter is set (spec clean-site, design C3).
    if (g.dimmed) continue;
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
    // Cut where a checked token can sit: each grave's drawn parts and name, and
    // the Art box of a grave whose burial, Vigil or Burst plays (spec cemetery-undead-fixes, bug 1).
    for (const g of plan.graves) {
      // A grave whose burial plays is cut by its burial regions below, which follow the sinking stone; its parts at
      // rest would leave a column where the stone was (spec judge-path, requirement 6).
      if (g.burial !== null) continue;
      const parts = formParts(g);
      if (parts.some((p) => intersects(p, reach))) {
        parted.push(g);
        cuts.push(...parts);
      }
    }
    partCount = cuts.length;
    // The selection ring and the focus outline are not cut: each sits on its own ink casing, so the gold never sits
    // on the Halo (spec judge-path, requirement 4).
    for (const g of plan.graves) add(labelRect(g));
    for (const i of playingGraves(plan)) {
      const g = plan.graves[i];
      if (g === undefined) continue;
      if (plan.burst !== null && plan.burst.startMs !== null && plan.burst.index === i) {
        add(artRect(g));
        continue;
      }
      // A burial or a Vigil: the stone sinks inside its own columns down to the plinth top, a mound shows and the
      // Priest walks and reads. Only those are cut, so the Halo's edge still follows the grave.
      for (const r of buryingRegions(g, g.burial)) add(r);
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

/** How far a cut reaches past its edge in either model of the soft edge. */
const CUT_REACH = Math.max(HALO_FEATHER, HALO_GROW + 4 * HALO_BLUR);
const BUCKET = 64;
const buckets = new WeakMap<readonly Rect[], Map<string, Rect[]>>();

/**
 * The cuts that can touch a point: a cut farther than CUT_REACH changes nothing there. Kept in grid buckets per mask,
 * in mask order, so the product over them equals the product over every cut.
 */
function cutsNear(mask: HaloMask, x: number, y: number): readonly Rect[] {
  let grid = buckets.get(mask.cuts);
  if (grid === undefined) {
    grid = new Map();
    for (const c of mask.cuts) {
      const i0 = Math.floor((c.x - CUT_REACH) / BUCKET);
      const i1 = Math.floor((c.x + c.w + CUT_REACH) / BUCKET);
      const j0 = Math.floor((c.y - CUT_REACH) / BUCKET);
      const j1 = Math.floor((c.y + c.h + CUT_REACH) / BUCKET);
      for (let i = i0; i <= i1; i += 1) {
        for (let j = j0; j <= j1; j += 1) {
          const k = `${String(i)},${String(j)}`;
          const list = grid.get(k);
          if (list === undefined) grid.set(k, [c]);
          else list.push(c);
        }
      }
    }
    buckets.set(mask.cuts, grid);
  }
  return grid.get(`${String(Math.floor(x / BUCKET))},${String(Math.floor(y / BUCKET))}`) ?? [];
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
  for (const c of cutsNear(mask, x, y)) {
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
