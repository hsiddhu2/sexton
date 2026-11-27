// The Home headline (spec clean-site, design C3, requirements 2.1 to 2.3) and the State counts at the shown date
// (2.4). Only Possessed packages count as "need you now"; Dead, Haunted and a failing policy keep the all-clear away
// (2.16, 2.17). Pure.
import type { ScanResponse, State } from "@sexton/api";
import { hasGhost } from "../scene/layout.js";
import { formAt, timelineOf } from "../time/form-at.js";
import { ALL_CLEAR_TEXT, needFixingText, pastNothingText, pastPossessedText, policyFailsText, possessedText } from "../copy/headline.js";

export type StateCounts = Readonly<Record<State, number>>;

export interface Counts {
  readonly counts: StateCounts;
  /** Packages published at the date; every package at the scan date. */
  readonly total: number;
}

export interface Headline {
  /** The number set in the Possessed colour, or null when nothing needs the visitor. */
  readonly count: string | null;
  /** The rest of the headline after the count, or the whole headline when count is null. */
  readonly text: string;
}

/** Pure. The State of every package at `atMs` (null: the scan date); a package not published then is not counted. */
export function countsAt(response: ScanResponse, atMs: number | null): Counts {
  const counts: Record<State, number> = { Possessed: 0, Dead: 0, Haunted: 0, Restless: 0, Alive: 0 };
  let total = 0;
  for (const pkg of response.report.packages) {
    const state =
      atMs === null
        ? pkg.state
        : formAt(timelineOf(response, pkg.name), atMs, { state: pkg.state, reason: pkg.stateReason, ghost: hasGhost(pkg) }).state;
    if (state === null) continue;
    counts[state] += 1;
    total += 1;
  }
  return { counts, total };
}

/**
 * Pure. At the scan date (`date` null), in this order (2.1, 2.16, 2.17, 2.2): "<n> of <total> dependencies need you
 * now." when any package is Possessed; "Nothing is possessed. <k> of <total> need fixing." when any is Dead or Haunted;
 * "Nothing is possessed. The policy fails on <r> rules." when `failingRules` is above 0; else "Nothing needs you now."
 * At an earlier `date` (already written for display): "<n> of <total> dependencies needed you on <date>." or "Nothing
 * needed you on <date>." (2.3). `failingRules` is 0 where the policy result does not apply, as on a replay.
 */
export function headline(counts: StateCounts, total: number, date: string | null, failingRules = 0): Headline {
  const n = counts.Possessed;
  if (date !== null) {
    if (n === 0) return { count: null, text: pastNothingText(date) };
    return { count: String(n), text: pastPossessedText(total, date) };
  }
  if (n > 0) return { count: String(n), text: possessedText(n, total) };
  const k = counts.Dead + counts.Haunted;
  if (k > 0) return { count: null, text: needFixingText(k, total) };
  if (failingRules > 0) return { count: null, text: policyFailsText(failingRules) };
  return { count: null, text: ALL_CLEAR_TEXT };
}
