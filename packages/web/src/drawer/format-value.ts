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

export interface DisplayValue {
  readonly kind: "inline" | "block";
  readonly text: string;
}

/** Single values read inline and unquoted; objects and arrays stay a block. Unparseable text is shown as it is. */
export function displayValue(valueText: string): DisplayValue {
  let parsed: unknown;
  try {
    parsed = JSON.parse(valueText);
  } catch {
    return { kind: "inline", text: valueText };
  }
  if (typeof parsed === "string") return { kind: "inline", text: parsed };
  if (typeof parsed === "object" && parsed !== null) return { kind: "block", text: valueText };
  return { kind: "inline", text: valueText };
}
