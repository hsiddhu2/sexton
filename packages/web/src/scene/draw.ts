import { PALETTE } from "./palette.js";
import type { ScenePlan } from "./layout.js";
import { detailPath, ghostPath, SHAPES, shapePath } from "./shapes.js";

/** The subset of CanvasRenderingContext2D the painter calls. */
export interface PaintContext2D {
  fillStyle: string | CanvasGradient | CanvasPattern;
  strokeStyle: string | CanvasGradient | CanvasPattern;
  lineWidth: number;
  font: string;
  textAlign: CanvasTextAlign;
  setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void;
  clearRect(x: number, y: number, w: number, h: number): void;
  fillRect(x: number, y: number, w: number, h: number): void;
  strokeRect(x: number, y: number, w: number, h: number): void;
  save(): void;
  restore(): void;
  translate(x: number, y: number): void;
  rotate(angle: number): void;
  fill(path: Path2D): void;
  stroke(path: Path2D): void;
  fillText(text: string, x: number, y: number): void;
}

const BODY_DX = 16;
const BODY_DY = 26;
const BODY_HALF = 32;

/** Executes a plan. No layout logic and no per-package numbers live here. */
export function drawScene(ctx: PaintContext2D, plan: ScenePlan, scale: number): void {
  const colours = PALETTE[plan.theme];
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.clearRect(0, 0, plan.width, plan.height);
  ctx.fillStyle = colours.bg;
  ctx.fillRect(0, 0, plan.width, plan.height);
  for (const grave of plan.graves) {
    const def = SHAPES[grave.shape];
    ctx.save();
    ctx.translate(grave.rect.x + BODY_DX + BODY_HALF, grave.rect.y + BODY_DY + BODY_HALF);
    ctx.rotate((def.tiltDegrees * Math.PI) / 180);
    ctx.translate(-BODY_HALF, -BODY_HALF);
    ctx.fillStyle = grave.fill;
    ctx.fill(shapePath(grave.shape));
    const detail = detailPath(grave.shape);
    if (detail !== null) {
      ctx.strokeStyle = colours.bg;
      ctx.lineWidth = 2;
      ctx.stroke(detail);
    }
    ctx.restore();
    if (grave.ghost !== null) {
      ctx.save();
      ctx.translate(grave.ghost.x, grave.ghost.y);
      ctx.fillStyle = colours.ghost;
      ctx.fill(ghostPath());
      ctx.restore();
    }
    if (grave.inscription !== null) {
      ctx.fillStyle = colours.text;
      ctx.font = "11px monospace";
      ctx.textAlign = "center";
      ctx.fillText(grave.inscription, grave.rect.x + 48, grave.rect.y + 106);
    }
  }
  if (plan.ring !== null) {
    ctx.strokeStyle = colours.ring;
    ctx.lineWidth = 3;
    ctx.strokeRect(plan.ring.x, plan.ring.y, plan.ring.w, plan.ring.h);
  }
}
