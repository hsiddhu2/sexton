// The help line and the date badge sit in the Scene's sky band (spec clean-site, design C3, requirements 2.10 to
// 2.12). They are DOM elements over the canvas, so their rectangles are fixed here and planScene keeps at least
// OVERLAY_BAND px of sky above every grave: neither one ever covers an Art box. Pure.
import type { Rect } from "./layout.js";

/** The sky band, from the top of the Scene, that holds the two overlays. */
export const OVERLAY_BAND = 56;
/** The overlays' top and the help line's left inset, in CSS pixels. */
export const OVERLAY_TOP = 16;
export const HELP_LEFT = 20;
/** The tallest an overlay may be: one line of 13 px text, or the badge with its border and padding. */
export const OVERLAY_HEIGHT = 28;
export const HELP_MAX_WIDTH = 460;
export const BADGE_WIDTH = 240;

export interface OverlayRects {
  readonly help: Rect;
  readonly badge: Rect;
}

/** Pure. The help line (top left) and the date badge (top centre) in a Scene `width` px wide. */
export function overlayRects(width: number): OverlayRects {
  const w = Number.isFinite(width) ? Math.max(0, width) : 0;
  const helpWidth = Math.max(0, Math.min(HELP_MAX_WIDTH, w - 2 * HELP_LEFT));
  const badgeWidth = Math.min(BADGE_WIDTH, w);
  return {
    help: { x: HELP_LEFT, y: OVERLAY_TOP, w: helpWidth, h: OVERLAY_HEIGHT },
    badge: { x: Math.round((w - badgeWidth) / 2), y: OVERLAY_TOP, w: badgeWidth, h: OVERLAY_HEIGHT },
  };
}
