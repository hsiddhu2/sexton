import type { PackageHealth, State } from "@sexton/api";
import type { FormView } from "../time/form-at.js";
import { colourFor, PALETTE, type Theme } from "./palette.js";
import { unitClusters, unitStars } from "./scenery-seed.js";
import { SHAPE_BY_STATE, type ShapeId } from "./shapes.js";
import { dancers, type Beat } from "./motion.js";
import { OVERLAY_BAND } from "./overlay-band.js";
import { TIER_DRAW_ORDER, TIER_FRONT_FIRST_ORDER, TIER_GAP, TIER_OF, TIER_SCALE, type TierId } from "./tiers.js";

export type { Theme } from "./palette.js";
export type { ShapeId } from "./shapes.js";

export const CELL_WIDTH = 192;
export const CELL_HEIGHT = 224;
export const PADDING = 16;
/** Spec cemetery-undead: room for the harvest moon, the church and the bats. */
export const SKY_HEIGHT = 120;
/** Stars sit in the top band of the sky only, as before. */
export const STAR_BAND_HEIGHT = 80;
/** The tallest sky: when the graves fit in the fit height, the sky grows so the graves stand at the bottom. */
export const MAX_SKY_HEIGHT = 420;
export const MIN_WIDTH = CELL_WIDTH + 2 * PADDING;
export const MAX_INSCRIPTIONS_PACKAGES = 60;
export const INSCRIPTION_UNITS = 16;
export const GHOST_STEPS = 48;
export const GHOST_STEP_MS = 100;
export const GHOST_AMPLITUDE = 6;
export const GHOST_WIDTH = 24;
export const GHOST_HEIGHT = 28;
export const MAX_BACKING = 16384;

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/** Cell-relative geometry of one Grave. Constants, never per package. */
export const GRAVE_GEOMETRY = {
  shapeX: 8,
  shapeY: 7,
  shapeScale: 2.75,
  plinth: { x: 44, y: 172, w: 104, h: 26, r: 5 },
  ghostX: 84,
  ghostTop: 12,
  inscription: { x: 96, baseline: 190, maxWidth: 96, font: '600 15px Inter, system-ui, sans-serif' },
} as const;

export interface GravePlan {
  readonly index: number;
  readonly name: string;
  readonly state: State;
  readonly rect: Rect;
  readonly shape: ShapeId;
  readonly fill: string;
  readonly ghost: { readonly x: number; readonly y: number } | null;
  readonly inscription: string | null;
  /** True for the Not-published form (an unmarked mound). */
  readonly pending: boolean;
  /** True when a pull request marker is drawn beside the grave. Never true for a pending grave. */
  readonly marker: boolean;
  /** Burial phase in [0, 1], or null when no burial plays on this grave. */
  readonly burial: number | null;
  /** True while a filter is set and the grave is of another State, or Not published (spec clean-site, 2.7). */
  readonly dimmed: boolean;
}

export const STAR_AREA = 800;
/** Bat positions as [fraction of the width, y in a 120 px sky]. They scale with the sky height. */
const BAT_SPOTS: readonly (readonly [number, number])[] = [
  [0.2, 40],
  [0.5, 26],
  [0.56, 50],
  [0.62, 32],
];
export const GRASS_CLUSTER_WIDTH = 96;
export const GRASS_TILE_HEIGHT = 224;
export const BOTTOM_LINE_MIN_GAP = 10;
export const BOTTOM_LINE_OFFSET = 26;

export interface Star {
  readonly x: number;
  readonly y: number;
  readonly size: 1 | 2;
  readonly layer: "far" | "near";
}

/** Tile-relative rectangle: x, y, width, height. */
export type TuftRect = readonly [number, number, number, number];

/** Three blades from one base. Tile-relative: y is measured from the top of the line band. */
export interface Tuft {
  readonly x: number;
  readonly base: number;
  readonly h: number;
  readonly dir: -1 | 1;
  readonly tone: "dark" | "light";
  readonly rects: readonly TuftRect[];
}

export interface Scenery {
  readonly skyHeight: number;
  readonly horizonY: number;
  readonly moon: { readonly x: number; readonly y: number; readonly r: number };
  readonly fog: { readonly y: number; readonly h: number };
  readonly groundFade: number;
  readonly stars: readonly Star[];
  readonly grass: readonly Tuft[];
  /** Four bats at width-only positions (spec cemetery-undead, 6.2). */
  readonly bats: readonly { readonly x: number; readonly y: number }[];
}

export interface ScenePlan {
  readonly width: number;
  readonly height: number;
  /** Columns of the front Tier (cell width 192 at fit scale 1), or 0 with no packages. */
  readonly columns: number;
  /** Rows over all Tiers. */
  readonly rows: number;
  /** The y of the base of every grave row, over all Tiers, top to bottom: grass grows along these lines. */
  readonly rowLines: readonly number[];
  /** Grave indices in paint order: the back Tier first, the front Tier last. */
  readonly paintOrder: readonly number[];
  /** The Dead packages whose skeleton dances in its windows (spec cemetery-undead, 4.3, 4.4). */
  readonly dancers: ReadonlySet<string>;
  /** True under Reduced motion: every Character holds one still Pose. */
  readonly reducedMotion: boolean;
  /** The hovered or focused grave, which gets the Lantern glow, or null. */
  readonly lantern: number | null;
  readonly groundHeight: number;
  readonly theme: Theme;
  readonly graves: readonly GravePlan[];
  readonly ring: Rect | null;
  /** The hover ring on the grave under the pointer when it is not the Selected one, or null (spec clean-site, 3.13). */
  readonly hoverRing: Rect | null;
  readonly scenery: Scenery;
  /** The selected grave, which holds the ring, or null (spec cemetery-undead-2, A3). */
  readonly selected: number | null;
  /** The replay Burst: its grave and its start on the page clock, or a null start for the final pose (B3). */
  readonly burst: { readonly index: number; readonly startMs: number | null } | null;
  /** The burial Priest: its grave and the burial phase, or a null phase for the Vigil (B4). */
  readonly priest: { readonly index: number; readonly phase: number | null } | null;
  /** The start of the Load moment on the page clock, or null (B5). */
  readonly riseStartMs: number | null;
  /** The music track's beat the Characters' Pose clock follows while Music is on, else null or absent (14.3). */
  readonly beat?: Beat | null;
}

export interface SceneInput {
  readonly packages: readonly PackageHealth[];
  readonly width: number;
  readonly theme: Theme;
  readonly selectedIndex: number | null;
  readonly ghostPhase: number;
  /** Free height of the viewport under the header. Unreadable values count as 0. */
  readonly minHeight?: number;
  /**
   * The height the graves should end within: the free height less a Footer bar that stays in view.
   * When the graves fit, the sky grows so they stand at the bottom of it. Absent or unreadable, the sky is SKY_HEIGHT.
   */
  readonly fitHeight?: number;
  /** A replay: its one grave is drawn full size, at up to REPLAY_SCALE (requirement 5.8). */
  readonly replay?: boolean;
  /** One Form per grave, in triage order; undefined entries keep the scan Form. */
  readonly forms?: readonly (FormView | undefined)[];
  /** One flag per grave: a pull request was opened for it. */
  readonly marks?: readonly boolean[];
  readonly burial?: { readonly index: number; readonly phase: number } | null;
  /** Spec cemetery-undead, 4.2. */
  readonly reducedMotion?: boolean;
  /** The hovered or focused grave index, for the Lantern glow. */
  readonly lantern?: number | null;
  /** Spec cemetery-undead-2, B3: the replay Burst on a grave, from its start on the page clock. */
  readonly burst?: { readonly index: number; readonly startMs: number } | null;
  /** Spec cemetery-undead-2, B4: the Priest on a grave, at a burial phase, or a null phase for the Vigil. */
  readonly priest?: { readonly index: number; readonly phase: number | null } | null;
  /** Spec cemetery-undead-2, B5: the Load moment's start on the page clock. */
  readonly rise?: { readonly startMs: number } | null;
  /** Spec clean-site, 2.7: the names of the graves drawn at the dim alpha while a filter is set. */
  readonly dimmed?: ReadonlySet<string>;
  /** Spec clean-site, 3.13: the grave under the pointer, which gets the hover ring unless it is the Selected one. */
  readonly hover?: number | null;
  /** Spec clean-site, 14.3: the music beat, while Music is on. */
  readonly beat?: Beat | null;
  /** Spec clean-site, 15.3: the Narrow layout stacks the Tiers front first, two front graves to a row where they fit. */
  readonly frontFirst?: boolean;
}

const round2 = (value: number): number => Math.round(value * 100) / 100;

/** Pure. Integer phase to a vertical offset in CSS pixels, rounded to two decimals. */
export function ghostOffset(phase: number): number {
  return round2(GHOST_AMPLITUDE * Math.sin((2 * Math.PI * phase) / GHOST_STEPS)) + 0;
}

function makeTuft(x: number, base: number, h: number, dir: -1 | 1, tone: "dark" | "light"): Tuft {
  const rects: TuftRect[] = [];
  for (let k = 0; k < 3; k += 1) {
    const bh = k === 1 ? h : h - 2;
    const lean = k === 1 ? dir : k === 0 ? -1 : 1;
    const bx = x + (k - 1) * 2;
    const low = Math.ceil(bh / 2);
    rects.push([bx, base - low, 1, low], [bx + lean, base - bh, 1, Math.floor(bh / 2)]);
  }
  return { x, base, h, dir, tone, rects };
}

/** Pure. Decoration that depends on the layout width and the sky height only. */
export function sceneryFor(width: number, skyHeight: number = SKY_HEIGHT): Scenery {
  if (lastScenery !== null && lastScenery.width === width && lastScenery.sky === skyHeight) return lastScenery.scenery;
  const sky = skyHeight;
  const band = Math.max(STAR_BAND_HEIGHT, sky - 40);
  // The backing store never exceeds MAX_BACKING CSS pixels, so decoration is capped there too.
  const w = Number.isNaN(width) ? 0 : Math.min(width, MAX_BACKING);
  const starSpan = Math.max(w - 1, 0);
  const stars = unitStars(Math.floor((w * band) / STAR_AREA)).map((s, i): Star => {
    const near = i % 3 === 0;
    return {
      x: Math.floor(s.u * starSpan),
      y: 4 + Math.floor(s.v * (band - 11)),
      size: near ? 2 : 1,
      layer: near ? "near" : "far",
    };
  });
  const span = Math.max(w - 7, 0);
  const grass: Tuft[] = [];
  for (const cluster of unitClusters(Math.floor(w / GRASS_CLUSTER_WIDTH))) {
    const centre = 3 + Math.floor(cluster.cu * span);
    for (const t of cluster.tufts) {
      const x = Math.min(Math.max(centre + Math.floor((t.off - 0.5) * 48), 3), Math.max(w - 4, 3));
      grass.push(makeTuft(x, 8 + Math.floor(t.v * 9), 4 + Math.floor(t.r * 5), t.r2 < 0.5 ? -1 : 1, t.r3 < 0.5 ? "dark" : "light"));
    }
  }
  // The harvest moon grows with a taller sky, as in the approved design, and always fits inside it.
  const moonR = Math.min(Math.floor(width / 5) - 4, Math.max(52, Math.floor(sky * 0.3)));
  const scenery: Scenery = {
    skyHeight: sky,
    horizonY: sky,
    moon: { x: Math.floor(width - width / 5), y: sky > SKY_HEIGHT ? Math.round(sky * 0.4) : 62, r: moonR },
    fog: { y: sky - 40, h: 160 },
    groundFade: 640,
    stars,
    grass,
    bats: BAT_SPOTS.map(([u, y]) => ({ x: Math.floor(u * Math.max(w - 28, 0)), y: Math.round((y * sky) / SKY_HEIGHT) })),
  };
  lastScenery = { width, sky, scenery };
  return scenery;
}

let lastScenery: { readonly width: number; readonly sky: number; readonly scenery: Scenery } | null = null;

/** The scale of a replay's one grave, before it is fitted to the width and the fit height. */
export const REPLAY_SCALE = 1.8;
/** The smallest scale of a replay's grave, on a short screen only (spec clean-site, 3.29). */
export const REPLAY_MIN_FIT_SCALE = 0.8;
/** The shortest Scene a replay's grave fits at REPLAY_MIN_FIT_SCALE: the sky, the padding and the cell (331.2 px). */
export const REPLAY_MIN_SCENE_HEIGHT = Math.ceil(SKY_HEIGHT + 2 * PADDING + CELL_HEIGHT * REPLAY_MIN_FIT_SCALE);
/** How far the open grave's lid reaches past its cell, in cell units. */
export const REPLAY_OVERHANG = 60;

/**
 * How far apart graves of a Tier may spread to fill a row, as a multiple of the Tier cell width. The middle
 * and back caps give the front pitch of 205 px, so their rows line up with the front columns (spec cemetery-undead-2, A5).
 */
export const PITCH_CAP: Readonly<Record<TierId, number>> = { front: 1.07, middle: 1.334, back: 1.667 };

/** A ghost means one or more advisories, and nothing else (5.1). */
export function hasGhost(pkg: PackageHealth): boolean {
  const signal = pkg.signals.advisories;
  return signal.available && signal.value.length > 0;
}

export function inscriptionFor(name: string, packageCount: number): string | null {
  if (packageCount > MAX_INSCRIPTIONS_PACKAGES) return null;
  if (name.length <= INSCRIPTION_UNITS) return name;
  let cut = name.slice(0, INSCRIPTION_UNITS - 1);
  const last = cut.charCodeAt(cut.length - 1);
  if (last >= 0xd800 && last <= 0xdbff) cut = cut.slice(0, -1);
  return `${cut}…`;
}

/** Pure. The cell size of a Tier: the front cell scaled, rounded to whole pixels; `fit` scales all three alike. */
export function tierCell(tier: TierId, fit = 1): { readonly w: number; readonly h: number } {
  const s = TIER_SCALE[tier] * fit;
  return { w: Math.round(CELL_WIDTH * s), h: Math.round(CELL_HEIGHT * s) };
}

/**
 * The smallest fit scale (spec clean-site, task 11): every Tier keeps its own scale, and all three shrink together so a
 * scan fits the Scene's height (Wide and Middle layouts) or stands two front graves to a row (Narrow layout).
 */
export const MIN_FIT_SCALE = 0.4;
/** The smallest fit scale of the Narrow layout, unchanged by the lower floor of the Wide and Middle layouts. */
export const NARROW_MIN_FIT_SCALE = 0.6;
/** The fit scales tried, largest first. */
const FIT_STEP = 0.02;
/** The front graves the Narrow layout stands in one row, as in the approved design. */
export const NARROW_FRONT_COLUMNS = 2;

/** Pure. The height the graves of `counts` need at a fit scale: the Tiers' rows, the padding and the smallest sky. */
function neededHeight(counts: Readonly<Record<TierId, number>>, inner: number, fit: number): number {
  let h = 2 * PADDING + Math.max(SKY_HEIGHT, OVERLAY_BAND);
  let tiers = 0;
  for (const tier of TIER_DRAW_ORDER) {
    const count = counts[tier];
    if (count === 0) continue;
    const cell = tierCell(tier, fit);
    const cols = Math.max(1, Math.floor(inner / cell.w));
    h += Math.ceil(count / cols) * cell.h;
    tiers += 1;
  }
  return h + Math.max(0, tiers - 1) * TIER_GAP;
}

/**
 * Pure. The fit scale of a layout (spec clean-site, task 11). The Narrow layout (`frontFirst`) takes the largest scale
 * that stands NARROW_FRONT_COLUMNS front graves in a row, never under NARROW_MIN_FIT_SCALE. Otherwise, with a fit height, the
 * largest scale from 1 down to MIN_FIT_SCALE whose graves fit in it; 1 when none does (a large scan scrolls as before)
 * or with no fit height.
 */
export function fitScale(counts: Readonly<Record<TierId, number>>, width: number, fitHeight: number, frontFirst: boolean): number {
  // The same inner width the rows are planned in: the columns of a Tier are floor(inner / cell width).
  const inner = width - 2 * PADDING;
  if (!Number.isFinite(inner)) return 1;
  if (frontFirst) {
    // Half a pixel short of the half width, so the rounded front cell still leaves two columns.
    const two = (inner / NARROW_FRONT_COLUMNS - 0.5) / CELL_WIDTH;
    return Math.max(NARROW_MIN_FIT_SCALE, Math.min(1, Math.floor(two * 1000) / 1000));
  }
  if (!(fitHeight > 0)) return 1;
  const steps = Math.round((1 - MIN_FIT_SCALE) / FIT_STEP);
  for (let k = 0; k <= steps; k += 1) {
    const fit = Math.round((1 - k * FIT_STEP) * 100) / 100;
    if (neededHeight(counts, inner, fit) <= fitHeight) return fit;
  }
  return 1;
}

/** Pure. The cell of a replay's one grave: REPLAY_SCALE, or less so it fits the width and the fit height. */
export function replayCell(width: number, fit: number | undefined): { readonly w: number; readonly h: number } {
  // The open grave's lid lies up to REPLAY_OVERHANG cell units past each side, so the width leaves room for it.
  const byWidth = (Math.min(width, MAX_BACKING) - 2 * PADDING) / (CELL_WIDTH + 2 * REPLAY_OVERHANG);
  const byHeight = typeof fit === "number" && Number.isFinite(fit) && fit > 0 ? (fit - SKY_HEIGHT - 2 * PADDING) / CELL_HEIGHT : REPLAY_SCALE;
  const s = Math.max(1, Math.min(REPLAY_SCALE, byWidth, byHeight));
  // A short Scene (spec clean-site, 3.29) shrinks the grave below 1, never under REPLAY_MIN_FIT_SCALE; the width alone
  // never takes it under 1, so the Narrow layout is unchanged.
  if (byHeight < 1) {
    const short = Math.max(REPLAY_MIN_FIT_SCALE, Math.min(byHeight, s));
    return { w: Math.floor(CELL_WIDTH * short), h: Math.floor(CELL_HEIGHT * short) };
  }
  return { w: Math.floor(CELL_WIDTH * s), h: Math.floor(CELL_HEIGHT * s) };
}

export function planScene(input: SceneInput): ScenePlan {
  const width = Number.isFinite(input.width) ? Math.max(MIN_WIDTH, Math.floor(input.width)) : MIN_WIDTH;
  const n = input.packages.length;
  const reducedMotion = input.reducedMotion === true;
  if (n === 0) {
    const scenery = sceneryFor(width);
    return { width, height: 0, columns: 0, rows: 0, rowLines: [], paintOrder: [], dancers: new Set(), reducedMotion, lantern: null, groundHeight: 0, theme: input.theme, graves: [], ring: null, hoverRing: null, scenery, selected: null, burst: null, priest: null, riseStartMs: null };
  }
  // Tiers follow the scan-date State, so a grave never moves while the scrubber does (spec cemetery-undead, 5.6).
  const byTier: Record<TierId, number[]> = { front: [], middle: [], back: [] };
  input.packages.forEach((pkg, index) => {
    byTier[TIER_OF[pkg.state]].push(index);
  });
  // Rectangles are planned from the top of the field, then moved down by the sky height.
  const local: Rect[] = new Array<Rect>(n);
  const localLines: number[] = [];
  const paintOrder: number[] = [];
  let y = PADDING;
  let first = true;
  const span = Math.min(width, MAX_BACKING) - 2 * PADDING;
  const replayOne = n === 1 && input.replay === true;
  const frontFirst = input.frontFirst === true;
  const fitIn = typeof input.fitHeight === "number" && Number.isFinite(input.fitHeight) ? Math.floor(input.fitHeight) : 0;
  const counts = { front: byTier.front.length, middle: byTier.middle.length, back: byTier.back.length };
  const fit = replayOne ? 1 : fitScale(counts, width, fitIn, frontFirst);
  // The Narrow layout stacks the Tiers front first, so the worst graves come first from the top (15.3).
  for (const tier of frontFirst ? TIER_FRONT_FIRST_ORDER : TIER_DRAW_ORDER) {
    const members = byTier[tier];
    if (members.length === 0) continue;
    if (!first) y += TIER_GAP;
    first = false;
    const cell = replayOne ? replayCell(width, input.fitHeight) : tierCell(tier, fit);
    const cols = Math.max(1, Math.floor((width - 2 * PADDING) / cell.w));
    const tierRows = Math.ceil(members.length / cols);
    members.forEach((index, k) => {
      // Each row is centred in the drawable width (the backing store stops at MAX_BACKING), and its graves spread
      // apart up to PITCH_CAP to fill the row, as in the approved design. The rectangle stays one cell, so none overlap.
      const row = Math.floor(k / cols);
      const inRow = Math.min(cols, members.length - row * cols);
      const pitch = Math.max(cell.w, Math.min(Math.floor(cell.w * PITCH_CAP[tier]), Math.floor(span / inRow)));
      const used = (inRow - 1) * pitch + cell.w;
      const left = PADDING + Math.max(0, Math.floor((span - used) / 2));
      local[index] = { x: left + (k % cols) * pitch, y: y + row * cell.h, w: cell.w, h: cell.h };
      paintOrder.push(index);
    });
    for (let r = 1; r <= tierRows; r += 1) localLines.push(y + r * cell.h);
    y += tierRows * cell.h;
  }
  const field = y + PADDING;
  // The sky grows to fill the fit height, so the graves stand at the bottom above the Footer bar.
  // At least OVERLAY_BAND of sky stays above the graves for the help line and the date badge (spec clean-site, 2.12).
  const sky = Math.min(MAX_SKY_HEIGHT, Math.max(SKY_HEIGHT, OVERLAY_BAND, fitIn - field));
  const scenery = sceneryFor(width, sky);
  const rects: Rect[] = local.map((r) => ({ x: r.x, y: r.y + sky, w: r.w, h: r.h }));
  const rowLines = localLines.map((line) => line + sky);
  y = field - PADDING + sky;
  const columns = Math.max(1, Math.floor((width - 2 * PADDING) / tierCell("front", fit).w));
  const rows = rowLines.length;
  const height = y + PADDING;
  const free = typeof input.minHeight === "number" && Number.isFinite(input.minHeight) ? Math.max(0, Math.floor(input.minHeight)) : 0;
  const groundHeight = Math.max(height, free);
  const graves = input.packages.map((pkg, index): GravePlan => {
    const rect = rects[index] as Rect;
    const scale = rect.w / CELL_WIDTH;
    const form = input.forms?.[index];
    const pending = form !== undefined && form.state === null;
    const state = form?.state ?? pkg.state;
    const showGhost = form === undefined ? hasGhost(pkg) : form.ghost && !pending;
    const baseName = form?.version === undefined ? pkg.name : `${pkg.name} ${form.version}`;
    const burial = input.burial;
    return {
      index,
      name: pkg.name,
      state: pkg.state,
      rect,
      shape: pending ? "unmarked" : SHAPE_BY_STATE[state],
      fill: pending ? PALETTE[input.theme].border : colourFor(state, input.theme),
      ghost: showGhost
        ? { x: rect.x + GRAVE_GEOMETRY.ghostX * scale, y: rect.y + GRAVE_GEOMETRY.ghostTop * scale + ghostOffset(input.ghostPhase) }
        : null,
      inscription: inscriptionFor(baseName, n),
      pending,
      marker: !pending && input.marks?.[index] === true,
      burial: !pending && burial != null && burial.index === index ? Math.min(1, Math.max(0, burial.phase)) : null,
      dimmed: input.dimmed?.has(pkg.name) === true,
    };
  });
  const selected = input.selectedIndex;
  const selectedGrave = selected !== null && Number.isInteger(selected) ? graves[selected] : undefined;
  const ring: Rect | null =
    selectedGrave === undefined
      ? null
      : { x: selectedGrave.rect.x + 2, y: selectedGrave.rect.y + 2, w: selectedGrave.rect.w - 4, h: selectedGrave.rect.h - 4 };
  const hover = typeof input.hover === "number" && Number.isInteger(input.hover) ? graves[input.hover] : undefined;
  const hoverRing: Rect | null =
    hover === undefined || hover.index === selectedGrave?.index
      ? null
      : { x: hover.rect.x + 2, y: hover.rect.y + 2, w: hover.rect.w - 4, h: hover.rect.h - 4 };
  const lantern = typeof input.lantern === "number" && Number.isInteger(input.lantern) && input.lantern >= 0 && input.lantern < n ? input.lantern : null;
  const deadNames = input.packages.filter((p) => p.state === "Dead").map((p) => p.name);
  const inRange = (i: unknown): i is number => typeof i === "number" && Number.isInteger(i) && i >= 0 && i < n;
  const burstIn = input.burst;
  // Under Reduced motion the Burst stores no start, and the draw shows its final pose (requirement 9.5).
  const burst = burstIn != null && inRange(burstIn.index) && !graves[burstIn.index]?.pending
    ? { index: burstIn.index, startMs: reducedMotion || !Number.isFinite(burstIn.startMs) ? null : burstIn.startMs }
    : null;
  const priestIn = input.priest;
  const priest = priestIn != null && inRange(priestIn.index) && !graves[priestIn.index]?.pending
    ? { index: priestIn.index, phase: priestIn.phase === null || reducedMotion ? null : Math.min(1, Math.max(0, Number.isFinite(priestIn.phase) ? priestIn.phase : 0)) }
    : null;
  const riseStartMs = input.rise != null && !reducedMotion && Number.isFinite(input.rise.startMs) ? input.rise.startMs : null;
  return {
    width, height, columns, rows, rowLines, paintOrder, dancers: dancers(deadNames), reducedMotion, lantern, groundHeight, theme: input.theme, graves, ring, hoverRing, scenery,
    selected: selectedGrave === undefined ? null : selectedGrave.index,
    burst,
    priest,
    riseStartMs,
    ...(input.beat != null && !reducedMotion ? { beat: input.beat } : {}),
  };
}

export function backingStore(cssWidth: number, cssHeight: number, dpr: number): { scale: number; width: number; height: number } {
  const scale = Math.min(
    2,
    dpr > 0 ? dpr : 1,
    MAX_BACKING / Math.max(cssWidth, 1),
    MAX_BACKING / Math.max(cssHeight, 1),
  );
  return {
    scale,
    width: Math.max(1, Math.floor(cssWidth * scale)),
    height: Math.max(1, Math.floor(cssHeight * scale)),
  };
}
