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

const r = (x: number, y: number, w: number, h: number): Rect => ({ x, y, w, h });

/**
 * The Part boxes of each Form (spec cemetery-undead-fixes, bug 1): the 8-unit grid blocks, merged into runs, that
 * any mark of the Form touches at rest (its stone, pit, lid, Character at every Pose, Costume), without shadow, Ghost
 * and pennant, at the Tier scales and the replay scale. They follow the drawing, so the Halo is cut only where the
 * grave is. Measured by the outline probe of test/art-box.test.ts, which fails when a mark leaves them.
 */
export const FORM_PARTS: Readonly<Record<ShapeId, readonly Rect[]>> = {
  rounded: [r(88, 0, 16, 16), r(72, 16, 64, 8), r(56, 24, 88, 8), r(48, 32, 104, 24), r(40, 56, 112, 16), r(48, 72, 104, 88), r(40, 160, 120, 16), r(40, 176, 112, 24)],
  tilted: [r(80, 16, 48, 8), r(64, 24, 80, 8), r(56, 32, 96, 8), r(48, 40, 104, 8), r(48, 48, 112, 8), r(40, 56, 120, 16), r(48, 72, 112, 8), r(48, 80, 120, 8), r(40, 88, 136, 16), r(40, 104, 120, 32), r(40, 136, 112, 16), r(40, 152, 136, 8), r(32, 160, 152, 16), r(40, 176, 112, 24)],
  cross: [r(88, 0, 8, 8), r(112, 0, 8, 8), r(80, 8, 40, 40), r(32, 48, 128, 8), r(40, 56, 120, 16), r(32, 72, 128, 8), r(80, 80, 40, 88), r(40, 168, 112, 32)],
  cracked: [r(72, 16, 48, 8), r(64, 24, 72, 8), r(56, 32, 88, 8), r(48, 40, 104, 8), r(40, 48, 112, 24), r(40, 72, 120, 32), r(48, 104, 112, 16), r(40, 120, 120, 8), r(40, 128, 128, 8), r(48, 136, 120, 24), r(56, 160, 104, 8), r(40, 168, 112, 32)],
  open: [r(80, 0, 32, 16), r(64, 16, 64, 8), r(48, 24, 96, 8), r(32, 32, 128, 8), r(24, 40, 144, 8), r(16, 48, 160, 8), r(24, 56, 144, 8), r(40, 64, 112, 8), r(48, 72, 96, 8), r(56, 80, 88, 8), r(56, 88, 80, 8), r(-16, 96, 16, 8), r(72, 96, 48, 8), r(-24, 104, 40, 8), r(80, 104, 32, 8), r(-24, 112, 56, 8), r(72, 112, 56, 8), r(-32, 120, 72, 8), r(64, 120, 72, 8), r(-40, 128, 200, 8), r(-40, 136, 208, 8), r(-32, 144, 200, 8), r(-24, 152, 192, 8), r(-8, 160, 184, 8), r(0, 168, 184, 8), r(16, 176, 136, 8), r(32, 184, 120, 8), r(40, 192, 112, 8)],
  unmarked: [r(24, 120, 8, 8), r(88, 120, 16, 8), r(160, 120, 8, 8), r(24, 128, 144, 48), r(40, 176, 112, 24)],
};

/** The Part boxes of a grave's shown Form in scene pixels, with its Ghost and pennant boxes when it has them. */
export function formParts(grave: Pick<GravePlan, "rect" | "shape" | "ghost" | "marker">): Rect[] {
  const out = FORM_PARTS[grave.shape].map((p) => scaledBox(grave, p));
  if (grave.ghost !== null) out.push(scaledBox(grave, GHOST_BOX));
  if (grave.marker) out.push(scaledBox(grave, MARKER_BOX));
  return out;
}

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
