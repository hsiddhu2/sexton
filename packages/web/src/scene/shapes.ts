import type { State } from "@sexton/api";

export type ShapeId = "rounded" | "tilted" | "cross" | "cracked" | "open" | "unmarked";

export interface ShapeDef {
  readonly d: string;
  readonly detail: string | null;
  readonly tiltDegrees: number;
  /** Pit rectangle, filled with the pit token before the shape, and its rim outline path. Null for solid shapes. */
  readonly pit: { readonly x: number; readonly y: number; readonly w: number; readonly h: number; readonly rim: string } | null;
}

/** Four distinct outlines in a 64 by 64 box. The tilt is a constant of the shape, never per package. */
export const SHAPES: Record<ShapeId, ShapeDef> = {
  // Alive: a tall rounded stone, upright (a party hat and flowers are its Costume). Spec cemetery-undead, 3.5.
  rounded: { d: "M14 60 V24 A18 18 0 0 1 50 24 V60 Z", detail: null, tiltDegrees: 0, pit: null },
  // Restless: a broad stone, tilted (a hand claws out of the dirt in front of it). Spec cemetery-undead, 3.3.
  tilted: { d: "M12 60 V26 A20 20 0 0 1 52 26 V60 Z", detail: null, tiltDegrees: -6, pit: null },
  cross: { d: "M26 60 V38 H10 V26 H26 V6 H38 V26 H54 V38 H38 V60 Z", detail: null, tiltDegrees: 0, pit: null },
  cracked: {
    d: "M12 60 V30 A20 20 0 0 1 52 30 V60 Z",
    detail: "M30 24 L26 38 L34 46 L30 60",
    tiltDegrees: -8,
    pit: null,
  },
  // Open grave: a dark pit sunk into the ground, a mound of earth beside it, the lid tilted off. Lid and mound take the state colour.
  open: {
    d: "M2 58 L8 30 L30 38 L24 62 Z M48 60 Q56 36 64 60 Z",
    detail: null,
    tiltDegrees: 0,
    pit: { x: 16, y: 42, w: 30, h: 18, rim: "M16 42 H46 V60 H16 Z" },
  },
  // Not-published form: a low mound with no stone. Not a form of any State.
  unmarked: { d: "M8 60 Q8 44 32 44 Q56 44 56 60 Z", detail: null, tiltDegrees: 0, pit: null },
};

export interface SolidBox {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export interface Speck {
  readonly x: number;
  readonly y: number;
}

/** Axis-aligned rectangles that lie inside each shape. Every speck sits inside one. */
export const SOLID_BOXES: Record<ShapeId, readonly SolidBox[]> = {
  rounded: [{ x: 14, y: 24, w: 36, h: 36 }],
  tilted: [{ x: 12, y: 26, w: 40, h: 34 }],
  cross: [
    { x: 26, y: 6, w: 12, h: 54 },
    { x: 10, y: 26, w: 44, h: 12 },
  ],
  cracked: [{ x: 12, y: 30, w: 40, h: 30 }],
  open: [{ x: 10, y: 40, w: 14, h: 14 }],
  unmarked: [{ x: 12, y: 50, w: 40, h: 10 }],
};

/** Stone texture: 1 by 1 shape unit squares, the same for every grave of a shape. */
export const SPECKS: Record<ShapeId, readonly Speck[]> = {
  rounded: [
    { x: 20, y: 32 },
    { x: 40, y: 30 },
    { x: 28, y: 42 },
    { x: 42, y: 48 },
    { x: 20, y: 52 },
    { x: 34, y: 54 },
  ],
  tilted: [
    { x: 18, y: 34 },
    { x: 40, y: 32 },
    { x: 28, y: 42 },
    { x: 44, y: 48 },
    { x: 20, y: 52 },
    { x: 34, y: 54 },
  ],
  cross: [
    { x: 30, y: 12 },
    { x: 33, y: 20 },
    { x: 28, y: 44 },
    { x: 34, y: 52 },
    { x: 14, y: 30 },
    { x: 46, y: 32 },
  ],
  cracked: [
    { x: 16, y: 32 },
    { x: 44, y: 30 },
    { x: 18, y: 48 },
    { x: 42, y: 44 },
    { x: 46, y: 54 },
    { x: 36, y: 36 },
  ],
  open: [
    { x: 12, y: 42 },
    { x: 18, y: 44 },
    { x: 14, y: 48 },
    { x: 20, y: 50 },
  ],
  unmarked: [
    { x: 20, y: 52 },
    { x: 30, y: 50 },
    { x: 42, y: 54 },
    { x: 36, y: 57 },
  ],
};

export const SHAPE_BY_STATE: Record<State, ShapeId> = {
  Alive: "rounded",
  Restless: "tilted",
  Haunted: "cross",
  Dead: "cracked",
  Possessed: "open",
};

/**
 * The original Ghost (spec cemetery-undead, 3.6): a rounded body with a wavy hem, 24 by 28. Its oval eyes and blush
 * are GHOST_EYES and GHOST_BLUSH. Original art: never a logo or a mark of another product.
 */
export const GHOST_PATH = "M0 28 V12 A12 12 0 0 1 24 12 V28 Q21 24 18 28 Q15 24 12 28 Q9 24 6 28 Q3 24 0 28 Z";
/** Eye ovals as [cx, cy, rx, ry], ghost-relative. */
export const GHOST_EYES: readonly (readonly [number, number, number, number])[] = [
  [8, 12, 2, 3],
  [16, 12, 2, 3],
];
/** Blush ovals as [cx, cy, rx, ry], ghost-relative. */
export const GHOST_BLUSH: readonly (readonly [number, number, number, number])[] = [
  [5, 17, 2, 1],
  [19, 17, 2, 1],
];

/** Cell-relative rounded rectangle for the Plinth. Same for every State. */
export const PLINTH_PATH = "M49 172 H143 A5 5 0 0 1 148 177 V193 A5 5 0 0 1 143 198 H49 A5 5 0 0 1 44 193 V177 A5 5 0 0 1 49 172 Z";

const shapeCache = new Map<ShapeId, Path2D>();
const rimCache = new Map<ShapeId, Path2D>();
const detailCache = new Map<ShapeId, Path2D>();
let ghostCache: Path2D | null = null;
let plinthCache: Path2D | null = null;

export function shapePath(id: ShapeId): Path2D {
  let path = shapeCache.get(id);
  if (path === undefined) {
    path = new Path2D(SHAPES[id].d);
    shapeCache.set(id, path);
  }
  return path;
}

export function detailPath(id: ShapeId): Path2D | null {
  const detail = SHAPES[id].detail;
  if (detail === null) return null;
  let path = detailCache.get(id);
  if (path === undefined) {
    path = new Path2D(detail);
    detailCache.set(id, path);
  }
  return path;
}

export function pitRimPath(id: ShapeId): Path2D | null {
  const pit = SHAPES[id].pit;
  if (pit === null) return null;
  let path = rimCache.get(id);
  if (path === undefined) {
    path = new Path2D(pit.rim);
    rimCache.set(id, path);
  }
  return path;
}

export function ghostPath(): Path2D {
  ghostCache ??= new Path2D(GHOST_PATH);
  return ghostCache;
}

export function plinthPath(): Path2D {
  plinthCache ??= new Path2D(PLINTH_PATH);
  return plinthCache;
}
