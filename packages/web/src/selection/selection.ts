export type ArrowKey = "ArrowLeft" | "ArrowRight" | "ArrowUp" | "ArrowDown";

const ARROW_KEYS: readonly string[] = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"];

function isArrowKey(key: string): key is ArrowKey {
  return ARROW_KEYS.includes(key);
}

function clamp(value: number, count: number): number {
  return Math.min(Math.max(value, 0), count - 1);
}

/** A clamped integer index in 0..count-1. Returns 0 when count is not positive. */
function normalise(index: number | null, count: number): number {
  if (count <= 0) return 0;
  if (index === null || !Number.isFinite(index)) return 0;
  return clamp(Math.trunc(index), count);
}

export function moveSelection(index: number, key: string, columns: number, count: number): number {
  const start = normalise(index, count);
  if (count <= 0 || !isArrowKey(key)) return start;
  const step = Number.isFinite(columns) ? Math.max(1, Math.trunc(columns)) : 1;
  switch (key) {
    case "ArrowLeft":
      return clamp(start - 1, count);
    case "ArrowRight":
      return clamp(start + 1, count);
    case "ArrowUp":
      return clamp(start - step, count);
    case "ArrowDown":
      return clamp(start + step, count);
  }
}

export interface KeyEvent {
  readonly key: string;
  readonly ctrlKey: boolean;
  readonly altKey: boolean;
  readonly metaKey: boolean;
}

export interface KeyOutcome {
  readonly index: number | null;
  readonly handled: boolean;
  readonly preventDefault: boolean;
}

/**
 * Up and Down on a grave button. Left and Right are handled by the page (spec clean-site, 3.23): they move the
 * Selected grave in triage order with wrap, so they leave this reducer.
 */
export function reduceSelection(index: number | null, event: KeyEvent, columns: number, count: number): KeyOutcome {
  if (count <= 0) return { index: null, handled: false, preventDefault: false };
  const current = normalise(index, count);
  if (!isArrowKey(event.key) || event.key === "ArrowLeft" || event.key === "ArrowRight") return { index: current, handled: false, preventDefault: false };
  if (event.ctrlKey || event.altKey || event.metaKey) {
    return { index: current, handled: false, preventDefault: false };
  }
  return { index: moveSelection(current, event.key, columns, count), handled: true, preventDefault: true };
}

/** Pure. Left and Right on the page (spec clean-site, 3.23): the previous or next index, wrapping at the ends. */
export function stepWrap(index: number | null, key: "ArrowLeft" | "ArrowRight", count: number): number | null {
  if (count <= 0) return null;
  const current = normalise(index, count);
  return (current + (key === "ArrowRight" ? 1 : -1) + count) % count;
}
