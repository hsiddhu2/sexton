// Terminal-safe text. Spec: .kiro/specs/cli-and-action, Requirement 6.5, handoff decision 17.
// neutralise turns C0, C1, DEL, line and paragraph separators, bidi controls and direction marks into spaces and lone
// surrogates into U+FFFD; cleanLine (which neutralises again) cuts to max code points. Pure.

import { cleanLine, neutralise } from "@sexton/engine";

export function safe(value: unknown, max = 200): string {
  return cleanLine(neutralise(typeof value === "string" ? value : String(value)), max);
}
