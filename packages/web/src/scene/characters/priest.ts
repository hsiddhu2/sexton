// The burial Priest (spec cemetery-undead-2, requirement 10): original vector art in the blocky style of the other
// Characters, drawn in a grave's cell frame. Every number is a constant of the Priest, never of a package.
import type { PaintContext2D } from "../draw.js";
import type { PaletteTheme } from "../palette.js";

/** The Priest is drawn PRIEST_SCALE times his 24 by 76 figure: about 35 cell units wide (visual critic rounds 5, 6). */
const PRIEST_SCALE = 1.45;
const FIGURE_W = 24;
/** The Priest's drawn reach to the right (his book at his side, with its outline), and where his left edge starts and stops, in cell units. */
export const PRIEST_W = 28 * PRIEST_SCALE;
export const PRIEST_FROM_X = 191;
export const PRIEST_AT_X = 183;
/** He walks over burial phases 0 to WALK_END, then reads. The bell sounds when he starts reading. */
export const WALK_END = 0.4;
const FEET_Y = 198;
const STEPS = 6;

export interface PriestPose {
  readonly x: number;
  readonly step: 0 | 1;
  readonly reading: boolean;
}

/** Pure. The Priest at a burial phase, or standing still with his book raised for the Vigil (null). */
export function priestPose(phase: number | null): PriestPose {
  if (phase === null || !Number.isFinite(phase)) return { x: PRIEST_AT_X, step: 0, reading: true };
  const p = Math.min(1, Math.max(0, phase));
  if (p >= WALK_END) return { x: PRIEST_AT_X, step: 0, reading: true };
  const u = p / WALK_END;
  return { x: PRIEST_FROM_X + (PRIEST_AT_X - PRIEST_FROM_X) * u, step: Math.floor(u * STEPS * 2) % 2 === 0 ? 0 : 1, reading: false };
}

/**
 * Draws the Priest in cell units, facing the grave (left): a violet-grey cassock that flares to the hem in steps, a
 * dark neck band under a white collar, a face with eyes and a skullcap, and an arm holding a book with a white cross
 * (visual critic rounds 5 to 7).
 */
export function drawPriest(ctx: PaintContext2D, c: PaletteTheme, phase: number | null): void {
  const { x, step, reading } = priestPose(phase);
  ctx.save();
  ctx.translate(x, FEET_Y);
  ctx.scale(PRIEST_SCALE, PRIEST_SCALE);
  // Feet, stepping in turn.
  ctx.fillStyle = c.ink;
  ctx.fillRect(4 + (step === 1 ? -2 : 0), -3, 7, 3);
  ctx.fillRect(13 + (step === 1 ? 2 : 0), -3, 7, 3);
  // The cassock flares from narrow shoulders to a wide hem, in steps, outlined so it reads on the dark ground.
  const rows: readonly (readonly [number, number, number])[] = [
    [7, -56, 10],
    [6, -48, 12],
    [5, -40, 14],
    [4, -32, 16],
    [3, -24, 18],
    [2, -16, 20],
    [1, -8, 22],
  ];
  ctx.fillStyle = c.border;
  for (const [rx, ry, rw] of rows) ctx.fillRect(rx - 1, ry, rw + 2, 8);
  ctx.fillStyle = c.grassLight;
  for (const [rx, ry, rw] of rows) ctx.fillRect(rx, ry, rw, 8);
  ctx.fillRect(1, -3, 22, 0.5);
  // Buttons down the front.
  ctx.fillStyle = c.border;
  for (const y of [-50, -43, -36, -29, -22, -15]) ctx.fillRect(11, y, 2, 2);
  // A dark neck band, then the white collar notch on it.
  ctx.fillStyle = c.ink;
  ctx.fillRect(7, -60, 10, 4);
  ctx.fillStyle = c.ghost;
  ctx.fillRect(9, -59, 6, 3);
  // Face with eyes, and a skullcap. The face is the warm marker cream, not the skeletons' bone.
  ctx.fillStyle = c.marker;
  ctx.fillRect(6, -72, 12, 12);
  ctx.fillStyle = c.ink;
  ctx.fillRect(7, -67, 2, 2);
  ctx.fillRect(11, -67, 2, 2);
  ctx.fillRect(7, -63, 4, 1);
  ctx.fillStyle = c.border;
  ctx.fillRect(7, -76, 10, 4);
  // The arm, from the shoulder to the book; the book with a white cross.
  const bx = reading ? -8 : FIGURE_W - 9;
  const by = reading ? -58 : -42;
  ctx.fillStyle = c.border;
  if (reading) ctx.fillRect(bx + 6, -50, 8, 5);
  else ctx.fillRect(16, -52, 5, 12);
  ctx.fillStyle = c.ink;
  ctx.fillRect(bx, by, 12, 15);
  ctx.strokeStyle = c.border;
  ctx.lineWidth = 1;
  ctx.strokeRect(bx + 0.5, by + 0.5, 11, 14);
  ctx.fillStyle = c.ghost;
  ctx.fillRect(bx + 5, by + 2, 2, 11);
  ctx.fillRect(bx + 2, by + 5, 8, 2);
  ctx.restore();
}

/**
 * Pure. What the bell rings for now: a burial once its Priest reads, or a Vigil from its start; null for neither. The
 * bell rings once each time this changes to a new value (requirement 10.2).
 */
export function bellKey(
  burial: { readonly name: string; readonly phase: number } | null,
  vigil: { readonly name: string; readonly startMs: number } | null,
): string | null {
  if (burial !== null) return burial.phase >= WALK_END ? `burial:${burial.name}` : null;
  return vigil === null ? null : `vigil:${vigil.name}:${String(vigil.startMs)}`;
}
