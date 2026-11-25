// Where a Bubble goes (spec cemetery-undead-2, requirement 7.4, and the owner's fix of 25 Nov): next to its speaking
// grave, with a tail that ends on the speaker inside its cell, in the speaker's column where it fits, inside the Scene,
// clear of every name label and of the other Bubble. Pure.
import { FORM_BOX, formRects, GHOST_BOX, intersects, labelRect } from "../scene/art-box.js";
import { CELL_WIDTH, MAX_BACKING, type GravePlan, type Rect, type ScenePlan } from "../scene/layout.js";

/** The widest Bubble, and the narrowest. A Bubble is as wide as its speaker's column, between the two. */
export const BUBBLE_MAX_W = 220;
export const BUBBLE_MIN_W = 160;
/** The tail's length and half its base, in CSS pixels. */
export const TAIL = 10;
/** Half the tail's width: the 14 px square turned 45 degrees spans 19.8 px, so 10 covers it. */
export const TAIL_HALF = 10;
/** Text metrics for the height: 13.5 px type, 17 px lines, 8 by 12 padding, a generous average glyph width. */
const LINE_H = 17;
const PAD_Y = 8;
const PAD_X = 12;
const GLYPH_W = 7.6;
/** The speaker's head in cell units: the stone's centre line. */
const HEAD_X = 96;

export type TailSide = "down" | "left" | "right";

export interface BubbleGeometry {
  readonly rect: Rect;
  /** Where the tail ends, on the speaker, in scene pixels, and the side of the Bubble it leaves from. */
  readonly tail: { readonly x: number; readonly y: number; readonly side: TailSide };
  /** The tail's own rectangle, which also stays clear of every name label. */
  readonly tailRect: Rect;
}

/** Pure. The height a line needs at a width: whole lines of text plus the padding. */
export function bubbleHeight(line: string, width: number): number {
  const perLine = Math.max(1, Math.floor((width - 2 * PAD_X) / GLYPH_W));
  return Math.ceil(line.length / perLine + 0.25) * LINE_H + 2 * PAD_Y;
}

/** Pure. A Bubble's width for a speaker: its column's width, kept between BUBBLE_MIN_W and BUBBLE_MAX_W. */
export function bubbleWidth(grave: Pick<GravePlan, "rect">): number {
  return Math.min(BUBBLE_MAX_W, Math.max(BUBBLE_MIN_W, grave.rect.w));
}

function tailRectOf(side: TailSide, x: number, y: number): Rect {
  if (side === "down") return { x: x - TAIL_HALF, y: y - TAIL, w: 2 * TAIL_HALF, h: TAIL };
  if (side === "left") return { x, y: y - TAIL_HALF, w: TAIL, h: 2 * TAIL_HALF };
  return { x: x - TAIL, y: y - TAIL_HALF, w: TAIL, h: 2 * TAIL_HALF };
}

/** The candidate places for a Bubble, in order: above the speaker in its column, then beside it, right, then left. */
export function bubbleCandidates(grave: GravePlan, line: string, sceneWidth: number): BubbleGeometry[] {
  const s = grave.rect.w / CELL_WIDTH;
  const core = FORM_BOX[grave.shape];
  const cell = grave.rect;
  const w = bubbleWidth(grave);
  const h = bubbleHeight(line, w);
  const top = grave.ghost !== null ? Math.min(core.y, GHOST_BOX.y) : core.y;
  const headX = cell.x + HEAD_X * s;
  // The tail ends just inside the cell's top edge, on the speaker's head.
  const headY = cell.y + Math.max(2, top) * s;
  const right = Math.min(cell.x + cell.w - 1, cell.x + Math.min(core.x + core.w, CELL_WIDTH) * s);
  const left = Math.max(cell.x + 1, cell.x + core.x * s);
  const sideY = cell.y + (top + 40) * s;
  const maxX = Math.min(sceneWidth, MAX_BACKING) - w;
  const centredX = Math.min(Math.max(0, cell.x + cell.w / 2 - w / 2), maxX);
  const out: BubbleGeometry[] = [];
  const add = (rect: Rect, side: TailSide, x: number, y: number): void => {
    out.push({ rect, tail: { x, y, side }, tailRect: tailRectOf(side, x, y) });
  };
  add({ x: centredX, y: headY - TAIL - h, w, h }, "down", Math.min(Math.max(headX, centredX + TAIL_HALF + 6), centredX + w - TAIL_HALF - 6), headY);
  add({ x: right + TAIL, y: sideY - h / 2, w, h }, "left", right, sideY);
  add({ x: left - TAIL - w, y: sideY - h / 2, w, h }, "right", left, sideY);
  return out;
}

/**
 * The first candidate inside the Scene and clear of every name label and of what is taken, else null. A place that
 * also keeps off every other grave's art (its stone, Character, Ghost and pennant) wins over one that does not, so a
 * Bubble is not read as another grave's (visual critic round 10).
 */
export function placeBubble(plan: ScenePlan, index: number, line: string, taken: readonly Rect[]): BubbleGeometry | null {
  const grave = plan.graves[index];
  if (grave === undefined) return null;
  const width = Math.min(plan.width, MAX_BACKING);
  const candidates = bubbleCandidates(grave, line, plan.width).filter(({ rect, tailRect }) => {
    if (rect.x < 0 || rect.y < 0 || rect.x + rect.w > width || rect.y + rect.h > plan.groundHeight) return false;
    if (plan.graves.some((g) => intersects(rect, labelRect(g)) || intersects(tailRect, labelRect(g)))) return false;
    return !taken.some((t) => intersects(rect, t) || intersects(tailRect, t));
  });
  const others = plan.graves.filter((g) => g.index !== index).flatMap((g) => formRects(g));
  return candidates.find(({ rect }) => !others.some((r) => intersects(rect, r))) ?? candidates[0] ?? null;
}
