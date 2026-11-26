// A little mischief (spec clean-site, design C16, requirement 19): every Epitaph line, Dry line and the Scanning line,
// word for word, and nothing else. None names a capability. Clear wins: none replaces or shortens a plain sentence or a
// next step. Pure.
import type { FailureCardId } from "../load/scan-failure.js";
import type { Family } from "../panel/reason-family.js";

/** The Inspector's Epitaph line for each Reason family (19.1). */
export const EPITAPH_LINES: Readonly<Record<Family, string>> = {
  maintainer: "The keys changed hands. Nobody heard the door.",
  provenance: "It used to carry papers. This one came without.",
  "install-script": "It came back with a script, and it runs before you do.",
  "new-dependency": "It brought a new friend along. Check the friend.",
  publisher: "A new hand signed this one. The pipeline did not.",
  deprecated: "Deprecated, not departed.",
  "stale-advisory": "Two years without a release, and a hole still open.",
  high: "Something serious walks these grounds.",
  unavailable: "Nobody could find its records.",
  stale: "Two years of silence. It may just be resting.",
  low: "A small advisory keeps it awake.",
  none: "Alive and well, as far as the records show.",
};

/** The cards that open with a Dry line: the Live scan cards of 12.2, the load card of 12.7 and the 10.10 card. */
export type DryCard = FailureCardId | "load-failed" | "no-such-replay";

/** The Dry line at the top of each failure card (19.3, 19.4). */
export const DRY_LINES: Readonly<Record<DryCard, string>> = {
  network: "The lantern went out halfway down the path.",
  "rate-limited": "Easy now, even the dead take turns.",
  busy: "The gravediggers upstream are swamped.",
  "not-readable": "We knocked, and nobody answered.",
  "invalid-url": "That address leads to no cemetery we know.",
  "invalid-file": "The headstone is cracked.",
  "too-large": "That plot is too big for one shovel.",
  "invalid-policy": "The house rules are smudged.",
  generic: "Our shovel slipped.",
  "load-failed": "This one would not come out of the ground.",
  "no-such-replay": "No such ghost story is told here.",
};

/** The Scanning line under the scanning card's note (19.8). */
export const SCANNING_LINE = "Lantern lit. Mind the roots.";
