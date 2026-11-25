// Bump data fetch. Spec: .kiro/specs/remediation, Requirements 2.17 to 2.23, 8.2, 8.4, 8.6, 8.7, 8.9, 8.10.
// The fetch itself lives in version-data.ts, shared with gatherMigrationData. Never rejects; a failure degrades one package.

import semver from "semver";
import { isValidPackageName } from "../intake/names.js";
import type { ClientContext } from "../clients/context.js";
import { mapWithConcurrency } from "../util/concurrency.js";
import type { BumpDataResult } from "../types.js";
import { orderCandidates } from "./candidates.js";
import { BUMP_CONCURRENCY, fail, gatherVersionData } from "./version-data.js";

export { BUMP_CONCURRENCY } from "./version-data.js";
export type { BumpData, BumpFailure, BumpDataResult } from "../types.js";

export interface BumpTarget {
  readonly name: string;
  readonly installedVersion: string;
  readonly declaredRange?: string;
}

async function gatherOne(ctx: ClientContext, target: BumpTarget): Promise<BumpDataResult> {
  const { name, installedVersion } = target;
  if (!isValidPackageName(name)) return fail("package name is not a valid npm package name");
  if (semver.valid(installedVersion) !== installedVersion) return fail("installed version is not a valid semver version");
  return gatherVersionData(ctx, name, (published) => orderCandidates(installedVersion, target.declaredRange, published).map((c) => c.version));
}

/** Bump data for each target, one entry per distinct name. Never rejects. */
export async function gatherBumpData(ctx: ClientContext, targets: readonly BumpTarget[]): Promise<ReadonlyMap<string, BumpDataResult>> {
  const unique: BumpTarget[] = [];
  const seen = new Set<string>();
  for (const t of targets) {
    if (typeof t !== "object" || t === null || seen.has(t.name)) continue;
    seen.add(t.name);
    unique.push(t);
  }
  const results = await mapWithConcurrency(unique, BUMP_CONCURRENCY, async (t) => {
    try {
      return await gatherOne(ctx, t);
    } catch {
      return fail("bump data could not be read");
    }
  });
  const out = new Map<string, BumpDataResult>();
  unique.forEach((t, i) => out.set(t.name, results[i] as BumpDataResult));
  return out;
}
