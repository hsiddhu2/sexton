// Sexton engine. Public surface is defined by the specs under .kiro/specs.

export type {
  Advisory,
  AvailableSignal,
  HealthReport,
  PackageHealth,
  PackageRef,
  PackageSignals,
  Severity,
  Signal,
  SignalName,
  State,
  UnavailableSignal,
} from "./types.js";
export { SEVERITIES, SIGNAL_NAMES, STATE_ORDER } from "./types.js";

export { available, unavailable, cleanReason, fromIso, toIso, isAvailable, MAX_REASON_LENGTH } from "./signal.js";
export { evaluateState, stateFromSignals, healthRank, monthsBefore, DEAD_AFTER_MONTHS, RESTLESS_AFTER_MONTHS } from "./state.js";
export type { StateInputs, StateResult } from "./state.js";
export { normaliseSeverity, severityFromScore, severityFromOsv, isSeverity } from "./severity.js";
export type { OsvSeverityFields } from "./severity.js";

export { CachedFetcher, MemoryCacheStore, cacheKey, DEFAULT_CACHE_TTL_MS } from "./cache.js";
export type { CacheEntry, CacheStore, CachedFetcherOptions, Clock } from "./cache.js";
export { createFetchTransport, requestWithRetry, backoffDelay, UpstreamError, RETRY_STATUSES, DEFAULT_MAX_RETRIES, DEFAULT_BASE_DELAY_MS } from "./http.js";
export type { Transport, TransportRequest, TransportResponse, RetryOptions, Sleep, Random } from "./http.js";
export { ENGINE_VERSION, USER_AGENT, REPO_URL } from "./version.js";

export { scorePackages, scoreOne, buildHealth, mapWithConcurrency, PACKAGE_CONCURRENCY } from "./score.js";
export type { ScoringDependencies } from "./score.js";
export type { ClientContext } from "./clients/context.js";
export { fetchPackumentSignals, fetchInstallScriptSignal, extractLastPublish, extractDeprecated, packumentUrl, encodePackageName, NPM_REGISTRY, ABBREVIATED_ACCEPT } from "./clients/npm.js";
export { fetchAdvisoriesSignal, fetchAdvisory, queryVulnIds, OSV_API, OSV_MAX_PAGES } from "./clients/osv.js";
