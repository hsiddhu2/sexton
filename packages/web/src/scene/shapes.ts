import type { State } from "@sexton/api";

export type ShapeId = "upright" | "cross" | "cracked" | "open";

export interface ShapeDef {
  readonly d: string;
  readonly detail: string | null;
  readonly tiltDegrees: number;
}

/** Four distinct outlines in a 64 by 64 box. The tilt is a constant of the shape, never per package. */
export const SHAPES: Record<ShapeId, ShapeDef> = {
  upright: { d: "M12 60 V26 A20 20 0 0 1 52 26 V60 Z", detail: null, tiltDegrees: 0 },
  cross: { d: "M26 60 V38 H10 V26 H26 V6 H38 V26 H54 V38 H38 V60 Z", detail: null, tiltDegrees: 0 },
  cracked: {
    d: "M12 60 V22 L24 14 L32 24 L42 12 L52 20 V60 Z",
    detail: "M30 24 L26 38 L34 46 L30 60",
    tiltDegrees: -8,
  },
  open: { d: "M4 40 Q32 16 60 40 Z M8 44 H56 V60 H8 Z", detail: null, tiltDegrees: 0 },
};

export const SHAPE_BY_STATE: Record<State, ShapeId> = {
  Alive: "upright",
  Restless: "upright",
  Haunted: "cross",
  Dead: "cracked",
  Possessed: "open",
};

/** 12 by 14 ghost outline. */
export const GHOST_PATH = "M0 14 V6 A6 6 0 0 1 12 6 V14 L9 11 L6 14 L3 11 Z";

const shapeCache = new Map<ShapeId, Path2D>();
const detailCache = new Map<ShapeId, Path2D>();
let ghostCache: Path2D | null = null;

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

export function ghostPath(): Path2D {
  ghostCache ??= new Path2D(GHOST_PATH);
  return ghostCache;
}
