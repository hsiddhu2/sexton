// The Bubble table (spec cemetery-undead-2, requirement 7, design.md "Bubble table", approved by the owner on 25 Nov
// 2026 with two lines changed). One short line per State and Reason family, true of that reason. Pure: it takes no
// package name, so no line can depend on one.
import type { State } from "@sexton/api";
import { reasonFamily, type ReasonFamily } from "../epitaph/epitaph.js";

export const BUBBLE_LINES: Readonly<Record<ReasonFamily, string>> = {
  deprecated: "Deprecated, not departed.",
  "minor-advisory": "One more minor bump and I am coming out.",
  "maintainer-change": "Who has the keys now?",
  "provenance-regression": "Papers? I left them in the last version.",
  "install-script": "I brought a script. It runs on install.",
  // Spec new-signals, task 10.2 (approved by the owner on 25 Nov 2026).
  "new-dependency": "I brought a plus-one. Nobody checked the list.",
  "publisher-change": "Published by hand. The robot usually does it.",
  "stale-with-advisory": "Two years down here, and the hole is open.",
  "severe-advisory": "Boo. Severity High, or worse.",
  "no-signals": "Couldn't read my papers. Ask me again later.",
  stale: "Two years without a release. Getting restless.",
  "no-rule": "Still kicking. The party hat stays on.",
};

/** The longest line, in characters (decision 1 of design.md "Decisions made during implementation"). */
export const MAX_BUBBLE_CHARS = 46;

/** The Bubble line of a State and its reason, or null when the reason is not one the table knows. */
export function bubbleLine(state: State, reason: string): string | null {
  const family = reasonFamily(state, reason);
  return family === null ? null : BUBBLE_LINES[family];
}
