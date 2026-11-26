// The Home headline (spec clean-site, design C3, requirements 2.1 to 2.3) and the State counts at the shown date
// (2.4). Only Possessed packages count as "need you now" (call 1 of design.md). Pure.
import type { ScanResponse, State } from "@sexton/api";
import { hasGhost } from "../scene/layout.js";
import { formAt, timelineOf } from "../time/form-at.js";

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
 * Pure. "<n> of <total> dependencies need you now." ("needs" for one), "Nothing needs you now.", and at an earlier
 * `date` (already written for display) "<n> of <total> dependencies needed you on <date>." or "Nothing needed you on <date>."
 */
export function headline(counts: StateCounts, total: number, date: string | null): Headline {
  const n = counts.Possessed;
  if (date === null) {
    if (n === 0) return { count: null, text: "Nothing needs you now." };
    return { count: String(n), text: ` of ${String(total)} dependencies ${n === 1 ? "needs" : "need"} you now.` };
  }
  if (n === 0) return { count: null, text: `Nothing needed you on ${date}.` };
  return { count: String(n), text: ` of ${String(total)} dependencies needed you on ${date}.` };
}
