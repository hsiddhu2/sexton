export const UNDISPLAYABLE_TEXT = "value cannot be displayed";

/** JSON.stringify(value, null, 2) with a fixed fallback when it throws or returns undefined. */
export function formatSignalValue(value: unknown): string {
  try {
    const text = JSON.stringify(value, null, 2) as string | undefined;
    return text ?? UNDISPLAYABLE_TEXT;
  } catch {
    return UNDISPLAYABLE_TEXT;
  }
}
