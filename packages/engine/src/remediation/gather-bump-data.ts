// Bump data fetch. Spec: .kiro/specs/remediation, Requirements 2.17 to 2.23, 8.2, 8.4, 8.6, 8.7, 8.9, 8.10.
// The only remediation module that touches a Transport. Never rejects; a failure degrades one package.

import semver from "semver";
import { UpstreamError } from "../http.js";
import { isValidPackageName } from "../intake/names.js";
import { readFullPackument } from "../clients/npm.js";
import { fetchAdvisory, OsvPaginationError, OsvShapeError, queryVulnIdsBatch } from "../clients/osv.js";
import type { ClientContext } from "../clients/context.js";
import { mapWithConcurrency } from "../score.js";
import type { Advisory } from "../types.js";
import { orderCandidates } from "./candidates.js";
import { readPublished } from "./read-published.js";

export const BUMP_CONCURRENCY = 8;

export interface BumpTarget {
  readonly name: string;
  readonly installedVersion: string;
  readonly declaredRange?: string;
}

export interface BumpData {
  readonly ok: true;
  readonly published: readonly string[];
  readonly deprecated: ReadonlySet<string>;
  readonly advisories: ReadonlyMap<string, readonly Advisory[]>;
}

export interface BumpFailure {
  readonly ok: false;
  readonly reason: string;
}

export type BumpDataResult = BumpData | BumpFailure;

type Stage = "packument request" | "OSV querybatch" | "OSV advisory detail";

/** Fixed reason text. Only an HTTP status is taken from the error, never its message. Design decision 7. */
function reasonFor(error: unknown, stage: Stage): string {
  if (error instanceof UpstreamError) return `${stage} failed (HTTP ${String(error.status)})`;
  if (error instanceof OsvPaginationError) return "OSV querybatch pagination did not finish";
  if (error instanceof OsvShapeError) return `${stage} response is malformed`;
  return `${stage} failed`;
}

const fail = (reason: string): BumpFailure => ({ ok: false, reason });

async function gatherOne(ctx: ClientContext, target: BumpTarget): Promise<BumpDataResult> {
  const { name, installedVersion } = target;
  if (!isValidPackageName(name)) return fail("package name is not a valid npm package name");
  if (semver.valid(installedVersion) !== installedVersion) return fail("installed version is not a valid semver version");

  let packument: unknown;
  try {
    packument = await readFullPackument(ctx, name);
  } catch (error) {
    return fail(reasonFor(error, "packument request"));
  }
  const published = readPublished(packument);
  if (published === null) return fail("packument has no versions");

  const candidates = orderCandidates(installedVersion, target.declaredRange, published.versions);
  if (candidates.length === 0) {
    return { ok: true, published: published.versions, deprecated: published.deprecated, advisories: new Map() };
  }

  let idsByVersion: ReadonlyMap<string, readonly string[]>;
  try {
    idsByVersion = await queryVulnIdsBatch(
      ctx,
      name,
      candidates.map((c) => c.version),
    );
  } catch (error) {
    return fail(reasonFor(error, "OSV querybatch"));
  }

  const distinct = [...new Set([...idsByVersion.values()].flat())];
  const details = new Map<string, Advisory>();
  try {
    const fetched = await mapWithConcurrency(distinct, BUMP_CONCURRENCY, (id) => fetchAdvisory(ctx, id));
    distinct.forEach((id, i) => details.set(id, fetched[i] as Advisory));
  } catch (error) {
    return fail(reasonFor(error, "OSV advisory detail"));
  }

  const advisories = new Map<string, readonly Advisory[]>();
  for (const c of candidates) {
    const ids = idsByVersion.get(c.version) ?? [];
    advisories.set(
      c.version,
      ids.map((id) => {
        const advisory = details.get(id) as Advisory;
        return { id: advisory.id, severity: advisory.severity, summary: advisory.summary };
      }),
    );
  }
  return { ok: true, published: published.versions, deprecated: published.deprecated, advisories };
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
