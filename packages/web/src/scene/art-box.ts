// The boxes that keep every grave's name readable (spec cemetery-undead-2, requirement 1). Pure.
import { CELL_WIDTH, GRAVE_GEOMETRY, type GravePlan, type Rect } from "./layout.js";
import type { ShapeId } from "./shapes.js";

/**
 * Everything one grave draws but its glow lies in this box, in cell units (cell 192 by 224): inside its own cell's
 * vertical band and at most 40 cell units past either side. A neighbour's name label starts 44 cell units into its
 * cell, and rows never overlap, so no grave reaches another grave's name. It is 220 high, not 224: a Tier cell is
 * rounded to whole pixels, so 224 units at the drawing scale can pass the cell's bottom by under a pixel. Nothing is
 * drawn below 219.
 */
export const ART_BOX: Rect = { x: -40, y: 0, w: 272, h: 220 };

/** The name label: the plinth rectangle. */
export const LABEL_BOX: Rect = { x: GRAVE_GEOMETRY.plinth.x, y: GRAVE_GEOMETRY.plinth.y, w: GRAVE_GEOMETRY.plinth.w, h: GRAVE_GEOMETRY.plinth.h };

/**
 * What each Form draws at rest, without its shadow, Ghost and pennant, in cell units: the union of the drawing over
 * every Pose at the Tier scales 0.64, 0.8 and 1 and the replay scale, rounded out to whole units. Measured by the
 * bounds probe of test/art-box.test.ts, which fails when a drawing leaves its boxes. The shadow is not cut from the
 * Halo: it is a dark oval that no checked token sits on.
 */
export const FORM_BOX: Readonly<Record<ShapeId, Rect>> = {
  rounded: { x: 44, y: 1, w: 110, h: 198 },
  tilted: { x: 37, y: 20, w: 142, h: 179 },
  cross: { x: 39, y: 8, w: 121, h: 191 },
  cracked: { x: 42, y: 21, w: 122, h: 178 },
  open: { x: -39, y: 3, w: 218, h: 196 },
  unmarked: { x: 28, y: 126, w: 136, h: 73 },
};

/** The Ghost at either drift extreme, at every Tier scale (the drift in cell units grows as the scale shrinks). */
export const GHOST_BOX: Rect = { x: 80, y: 0, w: 48, h: 76 };

/** The pull request pennant. */
export const MARKER_BOX: Rect = { x: 160, y: 124, w: 16, h: 44 };

/** A cell-unit box placed on a grave's rectangle, in scene pixels. */
export function scaledBox(grave: Pick<GravePlan, "rect">, box: Rect): Rect {
  const s = grave.rect.w / CELL_WIDTH;
  return { x: grave.rect.x + box.x * s, y: grave.rect.y + box.y * s, w: box.w * s, h: box.h * s };
}

/** The Art box of a grave in scene pixels. */
export function artRect(grave: Pick<GravePlan, "rect">): Rect {
  return scaledBox(grave, ART_BOX);
}

/** The name label of a grave in scene pixels. */
export function labelRect(grave: Pick<GravePlan, "rect">): Rect {
  return scaledBox(grave, LABEL_BOX);
}

/**
 * The Form boxes of a grave's shown Form in scene pixels: its core, then its Ghost and its pennant when it has them.
 */
export function formRects(grave: Pick<GravePlan, "rect" | "shape" | "ghost" | "marker">): Rect[] {
  const out = [scaledBox(grave, FORM_BOX[grave.shape])];
  if (grave.ghost !== null) out.push(scaledBox(grave, GHOST_BOX));
  if (grave.marker) out.push(scaledBox(grave, MARKER_BOX));
  return out;
}

/** True when the open interiors of two rectangles meet. Touching edges do not count. */
export function intersects(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}
