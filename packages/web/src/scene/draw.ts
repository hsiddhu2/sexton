import {
  ALPHA_ZERO_BYTE,
  FOG_PEAK_ALPHA_BYTE,
  MOON_HALO_ALPHA_BYTE,
  PALETTE,
} from "./palette.js";
import { GRAVE_GEOMETRY, type GravePlan, type ScenePlan } from "./layout.js";
import { detailPath, ghostPath, pitRimPath, plinthPath, SHAPES, shapePath } from "./shapes.js";

export interface GradientLike {
  addColorStop(offset: number, colour: string): void;
}

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
  scale(x: number, y: number): void;
  beginPath(): void;
  arc(x: number, y: number, r: number, startAngle: number, endAngle: number): void;
  fill(path?: Path2D): void;
  stroke(path: Path2D): void;
  fillText(text: string, x: number, y: number, maxWidth?: number): void;
  createLinearGradient(x0: number, y0: number, x1: number, y1: number): GradientLike;
  createRadialGradient(x0: number, y0: number, r0: number, x1: number, y1: number, r1: number): GradientLike;
}

const SHAPE_HALF = 32;
const SKY_MID_STOP = 0.6;
const HALO_OUTER = 2.5;
const HORIZON_LINE_HEIGHT = 2;
const CRACK_LINE_WIDTH = 2;
const RING_LINE_WIDTH = 3;
const PIT_RIM_LINE_WIDTH = 1.5;

function drawScenery(ctx: PaintContext2D, plan: ScenePlan): void {
  const colours = PALETTE[plan.theme];
  const s = plan.scenery;
  const sky = ctx.createLinearGradient(0, 0, 0, s.skyHeight);
  sky.addColorStop(0, colours.skyTop);
  sky.addColorStop(SKY_MID_STOP, colours.skyMid);
  sky.addColorStop(1, colours.skyHorizon);
  ctx.fillStyle = sky as CanvasGradient;
  ctx.fillRect(0, 0, plan.width, s.skyHeight);

  const { x: mx, y: my, r } = s.moon;
  const halo = ctx.createRadialGradient(mx, my, r, mx, my, r * HALO_OUTER);
  halo.addColorStop(0, colours.moon + MOON_HALO_ALPHA_BYTE);
  halo.addColorStop(1, colours.moon + ALPHA_ZERO_BYTE);
  ctx.fillStyle = halo as CanvasGradient;
  ctx.fillRect(mx - r * HALO_OUTER, my - r * HALO_OUTER, r * HALO_OUTER * 2, r * HALO_OUTER * 2);
  ctx.beginPath();
  ctx.arc(mx, my, r, 0, 2 * Math.PI);
  ctx.fillStyle = colours.moon;
  ctx.fill();

  const ground = ctx.createLinearGradient(0, s.horizonY, 0, s.horizonY + s.groundFade);
  ground.addColorStop(0, colours.groundTop);
  ground.addColorStop(1, colours.bg);
  ctx.fillStyle = ground as CanvasGradient;
  ctx.fillRect(0, s.horizonY, plan.width, Math.max(0, plan.height - s.horizonY));

  ctx.fillStyle = colours.horizon;
  ctx.fillRect(0, s.horizonY, plan.width, HORIZON_LINE_HEIGHT);

  const fog = ctx.createLinearGradient(0, s.fog.y, 0, s.fog.y + s.fog.h);
  fog.addColorStop(0, colours.fog + ALPHA_ZERO_BYTE);
  fog.addColorStop(0.5, colours.fog + FOG_PEAK_ALPHA_BYTE);
  fog.addColorStop(1, colours.fog + ALPHA_ZERO_BYTE);
  ctx.fillStyle = fog as CanvasGradient;
  ctx.fillRect(0, s.fog.y, plan.width, s.fog.h);
}

function drawGrave(ctx: PaintContext2D, grave: GravePlan, plan: ScenePlan): void {
  const colours = PALETTE[plan.theme];
  const g = GRAVE_GEOMETRY;
  const def = SHAPES[grave.shape];

  ctx.save();
  ctx.translate(grave.rect.x + g.shapeX + SHAPE_HALF * g.shapeScale, grave.rect.y + g.shapeY + SHAPE_HALF * g.shapeScale);
  ctx.rotate((def.tiltDegrees * Math.PI) / 180);
  ctx.translate(-SHAPE_HALF * g.shapeScale, -SHAPE_HALF * g.shapeScale);
  ctx.scale(g.shapeScale, g.shapeScale);
  if (def.pit !== null) {
    ctx.fillStyle = colours.pit;
    ctx.fillRect(def.pit.x, def.pit.y, def.pit.w, def.pit.h);
    const rim = pitRimPath(grave.shape);
    if (rim !== null) {
      ctx.strokeStyle = colours.border;
      ctx.lineWidth = PIT_RIM_LINE_WIDTH;
      ctx.stroke(rim);
    }
  }
  ctx.fillStyle = grave.fill;
  ctx.fill(shapePath(grave.shape));
  const detail = detailPath(grave.shape);
  if (detail !== null) {
    ctx.strokeStyle = colours.ink;
    ctx.lineWidth = CRACK_LINE_WIDTH;
    ctx.stroke(detail);
  }
  ctx.restore();

  ctx.save();
  ctx.translate(grave.rect.x, grave.rect.y);
  ctx.fillStyle = grave.fill;
  ctx.fill(plinthPath());
  ctx.restore();

  if (grave.ghost !== null) {
    ctx.save();
    ctx.translate(grave.ghost.x, grave.ghost.y);
    ctx.scale(2, 2);
    ctx.fillStyle = colours.ghost;
    ctx.fill(ghostPath());
    ctx.restore();
  }

  if (grave.inscription !== null) {
    ctx.fillStyle = colours.ink;
    ctx.font = g.inscription.font;
    ctx.textAlign = "center";
    ctx.fillText(grave.inscription, grave.rect.x + g.inscription.x, grave.rect.y + g.inscription.baseline, g.inscription.maxWidth);
  }
}

/** Executes a plan. No layout logic and no per-package numbers live here. */
export function drawScene(ctx: PaintContext2D, plan: ScenePlan, scale: number): void {
  const colours = PALETTE[plan.theme];
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.clearRect(0, 0, plan.width, plan.height);
  drawScenery(ctx, plan);
  for (const grave of plan.graves) drawGrave(ctx, grave, plan);
  if (plan.ring !== null) {
    ctx.strokeStyle = colours.ring;
    ctx.lineWidth = RING_LINE_WIDTH;
    ctx.strokeRect(plan.ring.x, plan.ring.y, plan.ring.w, plan.ring.h);
  }
}
