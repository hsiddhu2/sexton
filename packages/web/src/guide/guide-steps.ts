// The Guide's four steps and where its card sits (spec judge-path, requirements 1.4, 1.14 to 1.16). Pure.
import type { Rect } from "../scene/layout.js";
import { intersects } from "../scene/art-box.js";
import { REPLAY_BUTTON_TEXT, REPLAY_GROUP_LABEL } from "../replay/replay-ids.js";

export type AnchorId = "fix-first-grave" | "replay-axios";

export interface GuideStep {
  readonly title: string;
  readonly body: string;
  readonly anchor: AnchorId;
}

export const GUIDE_STEPS: readonly GuideStep[] = [
  {
    title: "Hover a grave",
    body: "Each grave is one dependency. Its shape and colour show its state. Hover this one, or Tab to it, to see why.",
    anchor: "fix-first-grave",
  },
  { title: "Open its drawer", body: "Press it, or press Enter on it, to open the drawer.", anchor: "fix-first-grave" },
  {
    title: "Read the evidence",
    body: "The drawer shows every signal with its source and date, and the pull request Sexton would open, with its body.",
    anchor: "fix-first-grave",
  },
  {
    title: REPLAY_GROUP_LABEL,
    body: `Press "${REPLAY_BUTTON_TEXT.axios}" to watch a real compromise unfold, stop by stop.`,
    anchor: "replay-axios",
  },
];

/** The card's width, the gap to its Anchor and the margin it keeps from the viewport's edges, in CSS pixels. */
export const GUIDE_W = 300;
export const GUIDE_GAP = 12;
export const GUIDE_MARGIN = 8;

export type GuideSide = "right" | "left" | "above" | "below" | "dock" | "dock-forced";

export interface GuideViewport {
  readonly width: number;
  readonly height: number;
  /** The bottom of a pinned header, or null when the header has scrolled away or is not pinned. */
  readonly headerBottom: number | null;
  /** The top of the pinned Footer bar, or null when it is not pinned. */
  readonly footerTop: number | null;
}

export interface GuidePlace {
  readonly left: number;
  readonly top: number;
  readonly side: GuideSide;
}

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(v, hi));

/** The slide step, in CSS pixels, when a side place moves along its Anchor to clear a name. */
export const GUIDE_SLIDE = 8;

/**
 * Pure. The side places of one side, in the order they are tried: beside the Anchor, starting level with it and
 * sliding along it in GUIDE_SLIDE steps while the card still overlaps the Anchor's span, each kept inside the viewport.
 */
export function guideCandidates(anchor: Rect, viewport: GuideViewport, height: number, side: "right" | "left" | "above" | "below"): GuidePlace[] {
  const m = GUIDE_MARGIN;
  const w = Math.min(GUIDE_W, viewport.width - 2 * m);
  const maxLeft = viewport.width - w - m;
  const maxTop = viewport.height - height - m;
  const out: GuidePlace[] = [];
  if (side === "right" || side === "left") {
    const left = side === "right" ? anchor.x + anchor.w + GUIDE_GAP : anchor.x - GUIDE_GAP - w;
    const tops = new Set<number>();
    // From level with the Anchor's top, down and then up, while the card still faces part of the Anchor.
    for (let t = anchor.y; t <= anchor.y + anchor.h; t += GUIDE_SLIDE) tops.add(clamp(t, m, maxTop));
    for (let t = anchor.y - GUIDE_SLIDE; t + height >= anchor.y; t -= GUIDE_SLIDE) tops.add(clamp(t, m, maxTop));
    for (const top of tops) out.push({ left, top, side });
    return out;
  }
  const top = side === "above" ? anchor.y - GUIDE_GAP - height : anchor.y + anchor.h + GUIDE_GAP;
  const lefts = new Set<number>();
  for (let l = anchor.x; l <= anchor.x + anchor.w; l += GUIDE_SLIDE) lefts.add(clamp(l, m, maxLeft));
  for (let l = anchor.x - GUIDE_SLIDE; l + w >= anchor.x; l -= GUIDE_SLIDE) lefts.add(clamp(l, m, maxLeft));
  for (const left of lefts) out.push({ left, top, side });
  return out;
}

/** Pure. The card's rectangle at a place. */
export function guideRect(place: GuidePlace, viewport: Pick<GuideViewport, "width">, height: number): Rect {
  return { x: place.left, y: place.top, w: Math.min(GUIDE_W, viewport.width - 2 * GUIDE_MARGIN), h: height };
}

/**
 * Pure. The first place beside, above or below the Anchor (sides in that order, each sliding along the Anchor) that
 * lies inside the viewport and clear of every Name label and other obstacle. Else the dock: the band nearest the
 * viewport's bottom (above a pinned Footer bar), moving up in GUIDE_SLIDE steps to just below a pinned header, that is
 * clear of them and of the Anchor. Else, the one case that may cover a name, the bottom band.
 */
export function placeGuide(anchor: Rect, viewport: GuideViewport, height: number, labels: readonly Rect[]): GuidePlace {
  const m = GUIDE_MARGIN;
  const w = Math.min(GUIDE_W, viewport.width - 2 * m);
  const maxLeft = viewport.width - w - m;
  const maxTop = viewport.height - height - m;
  const inside = (p: GuidePlace): boolean => p.left >= m && p.left <= maxLeft && p.top >= m && p.top <= maxTop;
  const clear = (p: GuidePlace): boolean => !labels.some((l) => intersects(l, guideRect(p, viewport, height)));
  for (const side of ["right", "left", "above", "below"] as const) {
    for (const p of guideCandidates(anchor, viewport, height, side)) if (inside(p) && clear(p)) return p;
  }
  return dockGuide(anchor, viewport, height, labels);
}

/** Pure. The dock of placeGuide: the lowest band clear of every obstacle and the Anchor, else the bottom band. */
export function dockGuide(anchor: Rect, viewport: GuideViewport, height: number, labels: readonly Rect[]): GuidePlace {
  const m = GUIDE_MARGIN;
  const w = Math.min(GUIDE_W, viewport.width - 2 * m);
  const left = clamp(anchor.x, m, viewport.width - w - m);
  const lo = (viewport.headerBottom ?? 0) + m;
  const hi = Math.max(lo, (viewport.footerTop ?? viewport.height) - height - m);
  const blocked = [...labels, anchor];
  for (const top of dockTops(lo, hi)) {
    const card = { x: left, y: top, w, h: height };
    if (!blocked.some((l) => intersects(l, card))) return { left, top, side: "dock" };
  }
  return { left, top: hi, side: "dock-forced" };
}

/** Pure. The dock's tops, from the bottom band up to the top band. */
export function dockTops(lo: number, hi: number): number[] {
  const out: number[] = [];
  for (let t = hi; t > lo; t -= GUIDE_SLIDE) out.push(t);
  out.push(lo);
  return out;
}

export interface GuideArrow {
  /** The card's edge the notch sits on, facing the Anchor. */
  readonly edge: "left" | "right" | "top" | "bottom";
  /** Along that edge, from the card's left or top, in CSS pixels. */
  readonly offset: number;
}

/** The notch keeps this far from the card's corners. */
const ARROW_INSET = 18;

/**
 * Pure. The notch on the card's edge that faces its Anchor, pointing at the Anchor's middle where the card faces it;
 * null for a dock (the card is not beside its Anchor, so a notch would point at whatever lies between them) and when
 * the Anchor's middle is too near a corner.
 */
export function guideArrow(place: GuidePlace, anchor: Rect, viewport: Pick<GuideViewport, "width">, height: number): GuideArrow | null {
  const card = guideRect(place, viewport, height);
  const along = (centre: number, start: number, length: number): number | null => {
    const o = centre - start;
    return o < ARROW_INSET || o > length - ARROW_INSET ? null : o;
  };
  const cx = anchor.x + anchor.w / 2;
  const cy = anchor.y + anchor.h / 2;
  // Facing part of the Anchor: the notch points at the middle of the part it faces.
  const midY = (Math.max(card.y, anchor.y) + Math.min(card.y + card.h, anchor.y + anchor.h)) / 2;
  const midX = (Math.max(card.x, anchor.x) + Math.min(card.x + card.w, anchor.x + anchor.w)) / 2;
  const edge: GuideArrow["edge"] | null =
    place.side === "right" ? "left" : place.side === "left" ? "right" : place.side === "above" ? "bottom" : place.side === "below" ? "top" : null;
  if (edge === null) return null;
  const offset = edge === "left" || edge === "right" ? along(Number.isFinite(midY) ? midY : cy, card.y, card.h) : along(anchor.x + anchor.w < card.x || anchor.x > card.x + card.w ? cx : midX, card.x, card.w);
  return offset === null ? null : { edge, offset };
}
