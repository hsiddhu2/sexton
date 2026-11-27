// The Guide ghost (spec clean-site, design C16, requirements 19.5 to 19.7 and 19.9): the Scene's own ghost, drawn once
// by drawGhost at drift phase 0 into a small canvas in the Tour card's title row and at the start of the Welcome bar.
// A still picture with no animation loop, hidden from assistive technology, with no tab stop and taking no input. It
// is never drawn in the Scene or beside a grave picture, so it never stands for an advisory.
import { useLayoutEffect, useRef } from "react";
import { drawGhost, ghostPictureArgs } from "./draw.js";

/** The Guide ghost's side in CSS pixels. */
export const GHOST_PICTURE_SIDE = 28;

export function GhostPicture() {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const dpr = Math.min(2, window.devicePixelRatio > 0 ? window.devicePixelRatio : 1);
  useLayoutEffect(() => {
    const ctx = ref.current?.getContext("2d") ?? null;
    if (ctx === null) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, GHOST_PICTURE_SIDE, GHOST_PICTURE_SIDE);
    const { x, y, size } = ghostPictureArgs(GHOST_PICTURE_SIDE);
    drawGhost(ctx, x, y, size, 0);
  }, [dpr]);
  const backing = Math.max(1, Math.round(GHOST_PICTURE_SIDE * dpr));
  return (
    <canvas
      ref={ref}
      className="ghost-picture"
      aria-hidden="true"
      width={backing}
      height={backing}
      style={{ width: GHOST_PICTURE_SIDE, height: GHOST_PICTURE_SIDE }}
    />
  );
}
