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
 * The Part boxes of each Form (spec cemetery-undead-fixes, bug 1): the 4-unit grid blocks (spec judge-path, decision 6;
 * 8 units before), merged into runs, that
 * any mark of the Form touches at rest (its stone, pit, lid, Character at every Pose, Costume), without shadow, Ghost
 * and pennant, at the Tier scales and the replay scale. They follow the drawing, so the Halo is cut only where the
 * grave is. Measured by the outline probe of test/art-box.test.ts, which fails when a mark leaves them.
 */
export const FORM_PARTS: Readonly<Record<ShapeId, readonly Rect[]>> = {
  rounded: [r(88, 0, 16, 4), r(92, 4, 8, 4), r(88, 8, 16, 8), r(84, 16, 40, 4), r(76, 20, 56, 4), r(68, 24, 68, 4), r(60, 28, 80, 4), r(56, 32, 88, 4), r(56, 36, 92, 4), r(52, 40, 96, 4), r(52, 44, 100, 4), r(48, 48, 104, 12), r(44, 60, 108, 12), r(48, 72, 104, 88), r(44, 160, 112, 16), r(40, 176, 112, 20), r(44, 196, 104, 4)],
  tilted: [r(84, 20, 44, 4), r(72, 24, 64, 4), r(68, 28, 72, 4), r(60, 32, 84, 4), r(60, 36, 88, 4), r(56, 40, 96, 4), r(52, 44, 100, 4), r(48, 48, 108, 12), r(48, 60, 112, 4), r(44, 64, 116, 8), r(48, 72, 112, 4), r(44, 76, 116, 4), r(44, 80, 120, 8), r(44, 88, 124, 4), r(44, 92, 128, 8), r(44, 100, 120, 4), r(44, 104, 116, 8), r(44, 112, 112, 4), r(40, 116, 116, 16), r(40, 132, 112, 20), r(36, 152, 124, 8), r(164, 156, 4, 4), r(36, 160, 144, 4), r(36, 164, 140, 4), r(48, 168, 132, 4), r(44, 172, 136, 4), r(40, 176, 112, 20), r(44, 196, 104, 4)],
  cross: [r(80, 8, 4, 4), r(88, 8, 32, 4), r(80, 12, 40, 36), r(48, 48, 112, 4), r(36, 52, 124, 4), r(40, 56, 120, 16), r(36, 72, 120, 4), r(36, 76, 8, 4), r(80, 76, 40, 92), r(148, 76, 8, 4), r(48, 168, 96, 4), r(44, 172, 104, 4), r(40, 176, 112, 20), r(44, 196, 104, 4)],
  cracked: [r(72, 20, 4, 4), r(80, 20, 40, 4), r(72, 24, 56, 4), r(64, 28, 68, 4), r(60, 32, 80, 4), r(56, 36, 84, 4), r(52, 40, 92, 4), r(48, 44, 100, 8), r(44, 52, 108, 12), r(40, 64, 112, 12), r(40, 76, 116, 12), r(44, 88, 112, 16), r(44, 104, 116, 8), r(48, 112, 112, 8), r(44, 120, 116, 12), r(48, 132, 116, 8), r(52, 140, 112, 20), r(52, 160, 108, 8), r(48, 168, 96, 4), r(44, 172, 104, 4), r(40, 176, 112, 20), r(44, 196, 104, 4)],
  open: [r(80, 0, 4, 4), r(108, 0, 4, 4), r(80, 4, 12, 12), r(100, 4, 12, 12), r(76, 16, 16, 4), r(100, 16, 16, 4), r(68, 20, 56, 8), r(48, 28, 96, 4), r(40, 32, 28, 4), r(72, 32, 48, 4), r(124, 32, 28, 4), r(32, 36, 36, 4), r(76, 36, 40, 4), r(124, 36, 36, 4), r(28, 40, 40, 4), r(80, 40, 32, 20), r(124, 40, 40, 4), r(24, 44, 44, 16), r(124, 44, 44, 16), r(32, 60, 36, 4), r(76, 60, 40, 4), r(124, 60, 36, 4), r(40, 64, 112, 4), r(48, 68, 96, 8), r(52, 76, 88, 8), r(56, 84, 80, 4), r(60, 88, 72, 4), r(68, 92, 56, 4), r(-8, 96, 4, 4), r(72, 96, 48, 4), r(-16, 100, 20, 4), r(76, 100, 40, 4), r(-20, 104, 28, 4), r(80, 104, 32, 4), r(-20, 108, 36, 4), r(84, 108, 24, 4), r(-24, 112, 48, 4), r(76, 112, 40, 4), r(-24, 116, 52, 4), r(72, 116, 56, 4), r(-28, 120, 64, 4), r(68, 120, 64, 4), r(-32, 124, 72, 4), r(64, 124, 72, 4), r(-32, 128, 80, 4), r(64, 128, 80, 4), r(-36, 132, 92, 4), r(60, 132, 100, 4), r(-40, 136, 208, 4), r(-40, 140, 204, 4), r(-36, 144, 200, 4), r(-28, 148, 192, 4), r(-20, 152, 184, 4), r(-16, 156, 180, 4), r(-8, 160, 176, 4), r(-4, 164, 180, 4), r(4, 168, 176, 4), r(12, 172, 168, 4), r(16, 176, 136, 4), r(24, 180, 128, 4), r(28, 184, 124, 4), r(36, 188, 116, 4), r(40, 192, 112, 4), r(44, 196, 104, 4)],
  unmarked: [r(28, 124, 136, 52), r(40, 176, 112, 20), r(44, 196, 104, 4)],
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
