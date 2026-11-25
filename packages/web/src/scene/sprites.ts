// Offscreen sprites: a repeated drawing (a grave's body at one Pose, a ghost, a glow) is painted once per size and
// state, then drawn as an image. A front row of 300 Possessed or Dead graves repainted every path of every zombie,
// skeleton and ghost each frame and took about 300 ms; drawn from sprites it stays inside the 16 ms budget
// (spec cemetery-undead-2, owner fix of 25 Nov). Sprites are used only on a real canvas: the painter's tests and the
// bounds probe record the direct drawing, which is the one source both paths share.
import type { Rect } from "./layout.js";

const MAX_SPRITES = 400;
const cache = new Map<string, HTMLCanvasElement>();
let enabled = true;

/** Tests and the e2e hook only: turn sprites off, to compare with the direct drawing. */
export function setSpritesEnabled(value: boolean): void {
  enabled = value;
}

/** True when the context is a browser canvas context and sprites are on. */
export function canSprite(ctx: unknown): ctx is CanvasRenderingContext2D {
  return enabled && typeof document !== "undefined" && typeof CanvasRenderingContext2D !== "undefined" && ctx instanceof CanvasRenderingContext2D;
}

/**
 * The sprite of `key` covering `box` (in the caller's units) at `k` device pixels per unit, painted by `draw` in those
 * units on first use. Null when no canvas can be made.
 */
export function sprite(key: string, box: Rect, k: number, draw: (ctx: CanvasRenderingContext2D) => void): HTMLCanvasElement | null {
  const full = `${key}|${String(Math.round(k * 1000) / 1000)}`;
  const hit = cache.get(full);
  if (hit !== undefined) return hit;
  if (cache.size >= MAX_SPRITES) cache.clear();
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.ceil(box.w * k));
  canvas.height = Math.max(1, Math.ceil(box.h * k));
  const c = canvas.getContext("2d");
  if (c === null) return null;
  c.scale(k, k);
  c.translate(-box.x, -box.y);
  draw(c);
  cache.set(full, canvas);
  return canvas;
}

/** Draws a sprite over `box` in the current transform. */
export function drawSprite(ctx: CanvasRenderingContext2D, image: HTMLCanvasElement, box: Rect, k: number): void {
  ctx.drawImage(image, box.x, box.y, image.width / k, image.height / k);
}
