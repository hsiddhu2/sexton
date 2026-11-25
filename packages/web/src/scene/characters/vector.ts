// Vector Characters and Costumes, drawn in the 64 by 64 shape box of a grave, in the mockup's blocky style.
// Spec cemetery-undead, design.md "Characters" (Vector fallback) and requirement 3. Pure apart from the context calls:
// every number is a constant of the Character, the Clip and the Pose, never of a package.
import type { State } from "@sexton/api";
import type { PaintContext2D } from "../draw.js";
import type { PaletteTheme } from "../palette.js";
import type { ShapeId } from "../shapes.js";

export type CharacterId = "zombie" | "skeleton" | "hand";
export type ClipId = "dance" | "lounge" | "twitch";
export type CostumeId = "devil" | "onesie" | "party";

/** Poses per Clip at 12 a second. */
export const POSE_COUNT: Readonly<Record<ClipId, number>> = { dance: 12, lounge: 12, twitch: 8 };

export interface CharacterDef {
  readonly id: CharacterId;
  /** The Clips the Character can play. The first is its own Clip outside a dance window. */
  readonly clips: readonly ClipId[];
}

/** The Character of each State, or null. Haunted and Alive have none (requirement 3). */
export const CHARACTER_BY_STATE: Readonly<Record<State, CharacterDef | null>> = {
  Possessed: { id: "zombie", clips: ["dance"] },
  Dead: { id: "skeleton", clips: ["lounge", "dance"] },
  Restless: { id: "hand", clips: ["twitch"] },
  Haunted: null,
  Alive: null,
};

/**
 * The Character and Costume of a drawn shape. The shape is the Form of the State shown at the chosen date, so a
 * grave seen at an earlier date shows that date's Character. The Not-published mound has neither.
 */
export const STATE_BY_SHAPE: Readonly<Record<ShapeId, State | null>> = {
  open: "Possessed",
  cracked: "Dead",
  cross: "Haunted",
  tilted: "Restless",
  rounded: "Alive",
  unmarked: null,
};

/** The Costume of each State, or null. */
export const COSTUME_BY_STATE: Readonly<Record<State, CostumeId | null>> = {
  Possessed: "devil",
  Dead: "onesie",
  Restless: null,
  Haunted: null,
  Alive: "party",
};

const TAU = 2 * Math.PI;
/** The zombie's size and place in the shape box. Its centre stays at x 32. */
const ZOMBIE_SCALE = 1.15;
const ZOMBIE_DX = 32 - 32 * ZOMBIE_SCALE;
const ZOMBIE_DY = -7;

/** A rectangle rotated about its own top-centre, for limbs. */
function limb(ctx: PaintContext2D, x: number, y: number, w: number, h: number, angle: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.fillRect(-w / 2, 0, w, h);
  ctx.restore();
}

function zombie(ctx: PaintContext2D, c: PaletteTheme, pose: number): void {
  const t = (pose / POSE_COUNT.dance) * TAU;
  const bob = Math.round(Math.sin(2 * t) * 1.5);
  const sway = Math.sin(t);
  // Tail behind, curling with the dance.
  ctx.fillStyle = c.costume.cape;
  limb(ctx, 40, 44 + bob, 3, 14, -0.9 + 0.3 * sway);
  // Cape behind the body.
  ctx.fillRect(19, 28 + bob, 26, 22);
  // Legs.
  ctx.fillRect(25 + Math.round(sway), 44 + bob, 5, 14 - bob);
  ctx.fillRect(34 - Math.round(sway), 44 + bob, 5, 14 - bob);
  // Dress, in the Possessed colour.
  ctx.fillStyle = c.states.Possessed;
  ctx.fillRect(22, 28 + bob, 20, 18);
  // Arms up, waving.
  ctx.fillStyle = c.costume.skin;
  limb(ctx, 23, 30 + bob, 5, 16, Math.PI - 0.5 + 0.35 * sway);
  limb(ctx, 41, 30 + bob, 5, 16, Math.PI + 0.5 + 0.35 * sway);
  // Head.
  ctx.fillRect(24, 12 + bob, 16, 15);
  // Red eyes and a mouth.
  ctx.fillStyle = c.costume.eyes;
  ctx.fillRect(27, 17 + bob, 4, 4);
  ctx.fillRect(33, 17 + bob, 4, 4);
  ctx.fillStyle = c.ink;
  ctx.fillRect(28, 23 + bob, 8, 2);
  // Devil horns.
  ctx.fillStyle = c.costume.horns;
  limb(ctx, 26, 13 + bob, 3, 7, Math.PI + 0.45);
  limb(ctx, 38, 13 + bob, 3, 7, Math.PI - 0.45);
}

function skeleton(ctx: PaintContext2D, c: PaletteTheme, clip: ClipId, pose: number): void {
  const n = POSE_COUNT[clip];
  const t = (pose / n) * TAU;
  const dancing = clip === "dance";
  const bob = dancing ? Math.round(Math.abs(Math.sin(t)) * -4) : Math.round(Math.sin(t) * 0.8);
  if (dancing) {
    // Standing up in front of the stone, arms up in turn.
    ctx.fillStyle = c.costume.onesie;
    ctx.fillRect(28, 34 + bob, 10, 14);
    limb(ctx, 30, 47 + bob, 4, 12, 0.25 * Math.sin(t));
    limb(ctx, 36, 47 + bob, 4, 12, -0.25 * Math.sin(t));
    ctx.fillStyle = c.costume.bone;
    for (const y of [37, 40, 43]) ctx.fillRect(29, y + bob, 8, 1);
    limb(ctx, 28, 36 + bob, 3, 12, Math.PI - 0.4 + 0.5 * Math.sin(t));
    limb(ctx, 38, 36 + bob, 3, 12, Math.PI + 0.4 + 0.5 * Math.sin(t + Math.PI));
    ctx.fillRect(27, 23 + bob, 12, 10);
    ctx.fillStyle = c.ink;
    ctx.fillRect(29, 26 + bob, 3, 3);
    ctx.fillRect(34, 26 + bob, 3, 3);
    ctx.fillRect(31, 31 + bob, 4, 1);
    return;
  }
  // Lounging across the base of the stone: back against it, legs out to the right.
  ctx.fillStyle = c.costume.onesie;
  ctx.fillRect(22, 44 + bob, 16, 9);
  limb(ctx, 38, 48 + bob, 5, 18, -1.45 + 0.1 * Math.max(0, Math.sin(t)));
  limb(ctx, 38, 51 + bob, 5, 18, -1.6);
  // Onesie stripes and ribs.
  ctx.fillStyle = c.costume.bone;
  for (const x of [25, 29, 33]) ctx.fillRect(x, 45 + bob, 2, 7);
  // One arm behind the head, one resting on the knee.
  limb(ctx, 24, 45 + bob, 3, 11, Math.PI - 0.2);
  limb(ctx, 36, 46 + bob, 3, 10, -1.2);
  // Skull, resting against the stone.
  ctx.fillRect(14, 34 + bob, 12, 10);
  ctx.fillStyle = c.ink;
  ctx.fillRect(16, 37 + bob, 3, 3);
  ctx.fillRect(21, 37 + bob, 3, 3);
  ctx.fillRect(18, 42 + bob, 4, 1);
}

function hand(ctx: PaintContext2D, c: PaletteTheme, pose: number): void {
  const t = (pose / POSE_COUNT.twitch) * TAU;
  // A stepped mound of dirt in front of the stone, in the blocky style.
  ctx.fillStyle = c.costume.dirt;
  ctx.fillRect(30, 57, 32, 3);
  ctx.fillRect(34, 55, 24, 2);
  ctx.fillRect(38, 53, 16, 2);
  // Forearm and palm rising out of it.
  ctx.fillStyle = c.costume.skin;
  const lift = Math.round(Math.max(0, Math.sin(t)) * 3);
  ctx.fillRect(42, 42 - lift, 9, 16 + lift);
  ctx.fillRect(40, 38 - lift, 13, 6);
  // Four splayed fingers and a thumb, clawing in turn.
  for (let k = 0; k < 4; k += 1) {
    const curl = 0.3 * Math.sin(t + k * 0.9);
    limb(ctx, 41.5 + k * 3.3, 39 - lift, 2.8, 10, Math.PI + (k - 1.5) * 0.28 + curl);
  }
  limb(ctx, 40, 43 - lift, 2.8, 7, Math.PI / 2 + 0.4);
}

/** Draws one Pose of a Character in shape-box units. */
export function drawCharacter(ctx: PaintContext2D, c: PaletteTheme, id: CharacterId, clip: ClipId, pose: number): void {
  if (id === "zombie") {
    // The largest figure in the scene: drawn ZOMBIE_SCALE times larger, feet in the pit at the plinth top, horns
    // inside the top of the cell so they never reach the name of the row behind (spec cemetery-undead-2, A1).
    ctx.save();
    ctx.translate(ZOMBIE_DX, ZOMBIE_DY);
    ctx.scale(ZOMBIE_SCALE, ZOMBIE_SCALE);
    zombie(ctx, c, pose);
    ctx.restore();
  }
  else if (id === "skeleton") skeleton(ctx, c, clip, pose);
  else hand(ctx, c, pose);
}

/** The party hat and flowers of the Alive stone, in shape-box units. Still. */
export function drawPartyCostume(ctx: PaintContext2D, c: PaletteTheme): void {
  // The hat stands on the stone top with its bobble inside the top of the cell (spec cemetery-undead-2, A1).
  ctx.fillStyle = c.costume.hat;
  for (let row = 1; row < 10; row += 1) ctx.fillRect(32 - row * 0.7, 1 + row, row * 1.4 + 1, 1);
  ctx.fillStyle = c.costume.flower;
  ctx.fillRect(30, -2, 4, 4);
  for (const x of [14, 20, 44, 50]) ctx.fillRect(x, 56, 3, 3);
  ctx.fillStyle = c.costume.skin;
  for (const x of [14, 20, 44, 50]) ctx.fillRect(x + 0.5, 59, 2, 2);
}
