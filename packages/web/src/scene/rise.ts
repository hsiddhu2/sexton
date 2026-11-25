// The Rise clip and the Load moment (spec cemetery-undead-2, requirement 11). Pure.

/** One grave's rise out of the ground. */
export const RISE_MS = 400;
/** The last grave of the Load moment starts at most this long after the first. */
export const LOAD_SPREAD_MS = 500;
/** The gap between two graves' starts, at most. */
export const LOAD_STEP_MS = 40;

/** 0 under the ground, 1 standing. Ease-out cubic, clamped; NaN and t <= 0 give 0. */
export function riseAt(elapsedMs: number, durationMs: number = RISE_MS): number {
  if (!(elapsedMs > 0) || !(durationMs > 0)) return 0;
  if (elapsedMs >= durationMs) return 1;
  const u = 1 - elapsedMs / durationMs;
  return 1 - u * u * u;
}

/** The start delay of grave i of n in the Load moment, in triage order: i times min(40, 500 / (n - 1)). */
export function loadDelay(index: number, n: number): number {
  if (!(n > 1) || !(index > 0)) return 0;
  const i = Math.min(index, n - 1);
  return Math.min(i * LOAD_STEP_MS, (i * LOAD_SPREAD_MS) / (n - 1));
}

/** The whole Load moment's length for n graves: the last start plus one rise. */
export function loadMomentMs(n: number): number {
  return loadDelay(n - 1, n) + RISE_MS;
}
