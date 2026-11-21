// Range style. Spec: .kiro/specs/remediation, Requirements 4.13, 4.14, 8.5, HP decision 4. Pure.
// The Declared range is read only to pick a style. It is never copied into an Edit, a title or a body.

import semver from "semver";
import { isUsableRange } from "./candidates.js";

export type RangeStyle = "exact" | "tilde" | "caret";

const TILDE = /^~>?\s*[^\s|<>=~^]+$/;
const LEADING_EQUALS = /^=\s*/;
const SPACE_OR_PIPE = /[\s|]/;

/** The operator form of a Declared range. An absent, unusable or compound range is "caret". */
export function rangeStyle(declaredRange: string | undefined): RangeStyle {
  try {
    if (!isUsableRange(declaredRange)) return "caret";
    const text = declaredRange.trim();
    const bare = text.replace(LEADING_EQUALS, "");
    if (!SPACE_OR_PIPE.test(bare) && semver.valid(bare) !== null) return "exact";
    if (TILDE.test(text)) return "tilde";
    return "caret";
  } catch {
    return "caret";
  }
}

/** The new range for a chosen Published version in a style. */
export function styledRange(style: RangeStyle, version: string): string {
  if (style === "exact") return version;
  if (style === "tilde") return `~${version}`;
  return `^${version}`;
}
