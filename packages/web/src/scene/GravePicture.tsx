// One grave drawn by the scene painter into a small canvas, for the Guide page and the Legend (spec clean-site,
// design C7), so the pictures are the real graves. Its accessible name says in words what it shows (spec
// cemetery-undead, 10.3).
import { useLayoutEffect, useRef } from "react";
import { drawPicture } from "./draw.js";
import { CELL_HEIGHT } from "./layout.js";
import type { Theme } from "./palette.js";
import { PICTURE_BOX, PICTURE_SIDE, PICTURE_WORDS, picturePlan, type PictureKind } from "./picture.js";

export interface GravePictureProps {
  readonly kind: PictureKind;
  readonly theme: Theme;
  /** The picture's height in CSS pixels; its width follows the picture box. */
  readonly height: number;
}

export function GravePicture({ kind, theme, height }: GravePictureProps) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const width = Math.round((height * PICTURE_BOX.w) / PICTURE_BOX.h);
  const dpr = Math.min(2, window.devicePixelRatio > 0 ? window.devicePixelRatio : 1);
  useLayoutEffect(() => {
    const ctx = ref.current?.getContext("2d") ?? null;
    if (ctx === null) return;
    const { plan, grave } = picturePlan(kind, theme);
    drawPicture(ctx, plan, grave, (height * dpr) / CELL_HEIGHT, PICTURE_SIDE);
  }, [kind, theme, height, dpr]);
  return (
    <canvas
      ref={ref}
      className="grave-picture"
      role="img"
      aria-label={PICTURE_WORDS[kind]}
      width={Math.max(1, Math.round(width * dpr))}
      height={Math.max(1, Math.round(height * dpr))}
      style={{ width, height }}
    />
  );
}
