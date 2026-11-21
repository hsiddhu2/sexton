import type { PackageHealth, Severity, State } from "@sexton/api";
import { STATES } from "../load/lists.js";

const SEVERITY_RANK: Record<Severity, 1 | 2 | 3 | 4 | 5> = { Critical: 5, High: 4, Moderate: 3, Low: 2, Unknown: 1 };

/** Highest advisory severity: Critical 5 down to Unknown 1. Unavailable or empty gives 0 (3.3). */
export function severityRank(pkg: PackageHealth): 0 | 1 | 2 | 3 | 4 | 5 {
  const signal = pkg.signals.advisories;
  if (!signal.available) return 0;
  let max: 0 | 1 | 2 | 3 | 4 | 5 = 0;
  for (const advisory of signal.value) {
    const rank = SEVERITY_RANK[advisory.severity];
    if (rank > max) max = rank;
  }
  return max;
}

/** The reach of an available transitiveReach signal, else 0 (3.4). */
export function reachRank(pkg: PackageHealth): number {
  const signal = pkg.signals.transitiveReach;
  return signal.available ? signal.value.reach : 0;
}

/** Index in STATES: Possessed 0, Dead 1, Haunted 2, Restless 3, Alive 4. */
export function stateRank(state: State): 0 | 1 | 2 | 3 | 4 {
  return STATES.indexOf(state) as 0 | 1 | 2 | 3 | 4;
}

export function compareTriage(a: PackageHealth, b: PackageHealth): number {
  const byState = stateRank(a.state) - stateRank(b.state);
  if (byState !== 0) return byState;
  const bySeverity = severityRank(b) - severityRank(a);
  if (bySeverity !== 0) return bySeverity;
  const byReach = reachRank(b) - reachRank(a);
  if (byReach !== 0) return byReach;
  return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
}

export function triageOrder(packages: readonly PackageHealth[]): PackageHealth[] {
  return packages.slice().sort(compareTriage);
}
