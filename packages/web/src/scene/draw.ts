import {
  ALPHA_ZERO_BYTE,
  FOG_PEAK_ALPHA_BYTE,
  MOON_HALO_ALPHA_BYTE,
  PALETTE,
  SHADOW_ALPHA_BYTE,
  STONE_ALPHA_BYTE,
} from "./palette.js";
import { GRAVE_GEOMETRY, BOTTOM_LINE_MIN_GAP, BOTTOM_LINE_OFFSET, CELL_HEIGHT, CELL_WIDTH, type GravePlan, type ScenePlan, type Star, type Tuft } from "./layout.js";
import { BURIAL_SINK_PX, burialFrame } from "../time/burial.js";
import { detailPath, ghostPath, pitRimPath, plinthPath, SHAPES, shapePath, SPECKS } from "./shapes.js";

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
  rect(x: number, y: number, w: number, h: number): void;
  clip(): void;
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

const SHADOW_RX = 72;
const SHADOW_RY = 8;
const SHADOW_CX = 96;
const SHADOW_CY = 210;
const STONE_LINE_WIDTH = 0.5;
const MARKER_BASE_Y = 168;
const MOUND_RX = 60;
const MOUND_RY = 14;
/** The pennant at fixed Cell offsets: pole, then three flag rows. Right of every stone box, above the Plinth top. */
const MARKER_RECTS: readonly (readonly [number, number, number, number])[] = [
  [160, 124, 2, 44],
  [162, 124, 14, 4],
  [162, 128, 10, 4],
  [162, 132, 6, 4],
];

interface Split<T> {
  readonly a: readonly T[];
  readonly b: readonly T[];
}

// Scenery is cached per width, so its lists keep one identity. Splitting by layer or
// tone happens once per list, not once per frame.
const starSplits = new WeakMap<readonly Star[], Split<Star>>();
const tuftRects = new WeakMap<readonly Tuft[], Split<number>>();

function splitStars(stars: readonly Star[]): Split<Star> {
  let split = starSplits.get(stars);
  if (split === undefined) {
    split = { a: stars.filter((s) => s.layer === "far"), b: stars.filter((s) => s.layer === "near") };
    starSplits.set(stars, split);
  }
  return split;
}

/** Flat [x, y, w, h, ...] lists per tone, built once per Scenery list. */
function splitTuftRects(grass: readonly Tuft[]): Split<number> {
  let split = tuftRects.get(grass);
  if (split === undefined) {
    const dark: number[] = [];
    const light: number[] = [];
    for (const t of grass) {
      const out = t.tone === "dark" ? dark : light;
      for (const r of t.rects) out.push(r[0], r[1], r[2], r[3]);
    }
    split = { a: dark, b: light };
    tuftRects.set(grass, split);
  }
  return split;
}

/** One fillStyle per tone, then a fillRect per rectangle for each Row line and the Bottom line. */
function drawTufts(ctx: PaintContext2D, plan: ScenePlan): void {
  const colours = PALETTE[plan.theme];
  const { a: dark, b: light } = splitTuftRects(plan.scenery.grass);
  const first = plan.scenery.skyHeight + CELL_HEIGHT;
  const bottom = plan.groundHeight - plan.height >= BOTTOM_LINE_MIN_GAP ? plan.groundHeight - BOTTOM_LINE_OFFSET : -1;
  for (let pass = 0; pass < 2; pass += 1) {
    const list = pass === 0 ? dark : light;
    ctx.fillStyle = pass === 0 ? colours.grassDark : colours.grassLight;
    for (let line = 1; line <= plan.rows; line += 1) {
      const top = first + (line - 1) * CELL_HEIGHT;
      for (let i = 0; i < list.length; i += 4) ctx.fillRect(list[i] ?? 0, top + (list[i + 1] ?? 0), 1, list[i + 3] ?? 0);
    }
    if (bottom >= 0) {
      for (let i = 0; i < list.length; i += 4) ctx.fillRect(list[i] ?? 0, bottom + (list[i + 1] ?? 0), 1, list[i + 3] ?? 0);
    }
  }
}

function drawScenery(ctx: PaintContext2D, plan: ScenePlan): void {
  const colours = PALETTE[plan.theme];
  const s = plan.scenery;
  const sky = ctx.createLinearGradient(0, 0, 0, s.skyHeight);
  sky.addColorStop(0, colours.skyTop);
  sky.addColorStop(SKY_MID_STOP, colours.skyMid);
  sky.addColorStop(1, colours.skyHorizon);
  ctx.fillStyle = sky as CanvasGradient;
  ctx.fillRect(0, 0, plan.width, s.skyHeight);

  const { a: far, b: near } = splitStars(s.stars);
  ctx.fillStyle = colours.starFar;
  for (let i = 0; i < far.length; i += 1) {
    const st = far[i];
    if (st !== undefined) ctx.fillRect(st.x, st.y, 1, 1);
  }
  ctx.fillStyle = colours.star;
  for (let i = 0; i < near.length; i += 1) {
    const st = near[i];
    if (st !== undefined) ctx.fillRect(st.x, st.y, 2, 2);
  }

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
  ctx.fillRect(0, s.horizonY, plan.width, Math.max(0, plan.groundHeight - s.horizonY));

  ctx.fillStyle = colours.horizon;
  ctx.fillRect(0, s.horizonY, plan.width, HORIZON_LINE_HEIGHT);

  const fog = ctx.createLinearGradient(0, s.fog.y, 0, s.fog.y + s.fog.h);
  fog.addColorStop(0, colours.fog + ALPHA_ZERO_BYTE);
  fog.addColorStop(0.5, colours.fog + FOG_PEAK_ALPHA_BYTE);
  fog.addColorStop(1, colours.fog + ALPHA_ZERO_BYTE);
  ctx.fillStyle = fog as CanvasGradient;
  ctx.fillRect(0, s.fog.y, plan.width, s.fog.h);

  drawTufts(ctx, plan);
}

/** Translucent decoration colours, built once per frame rather than once per grave. */
interface DecorationColours {
  readonly shadow: string;
  readonly stone: string;
}

function drawGrave(ctx: PaintContext2D, grave: GravePlan, plan: ScenePlan, deco: DecorationColours): void {
  const colours = PALETTE[plan.theme];
  const g = GRAVE_GEOMETRY;
  const def = SHAPES[grave.shape];

  ctx.save();
  ctx.translate(grave.rect.x + SHADOW_CX, grave.rect.y + SHADOW_CY);
  ctx.scale(SHADOW_RX, SHADOW_RY);
  ctx.beginPath();
  ctx.arc(0, 0, 1, 0, 2 * Math.PI);
  ctx.fillStyle = deco.shadow;
  ctx.fill();
  ctx.restore();

  const frame = grave.burial === null ? null : burialFrame(grave.burial);
  ctx.save();
  if (frame !== null) {
    // The stone sinks behind the ground line at the Plinth top: nothing below the Cell's stone area is drawn.
    ctx.beginPath();
    ctx.rect(grave.rect.x, grave.rect.y, CELL_WIDTH, MARKER_BASE_Y);
    ctx.clip();
    ctx.translate(0, frame.sink * BURIAL_SINK_PX);
  }
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
  const outline = shapePath(grave.shape);
  ctx.fill(outline);
  ctx.strokeStyle = deco.stone;
  ctx.lineWidth = STONE_LINE_WIDTH;
  ctx.stroke(outline);
  ctx.fillStyle = deco.stone;
  const specks = SPECKS[grave.shape];
  for (let i = 0; i < specks.length; i += 1) {
    const sp = specks[i];
    if (sp !== undefined) ctx.fillRect(sp.x, sp.y, 1, 1);
  }
  const detail = detailPath(grave.shape);
  if (detail !== null) {
    ctx.strokeStyle = colours.ink;
    ctx.lineWidth = CRACK_LINE_WIDTH;
    ctx.stroke(detail);
  }
  ctx.restore();

  if (frame !== null && frame.mound > 0) {
    ctx.save();
    ctx.translate(grave.rect.x + SHADOW_CX, grave.rect.y + MARKER_BASE_Y);
    ctx.scale(MOUND_RX * frame.mound, MOUND_RY * frame.mound);
    ctx.beginPath();
    ctx.arc(0, 0, 1, 0, 2 * Math.PI);
    ctx.fillStyle = colours.grassLight;
    ctx.fill();
    ctx.restore();
  }

  ctx.save();
  ctx.translate(grave.rect.x, grave.rect.y);
  ctx.fillStyle = grave.fill;
  ctx.fill(plinthPath());
  ctx.restore();

  if (grave.ghost !== null && grave.burial === null) {
    ctx.save();
    ctx.translate(grave.ghost.x, grave.ghost.y);
    ctx.scale(2, 2);
    ctx.fillStyle = colours.ghost;
    ctx.fill(ghostPath());
    ctx.restore();
  }

  if (grave.marker) {
    ctx.fillStyle = colours.marker;
    for (const [mx, my, mw, mh] of MARKER_RECTS) ctx.fillRect(grave.rect.x + mx, grave.rect.y + my, mw, mh);
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
  ctx.clearRect(0, 0, plan.width, plan.groundHeight);
  drawScenery(ctx, plan);
  const deco: DecorationColours = { shadow: colours.pit + SHADOW_ALPHA_BYTE, stone: colours.ink + STONE_ALPHA_BYTE };
  for (const grave of plan.graves) drawGrave(ctx, grave, plan, deco);
  if (plan.ring !== null) {
    ctx.strokeStyle = colours.ring;
    ctx.lineWidth = RING_LINE_WIDTH;
    ctx.strokeRect(plan.ring.x, plan.ring.y, plan.ring.w, plan.ring.h);
  }
}
