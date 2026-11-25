// The Bubble schedule (spec cemetery-undead-2, requirement 7.3): at most two Bubbles, chosen by the clock alone. Pure.

export const BUBBLE_SLOT_MS = 6_000;
export const BUBBLE_SHOW_MS = 4_500;

/** FNV-1a, 32 bits, of a string. */
export function fnv1a(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** The slot of an instant, or null for an instant that is not a finite number. */
export function slotOf(nowMs: number): number | null {
  return Number.isFinite(nowMs) ? Math.floor(nowMs / BUBBLE_SLOT_MS) : null;
}

/** True in the first BUBBLE_SHOW_MS of a slot. */
export function inShowWindow(nowMs: number): boolean {
  const slot = slotOf(nowMs);
  return slot !== null && nowMs - slot * BUBBLE_SLOT_MS < BUBBLE_SHOW_MS;
}

/** At most two of the eligible grave indices for this instant, or none in the last 1,500 ms of a slot. */
export function bubblesAt(eligible: readonly number[], nowMs: number): readonly number[] {
  const n = eligible.length;
  const slot = slotOf(nowMs);
  if (n === 0 || slot === null || !inShowWindow(nowMs)) return [];
  const hash = fnv1a(String(slot));
  const p = hash % n;
  const first = eligible[p];
  if (first === undefined) return [];
  if (n === 1) return [first];
  const second = eligible[(p + 1 + ((hash >>> 8) % (n - 1))) % n];
  return second === undefined ? [first] : [first, second];
}

/** The next instant after nowMs at which the schedule changes: the next show boundary or slot start. */
export function nextBubbleChange(nowMs: number): number {
  const slot = slotOf(nowMs) ?? 0;
  const start = slot * BUBBLE_SLOT_MS;
  return nowMs < start + BUBBLE_SHOW_MS ? start + BUBBLE_SHOW_MS : start + BUBBLE_SLOT_MS;
}
