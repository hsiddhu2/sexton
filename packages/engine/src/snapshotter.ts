// Snapshotter job function. Requirement 5. No scheduler, timer or cron here.

import type { ClientContext } from "./clients/context.js";
import { describeFailure, isRecord } from "./clients/context.js";
import { fetchProvenanceSignal } from "./clients/attestations.js";
import { extractMaintainers, fetchFullPackumentDocument } from "./clients/maintainers.js";
import { readAbbreviatedPackument } from "./clients/npm.js";
import { publishedVersions } from "./history.js";
import { mapWithConcurrency, PACKAGE_CONCURRENCY } from "./util/concurrency.js";
import { cleanReason, toIso } from "./signal.js";
import { MAX_SNAPSHOT_VERSIONS, RECENT_WINDOW_MS, type Snapshot, type SnapshotStore, type SnapshotVersion } from "./snapshot.js";

export const VERSION_CONCURRENCY = 4;

export interface SnapshotterFailure {
  readonly name: string;
  readonly reason: string;
}

export interface SnapshotterResult {
  readonly snapshotted: readonly string[];
  readonly failed: readonly SnapshotterFailure[];
  readonly error?: string;
}

type Outcome = { readonly name: string; readonly ok: true } | { readonly name: string; readonly ok: false; readonly reason: string };

function compareCodeUnits(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Appends one Snapshot per seen package. Never raises. Requirement 5. */
export async function runSnapshotter(store: SnapshotStore, ctx: ClientContext, names?: readonly string[]): Promise<SnapshotterResult> {
  const now = ctx.clock();
  const captureTime = toIso(now);

  let seen: string[];
  if (names !== undefined) {
    seen = [...new Set(names)];
  } else {
    try {
      seen = [...new Set(await store.listSeenWithin(now, RECENT_WINDOW_MS))];
    } catch (error) {
      return { snapshotted: [], failed: [], error: cleanReason(`listing seen packages failed: ${describeFailure(error)}`) };
    }
  }

  const outcomes = await mapWithConcurrency(seen, PACKAGE_CONCURRENCY, (name) => snapshotOne(store, ctx, name, captureTime));
  const snapshotted: string[] = [];
  const failed: SnapshotterFailure[] = [];
  for (const outcome of outcomes) {
    if (outcome.ok) snapshotted.push(outcome.name);
    else failed.push({ name: outcome.name, reason: outcome.reason });
  }
  snapshotted.sort(compareCodeUnits);
  failed.sort((a, b) => compareCodeUnits(a.name, b.name));
  return { snapshotted, failed };
}

async function snapshotOne(store: SnapshotStore, ctx: ClientContext, name: string, captureTime: string): Promise<Outcome> {
  const fail = (prefix: string, error: unknown): Outcome => ({ name, ok: false, reason: cleanReason(`${prefix}: ${describeFailure(error)}`) });
  try {
    const full = await fetchFullPackumentDocument(ctx, name);
    if (!full.ok) return fail("full packument read failed", full.reason);

    let abbreviated: unknown;
    try {
      abbreviated = await readAbbreviatedPackument(ctx, name);
    } catch (error) {
      return fail("abbreviated packument read failed", error);
    }
    const abbreviatedVersions = isRecord(abbreviated) && isRecord(abbreviated["versions"]) ? abbreviated["versions"] : {};

    const selected = publishedVersions(full.doc).slice(-MAX_SNAPSHOT_VERSIONS);
    const versions: SnapshotVersion[] = await mapWithConcurrency(selected, VERSION_CONCURRENCY, async (published) => {
      const entry = Object.hasOwn(abbreviatedVersions, published.version) ? abbreviatedVersions[published.version] : undefined;
      const provenance = await fetchProvenanceSignal(ctx, name, published.version);
      return {
        version: published.version,
        publishTime: published.publishTime,
        hasInstallScript: isRecord(entry) && entry["hasInstallScript"] === true,
        provenance: provenance.available ? provenance.value.present : null,
      };
    });

    const snapshot: Snapshot = { name, captureTime, maintainers: extractMaintainers(full.doc), versions };
    try {
      await store.append(snapshot);
    } catch (error) {
      return fail("snapshot append failed", error);
    }
    return { name, ok: true };
  } catch (error) {
    return fail("snapshot failed", error);
  }
}
