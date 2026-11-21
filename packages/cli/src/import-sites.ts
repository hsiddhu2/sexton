// When the CLI may offer a remove. Spec: .kiro/specs/cli-and-action, Requirements 2.5, 2.6 (handoff decision 15). Pure.

import type { IntakePackage } from "@sexton/engine";

export interface ListingState {
  readonly performed: boolean;
  readonly capped: boolean;
  readonly skipped: number;
}

/**
 * An entry only for a dependencies package, and only when the listing ran in full: performed, nothing capped, nothing
 * skipped. devDependencies never get one: a tool used through its command or a config file has no import.
 */
export function importSitesFor(intake: readonly IntakePackage[], counts: ReadonlyMap<string, number>, listing: ListingState): Map<string, number> {
  const sites = new Map<string, number>();
  if (!listing.performed || listing.capped || listing.skipped !== 0) return sites;
  for (const pkg of intake) {
    if (pkg.origin !== "dependencies" || sites.has(pkg.name)) continue;
    const n = counts.get(pkg.name);
    if (n !== undefined) sites.set(pkg.name, n);
  }
  return sites;
}
