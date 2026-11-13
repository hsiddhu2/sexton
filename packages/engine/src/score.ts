// Health scoring entry point. Requirement 10, 14.

import { CachedFetcher, MemoryCacheStore, type CacheStore, type Clock } from "./cache.js";
import type { ClientContext } from "./clients/context.js";
import { fetchInstallScriptSignal, fetchPackumentSignals } from "./clients/npm.js";
import { fetchAdvisoriesSignal } from "./clients/osv.js";
import { createFetchTransport, type RetryOptions, type Transport } from "./http.js";
import { stateFromSignals } from "./state.js";
import { SIGNAL_NAMES, type HealthReport, type PackageHealth, type PackageRef, type PackageSignals, type SignalName } from "./types.js";

export const PACKAGE_CONCURRENCY = 8;

export interface ScoringDependencies {
  readonly transport?: Transport;
  readonly clock?: Clock;
  readonly cacheTtlMs?: number;
  readonly cacheStore?: CacheStore;
  readonly retry?: RetryOptions;
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
  const results = await mapWithConcurrency(packages, PACKAGE_CONCURRENCY, (pkg) => scoreOne(ctx, pkg));
  return { generatedAt: clock().toISOString(), packages: results };
}

/** Fetches the four signals concurrently and assigns a state. Requirement 10.2, 10.5, 10.6. */
export async function scoreOne(ctx: ClientContext, pkg: PackageRef): Promise<PackageHealth> {
  const [packument, hasInstallScript, advisories] = await Promise.all([
    fetchPackumentSignals(ctx, pkg.name, pkg.installedVersion),
    fetchInstallScriptSignal(ctx, pkg.name, pkg.installedVersion),
    fetchAdvisoriesSignal(ctx, pkg.name, pkg.installedVersion),
  ]);
  const signals: PackageSignals = {
    lastPublish: packument.lastPublish,
    deprecated: packument.deprecated,
    hasInstallScript,
    advisories,
  };
  return buildHealth(pkg, signals, ctx.clock());
}

/** Pure assembly of a health entry from signals. Requirement 14.2, 14.3. */
export function buildHealth(pkg: PackageRef, signals: PackageSignals, now: Date): PackageHealth {
  const missingSignals: SignalName[] = SIGNAL_NAMES.filter((name) => !signals[name].available);
  const { state, stateReason } = stateFromSignals(signals, now);
  return { name: pkg.name, installedVersion: pkg.installedVersion, state, stateReason, signals, missingSignals };
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
