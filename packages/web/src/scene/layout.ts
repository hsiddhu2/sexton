import type { PackageHealth, State } from "@sexton/api";
import { colourFor, type Theme } from "./palette.js";
import { SHAPE_BY_STATE, type ShapeId } from "./shapes.js";

export type { Theme } from "./palette.js";
export type { ShapeId } from "./shapes.js";

export const CELL_WIDTH = 96;
export const CELL_HEIGHT = 112;
export const PADDING = 16;
export const MIN_WIDTH = 128;
export const MAX_INSCRIPTIONS_PACKAGES = 60;
export const INSCRIPTION_UNITS = 14;
const MAX_BACKING = 16384;

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

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

export interface ScenePlan {
  readonly width: number;
  readonly height: number;
  readonly columns: number;
  readonly theme: Theme;
  readonly graves: readonly GravePlan[];
  readonly ring: Rect | null;
}

export interface SceneInput {
  readonly packages: readonly PackageHealth[];
  readonly width: number;
  readonly theme: Theme;
  readonly selectedIndex: number | null;
  readonly ghostPhase: 0 | 1;
}

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
  if (n === 0) {
    return { width, height: 0, columns: 0, theme: input.theme, graves: [], ring: null };
  }
  const columns = Math.max(1, Math.floor((width - 2 * PADDING) / CELL_WIDTH));
  const rows = Math.ceil(n / columns);
  const height = 2 * PADDING + rows * CELL_HEIGHT;
  const graves = input.packages.map((pkg, index): GravePlan => {
    const rect: Rect = {
      x: PADDING + (index % columns) * CELL_WIDTH,
      y: PADDING + Math.floor(index / columns) * CELL_HEIGHT,
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
      ghost: hasGhost(pkg) ? { x: rect.x + 42, y: rect.y + 4 + 4 * input.ghostPhase } : null,
      inscription: inscriptionFor(pkg.name, n),
    };
  });
  const selected = input.selectedIndex;
  const selectedGrave = selected !== null && Number.isInteger(selected) ? graves[selected] : undefined;
  const ring: Rect | null =
    selectedGrave === undefined
      ? null
      : { x: selectedGrave.rect.x + 2, y: selectedGrave.rect.y + 2, w: selectedGrave.rect.w - 4, h: selectedGrave.rect.h - 4 };
  return { width, height, columns, theme: input.theme, graves, ring };
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
