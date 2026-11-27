// Character motion: a pure function of time, a seed from the package name, and Reduced motion.
// Spec cemetery-undead, requirement 4, design.md "Motion". No random source.

/** 12 Poses a second. */
export const FRAME_MS = 1000 / 12;
export const STILL_POSE = 0;
export const DANCE_PERIOD_MS = 12_000;
export const DANCE_LENGTH_MS = 2_000;

/** FNV-1a 32 of a string, as an unsigned integer. */
export function seedOf(name: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < name.length; i += 1) {
    h ^= name.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** A music track's beat (spec clean-site, 14.3). */
export interface Beat {
  readonly beatMs: number;
}

/** The time between two Pose steps: half a beat while a beat is given, else FRAME_MS (12 Poses a second). */
export function poseStepMs(beat: Beat | null): number {
  return beat !== null && Number.isFinite(beat.beatMs) && beat.beatMs > 0 ? beat.beatMs / 2 : FRAME_MS;
}

/**
 * The Pose clock (spec clean-site, design C12, 14.3 to 14.5): the number of Pose steps at an instant, one per half
 * beat with a beat and one per FRAME_MS without; null under Reduced motion, when every Character holds still.
 */
export function poseClock(nowMs: number, beat: Beat | null, reducedMotion: boolean): number | null {
  if (reducedMotion || !Number.isFinite(nowMs)) return null;
  return Math.floor(Math.max(0, nowMs) / poseStepMs(beat));
}

/** The Pose at an instant: STILL_POSE under Reduced motion, else one step of the Pose clock from the phase offset. */
export function poseAt(nowMs: number, poseCount: number, reducedMotion: boolean, phaseOffset: number, beat: Beat | null = null): number {
  if (poseCount <= 0) return 0;
  const step = poseClock(nowMs, beat, reducedMotion);
  if (step === null) return STILL_POSE;
  return (((step + phaseOffset) % poseCount) + poseCount) % poseCount;
}

/** The Dancers among the Dead names: max(1, floor(n / 5)) of them, by seed then name; none when n is 0. */
export function dancers(deadNames: readonly string[]): ReadonlySet<string> {
  const unique = [...new Set(deadNames)];
  if (unique.length === 0) return new Set();
  const count = Math.max(1, Math.floor(unique.length / 5));
  const sorted = unique.sort((a, b) => seedOf(a) - seedOf(b) || (a < b ? -1 : a > b ? 1 : 0));
  return new Set(sorted.slice(0, count));
}

/** True for DANCE_LENGTH_MS in every DANCE_PERIOD_MS, starting at seed mod the period. */
export function inDanceWindow(name: string, nowMs: number): boolean {
  if (!Number.isFinite(nowMs)) return false;
  const start = seedOf(name) % DANCE_PERIOD_MS;
  const into = (((nowMs - start) % DANCE_PERIOD_MS) + DANCE_PERIOD_MS) % DANCE_PERIOD_MS;
  return into < DANCE_LENGTH_MS;
}
