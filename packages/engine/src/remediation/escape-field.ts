// The one escaping function for text from outside the engine. Spec: .kiro/specs/remediation, Requirements 5.6, 5.17, 8.8,
// HP decision 5: escape first, then truncate. Pure.

export const ESCAPE_MAX_CODE_POINTS = 200;
const ELLIPSIS = "\u2026";

const LONE_SURROGATE = /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g;
const UNSAFE = /[\p{Cc}\u2028\u2029\u202a-\u202e\u2066-\u2069\u200e\u200f\u061c]/gu;

/** Lone surrogates to U+FFFD, then control, line-separator, bidi and direction-mark characters to a space. */
export function neutralise(value: unknown): string {
  const text = typeof value === "string" ? value : "";
  return text.replace(LONE_SURROGATE, "\ufffd").replace(UNSAFE, " ");
}

/** Cuts units so their cost stays within max, appending an ellipsis when anything was left out. */
export function cutUnits(units: readonly string[], cost: (unit: string) => number, max: number): string {
  let total = 0;
  let kept = "";
  for (let i = 0; i < units.length; i++) {
    const unit = units[i] as string;
    const c = cost(unit);
    if (total + c > max) return kept + ELLIPSIS;
    total += c;
    kept += unit;
  }
  return kept;
}

/** An inline code span that no Markdown inside it can break. At most 203 code points. */
export function escapeField(value: string): string {
  const units = Array.from(neutralise(value).replace(/`/g, "'")).map((ch) => (ch === "|" ? "\\|" : ch));
  const kept = cutUnits(units, (u) => (u === "\\|" ? 2 : 1), ESCAPE_MAX_CODE_POINTS);
  return `\`${kept.length === 0 ? " " : kept}\``;
}
