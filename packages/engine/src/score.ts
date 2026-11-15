// Health scoring entry point. Requirement 10, 14.

import { CachedFetcher, MemoryCacheStore, type CacheStore, type Clock } from "./cache.js";
import { fetchProvenanceSignal } from "./clients/attestations.js";
import { describeFailure, type ClientContext } from "./clients/context.js";
import { dependenciesUrl, DEPS_DEV_SOURCE, fetchDependencyGraph } from "./clients/deps-dev.js";
import { fetchFullPackumentDocument, maintainersSignalFrom, type PackumentDocument } from "./clients/maintainers.js";
import { fetchInstallScriptSignal, fetchPackumentSignals, packumentUrl, readAbbreviatedPackument } from "./clients/npm.js";
import { fetchAdvisoriesSignal } from "./clients/osv.js";
import { evaluateProvenanceRegression, maintainerChangeValue, newInstallScriptEvents } from "./history.js";
import { createFetchTransport, type RetryOptions, type Transport } from "./http.js";
import { transitiveReach, unionGraph, type ResolvedGraph, type UnionGraph } from "./reach.js";
import { available, fromIso, unavailable } from "./signal.js";
import type { Snapshot, SnapshotStore } from "./snapshot.js";
import { stateFromSignals } from "./state.js";
import {
  SIGNAL_NAMES,
  type HealthReport,
  type NewInstallScriptEvent,
  type NewSignals,
  type OriginalSignals,
  type PackageHealth,
  type PackageRef,
  type PackageSignals,
  type ProvenanceValue,
  type Signal,
  type SignalName,
  type TransitiveReachValue,
} from "./types.js";

export const PACKAGE_CONCURRENCY = 8;

export interface ScoringDependencies {
  readonly transport?: Transport;
  readonly clock?: Clock;
  readonly cacheTtlMs?: number;
  readonly cacheStore?: CacheStore;
  readonly retry?: RetryOptions;
  readonly snapshotStore?: SnapshotStore;
}

export interface ScoreOneOptions {
  readonly snapshotStore?: SnapshotStore;
  readonly reach?: ReachPhase;
  /** Defaults to ctx.clock(). */
  readonly reference?: Date;
}

/** Scores every package. One entry per input, in input order. Never throws for an upstream failure. */
export async function scorePackages(packages: readonly PackageRef[], deps: ScoringDependencies = {}): Promise<HealthReport> {
  const clock = deps.clock ?? (() => new Date());
  const ctx: ClientContext = {
    transport: deps.transport ?? createFetchTransport(),
    clock,
    cache: new CachedFetcher({ store: deps.cacheStore ?? new MemoryCacheStore(), clock, ...(deps.cacheTtlMs !== undefined ? { ttlMs: deps.cacheTtlMs } : {}) }),
    ...(deps.retry !== undefined ? { retry: deps.retry } : {}),
  };
  const reference = clock();
  const reach = await collectReach(ctx, packages);
  const options: ScoreOneOptions = {
    reach,
    reference,
    ...(deps.snapshotStore !== undefined ? { snapshotStore: deps.snapshotStore } : {}),
  };
  const results = await mapWithConcurrency(packages, PACKAGE_CONCURRENCY, (pkg) => scoreOne(ctx, pkg, options));
  return { generatedAt: clock().toISOString(), packages: results };
}

type HistoryRead = HistorySignalInput["historyRead"];

/** Fetches all ten signals and assigns a state. Never appends to the store. Requirement 10. */
export async function scoreOne(ctx: ClientContext, pkg: PackageRef, options: ScoreOneOptions = {}): Promise<PackageHealth> {
  const { name, installedVersion } = pkg;
  const reference = options.reference ?? ctx.clock();
  const store = options.snapshotStore;

  const readHistory = async (): Promise<HistoryRead> => {
    if (store === undefined) return { ok: true, history: [] }; // Requirement 10.13.
    try {
      return { ok: true, history: await store.history(name) };
    } catch (error) {
      return { ok: false, reason: describeFailure(error) };
    }
  };
  const readAbbreviated = async (): Promise<HistorySignalInput["abbreviatedPackument"]> => {
    try {
      return { ok: true, doc: await readAbbreviatedPackument(ctx, name) };
    } catch (error) {
      return { ok: false, reason: describeFailure(error) };
    }
  };
  const recordSeen = async (): Promise<void> => {
    if (store === undefined) return;
    try {
      await store.recordSeen(name, reference);
    } catch {
      // A Seen failure changes nothing in the entry. Requirement 10.12.
    }
  };

  const seen = recordSeen();
  const [packument, hasInstallScript, advisories, fullPackument, abbreviatedPackument, provenance, historyRead] =
    await Promise.all([
      fetchPackumentSignals(ctx, name, installedVersion),
      fetchInstallScriptSignal(ctx, name, installedVersion),
      fetchAdvisoriesSignal(ctx, name, installedVersion),
      fetchFullPackumentDocument(ctx, name),
      readAbbreviated(),
      fetchProvenanceSignal(ctx, name, installedVersion),
      readHistory(),
    ]);
  await seen;

  const maintainers = maintainersSignalFrom(fullPackument);
  const history = buildHistorySignals({
    name,
    installedVersion,
    reference,
    maintainers,
    provenance,
    hasInstallScript,
    fullPackument,
    abbreviatedPackument,
    historyRead,
  });

  const transitiveReachSignal: Signal<TransitiveReachValue> = (() => {
    const reachPhase = options.reach;
    if (reachPhase === undefined) {
      return unavailable("reach phase not run", DEPS_DEV_SOURCE, reference);
    }
    const fetch = reachPhase.fetches.get(`${name}@${installedVersion}`);
    const value: TransitiveReachValue = {
      reach: transitiveReach(reachPhase.union, name),
      graphsMissing: reachPhase.graphsMissing,
    };
    return available(value, fetch?.source ?? dependenciesUrl(name, installedVersion), fetch === undefined ? reference : fromIso(fetch.fetchedAt));
  })();

  const signals: OriginalSignals & Partial<NewSignals> = {
    lastPublish: packument.lastPublish,
    deprecated: packument.deprecated,
    hasInstallScript,
    advisories,
    maintainers,
    provenance,
    transitiveReach: transitiveReachSignal,
    ...history,
  };
  return buildHealth(pkg, signals, reference);
}

/** Pure assembly of a health entry from signals. Requirement 10.1, 10.3, 14.2, 14.3. */
export function buildHealth(pkg: PackageRef, signals: OriginalSignals & Partial<NewSignals>, now: Date): PackageHealth {
  const notEvaluated = <T>(): Signal<T> => unavailable("not evaluated", packumentUrl(pkg.name), now);
  const full: PackageSignals = {
    ...signals,
    maintainers: signals.maintainers ?? notEvaluated(),
    provenance: signals.provenance ?? notEvaluated(),
    transitiveReach: signals.transitiveReach ?? notEvaluated(),
    maintainerChange: signals.maintainerChange ?? notEvaluated(),
    provenanceRegression: signals.provenanceRegression ?? notEvaluated(),
    newInstallScript: signals.newInstallScript ?? notEvaluated(),
  };
  const missingSignals: SignalName[] = SIGNAL_NAMES.filter((name) => !full[name].available);
  const { state, stateReason } = stateFromSignals(full, now);
  return { name: pkg.name, installedVersion: pkg.installedVersion, state, stateReason, signals: full, missingSignals };
}

/** Runs fn over items with at most limit in flight. Preserves order. */
export async function mapWithConcurrency<T, R>(items: readonly T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index] as T);
    }
  });
  await Promise.all(workers);
  return results;
}

/** Result of phase one: the Union graph and where each package's own graph came from. Requirement 3.2. */
export interface ReachPhase {
  readonly union: UnionGraph;
  readonly graphsMissing: number;
  /** Keyed `${name}@${version}`. Present for failed fetches too. Requirement 3.1. */
  readonly fetches: ReadonlyMap<string, { readonly source: string; readonly fetchedAt: string }>;
}

/** Phase one. Fetches every graph at concurrency 8, waits for all, merges the ok graphs. Never throws. */
export async function collectReach(ctx: ClientContext, packages: readonly PackageRef[]): Promise<ReachPhase> {
  const results = await mapWithConcurrency(packages, PACKAGE_CONCURRENCY, (pkg) =>
    fetchDependencyGraph(ctx, pkg.name, pkg.installedVersion),
  );
  const graphs: ResolvedGraph[] = [];
  const fetches = new Map<string, { source: string; fetchedAt: string }>();
  let graphsMissing = 0;
  results.forEach((result, index) => {
    const pkg = packages[index];
    if (pkg !== undefined) {
      fetches.set(`${pkg.name}@${pkg.installedVersion}`, { source: result.source, fetchedAt: result.fetchedAt });
    }
    if (result.ok) {
      graphs.push(result.graph);
    } else {
      graphsMissing += 1;
    }
  });
  return { union: unionGraph(graphs), graphsMissing, fetches };
}

/** What scoreOne has in hand when it derives the three history signals. */
export interface HistorySignalInput {
  readonly name: string;
  readonly installedVersion: string;
  readonly reference: Date;
  readonly maintainers: Signal<readonly string[]>;
  readonly provenance: Signal<ProvenanceValue>;
  readonly hasInstallScript: Signal<boolean>;
  readonly fullPackument: PackumentDocument;
  readonly abbreviatedPackument:
    | { readonly ok: true; readonly doc: unknown }
    | { readonly ok: false; readonly reason: string };
  readonly historyRead:
    | { readonly ok: true; readonly history: readonly Snapshot[] }
    | { readonly ok: false; readonly reason: string };
}

/** Pure. Derives maintainerChange, provenanceRegression and newInstallScript. Requirements 6.9, 6.10, 7.5, 7.8, 8.5, 8.9. */
export function buildHistorySignals(
  input: HistorySignalInput,
): Pick<NewSignals, "maintainerChange" | "provenanceRegression" | "newInstallScript"> {
  const { reference, maintainers, provenance, hasInstallScript } = input;
  const packSource = packumentUrl(input.name);

  const maintainerChange: NewSignals["maintainerChange"] = (() => {
    if (!input.historyRead.ok) {
      return unavailable(input.historyRead.reason, packSource, reference);
    }
    const live = maintainers.available ? { maintainers: maintainers.value, fetchedAt: maintainers.fetchedAt } : null;
    const at = maintainers.available ? fromIso(maintainers.fetchedAt) : reference;
    return available(maintainerChangeValue(input.historyRead.history, live, reference), packSource, at);
  })();

  const provenanceRegression: NewSignals["provenanceRegression"] = (() => {
    const outcome = evaluateProvenanceRegression({
      installedVersion: input.installedVersion,
      provenance,
      fullPackument: input.fullPackument.ok ? input.fullPackument.doc : null,
      historyRead: input.historyRead,
    });
    const at = fromIso(provenance.fetchedAt);
    return outcome.kind === "unavailable"
      ? unavailable(outcome.reason, provenance.source, at)
      : available(outcome.value, provenance.source, at);
  })();

  const newInstallScript: Signal<readonly NewInstallScriptEvent[]> = (() => {
    if (!input.fullPackument.ok || !input.abbreviatedPackument.ok) {
      const missing = [
        ...(input.fullPackument.ok ? [] : ["full packument"]),
        ...(input.abbreviatedPackument.ok ? [] : ["abbreviated packument"]),
      ].join(" and ");
      return unavailable(`${missing} unavailable`, packSource, reference);
    }
    const parsed = new Date(hasInstallScript.fetchedAt);
    const at = Number.isFinite(parsed.getTime()) ? parsed : reference;
    return available(
      newInstallScriptEvents(input.fullPackument.doc, input.abbreviatedPackument.doc, reference),
      packSource,
      at,
    );
  })();

  return { maintainerChange, provenanceRegression, newInstallScript };
}
