import {
  ALPHA_ZERO_BYTE,
  FOG_PEAK_ALPHA_BYTE,
  GLOW_ALPHA_BYTE,
  HALO_ALPHA_BYTE,
  GRAIN_ALPHA_BYTE,
  LANTERN_ALPHA_BYTE,
  VIGNETTE_ALPHA_BYTE,
  MOON_HALO_ALPHA_BYTE,
  PALETTE,
  SHADOW_ALPHA_BYTE,
  STONE_ALPHA_BYTE,
} from "./palette.js";
import { GRAVE_GEOMETRY, BOTTOM_LINE_MIN_GAP, BOTTOM_LINE_OFFSET, CELL_WIDTH, MAX_BACKING, PADDING, type GravePlan, type Rect, type ScenePlan, type Star, type Tuft } from "./layout.js";
import { inDanceWindow, poseAt, seedOf } from "./motion.js";
import { CHURCH_PATH, TREE_PATH, batWing, churchPath, treePath } from "./silhouettes.js";
import { POSE_COUNT, type ClipId } from "./characters/vector.js";
import { HALO_BLUR, HALO_FEATHER, HALO_GROW, haloMask, type HaloMask } from "./halo.js";
import { drawPriest } from "./characters/priest.js";
import { canSprite, drawSprite, sprite } from "./sprites.js";
import { FORM_BOX, formParts } from "./art-box.js";
import { BURST_PARTICLES, burstFrame, FINAL_POSE, particleAt, SHARD_PATH, type BurstFrame } from "./burst.js";
import { loadDelay, loadMomentMs, riseAt } from "./rise.js";
import { BURIAL_SINK_PX, burialFrame } from "../time/burial.js";
import { CHARACTER_BY_STATE, COSTUME_BY_STATE, drawCharacter, drawPartyCostume, STATE_BY_SHAPE } from "./characters/vector.js";
import { pitEdgePath, detailPath, GHOST_BLUSH, GHOST_EYES, ghostPath, pitRimPath, plinthPath, SHAPES, shapePath, SPECKS } from "./shapes.js";

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
  /** Optional: absent or returning nothing, the grain is skipped (spec cemetery-undead, 6.3). */
  createPattern?(image: CanvasImageSource, repetition: string | null): CanvasPattern | null | undefined;
  /** Optional: absent, the Halo layer is skipped (spec cemetery-undead-2, A3). */
  drawImage?(image: CanvasImageSource, dx: number, dy: number, dw: number, dh: number): void;
}

const SHAPE_HALF = 32;
const SKY_MID_STOP = 0.45;
const CHURCH_X = 0.06;
const TREE_X = 0.88;
const BAT_POSES = 4;
const FENCE_STEP = 12;
const FENCE_HEIGHT = 18;
const GRAIN_TILE = 128;
const GRAIN_DOTS = 900;
const GRAIN_SEED = 0x5e7701c3;
const LANTERN_RADIUS = 0.6;
const GHOST_DRAW_SCALE = 2;
const MIN_NAME_PX = 12;
const INSCRIPTION_UNITS_PX = 15;
/** The side face of a stone: its outline again, this far right and up in shape units, shaded with SHADOW_ALPHA_BYTE. */
/** The ghost is drawn this far from its planned point, in cell units, so it floats over the top of its stone. */
const GHOST_SHIFT_X = -4;
const GHOST_SHIFT_Y = -2;
const SIDE_DX = 3;
const SIDE_DY = -1.5;

/** The ground rises this far in the middle of the width, so it meets the sky as a hill, not a straight line. */
const HILL_RISE = 22;
const HILL_EDGE = 3;
const PIT_EDGE_WIDTH = 0.6;
/** The violet glow of the horizon, just above the hill, as a fraction of the sky height. */
const HORIZON_GLOW = 0.45;
const BAT_SCALE = 1.7;
/** The church (150 high) and tree fit inside the 120 px sky. */
const SILHOUETTE_SCALE = 0.72;
/** Moon craters as [dx, dy, r], in moon radii. */
const CRATERS: readonly (readonly [number, number, number])[] = [
  [-0.35, -0.2, 0.18],
  [0.3, 0.25, 0.12],
  [0.1, -0.45, 0.09],
];
const HALO_OUTER = 2.5;
const CRACK_LINE_WIDTH = 2;
const RING_LINE_WIDTH = 3;
/** The Ring casing's width on each side of the ring's line, in CSS pixels. */
export const RING_CASING = 2;

const SHADOW_RX = 72;
const SHADOW_RY = 8;
const SHADOW_CX = 96;
const SHADOW_CY = 210;
const STONE_LINE_WIDTH = 0.5;
const MARKER_BASE_Y = 168;
const MOUND_RX = 60;
const MOUND_RY = 14;
const GLOW_RADIUS = 200;
/** The Possessed glow is centred over the pit, at this cell y (K2d fix 1). */
const GLOW_CY = 104;
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
  const bottom = plan.groundHeight - plan.height >= BOTTOM_LINE_MIN_GAP ? plan.groundHeight - BOTTOM_LINE_OFFSET : -1;
  for (let pass = 0; pass < 2; pass += 1) {
    const list = pass === 0 ? dark : light;
    ctx.fillStyle = pass === 0 ? colours.grassDark : colours.grassLight;
    for (const line of plan.rowLines) {
      const top = line - PADDING;
      for (let i = 0; i < list.length; i += 4) ctx.fillRect(list[i] ?? 0, top + (list[i + 1] ?? 0), 1, list[i + 3] ?? 0);
    }
    if (bottom >= 0) {
      for (let i = 0; i < list.length; i += 4) ctx.fillRect(list[i] ?? 0, bottom + (list[i + 1] ?? 0), 1, list[i + 3] ?? 0);
    }
  }
}

const hillCache = new Map<string, Path2D>();
function cachedPath(key: string, d: () => string): Path2D {
  let path = hillCache.get(key);
  if (path === undefined) {
    if (hillCache.size > 16) hillCache.clear();
    path = new Path2D(d());
    hillCache.set(key, path);
  }
  return path;
}

/** The top of the ground above the horizon line: a gentle hill, low at both edges. */
function hillPath(width: number, horizon: number): Path2D {
  const w = Math.min(width, MAX_BACKING);
  return cachedPath(`g${String(w)},${String(horizon)}`, () =>
    `M0 ${String(horizon)} C${String(w * 0.2)} ${String(horizon - HILL_RISE)} ${String(w * 0.8)} ${String(horizon - HILL_RISE)} ${String(w)} ${String(horizon)} Z`,
  );
}


function drawScenery(ctx: PaintContext2D, plan: ScenePlan, nowMs: number): void {
  const colours = PALETTE[plan.theme];
  const s = plan.scenery;
  // A tall, soft sky: near-black at the top, violet towards the horizon, no hard horizon line.
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

  // The harvest moon: a halo, then a disc lit at the centre and darker at the rim.
  const { x: mx, y: my, r } = s.moon;
  const halo = ctx.createRadialGradient(mx, my, r, mx, my, r * HALO_OUTER);
  halo.addColorStop(0, colours.moon + MOON_HALO_ALPHA_BYTE);
  halo.addColorStop(1, colours.moon + ALPHA_ZERO_BYTE);
  ctx.fillStyle = halo as CanvasGradient;
  ctx.fillRect(mx - r * HALO_OUTER, my - r * HALO_OUTER, r * HALO_OUTER * 2, r * HALO_OUTER * 2);
  const disc = ctx.createRadialGradient(mx - r * 0.3, my - r * 0.3, r * 0.1, mx, my, r);
  disc.addColorStop(0, colours.moon);
  disc.addColorStop(1, colours.moonEdge);
  ctx.beginPath();
  ctx.arc(mx, my, r, 0, 2 * Math.PI);
  ctx.fillStyle = disc as CanvasGradient;
  ctx.fill();
  ctx.fillStyle = colours.moonEdge;
  for (const [dx, dy, cr] of CRATERS) {
    ctx.beginPath();
    ctx.arc(mx + dx * r, my + dy * r, cr * r, 0, 2 * Math.PI);
    ctx.fill();
  }

  // Silhouettes on the horizon: the church at the left, a dead tree at the right, bats in the sky.
  ctx.fillStyle = colours.silhouette;
  ctx.save();
  ctx.translate(Math.floor(plan.width * CHURCH_X), s.horizonY - CHURCH_PATH.h * SILHOUETTE_SCALE);
  ctx.scale(SILHOUETTE_SCALE, SILHOUETTE_SCALE);
  ctx.fill(churchPath());
  ctx.restore();
  ctx.save();
  ctx.translate(Math.floor(plan.width * TREE_X), s.horizonY - TREE_PATH.h * SILHOUETTE_SCALE);
  ctx.scale(SILHOUETTE_SCALE, SILHOUETTE_SCALE);
  ctx.fill(treePath());
  ctx.restore();
  for (let i = 0; i < s.bats.length; i += 1) {
    const bat = s.bats[i];
    if (bat === undefined) continue;
    const flap = poseAt(nowMs, BAT_POSES, plan.reducedMotion, i);
    ctx.save();
    ctx.translate(bat.x, bat.y);
    ctx.scale(BAT_SCALE, BAT_SCALE);
    ctx.fill(batWing(flap));
    ctx.restore();
  }

  // The lit horizon: the violet of the sky gathers above the hill.
  const glowH = s.skyHeight * HORIZON_GLOW;
  const lit = ctx.createLinearGradient(0, s.horizonY - glowH, 0, s.horizonY);
  lit.addColorStop(0, colours.skyHorizon + ALPHA_ZERO_BYTE);
  lit.addColorStop(1, colours.skyHorizon);
  ctx.fillStyle = lit as CanvasGradient;
  ctx.fillRect(0, s.horizonY - glowH, plan.width, glowH);

  // The fence along the horizon: posts and two rails.
  ctx.fillStyle = colours.silhouette;
  // Posts stop at the backing-store width: nothing beyond it is ever shown.
  const fenceEnd = Math.min(plan.width, MAX_BACKING);
  for (let x = 2; x < fenceEnd; x += FENCE_STEP) ctx.fillRect(x, s.horizonY - FENCE_HEIGHT, 2, FENCE_HEIGHT + 2);
  ctx.fillRect(0, s.horizonY - FENCE_HEIGHT + 4, plan.width, 1);
  ctx.fillRect(0, s.horizonY - 6, plan.width, 1);

  // The ground: a low hill in front of the fence, lit along its top edge, darker towards the front (K2d fix 1).
  const hillTop = s.horizonY - HILL_RISE;
  const ground = ctx.createLinearGradient(0, hillTop, 0, hillTop + Math.max(s.groundFade / 3, (plan.groundHeight - hillTop) * 0.55));
  ground.addColorStop(0, colours.groundTop);
  ground.addColorStop(1, colours.bg);
  ctx.fillStyle = ground as CanvasGradient;
  ctx.fillRect(0, s.horizonY, plan.width, Math.max(0, plan.groundHeight - s.horizonY));
  // The lit edge: the hill once in the fog colour, raised by HILL_EDGE, then the hill in the ground colour over it.
  ctx.save();
  ctx.translate(0, -HILL_EDGE);
  ctx.fillStyle = colours.skyHorizon;
  ctx.fill(hillPath(plan.width, s.horizonY));
  ctx.restore();
  ctx.fillStyle = ground as CanvasGradient;
  ctx.fill(hillPath(plan.width, s.horizonY));

  const fog = ctx.createLinearGradient(0, s.fog.y, 0, s.fog.y + s.fog.h);
  fog.addColorStop(0, colours.fog + ALPHA_ZERO_BYTE);
  fog.addColorStop(0.5, colours.fog + FOG_PEAK_ALPHA_BYTE);
  fog.addColorStop(1, colours.fog + ALPHA_ZERO_BYTE);
  ctx.fillStyle = fog as CanvasGradient;
  ctx.fillRect(0, s.fog.y, plan.width, s.fog.h);

  drawTufts(ctx, plan);
  drawFinish(ctx, plan);
}

/** A seeded grain tile, made once per context (spec cemetery-undead, 6.3). No random source. */
const grainPatterns = new WeakMap<object, CanvasPattern | null>();
function grainPattern(ctx: PaintContext2D, colour: string): CanvasPattern | null {
  if (grainPatterns.has(ctx)) return grainPatterns.get(ctx) ?? null;
  let pattern: CanvasPattern | null = null;
  if (typeof document !== "undefined" && typeof ctx.createPattern === "function") {
    const tile = document.createElement("canvas");
    tile.width = GRAIN_TILE;
    tile.height = GRAIN_TILE;
    const t = tile.getContext("2d");
    if (t !== null) {
      t.fillStyle = colour;
      let seed = GRAIN_SEED;
      for (let i = 0; i < GRAIN_DOTS; i += 1) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        t.fillRect(seed % GRAIN_TILE, (seed >>> 8) % GRAIN_TILE, 1, 1);
      }
      pattern = ctx.createPattern(tile, "repeat") ?? null;
    }
  }
  grainPatterns.set(ctx, pattern);
  return pattern;
}

/** The vignette and the grain over the backdrop, under every grave (spec cemetery-undead, design.md "Palette"). */
function drawFinish(ctx: PaintContext2D, plan: ScenePlan): void {
  const colours = PALETTE[plan.theme];
  const w = plan.width;
  const h = plan.groundHeight;
  const cx = w / 2;
  const cy = h / 2;
  const inner = Math.min(w, h) * 0.55;
  const outer = Math.hypot(cx, cy);
  const vignette = ctx.createRadialGradient(cx, cy, inner, cx, cy, outer);
  vignette.addColorStop(0, colours.silhouette + ALPHA_ZERO_BYTE);
  vignette.addColorStop(1, colours.silhouette + VIGNETTE_ALPHA_BYTE);
  ctx.fillStyle = vignette as CanvasGradient;
  ctx.fillRect(0, 0, w, h);
  const grain = grainPattern(ctx, colours.star + GRAIN_ALPHA_BYTE);
  if (grain !== null) {
    ctx.fillStyle = grain;
    ctx.fillRect(0, 0, w, h);
  }
}

/** Ovals as [cx, cy, rx, ry], each a unit circle scaled. */
function drawOvals(ctx: PaintContext2D, ovals: readonly (readonly [number, number, number, number])[], colour: string): void {
  ctx.fillStyle = colour;
  for (const [cx, cy, rx, ry] of ovals) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(rx, ry);
    ctx.beginPath();
    ctx.arc(0, 0, 1, 0, 2 * Math.PI);
    ctx.fill();
    ctx.restore();
  }
}

/** Translucent decoration colours, built once per frame rather than once per grave. */
export interface DecorationColours {
  readonly shadow: string;
  readonly stone: string;
}

/** The Clip and Pose of a grave's Character at an instant (spec cemetery-undead, 4.1 to 4.5). */
function clipAndPose(grave: GravePlan, plan: ScenePlan, clips: readonly ClipId[], nowMs: number): { readonly clip: ClipId; readonly pose: number } {
  const own = clips[0] ?? "dance";
  const clip: ClipId = own === "lounge" && plan.dancers.has(grave.name) && !plan.reducedMotion && inDanceWindow(grave.name, nowMs) ? "dance" : own;
  const count = POSE_COUNT[clip];
  return { clip, pose: poseAt(nowMs, count, plan.reducedMotion, seedOf(grave.name) % count) };
}

/**
 * At most one glow under a grave: the Lantern glow on the hovered or focused grave, else the Possessed glow. All glows
 * are drawn on the ground before any grave, so a wide glow never tints a neighbouring stone (K2d fix 1).
 */
function drawGlow(ctx: PaintContext2D, grave: GravePlan, plan: ScenePlan): void {
  const lantern = plan.lantern === grave.index;
  if (!lantern && STATE_BY_SHAPE[grave.shape] !== "Possessed") return;
  const colours = PALETTE[plan.theme];
  const scale = grave.rect.w / CELL_WIDTH;
  ctx.save();
  ctx.translate(grave.rect.x, grave.rect.y);
  ctx.scale(scale, scale);
  const cy = lantern ? MARKER_BASE_Y - 20 : GLOW_CY;
  const radius = lantern ? CELL_WIDTH * LANTERN_RADIUS : GLOW_RADIUS;
  const inner = lantern ? colours.lantern + LANTERN_ALPHA_BYTE : grave.fill + GLOW_ALPHA_BYTE;
  const outer = (lantern ? colours.lantern : grave.fill) + ALPHA_ZERO_BYTE;
  const paintGlow = (c: PaintContext2D): void => {
    const glow = c.createRadialGradient(SHADOW_CX, cy, 0, SHADOW_CX, cy, radius);
    glow.addColorStop(0, inner);
    glow.addColorStop(1, outer);
    c.fillStyle = glow as CanvasGradient;
    c.fillRect(SHADOW_CX - radius, cy - radius, radius * 2, radius * 2);
  };
  const box: Rect = { x: SHADOW_CX - radius, y: cy - radius, w: radius * 2, h: radius * 2 };
  const k = paintBacking * scale;
  const image = canSprite(ctx) ? sprite(`glow|${inner}|${String(radius)}|${String(cy)}`, box, k, paintGlow) : null;
  if (image !== null && canSprite(ctx)) drawSprite(ctx, image, box, k);
  else paintGlow(ctx);
  ctx.restore();
}

/** The Halo layer is drawn at this fraction of a CSS pixel: it is soft everywhere, and its cuts are feathered. */
/**
 * The Halo layer is drawn at a quarter of a CSS pixel: it is soft everywhere, so a fresh layer for 150 Possessed graves
 * stays inside the frame budget (spec cemetery-undead-fixes, 2.9). Each solid cut is painted HALO_CUT_MARGIN wider
 * than the mask says, two layer pixels, so the layer's smoothing never leaves a trace of the Halo inside a cut.
 */
const HALO_LAYER_SCALE = 0.25;
/** The Halo's sources are drawn at a sixteenth of a CSS pixel and scaled up: they are smooth gradients (spec judge-path, 5.1). */
const HALO_SOURCE_SCALE = 0.0625;
const HALO_CUT_MARGIN = 8;
interface HaloLayer {
  readonly key: string;
  readonly canvas: HTMLCanvasElement;
  /** The scene rectangle the layer covers: the box around its sources, inside the scene. */
  readonly x: number;
  readonly y: number;
}
let haloLayer: HaloLayer | null = null;

/** E2E only: forget the Halo layer, so the next paint repaints it; `cold` forgets its sources canvas too. */
export function resetHaloLayer(cold = false): void {
  haloLayer = null;
  if (cold) haloSourcesKey = "";
}

/** E2E only: the Halo layer's alpha, 0 to 255, at a scene point, or null outside the layer or with no layer. */
export function haloLayerAlphaAt(x: number, y: number): number | null {
  if (haloLayer === null) return null;
  const lx = Math.floor((x - haloLayer.x) * HALO_LAYER_SCALE);
  const ly = Math.floor((y - haloLayer.y) * HALO_LAYER_SCALE);
  if (lx < 0 || ly < 0 || lx >= haloLayer.canvas.width || ly >= haloLayer.canvas.height) return null;
  const data = haloLayer.canvas.getContext("2d")?.getImageData(lx, ly, 1, 1).data;
  return data === undefined ? null : (data[3] ?? null);
}

/**
 * The cut sprite of a grave's parts, by Form, size, Ghost and pennant, in scene pixels at the grave's place: the parts
 * grown, rounded and blurred, then the parts solid with the cut margin over them, at HALO_LAYER_SCALE, with room for
 * the blur.
 */
function partSprites(g: GravePlan, ink: string): { cut: HTMLCanvasElement; box: Rect } | null {
  const parts = formParts({ ...g, rect: { x: 0, y: 0, w: g.rect.w, h: g.rect.h } });
  if (parts.length === 0) return null;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const p of parts) {
    x0 = Math.min(x0, p.x);
    y0 = Math.min(y0, p.y);
    x1 = Math.max(x1, p.x + p.w);
    y1 = Math.max(y1, p.y + p.h);
  }
  const key = `${g.shape}|${String(g.rect.w)}|${g.ghost === null ? "-" : "g"}|${g.marker ? "m" : "-"}`;
  const m = HALO_CUT_MARGIN;
  const pad = HALO_GROW + 4 * HALO_BLUR;
  const box: Rect = { x: x0 - pad, y: y0 - pad, w: x1 - x0 + 2 * pad, h: y1 - y0 + 2 * pad };
  const cut = sprite(`cut|${key}`, box, HALO_LAYER_SCALE, (c) => {
    c.fillStyle = ink;
    c.beginPath();
    for (const p of parts) c.roundRect(p.x - HALO_GROW, p.y - HALO_GROW, p.w + 2 * HALO_GROW, p.h + 2 * HALO_GROW, HALO_GROW);
    c.filter = `blur(${String(HALO_BLUR * HALO_LAYER_SCALE)}px)`;
    c.fill();
    c.filter = "none";
    c.beginPath();
    for (const p of parts) c.rect(p.x - m, p.y - m, p.w + 2 * m, p.h + 2 * m);
    c.fill();
  });
  if (cut === null) return null;
  return { cut, box: { x: box.x + g.rect.x, y: box.y + g.rect.y, w: box.w, h: box.h } };
}

/** True on a browser canvas with filters and rounded rectangles, found once. */
let haloBrowserCache: boolean | null = null;
function haloInBrowser(): boolean {
  if (haloBrowserCache === null) {
    // A real browser canvas with filters, found whether or not sprites are on at the time (review).
    const probe = document.createElement("canvas").getContext("2d");
    haloBrowserCache =
      typeof CanvasRenderingContext2D !== "undefined" && probe instanceof CanvasRenderingContext2D && typeof (probe as unknown as { filter?: unknown }).filter === "string" && typeof probe.roundRect === "function";
  }
  return haloBrowserCache;
}

/** The sources the sources canvas holds now. */
let haloSourcesKey = "";

/** Canvases the Halo reuses from one repaint to the next: allocating them each time cost several milliseconds. */
const haloCanvases: { layer: HTMLCanvasElement | null; sources: HTMLCanvasElement | null } = { layer: null, sources: null };
function haloCanvas(which: "layer" | "sources", w: number, h: number): HTMLCanvasElement {
  const c = haloCanvases[which] ?? document.createElement("canvas");
  haloCanvases[which] = c;
  if (c.width !== w) c.width = w;
  if (c.height !== h) c.height = h;
  return c;
}

/**
 * Paints the Halo's sources, then cuts every region of the mask out of it. The layer covers only the box around the
 * sources. In a browser: each source is a sprite per radius and colour; each grave's parts are a solid cut sprite and
 * a soft, blurred cut sprite per Form and size; the other cuts are one solid path and one blurred path of grown,
 * rounded copies, so the edge follows the grave with no straight seam (spec cemetery-undead-fixes, bug 1 and 2.9).
 * Without a filter (the unit tests), the strips of cemetery-undead-2 remain.
 */
function paintHaloLayer(mask: HaloMask, plan: ScenePlan): HaloLayer | null {
  const sceneW = Math.min(plan.width, MAX_BACKING);
  const sceneH = Math.min(plan.groundHeight, MAX_BACKING);
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const src of mask.sources) {
    x0 = Math.min(x0, src.cx - src.r);
    y0 = Math.min(y0, src.cy - src.r);
    x1 = Math.max(x1, src.cx + src.r);
    y1 = Math.max(y1, src.cy + src.r);
  }
  x0 = Math.max(0, Math.floor(x0));
  y0 = Math.max(0, Math.floor(y0));
  x1 = Math.min(sceneW, Math.ceil(x1));
  y1 = Math.min(sceneH, Math.ceil(y1));
  if (!(x1 > x0 && y1 > y0)) return null;
  const lw = Math.max(1, Math.ceil((x1 - x0) * HALO_LAYER_SCALE));
  const lh = Math.max(1, Math.ceil((y1 - y0) * HALO_LAYER_SCALE));
  const browser = haloInBrowser();
  const canvas = browser ? haloCanvas("layer", lw, lh) : document.createElement("canvas");
  if (!browser) {
    canvas.width = lw;
    canvas.height = lh;
  }
  const t = canvas.getContext("2d");
  if (t === null) return null;
  const colours = PALETTE[plan.theme];
  if (browser) {
    // The reused canvas is cleared; a new one is already empty.
    t.setTransform(1, 0, 0, 1, 0, 0);
    t.globalCompositeOperation = "source-over";
    t.clearRect(0, 0, lw, lh);
  }
  t.scale(HALO_LAYER_SCALE, HALO_LAYER_SCALE);
  t.translate(-x0, -y0);
  const paintSource = (c: PaintContext2D, src: HaloMask["sources"][number]): void => {
    const g = c.createRadialGradient(src.cx, src.cy, 0, src.cx, src.cy, src.r);
    g.addColorStop(0, src.colour + HALO_ALPHA_BYTE);
    g.addColorStop(1, src.colour + ALPHA_ZERO_BYTE);
    c.fillStyle = g as CanvasGradient;
    c.fillRect(src.cx - src.r, src.cy - src.r, src.r * 2, src.r * 2);
  };
  if (browser) {
    // The sources are smooth, so they are drawn on their own canvas at HALO_SOURCE_SCALE and scaled up once.
    const lowW = Math.max(1, Math.ceil((x1 - x0) * HALO_SOURCE_SCALE));
    const lowH = Math.max(1, Math.ceil((y1 - y0) * HALO_SOURCE_SCALE));
    // A hover or a selection changes the cuts, not the sources: the sources canvas is kept while they stay the same.
    const sourcesKey = `${String(x0)},${String(y0)},${String(lowW)},${String(lowH)};${mask.sources.map((q) => `${String(q.cx)},${String(q.cy)},${String(q.r)},${q.colour}`).join(";")}`;
    const reuse = haloSourcesKey === sourcesKey && haloCanvases.sources !== null;
    const sc = haloCanvas("sources", lowW, lowH).getContext("2d");
    if (sc === null) return null;
    if (!reuse) {
      haloSourcesKey = sourcesKey;
      sc.setTransform(1, 0, 0, 1, 0, 0);
      sc.clearRect(0, 0, lowW, lowH);
      for (const src of mask.sources) {
        // Drawn about its own centre, so one sprite serves every source of this radius and colour.
        const image = sprite(`halo|${src.colour}|${String(Math.round(src.r * 100) / 100)}`, { x: -src.r, y: -src.r, w: src.r * 2, h: src.r * 2 }, HALO_SOURCE_SCALE, (c) => {
          c.translate(-src.cx, -src.cy);
          paintSource(c, src);
        });
        if (image !== null) sc.drawImage(image, (src.cx - src.r - x0) * HALO_SOURCE_SCALE, (src.cy - src.r - y0) * HALO_SOURCE_SCALE, image.width, image.height);
      }
    }
    t.drawImage(sc.canvas, x0, y0, lowW / HALO_SOURCE_SCALE, lowH / HALO_SOURCE_SCALE);
  } else for (const src of mask.sources) paintSource(t, src);
  // destination-out keeps only the alpha of what is drawn: the ink token, opaque inside a cut, fading to none.
  t.globalCompositeOperation = "destination-out";
  const solid = colours.ink;
  const none = colours.ink + ALPHA_ZERO_BYTE;
  if (browser) {
    // Every cut solid, a little wider than the mask says so the layer's smoothing leaves no trace inside it.
    t.fillStyle = solid;
    t.beginPath();
    for (const c of mask.others) t.rect(c.x - HALO_CUT_MARGIN, c.y - HALO_CUT_MARGIN, c.w + 2 * HALO_CUT_MARGIN, c.h + 2 * HALO_CUT_MARGIN);
    t.fill();
    // A grave's parts are the same for every grave of its Form and size: one sprite holds their solid cut and its soft
    // edge together.
    for (const g of mask.parted) {
      const sp = partSprites(g, solid);
      // At the sprite's true size: its canvas is rounded up to whole pixels (review).
      if (sp !== null) t.drawImage(sp.cut, sp.box.x, sp.box.y, sp.cut.width / HALO_LAYER_SCALE, sp.cut.height / HALO_LAYER_SCALE);
    }
    // The soft edge: every cut grown and rounded through one blur (a filter works in the layer's own pixels), and the
    // parts' soft edges from their blurred sprites.
    t.beginPath();
    for (const c of mask.others) t.roundRect(c.x - HALO_GROW, c.y - HALO_GROW, c.w + 2 * HALO_GROW, c.h + 2 * HALO_GROW, HALO_GROW);
    t.filter = `blur(${String(HALO_BLUR * HALO_LAYER_SCALE)}px)`;
    t.fill();
    t.filter = "none";
    return { key: mask.key, canvas, x: x0, y: y0 };
  }
  const f = HALO_FEATHER;
  // Each cut is painted HALO_CUT_MARGIN wider than the mask says, so the half-scale layer's smoothing can never leave
  // a trace of the Halo inside a cut (review note, task 3). The painted Halo is then at most the model's.
  for (const exact of mask.cuts) {
    const m = HALO_CUT_MARGIN;
    const c = { x: exact.x - m, y: exact.y - m, w: exact.w + 2 * m, h: exact.h + 2 * m };
    t.fillStyle = solid;
    t.fillRect(c.x, c.y, c.w, c.h);
    const strips: readonly (readonly [number, number, number, number, number, number, number, number])[] = [
      [c.x - f, c.y, f, c.h, c.x, 0, c.x - f, 0],
      [c.x + c.w, c.y, f, c.h, c.x + c.w, 0, c.x + c.w + f, 0],
      [c.x, c.y - f, c.w, f, 0, c.y, 0, c.y - f],
      [c.x, c.y + c.h, c.w, f, 0, c.y + c.h, 0, c.y + c.h + f],
    ];
    for (const [x, y, sw, sh, x0, y0, x1, y1] of strips) {
      const g = t.createLinearGradient(x0, y0, x1, y1);
      g.addColorStop(0, solid);
      g.addColorStop(1, none);
      t.fillStyle = g;
      t.fillRect(x, y, sw, sh);
    }
    for (const [cx, cy, dx, dy] of [
      [c.x, c.y, -1, -1],
      [c.x + c.w, c.y, 1, -1],
      [c.x, c.y + c.h, -1, 1],
      [c.x + c.w, c.y + c.h, 1, 1],
    ] as const) {
      const g = t.createRadialGradient(cx, cy, 0, cx, cy, f);
      g.addColorStop(0, solid);
      g.addColorStop(1, none);
      t.fillStyle = g;
      t.fillRect(dx < 0 ? cx - f : cx, dy < 0 ? cy - f : cy, f, f);
    }
  }
  return { key: mask.key, canvas, x: x0, y: y0 };
}

/** The Halo, over the glow pass and under every grave (spec cemetery-undead-2, A3). Redrawn only when its mask changes. */
function drawHalo(ctx: PaintContext2D, plan: ScenePlan): void {
  const mask = haloMask(plan);
  if (mask.sources.length === 0 || typeof ctx.drawImage !== "function" || typeof document === "undefined") return;
  if (haloLayer?.key !== mask.key) {
    const layer = paintHaloLayer(mask, plan);
    if (layer === null) return;
    haloLayer = layer;
  }
  ctx.drawImage(haloLayer.canvas, haloLayer.x, haloLayer.y, haloLayer.canvas.width / HALO_LAYER_SCALE, haloLayer.canvas.height / HALO_LAYER_SCALE);
}

let shardCache: Path2D | null = null;
function shardPath(): Path2D {
  shardCache ??= new Path2D(SHARD_PATH);
  return shardCache;
}

/** The lid's rest centre and its place over the pit, in shape units, and how far it turns and rises in flight. */
const LID_REST_X = 1.43;
const LID_REST_Y = 50.52;
const LID_CLOSED_X = 32;
const LID_CLOSED_Y = 50;
const LID_CLOSED_TURN = -0.559;
const LID_ARC = 10;
/** The zombie is hidden below the pit's centre line while it rises, in shape units. */
const RISE_CLIP = { x: -20, y: -10, w: 104, h: 63.5 } as const;
const RISE_DEPTH = 52;

/** The Burst frame of a grave at an instant, or null when no Burst plays on it. A null start is the final pose. */
function burstOf(grave: GravePlan, plan: ScenePlan, nowMs: number): BurstFrame | null {
  const b = plan.burst;
  if (b === null || b.index !== grave.index || grave.shape !== "open") return null;
  return b.startMs === null ? FINAL_POSE : burstFrame(nowMs - b.startMs);
}

/** The pose of a grave's Character now, or null for a Form without one. */
function motionOf(grave: GravePlan, plan: ScenePlan, nowMs: number): { readonly clip: ClipId; readonly pose: number } | null {
  const formState = STATE_BY_SHAPE[grave.shape];
  const character = formState === null ? null : CHARACTER_BY_STATE[formState];
  return character === null ? null : clipAndPose(grave, plan, character.clips, nowMs);
}

/**
 * A grave's body in its cell frame: the shadow, the stone (with its pit, side face, texture and crack), the Character
 * at one Pose and the Costume, and during a Burst its lid, particles and rise. Drawn directly, or once into a sprite.
 */
function drawBody(
  ctx: PaintContext2D,
  grave: GravePlan,
  plan: ScenePlan,
  deco: DecorationColours,
  motion: { readonly clip: ClipId; readonly pose: number } | null,
  burst: BurstFrame | null,
  frame: ReturnType<typeof burialFrame> | null,
): void {
  const colours = PALETTE[plan.theme];
  const g = GRAVE_GEOMETRY;
  const def = SHAPES[grave.shape];
  const formState = STATE_BY_SHAPE[grave.shape];
  ctx.save();
  ctx.translate(SHADOW_CX, SHADOW_CY);
  ctx.scale(SHADOW_RX, SHADOW_RY);
  ctx.beginPath();
  ctx.arc(0, 0, 1, 0, 2 * Math.PI);
  ctx.fillStyle = deco.shadow;
  ctx.fill();
  ctx.restore();

  ctx.save();
  if (frame !== null) {
    // The stone sinks behind the ground line at the Plinth top: nothing below the Cell's stone area is drawn.
    ctx.beginPath();
    ctx.rect(0, 0, CELL_WIDTH, MARKER_BASE_Y);
    ctx.clip();
    ctx.translate(0, frame.sink * BURIAL_SINK_PX);
  }
  ctx.save();
  ctx.translate(g.shapeX + SHAPE_HALF * g.shapeScale, g.shapeY + SHAPE_HALF * g.shapeScale);
  ctx.rotate((def.tiltDegrees * Math.PI) / 180);
  ctx.translate(-SHAPE_HALF * g.shapeScale, -SHAPE_HALF * g.shapeScale);
  ctx.scale(g.shapeScale, g.shapeScale);
  if (def.pit !== null) {
    // The mound of dug earth, then the dark mouth of the pit in it (K2d fix 1).
    const rim = pitRimPath(grave.shape);
    if (rim !== null) {
      ctx.fillStyle = colours.surface;
      ctx.fill(rim);
    }
    const { x, y, w, h } = def.pit;
    drawOvals(ctx, [[x + w / 2, y + h / 2, w / 2, h / 2]], colours.pit);
    // The pit's edge catches the pink of the Possessed glow: a line, not a glow, so the one-glow rule holds. Pale pink,
    // never gold, so the selection ring stays the only gold outline near a grave (spec cemetery-undead-2, A4).
    ctx.strokeStyle = colours.costume.flower;
    ctx.lineWidth = PIT_EDGE_WIDTH;
    ctx.stroke(pitEdgePath());
  }
  if (burst !== null && burst.lid < 1) {
    // The lid flies from over the pit to its resting place, rising in an arc (spec cemetery-undead-2, B3).
    const p = burst.lid;
    ctx.translate(LID_REST_X + (LID_CLOSED_X - LID_REST_X) * (1 - p), LID_REST_Y + (LID_CLOSED_Y - LID_REST_Y) * (1 - p) - LID_ARC * Math.sin(Math.PI * p));
    ctx.rotate(LID_CLOSED_TURN * (1 - p));
    ctx.translate(-LID_REST_X, -LID_REST_Y);
  }
  const outline = shapePath(grave.shape);
  if (grave.shape !== "unmarked") {
    // The side face: the outline again, offset, shaded, so the stone reads as a block and not a flat shape.
    ctx.save();
    ctx.translate(SIDE_DX, SIDE_DY);
    ctx.fillStyle = grave.fill;
    ctx.fill(outline);
    ctx.fillStyle = colours.ink + SHADOW_ALPHA_BYTE;
    ctx.fill(outline);
    ctx.restore();
  }
  ctx.fillStyle = grave.fill;
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
  // The Character and Costume ride with the stone, also while it sinks (spec cemetery-undead, 10.2).
  if (formState !== null) {
    const character = CHARACTER_BY_STATE[formState];
    const costume = COSTUME_BY_STATE[formState];
    if (character !== null || costume === "party") {
      ctx.save();
      ctx.translate(g.shapeX, g.shapeY);
      ctx.scale(g.shapeScale, g.shapeScale);
      if (character !== null) {
        const { clip, pose } = motion ?? { clip: character.clips[0] ?? "dance", pose: 0 };
        if (burst !== null && burst.rise < 1) {
          // The zombie rises out of the pit: hidden below the pit's centre line, moved down by what is left to rise.
          ctx.save();
          ctx.beginPath();
          ctx.rect(RISE_CLIP.x, RISE_CLIP.y, RISE_CLIP.w, RISE_CLIP.h);
          ctx.clip();
          ctx.translate(0, (1 - burst.rise) * RISE_DEPTH);
          drawCharacter(ctx, colours, character.id, clip, pose);
          ctx.restore();
        } else drawCharacter(ctx, colours, character.id, clip, pose);
      }
      if (burst !== null && burst.particles < 1) {
        // Dirt and shards on fixed paths out of the pit.
        for (let i = 0; i < BURST_PARTICLES.length; i += 1) {
          const pt = BURST_PARTICLES[i];
          if (pt === undefined) continue;
          const at = particleAt(pt, burst.particles);
          if (pt.kind === "dirt") {
            ctx.fillStyle = colours.costume.dirt;
            ctx.fillRect(at.x, at.y, pt.size, pt.size);
            continue;
          }
          ctx.fillStyle = i % 2 === 0 ? colours.states.Possessed : colours.costume.bone;
          ctx.save();
          ctx.translate(at.x, at.y);
          ctx.rotate(pt.turn + pt.spin * burst.particles);
          ctx.scale(pt.size, pt.size);
          ctx.fill(shardPath());
          ctx.restore();
        }
      }
      if (costume === "party") drawPartyCostume(ctx, colours);
      ctx.restore();
    }
  }
  ctx.restore();

}

/** The body sprite's box in cell units: the Form's core box and the shadow, with a margin. */
function bodyBox(shape: GravePlan["shape"]): Rect {
  const f = FORM_BOX[shape];
  const x0 = Math.min(f.x, SHADOW_CX - SHADOW_RX) - 2;
  const y0 = Math.min(f.y, SHADOW_CY - SHADOW_RY) - 2;
  const x1 = Math.max(f.x + f.w, SHADOW_CX + SHADOW_RX) + 2;
  const y1 = Math.max(f.y + f.h, SHADOW_CY + SHADOW_RY) + 2;
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
const GHOST_SPRITE_BOX: Rect = { x: -1, y: -1, w: 26, h: 30 };

/** The device pixels per CSS pixel of the paint in progress, for sprites. */
let paintBacking = 1;
/** True while a grave is drawn rising in the Load moment: it is drawn directly, never from a sprite (review note). */
let paintDirect = false;

/** One grave, drawn in its cell frame at its Tier scale: every number below is cell-relative. */
export function drawGrave(ctx: PaintContext2D, grave: GravePlan, plan: ScenePlan, deco: DecorationColours, nowMs: number): void {
  const colours = PALETTE[plan.theme];
  const g = GRAVE_GEOMETRY;
  const scale = grave.rect.w / CELL_WIDTH;

  ctx.save();
  ctx.translate(grave.rect.x, grave.rect.y);
  ctx.scale(scale, scale);

  const frame = grave.burial === null ? null : burialFrame(grave.burial);
  const burst = burstOf(grave, plan, nowMs);
  const motion = motionOf(grave, plan, nowMs);
  const still = frame === null && (burst === null || (burst.lid >= 1 && burst.particles >= 1 && burst.rise >= 1));
  const k = paintBacking * scale;
  if (still && !paintDirect && canSprite(ctx)) {
    // A still body is the same for every grave of its Form, fill and Pose: drawn once, then as an image.
    const box = bodyBox(grave.shape);
    const key = `body|${plan.theme}|${grave.shape}|${grave.fill}|${motion === null ? "-" : `${motion.clip}${String(motion.pose)}`}`;
    const image = sprite(key, box, k, (c) => {
      drawBody(c, grave, plan, deco, motion, null, null);
    });
    if (image !== null) drawSprite(ctx, image, box, k);
    else drawBody(ctx, grave, plan, deco, motion, burst, frame);
  } else drawBody(ctx, grave, plan, deco, motion, burst, frame);

  if (frame !== null && frame.mound > 0) {
    ctx.save();
    ctx.translate(SHADOW_CX, MARKER_BASE_Y);
    ctx.scale(MOUND_RX * frame.mound, MOUND_RY * frame.mound);
    ctx.beginPath();
    ctx.arc(0, 0, 1, 0, 2 * Math.PI);
    ctx.fillStyle = colours.grassLight;
    ctx.fill();
    ctx.restore();
  }

  ctx.fillStyle = grave.fill;
  ctx.fill(plinthPath());

  if (grave.ghost !== null && grave.burial === null) {
    ctx.save();
    // The ghost position is planned in scene pixels; its drift is not scaled.
    ctx.translate((grave.ghost.x - grave.rect.x) / scale, (grave.ghost.y - grave.rect.y) / scale);
    // Drawn twice as large and higher, floating over the top of its stone, as in the mockup.
    ctx.translate(GHOST_SHIFT_X, GHOST_SHIFT_Y);
    ctx.scale(GHOST_DRAW_SCALE, GHOST_DRAW_SCALE);
    const paintGhost = (c: PaintContext2D): void => {
      c.fillStyle = colours.ghost;
      c.fill(ghostPath());
      drawOvals(c, GHOST_EYES, colours.ink);
      drawOvals(c, GHOST_BLUSH, colours.costume.blush);
    };
    const gk = k * GHOST_DRAW_SCALE;
    const image = canSprite(ctx) ? sprite(`ghost|${colours.ghost}`, GHOST_SPRITE_BOX, gk, paintGhost) : null;
    if (image !== null && canSprite(ctx)) drawSprite(ctx, image, GHOST_SPRITE_BOX, gk);
    else paintGhost(ctx);
    ctx.restore();
  }

  if (grave.marker) {
    ctx.fillStyle = colours.marker;
    for (const [mx, my, mw, mh] of MARKER_RECTS) ctx.fillRect(mx, my, mw, mh);
  }

  // The Priest walks to the grave and reads during its burial, or stands still for the Vigil (spec cemetery-undead-2, B4).
  if (plan.priest !== null && plan.priest.index === grave.index && !grave.pending) drawPriest(ctx, colours, plan.priest.phase);

  if (grave.inscription !== null) {
    ctx.fillStyle = colours.ink;
    // The name stays at least MIN_NAME_PX on screen whatever the Tier scale (critic round 5).
    ctx.font = scale >= 1 ? g.inscription.font : g.inscription.font.replace(/\d+px/, `${String(Math.max(INSCRIPTION_UNITS_PX, Math.round(MIN_NAME_PX / scale)))}px`);
    ctx.textAlign = "center";
    ctx.fillText(grave.inscription, g.inscription.x, g.inscription.baseline, g.inscription.maxWidth);
  }
  ctx.restore();
}

/** Executes a plan at an instant. No layout logic and no per-package numbers live here. */
export function drawScene(ctx: PaintContext2D, plan: ScenePlan, scale: number, nowMs = 0): void {
  const colours = PALETTE[plan.theme];
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  paintBacking = scale > 0 && Number.isFinite(scale) ? scale : 1;
  ctx.clearRect(0, 0, plan.width, plan.groundHeight);
  drawScenery(ctx, plan, nowMs);
  const deco: DecorationColours = { shadow: colours.pit + SHADOW_ALPHA_BYTE, stone: colours.ink + STONE_ALPHA_BYTE };
  // The Load moment: each grave rises out of the ground in triage order; the glows wait for the last one (B5).
  const rising = plan.riseStartMs !== null && nowMs - plan.riseStartMs < loadMomentMs(plan.graves.length);
  if (!rising) {
    for (const grave of plan.graves) drawGlow(ctx, grave, plan);
    drawHalo(ctx, plan);
  }
  for (const index of plan.paintOrder) {
    const grave = plan.graves[index];
    if (grave === undefined) continue;
    if (!rising || plan.riseStartMs === null) {
      drawGrave(ctx, grave, plan, deco, nowMs);
      continue;
    }
    const up = riseAt(nowMs - plan.riseStartMs - loadDelay(grave.index, plan.graves.length));
    if (up <= 0) continue;
    if (up >= 1) {
      drawGrave(ctx, grave, plan, deco, nowMs);
      continue;
    }
    // Clipped to its cell and moved down by what is left to rise; its Ghost shows once it stands.
    ctx.save();
    ctx.beginPath();
    ctx.rect(grave.rect.x, grave.rect.y, grave.rect.w, grave.rect.h);
    ctx.clip();
    ctx.translate(0, (1 - up) * grave.rect.h);
    paintDirect = true;
    try {
      drawGrave(ctx, grave.ghost === null ? grave : { ...grave, ghost: null }, plan, deco, nowMs);
    } finally {
      paintDirect = false;
    }
    ctx.restore();
  }
  if (plan.ring !== null) {
    // The Ring casing: ink on each side of the gold line, so the gold sits on ink and never on the Halo (spec
    // judge-path, requirement 4.1). Filled, so the ring stays one stroke and the last call.
    const r = plan.ring;
    const o = RING_LINE_WIDTH / 2 + RING_CASING;
    const t = 2 * o;
    ctx.fillStyle = colours.ink;
    ctx.fillRect(r.x - o, r.y - o, r.w + t, t);
    ctx.fillRect(r.x - o, r.y + r.h - o, r.w + t, t);
    ctx.fillRect(r.x - o, r.y + o, t, r.h - t);
    ctx.fillRect(r.x + r.w - o, r.y + o, t, r.h - t);
    ctx.strokeStyle = colours.ring;
    ctx.lineWidth = RING_LINE_WIDTH;
    ctx.strokeRect(plan.ring.x, plan.ring.y, plan.ring.w, plan.ring.h);
  }
}
