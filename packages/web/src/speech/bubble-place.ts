// Where a Bubble goes (spec cemetery-undead-2, requirement 7.4): inside the Scene, clear of every name label and of the
// other Bubble. Pure.
import { artRect, intersects, labelRect } from "../scene/art-box.js";
import { MAX_BACKING, type Rect, type ScenePlan } from "../scene/layout.js";

export const BUBBLE_W = 220;
export const BUBBLE_H = 56;
/** The gap between a Bubble and the Art box it speaks from. */
const GAP = 4;

/** Right of the Art box top, left of it, then above it (centred, kept inside the Scene). The first clear one wins, else null. */
export function placeBubble(plan: ScenePlan, index: number, taken: readonly Rect[]): Rect | null {
  const grave = plan.graves[index];
  if (grave === undefined) return null;
  const art = artRect(grave);
  const candidates: Rect[] = [
    { x: art.x + art.w + GAP, y: art.y, w: BUBBLE_W, h: BUBBLE_H },
    { x: art.x - GAP - BUBBLE_W, y: art.y, w: BUBBLE_W, h: BUBBLE_H },
    // Above, centred, then moved sideways to stay inside the Scene: on a phone the centred place runs off the edge.
    { x: Math.min(Math.max(0, art.x + art.w / 2 - BUBBLE_W / 2), Math.min(plan.width, MAX_BACKING) - BUBBLE_W), y: art.y - GAP - BUBBLE_H, w: BUBBLE_W, h: BUBBLE_H },
  ];
  for (const c of candidates) {
    if (c.x < 0 || c.y < 0 || c.x + c.w > plan.width || c.y + c.h > plan.groundHeight) continue;
    if (plan.graves.some((g) => intersects(c, labelRect(g)))) continue;
    if (taken.some((t) => intersects(c, t))) continue;
    return c;
  }
  return null;
}
