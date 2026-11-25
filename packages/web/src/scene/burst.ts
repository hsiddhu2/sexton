// The replay Burst (spec cemetery-undead-2, requirement 9). Pure: every number is a constant of the Burst, never of a
// package. The particles follow fixed paths from the scenery seed.
import { riseAt } from "./rise.js";
import { mulberry32, SCENERY_SEED } from "./scenery-seed.js";

export const BURST_MS = 1_600;
const LID_MS = 300;
const PARTICLE_MS = 900;
const ZOMBIE_FROM_MS = 250;
const ZOMBIE_MS = 1_100;

export interface BurstFrame {
  /** 0 closed over the pit, 1 flung to its resting place. */
  readonly lid: number;
  /** 0 to 1 along their paths; 1 means gone. */
  readonly particles: number;
  /** The zombie's Rise clip progress: 0 under the ground, 1 standing. */
  readonly rise: number;
}

export const FINAL_POSE: BurstFrame = { lid: 1, particles: 1, rise: 1 };

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
const easeOut = (v: number): number => 1 - (1 - v) * (1 - v);

/** Clamped. burstFrame(BURST_MS) and later is the final pose, which is the still open grave. NaN gives the final pose. */
export function burstFrame(elapsedMs: number): BurstFrame {
  if (Number.isNaN(elapsedMs) || elapsedMs >= BURST_MS) return FINAL_POSE;
  const t = Math.max(0, elapsedMs);
  return {
    lid: easeOut(clamp01(t / LID_MS)),
    particles: clamp01(t / PARTICLE_MS),
    rise: riseAt(t - ZOMBIE_FROM_MS, ZOMBIE_MS),
  };
}

export interface Particle {
  readonly kind: "dirt" | "shard";
  /** Start, in shape units: on the pit's rim. */
  readonly x: number;
  readonly y: number;
  /** Velocity in shape units per Burst particle time. */
  readonly vx: number;
  readonly vy: number;
  /** Side length (a clod) or triangle size (a shard), in shape units. */
  readonly size: number;
  /** A shard's turn at the start, and how far it spins along its path, in radians. */
  readonly turn: number;
  readonly spin: number;
}

/** Pull towards the ground, in shape units per particle time squared. */
export const PARTICLE_GRAVITY = 60;
/** How far out the particles fly, in shape units: inside the Art box (x -17.5 to 81.5) with a margin. */
const PARTICLE_LEFT = -15;
const PARTICLE_RIGHT = 79;
/** A shard: a triangle in a unit box, scaled by its size. */
export const SHARD_PATH = "M0 0 L1 0.35 L0.2 1 Z";

/**
 * Eight dirt clods and ten shards on fixed paths from the scenery seed: from the pit's rim, up and out to the edges of
 * the Art box (visual critic round 4: large enough to read as debris, spread wide around the figure).
 */
export const BURST_PARTICLES: readonly Particle[] = (() => {
  const next = mulberry32(SCENERY_SEED ^ 0xb0b5);
  const out: Particle[] = [];
  for (let i = 0; i < 18; i += 1) {
    const dirt = i < 8;
    const x = 9 + next() * 46;
    const side = x < 32 ? -1 : 1;
    const y = 48 + next() * 4;
    const raw = 18 + next() * 26;
    const vy = -42 - next() * 22;
    const size = dirt ? 3.5 + next() * 1.5 : 6 + next() * 3;
    // Never past PARTICLE_LEFT or PARTICLE_RIGHT, with the particle's own reach: inside the Art box.
    const reach = dirt ? size : size * Math.SQRT2;
    const room = side > 0 ? PARTICLE_RIGHT - reach - x : x - reach - PARTICLE_LEFT;
    out.push({
      kind: dirt ? "dirt" : "shard",
      x,
      y,
      vx: side * Math.min(raw, room),
      vy,
      size,
      turn: next() * 2 * Math.PI,
      spin: (next() - 0.5) * 6,
    });
  }
  return out;
})();

/** Pure. A particle's place at path progress q in [0, 1), in shape units. */
export function particleAt(p: Particle, q: number): { readonly x: number; readonly y: number } {
  return { x: p.x + p.vx * q, y: p.y + p.vy * q + 0.5 * PARTICLE_GRAVITY * q * q };
}
