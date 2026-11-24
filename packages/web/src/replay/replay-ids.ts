// The closed set of replay ids and their fixture addresses. Spec cemetery-time, requirement 18.
export const REPLAY_IDS = ["axios", "keyv"] as const;
export type ReplayId = (typeof REPLAY_IDS)[number];

/** The button text of each replay. */
export const REPLAY_BUTTON_TEXT: Readonly<Record<ReplayId, string>> = { axios: "axios 2026", keyv: "keyv 2026" };

/** The fixture address, a path on the page origin. It passes checkScanUrl. */
export function replayAddress(id: ReplayId): string {
  return `/replay/${id}.json`;
}

export function isReplayId(value: string): value is ReplayId {
  return (REPLAY_IDS as readonly string[]).includes(value);
}

export type ReplayParam = { readonly id: ReplayId } | { readonly rejected: true } | null;

/**
 * Pure. `null` when the query has no `replay` key, `{ id }` when it holds exactly one value that is exactly a known id,
 * else `{ rejected: true }` (an empty value, a repeated key, a case variant, a path, a URL).
 */
export function parseReplayParam(search: string): ReplayParam {
  const params = new URLSearchParams(search);
  const values = params.getAll("replay");
  if (values.length === 0) return null;
  const only = values[0];
  if (values.length === 1 && only !== undefined && isReplayId(only)) return { id: only };
  return { rejected: true };
}
