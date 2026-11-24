import type { PackageHealth, State } from "@sexton/api";
import type { FormView } from "../time/form-at.js";
import { colourFor, PALETTE, type Theme } from "./palette.js";
import { unitClusters, unitStars } from "./scenery-seed.js";
import { SHAPE_BY_STATE, type ShapeId } from "./shapes.js";
import { dancers } from "./motion.js";
import { TIER_DRAW_ORDER, TIER_GAP, TIER_OF, TIER_SCALE, type TierId } from "./tiers.js";

export type { Theme } from "./palette.js";
export type { ShapeId } from "./shapes.js";

export const CELL_WIDTH = 192;
export const CELL_HEIGHT = 224;
export const PADDING = 16;
/** Spec cemetery-undead: room for the harvest moon, the church and the bats. */
export const SKY_HEIGHT = 120;
/** Stars sit in the top band of the sky only, as before. */
export const STAR_BAND_HEIGHT = 80;
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
  shapeX: 32,
  shapeY: 48,
  shapeScale: 2,
  plinth: { x: 44, y: 172, w: 104, h: 26, r: 5 },
  ghostX: 84,
  ghostTop: 12,
  inscription: { x: 96, baseline: 190, maxWidth: 96, font: '15px "IM Fell English SC", Georgia, serif' },
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
}

export const STAR_AREA = 800;
/** Bat positions as [fraction of the width, y]. Fixed, so they depend on the width only. */
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
  /** Columns of the front Tier (cell width 192), or 0 with no packages. */
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
  readonly scenery: Scenery;
}

export interface SceneInput {
  readonly packages: readonly PackageHealth[];
  readonly width: number;
  readonly theme: Theme;
  readonly selectedIndex: number | null;
  readonly ghostPhase: number;
  /** Free height of the viewport under the header. Unreadable values count as 0. */
  readonly minHeight?: number;
  /** One Form per grave, in triage order; undefined entries keep the scan Form. */
  readonly forms?: readonly (FormView | undefined)[];
  /** One flag per grave: a pull request was opened for it. */
  readonly marks?: readonly boolean[];
  readonly burial?: { readonly index: number; readonly phase: number } | null;
  /** Spec cemetery-undead, 4.2. */
  readonly reducedMotion?: boolean;
  /** The hovered or focused grave index, for the Lantern glow. */
  readonly lantern?: number | null;
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

/** Pure. Decoration that depends on the layout width only. */
export function sceneryFor(width: number): Scenery {
  if (lastScenery !== null && lastScenery.width === width) return lastScenery.scenery;
  // The backing store never exceeds MAX_BACKING CSS pixels, so decoration is capped there too.
  const w = Number.isNaN(width) ? 0 : Math.min(width, MAX_BACKING);
  const starSpan = Math.max(w - 1, 0);
  const stars = unitStars(Math.floor((w * STAR_BAND_HEIGHT) / STAR_AREA)).map((s, i): Star => {
    const near = i % 3 === 0;
    return {
      x: Math.floor(s.u * starSpan),
      y: 4 + Math.floor(s.v * 69),
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
  const scenery: Scenery = {
    skyHeight: SKY_HEIGHT,
    horizonY: SKY_HEIGHT,
    moon: { x: Math.floor(width - width / 5), y: 62, r: Math.min(52, Math.floor(width / 5) - 4) },
    fog: { y: SKY_HEIGHT - 40, h: 160 },
    groundFade: 640,
    stars,
    grass,
    bats: BAT_SPOTS.map(([u, y]) => ({ x: Math.floor(u * Math.max(w - 28, 0)), y })),
  };
  lastScenery = { width, scenery };
  return scenery;
}

let lastScenery: { readonly width: number; readonly scenery: Scenery } | null = null;

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

/** Pure. The cell size of a Tier: the front cell scaled, rounded to whole pixels. */
export function tierCell(tier: TierId): { readonly w: number; readonly h: number } {
  const s = TIER_SCALE[tier];
  return { w: Math.round(CELL_WIDTH * s), h: Math.round(CELL_HEIGHT * s) };
}

export function planScene(input: SceneInput): ScenePlan {
  const width = Number.isFinite(input.width) ? Math.max(MIN_WIDTH, Math.floor(input.width)) : MIN_WIDTH;
  const n = input.packages.length;
  const scenery = sceneryFor(width);
  const reducedMotion = input.reducedMotion === true;
  if (n === 0) {
    return { width, height: 0, columns: 0, rows: 0, rowLines: [], paintOrder: [], dancers: new Set(), reducedMotion, lantern: null, groundHeight: 0, theme: input.theme, graves: [], ring: null, scenery };
  }
  // Tiers follow the scan-date State, so a grave never moves while the scrubber does (spec cemetery-undead, 5.6).
  const byTier: Record<TierId, number[]> = { front: [], middle: [], back: [] };
  input.packages.forEach((pkg, index) => {
    byTier[TIER_OF[pkg.state]].push(index);
  });
  const rects: Rect[] = new Array<Rect>(n);
  const rowLines: number[] = [];
  const paintOrder: number[] = [];
  let y = SKY_HEIGHT + PADDING;
  let first = true;
  for (const tier of TIER_DRAW_ORDER) {
    const members = byTier[tier];
    if (members.length === 0) continue;
    if (!first) y += TIER_GAP;
    first = false;
    const cell = tierCell(tier);
    const cols = Math.max(1, Math.floor((width - 2 * PADDING) / cell.w));
    const tierRows = Math.ceil(members.length / cols);
    members.forEach((index, k) => {
      // Each row is centred in the drawable width (the backing store stops at MAX_BACKING), as in the mockup.
      const row = Math.floor(k / cols);
      const inRow = Math.min(cols, members.length - row * cols);
      const span = Math.min(width, MAX_BACKING) - 2 * PADDING;
      const left = PADDING + Math.max(0, Math.floor((span - inRow * cell.w) / 2));
      rects[index] = { x: left + (k % cols) * cell.w, y: y + row * cell.h, w: cell.w, h: cell.h };
      paintOrder.push(index);
    });
    for (let r = 1; r <= tierRows; r += 1) rowLines.push(y + r * cell.h);
    y += tierRows * cell.h;
  }
  const columns = Math.max(1, Math.floor((width - 2 * PADDING) / CELL_WIDTH));
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
    };
  });
  const selected = input.selectedIndex;
  const selectedGrave = selected !== null && Number.isInteger(selected) ? graves[selected] : undefined;
  const ring: Rect | null =
    selectedGrave === undefined
      ? null
      : { x: selectedGrave.rect.x + 2, y: selectedGrave.rect.y + 2, w: selectedGrave.rect.w - 4, h: selectedGrave.rect.h - 4 };
  const lantern = typeof input.lantern === "number" && Number.isInteger(input.lantern) && input.lantern >= 0 && input.lantern < n ? input.lantern : null;
  const deadNames = input.packages.filter((p) => p.state === "Dead").map((p) => p.name);
  return { width, height, columns, rows, rowLines, paintOrder, dancers: dancers(deadNames), reducedMotion, lantern, groundHeight, theme: input.theme, graves, ring, scenery };
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
