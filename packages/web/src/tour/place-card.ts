// Where the Tour card goes (spec clean-site, design C11, requirement 13.6): below its target, else above it, else
// beside it, always inside the viewport with a 12 px margin. Pure.

export interface Box {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export interface Size {
  readonly width: number;
  readonly height: number;
}

export interface CardPlace {
  readonly x: number;
  readonly y: number;
  readonly width: number;
}

export const CARD_MARGIN = 12;
export const CARD_MAX_WIDTH = 320;
/** The card's height as the placement counts it: room for the step line, the title, two lines of text and the buttons. */
export const CARD_HEIGHT = 190;
/** The gap between the card and its target. */
export const CARD_GAP = 14;

const clamp = (v: number, lo: number, hi: number): number => Math.min(Math.max(v, lo), Math.max(lo, hi));

/**
 * Pure. The card's top left and width for a target box in a viewport. The card is min(320, width − 24) wide and
 * `cardHeight` tall (its measured height, else CARD_HEIGHT); its box always lies inside the viewport less
 * CARD_MARGIN on each side, as long as the viewport is at least the card height + 24 tall.
 */
export function placeCard(target: Box, viewport: Size, cardHeight: number = CARD_HEIGHT): CardPlace {
  const vw = Number.isFinite(viewport.width) ? Math.max(0, viewport.width) : 0;
  const vh = Number.isFinite(viewport.height) ? Math.max(0, viewport.height) : 0;
  const height = Number.isFinite(cardHeight) && cardHeight > 0 ? cardHeight : CARD_HEIGHT;
  const width = Math.max(0, Math.min(CARD_MAX_WIDTH, vw - 2 * CARD_MARGIN));
  const maxX = vw - CARD_MARGIN - width;
  const maxY = vh - CARD_MARGIN - height;
  const t = {
    x: Number.isFinite(target.x) ? target.x : 0,
    y: Number.isFinite(target.y) ? target.y : 0,
    w: Number.isFinite(target.w) ? Math.max(0, target.w) : 0,
    h: Number.isFinite(target.h) ? Math.max(0, target.h) : 0,
  };
  const alignedX = clamp(t.x, CARD_MARGIN, maxX);
  const below = t.y + t.h + CARD_GAP;
  if (below <= maxY) return { x: alignedX, y: Math.max(CARD_MARGIN, below), width };
  const above = t.y - CARD_GAP - height;
  if (above >= CARD_MARGIN) return { x: alignedX, y: Math.min(above, maxY), width };
  // Beside: to the right of the target when it fits, else to its left, else over it; the top follows the target.
  const right = t.x + t.w + CARD_GAP;
  const left = t.x - CARD_GAP - width;
  const x = right <= maxX ? right : left >= CARD_MARGIN ? left : alignedX;
  return { x: clamp(x, CARD_MARGIN, maxX), y: clamp(t.y + 20, CARD_MARGIN, maxY), width };
}
