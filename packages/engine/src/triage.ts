// Triage order of R-UI-3. Spec: .kiro/specs/sexton-power, Requirement 8.4. Pure.
// Possessed first, then by State from least to most healthy (STATE_ORDER), then highest advisory severity (higher first),
// then transitive reach (higher first), then name (code unit order). The web app holds its own copy; a test keeps them equal.
import { STATE_ORDER, type PackageHealth, type Severity } from "./types.js";

const SEVERITY_RANK: Readonly<Record<Severity, 1 | 2 | 3 | 4 | 5>> = { Critical: 5, High: 4, Moderate: 3, Low: 2, Unknown: 1 };

/** Highest advisory severity: Critical 5 down to Unknown 1. Unavailable or no advisories gives 0. */
function severityRank(pkg: PackageHealth): number {
  const signal = pkg.signals.advisories;
  if (!signal.available) return 0;
  let max = 0;
  for (const advisory of signal.value) {
    const rank = SEVERITY_RANK[advisory.severity];
    if (rank > max) max = rank;
  }
  return max;
}

/** The reach of an available transitiveReach signal, else 0. */
function reachRank(pkg: PackageHealth): number {
  const signal = pkg.signals.transitiveReach;
  return signal.available ? signal.value.reach : 0;
}

export function compareTriage(a: PackageHealth, b: PackageHealth): number {
  const byState = STATE_ORDER.indexOf(a.state) - STATE_ORDER.indexOf(b.state);
  if (byState !== 0) return byState;
  const bySeverity = severityRank(b) - severityRank(a);
  if (bySeverity !== 0) return bySeverity;
  const byReach = reachRank(b) - reachRank(a);
  if (byReach !== 0) return byReach;
  return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
}

/** A new array in triage order. The input is not changed. */
export function triageOrder(packages: readonly PackageHealth[]): PackageHealth[] {
  return packages.slice().sort(compareTriage);
}
