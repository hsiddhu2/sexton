/**
 * Index of the next focus target when Tab or Shift+Tab is pressed on element `current` of `count` focusables.
 * Returns -1 when there is nothing to focus (the dialog container takes focus).
 */
export function trapStep(count: number, current: number, shift: boolean): number {
  if (!Number.isInteger(count) || count <= 0) return -1;
  if (!Number.isInteger(current) || current < 0 || current >= count) return shift ? count - 1 : 0;
  return shift ? (current - 1 + count) % count : (current + 1) % count;
}
