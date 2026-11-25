import {
  ALPHA_ZERO_BYTE,
  FOG_PEAK_ALPHA_BYTE,
  GLOW_ALPHA_BYTE,
  GRAIN_ALPHA_BYTE,
  LANTERN_ALPHA_BYTE,
  VIGNETTE_ALPHA_BYTE,
  MOON_HALO_ALPHA_BYTE,
  PALETTE,
  SHADOW_ALPHA_BYTE,
  STONE_ALPHA_BYTE,
} from "./palette.js";
import { GRAVE_GEOMETRY, BOTTOM_LINE_MIN_GAP, BOTTOM_LINE_OFFSET, CELL_WIDTH, MAX_BACKING, PADDING, type GravePlan, type ScenePlan, type Star, type Tuft } from "./layout.js";
import { inDanceWindow, poseAt, seedOf } from "./motion.js";
import { CHURCH_PATH, TREE_PATH, batWing, churchPath, treePath } from "./silhouettes.js";
import { POSE_COUNT, type ClipId } from "./characters/vector.js";
import { BURIAL_SINK_PX, burialFrame } from "../time/burial.js";
import { CHARACTER_BY_STATE, COSTUME_BY_STATE, drawCharacter, drawPartyCostume, STATE_BY_SHAPE } from "./characters/vector.js";
import { detailPath, GHOST_BLUSH, GHOST_EYES, ghostPath, pitRimPath, plinthPath, SHAPES, shapePath, SPECKS } from "./shapes.js";

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
const GHOST_DRAW_SCALE = 1.6;
const MIN_NAME_PX = 12;
const INSCRIPTION_UNITS_PX = 15;
/** The family part of the inscription font, so the name has one source. */
const NAME_FAMILY = GRAVE_GEOMETRY.inscription.font.replace(/^\d+px /, "");
const GHOST_SHIFT_X = 10;
const GHOST_SHIFT_Y = 36;
const BAT_SCALE = 1.7;
/** The church (150 high) and tree fit inside the 120 px sky. */
const SILHOUETTE_SCALE = 0.72;
const HORIZON_FEATHER = 56;
/** Moon craters as [dx, dy, r], in moon radii. */
const CRATERS: readonly (readonly [number, number, number])[] = [
  [-0.35, -0.2, 0.18],
  [0.3, 0.25, 0.12],
  [0.1, -0.45, 0.09],
];
const HALO_OUTER = 2.5;
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
const GLOW_RADIUS = 96;
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

  const ground = ctx.createLinearGradient(0, s.horizonY, 0, s.horizonY + s.groundFade);
  ground.addColorStop(0, colours.groundTop);
  ground.addColorStop(1, colours.bg);
  ctx.fillStyle = ground as CanvasGradient;
  ctx.fillRect(0, s.horizonY, plan.width, Math.max(0, plan.groundHeight - s.horizonY));
  // Feather the horizon: the violet glow of the sky runs down into the ground, so there is no hard edge.
  const feather = ctx.createLinearGradient(0, s.horizonY, 0, s.horizonY + HORIZON_FEATHER);
  feather.addColorStop(0, colours.skyHorizon);
  feather.addColorStop(1, colours.skyHorizon + ALPHA_ZERO_BYTE);
  ctx.fillStyle = feather as CanvasGradient;
  ctx.fillRect(0, s.horizonY, plan.width, HORIZON_FEATHER);

  // The fence along the horizon: posts and two rails.
  ctx.fillStyle = colours.silhouette;
  // Posts stop at the backing-store width: nothing beyond it is ever shown.
  const fenceEnd = Math.min(plan.width, MAX_BACKING);
  for (let x = 2; x < fenceEnd; x += FENCE_STEP) ctx.fillRect(x, s.horizonY - FENCE_HEIGHT, 2, FENCE_HEIGHT + 2);
  ctx.fillRect(0, s.horizonY - FENCE_HEIGHT + 4, plan.width, 1);
  ctx.fillRect(0, s.horizonY - 6, plan.width, 1);

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
interface DecorationColours {
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

/** One grave, drawn in its cell frame at its Tier scale: every number below is cell-relative. */
function drawGrave(ctx: PaintContext2D, grave: GravePlan, plan: ScenePlan, deco: DecorationColours, nowMs: number): void {
  const colours = PALETTE[plan.theme];
  const g = GRAVE_GEOMETRY;
  const def = SHAPES[grave.shape];
  const scale = grave.rect.w / CELL_WIDTH;
  const formState = STATE_BY_SHAPE[grave.shape];

  ctx.save();
  ctx.translate(grave.rect.x, grave.rect.y);
  ctx.scale(scale, scale);

  // At most one glow under a grave: the Lantern glow on the hovered or focused grave, else the Possessed glow.
  const lantern = plan.lantern === grave.index;
  if (lantern || formState === "Possessed") {
    const cy = MARKER_BASE_Y - 20;
    const radius = lantern ? CELL_WIDTH * LANTERN_RADIUS : GLOW_RADIUS;
    const glow = ctx.createRadialGradient(SHADOW_CX, cy, 0, SHADOW_CX, cy, radius);
    glow.addColorStop(0, lantern ? colours.lantern + LANTERN_ALPHA_BYTE : grave.fill + GLOW_ALPHA_BYTE);
    glow.addColorStop(1, (lantern ? colours.lantern : grave.fill) + ALPHA_ZERO_BYTE);
    ctx.fillStyle = glow as CanvasGradient;
    ctx.fillRect(SHADOW_CX - radius, cy - radius, radius * 2, radius * 2);
  }

  ctx.save();
  ctx.translate(SHADOW_CX, SHADOW_CY);
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
  // The Character and Costume ride with the stone, also while it sinks (spec cemetery-undead, 10.2).
  if (formState !== null) {
    const character = CHARACTER_BY_STATE[formState];
    const costume = COSTUME_BY_STATE[formState];
    if (character !== null || costume === "party") {
      ctx.save();
      ctx.translate(g.shapeX, g.shapeY);
      ctx.scale(g.shapeScale, g.shapeScale);
      if (character !== null) {
        const { clip, pose } = clipAndPose(grave, plan, character.clips, nowMs);
        drawCharacter(ctx, colours, character.id, clip, pose);
      }
      if (costume === "party") drawPartyCostume(ctx, colours);
      ctx.restore();
    }
  }
  ctx.restore();

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
    // Drawn 1.6 times larger and lower, so the ghost overlaps the top of its stone, as in the mockup.
    ctx.translate(GHOST_SHIFT_X, GHOST_SHIFT_Y);
    ctx.scale(GHOST_DRAW_SCALE, GHOST_DRAW_SCALE);
    ctx.fillStyle = colours.ghost;
    ctx.fill(ghostPath());
    drawOvals(ctx, GHOST_EYES, colours.ink);
    drawOvals(ctx, GHOST_BLUSH, colours.costume.blush);
    ctx.restore();
  }

  if (grave.marker) {
    ctx.fillStyle = colours.marker;
    for (const [mx, my, mw, mh] of MARKER_RECTS) ctx.fillRect(mx, my, mw, mh);
  }

  if (grave.inscription !== null) {
    ctx.fillStyle = colours.ink;
    // The name stays at least MIN_NAME_PX on screen whatever the Tier scale (critic round 5).
    ctx.font = scale >= 1 ? g.inscription.font : `${String(Math.max(INSCRIPTION_UNITS_PX, Math.round(MIN_NAME_PX / scale)))}px ${NAME_FAMILY}`;
    ctx.textAlign = "center";
    ctx.fillText(grave.inscription, g.inscription.x, g.inscription.baseline, g.inscription.maxWidth);
  }
  ctx.restore();
}

/** Executes a plan at an instant. No layout logic and no per-package numbers live here. */
export function drawScene(ctx: PaintContext2D, plan: ScenePlan, scale: number, nowMs = 0): void {
  const colours = PALETTE[plan.theme];
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.clearRect(0, 0, plan.width, plan.groundHeight);
  drawScenery(ctx, plan, nowMs);
  const deco: DecorationColours = { shadow: colours.pit + SHADOW_ALPHA_BYTE, stone: colours.ink + STONE_ALPHA_BYTE };
  for (const index of plan.paintOrder) {
    const grave = plan.graves[index];
    if (grave !== undefined) drawGrave(ctx, grave, plan, deco, nowMs);
  }
  if (plan.ring !== null) {
    ctx.strokeStyle = colours.ring;
    ctx.lineWidth = RING_LINE_WIDTH;
    ctx.strokeRect(plan.ring.x, plan.ring.y, plan.ring.w, plan.ring.h);
  }
}
