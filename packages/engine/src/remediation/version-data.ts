// Version data fetch shared by gatherBumpData and gatherMigrationData. Spec: .kiro/specs/remediation, Requirements 2.17
// to 2.22 (2.20 and 2.21 as corrected), and .kiro/specs/migration-node-sass, Requirements 3.5, 3.6, 9.2.
// The only remediation module besides the two gatherers that touches a Transport. Never rejects for a well-typed ctx.

import { UpstreamError } from "../http.js";
import { readFullPackument } from "../clients/npm.js";
import { fetchAdvisory, OsvPaginationError, OsvShapeError, queryVulnIdsBatch } from "../clients/osv.js";
import type { ClientContext } from "../clients/context.js";
import { mapWithConcurrency } from "../util/concurrency.js";
import type { Advisory, BumpDataResult, BumpFailure } from "../types.js";
import { readPublished } from "./read-published.js";

export const BUMP_CONCURRENCY = 8;
/** Distinct advisory IDs per package beyond which no detail is fetched. Correction of remediation 2.20, 2.21. */
export const MAX_ADVISORY_IDS = 200;
export const REASON_TOO_MANY_ADVISORIES = "too many advisories";

type Stage = "packument request" | "OSV querybatch" | "OSV advisory detail";

/** Fixed reason text. Only an HTTP status is taken from the error, never its message. */
function reasonFor(error: unknown, stage: Stage): string {
  if (error instanceof UpstreamError) return `${stage} failed (HTTP ${String(error.status)})`;
  if (error instanceof OsvPaginationError) return "OSV querybatch pagination did not finish";
  if (error instanceof OsvShapeError) return `${stage} response is malformed`;
  return `${stage} failed`;
}

export const fail = (reason: string): BumpFailure => ({ ok: false, reason });

/**
 * Reads the packument of a valid package name, asks candidatesOf for the versions to evaluate, queries OSV for those
 * versions in one bounded querybatch, and fetches each distinct advisory once. The caller has checked the name.
 */
export async function gatherVersionData(
  ctx: ClientContext,
  name: string,
  candidatesOf: (published: readonly string[]) => readonly string[],
): Promise<BumpDataResult> {
  let packument: unknown;
  try {
    packument = await readFullPackument(ctx, name);
  } catch (error) {
    return fail(reasonFor(error, "packument request"));
  }
  const published = readPublished(packument);
  if (published === null) return fail("packument has no versions");

  const candidates = candidatesOf(published.versions);
  if (candidates.length === 0) {
    return { ok: true, published: published.versions, deprecated: published.deprecated, advisories: new Map() };
  }

  let idsByVersion: ReadonlyMap<string, readonly string[]>;
  try {
    idsByVersion = await queryVulnIdsBatch(ctx, name, candidates);
  } catch (error) {
    return fail(reasonFor(error, "OSV querybatch"));
  }

  const distinct = [...new Set([...idsByVersion.values()].flat())];
  if (distinct.length > MAX_ADVISORY_IDS) return fail(REASON_TOO_MANY_ADVISORIES);
  const details = new Map<string, Advisory>();
  try {
    const fetched = await mapWithConcurrency(distinct, BUMP_CONCURRENCY, (id) => fetchAdvisory(ctx, id));
    distinct.forEach((id, i) => details.set(id, fetched[i] as Advisory));
  } catch (error) {
    return fail(reasonFor(error, "OSV advisory detail"));
  }

  const advisories = new Map<string, readonly Advisory[]>();
  for (const version of candidates) {
    const ids = idsByVersion.get(version) ?? [];
    advisories.set(
      version,
      ids.map((id) => {
        const advisory = details.get(id) as Advisory;
        return { id: advisory.id, severity: advisory.severity, summary: advisory.summary };
      }),
    );
  }
  return { ok: true, published: published.versions, deprecated: published.deprecated, advisories };
}
