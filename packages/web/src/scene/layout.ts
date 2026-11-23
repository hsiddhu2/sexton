import type { PackageHealth, State } from "@sexton/api";
import { colourFor, type Theme } from "./palette.js";
import { unitStars, unitTufts } from "./scenery-seed.js";
import { SHAPE_BY_STATE, type ShapeId } from "./shapes.js";

export type { Theme } from "./palette.js";
export type { ShapeId } from "./shapes.js";

export const CELL_WIDTH = 192;
export const CELL_HEIGHT = 224;
export const PADDING = 16;
export const SKY_HEIGHT = 80;
export const MIN_WIDTH = CELL_WIDTH + 2 * PADDING;
export const MAX_INSCRIPTIONS_PACKAGES = 60;
export const INSCRIPTION_UNITS = 16;
export const GHOST_STEPS = 48;
export const GHOST_STEP_MS = 100;
export const GHOST_AMPLITUDE = 6;
export const GHOST_WIDTH = 24;
export const GHOST_HEIGHT = 28;
const MAX_BACKING = 16384;

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
  plinth: { x: 24, y: 168, w: 144, h: 40, r: 6 },
  ghostX: 84,
  ghostTop: 12,
  inscription: { x: 96, baseline: 193, maxWidth: 136, font: "14px monospace" },
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
}

export const STAR_AREA = 800;
export const GRASS_STEP = 14;
export const GRASS_TILE_HEIGHT = 224;

export interface Star {
  readonly x: number;
  readonly y: number;
  readonly size: 1 | 2;
  readonly layer: "far" | "near";
}

/** Tile-relative: y is measured from the top of the Tile. */
export interface Tuft {
  readonly x: number;
  readonly y: number;
  readonly h: number;
  readonly tone: "dark" | "light";
}

export interface Scenery {
  readonly skyHeight: number;
  readonly horizonY: number;
  readonly moon: { readonly x: number; readonly y: number; readonly r: number };
  readonly fog: { readonly y: number; readonly h: number };
  readonly groundFade: number;
  readonly stars: readonly Star[];
  readonly grass: readonly Tuft[];
}

export interface ScenePlan {
  readonly width: number;
  readonly height: number;
  readonly columns: number;
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
}

const round2 = (value: number): number => Math.round(value * 100) / 100;

/** Pure. Integer phase to a vertical offset in CSS pixels, rounded to two decimals. */
export function ghostOffset(phase: number): number {
  return round2(GHOST_AMPLITUDE * Math.sin((2 * Math.PI * phase) / GHOST_STEPS)) + 0;
}

/** Pure. Decoration that depends on the layout width only. */
export function sceneryFor(width: number): Scenery {
  if (lastScenery !== null && lastScenery.width === width) return lastScenery.scenery;
  // The backing store never exceeds MAX_BACKING CSS pixels, so decoration is capped there too.
  const w = Number.isNaN(width) ? 0 : Math.min(width, MAX_BACKING);
  const span = Math.max(w - 1, 0);
  const stars = unitStars(Math.floor((w * SKY_HEIGHT) / STAR_AREA)).map((s, i): Star => {
    const near = i % 3 === 0;
    return {
      x: Math.floor(s.u * span),
      y: 4 + Math.floor(s.v * 69),
      size: near ? 2 : 1,
      layer: near ? "near" : "far",
    };
  });
  const grass = unitTufts(Math.floor(w / GRASS_STEP)).map(
    (t): Tuft => ({
      x: Math.floor(t.u * span),
      y: Math.floor(t.v * (GRASS_TILE_HEIGHT - t.h + 1)),
      h: t.h,
      tone: t.tone,
    }),
  );
  const scenery: Scenery = {
    skyHeight: SKY_HEIGHT,
    horizonY: SKY_HEIGHT,
    moon: { x: Math.floor(width / 6), y: 40, r: 20 },
    fog: { y: 56, h: 96 },
    groundFade: 640,
    stars,
    grass,
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

export function planScene(input: SceneInput): ScenePlan {
  const width = Number.isFinite(input.width) ? Math.max(MIN_WIDTH, Math.floor(input.width)) : MIN_WIDTH;
  const n = input.packages.length;
  const scenery = sceneryFor(width);
  if (n === 0) {
    return { width, height: 0, columns: 0, theme: input.theme, graves: [], ring: null, scenery };
  }
  const columns = Math.max(1, Math.floor((width - 2 * PADDING) / CELL_WIDTH));
  const rows = Math.ceil(n / columns);
  const height = SKY_HEIGHT + PADDING + rows * CELL_HEIGHT + PADDING;
  const graves = input.packages.map((pkg, index): GravePlan => {
    const rect: Rect = {
      x: PADDING + (index % columns) * CELL_WIDTH,
      y: SKY_HEIGHT + PADDING + Math.floor(index / columns) * CELL_HEIGHT,
      w: CELL_WIDTH,
      h: CELL_HEIGHT,
    };
    return {
      index,
      name: pkg.name,
      state: pkg.state,
      rect,
      shape: SHAPE_BY_STATE[pkg.state],
      fill: colourFor(pkg.state, input.theme),
      ghost: hasGhost(pkg)
        ? { x: rect.x + GRAVE_GEOMETRY.ghostX, y: rect.y + GRAVE_GEOMETRY.ghostTop + ghostOffset(input.ghostPhase) }
        : null,
      inscription: inscriptionFor(pkg.name, n),
    };
  });
  const selected = input.selectedIndex;
  const selectedGrave = selected !== null && Number.isInteger(selected) ? graves[selected] : undefined;
  const ring: Rect | null =
    selectedGrave === undefined
      ? null
      : { x: selectedGrave.rect.x + 2, y: selectedGrave.rect.y + 2, w: selectedGrave.rect.w - 4, h: selectedGrave.rect.h - 4 };
  return { width, height, columns, theme: input.theme, graves, ring, scenery };
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
