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
export { RULE_TYPES, SEVERITIES, SIGNAL_NAMES, STATE_ORDER } from "./types.js";

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

// history-signals
export type {
  MaintainerChangeEvent,
  MaintainerChangeValue,
  NewInstallScriptEvent,
  NewSignals,
  OriginalSignals,
  ProvenanceRegressionValue,
  ProvenanceValue,
  TransitiveReachValue,
} from "./types.js";
export { NEW_SIGNAL_NAMES, ORIGINAL_SIGNAL_NAMES } from "./types.js";

export { InMemorySnapshotStore, InvalidCaptureTimeError, MAX_SNAPSHOT_VERSIONS, RECENT_WINDOW_MS } from "./snapshot.js";
export type { Snapshot, SnapshotStore, SnapshotVersion } from "./snapshot.js";

export { unionGraph, transitiveReach } from "./reach.js";
export type { NameEdge, ResolvedGraph, UnionGraph } from "./reach.js";

export {
  compareVersionOrder,
  evaluateProvenanceRegression,
  isRecent,
  maintainerChangeValue,
  maintainerDiff,
  newInstallScriptEvents,
  publishedVersions,
} from "./history.js";
export type { MaintainerDiff, ProvenanceRegressionInput, ProvenanceRegressionOutcome, PublishedVersion } from "./history.js";

export { runSnapshotter } from "./snapshotter.js";
export type { SnapshotterFailure, SnapshotterResult } from "./snapshotter.js";

export { fetchProvenanceSignal } from "./clients/attestations.js";
export { fetchDependencyGraph } from "./clients/deps-dev.js";
export type { GraphFetch } from "./clients/deps-dev.js";
export { extractMaintainers, fetchMaintainersSignal } from "./clients/maintainers.js";

export { collectReach, buildHistorySignals } from "./score.js";
export type { HistorySignalInput, ReachPhase, ScoreOneOptions } from "./score.js";

// policy
export { parsePolicy } from "./policy/parse.js";
export { formatPolicy } from "./policy/format.js";
export { evaluatePolicy } from "./policy/evaluate.js";
export { DEFAULT_POLICY } from "./policy/default.js";
export { inScope } from "./policy/match.js";
export { POLICY_SCHEMA } from "./policy/schema.js";
export type {
  ErrorCode,
  Failure,
  ForbidInstallScriptsRule,
  ForbidStateRule,
  MaxAgeMonthsRule,
  ParseResult,
  Policy,
  PolicyResult,
  PolicySource,
  RequireProvenanceRule,
  Rule,
  RuleResult,
  RuleType,
  Unevaluated,
  ValidationError,
} from "./types.js";

// repo-intake
export { parseRepoUrl, formatRepoUrl, isValidOwner, isValidRepo } from "./intake/url.js";
export { isValidPackageName, MAX_PACKAGE_NAME_LENGTH } from "./intake/names.js";
export { parsePackageJson, applyLockfile, parseManifests } from "./intake/manifest.js";
export { resolveUnlocked, isResolvableRange, UNRESOLVED_VERSION, MAX_RANGE_LENGTH } from "./intake/resolve.js";
export { applyCap, MAX_DIRECT_DEPENDENCIES } from "./intake/cap.js";
export { intakeRepo } from "./intake/intake.js";
export { scanMetadata, attachScan } from "./intake/scan.js";
export {
  fetchManifest,
  fetchRepoManifests,
  manifestUrl,
  GITHUB_RAW_SOURCE,
  GITHUB_RAW_HOST,
  MAX_MANIFEST_BYTES,
} from "./clients/github-raw.js";
export type { ManifestFile, ManifestOutcome, LockfileOutcome, ManifestFailure } from "./clients/github-raw.js";
export type { CapResult } from "./intake/cap.js";
export type {
  RepoRef,
  ParseRepoUrlResult,
  DependencyOrigin,
  Resolution,
  IntakePackage,
  SkippedCounts,
  LockfileVersion,
  ParsedDependency,
  PackageJsonOk,
  PackageJsonParse,
  ManifestsOk,
  ManifestsParse,
  ManifestParseError,
  IntakeErrorCode,
  IntakeError,
  IntakeSuccess,
  IntakeResult,
  ScanMetadata,
} from "./types.js";
export { INTAKE_ERROR_CODES } from "./types.js";
export type { TextBody } from "./http.js";

// remediation
export { planRemediation, REASON_INSTALLED_INVALID, REASON_NOT_GATHERED } from "./remediation/plan.js";
export type { PlanOptions } from "./remediation/plan.js";
export { selectBump, isPassing } from "./remediation/select-bump.js";
export type { SelectBumpInput, SelectBumpResult } from "./remediation/select-bump.js";
export { orderCandidates, hasPrereleaseComparator, MAX_CANDIDATES } from "./remediation/candidates.js";
export type { Candidate } from "./remediation/candidates.js";
export { rangeStyle, styledRange } from "./remediation/range-style.js";
export type { RangeStyle } from "./remediation/range-style.js";
export { isPublishedVersion, MAX_VERSION_LENGTH } from "./remediation/published-version.js";
export { gatherBumpData, BUMP_CONCURRENCY } from "./remediation/gather-bump-data.js";
export type { BumpTarget, BumpData, BumpFailure, BumpDataResult } from "./remediation/gather-bump-data.js";
export { bumpTargets } from "./remediation/bump-targets.js";
export { branchName, BRANCH_PREFIX, MAX_BRANCH_LENGTH } from "./remediation/branch-name.js";
export { encodeName, decodeName } from "./remediation/encoded-name.js";
export { isValidBranchName } from "./remediation/is-valid-branch-name.js";
export { buildPrIntent, BASE_REF_DEFAULT } from "./remediation/pr-intent.js";
export { buildPrBody, MAX_BODY_CHARS } from "./remediation/pr-body.js";
export { escapeField } from "./remediation/escape-field.js";
export { EMPTY_RECIPE_REGISTRY, DEFAULT_RECIPE_REGISTRY } from "./remediation/recipes.js";
// migration-node-sass
export { REASON_MIGRATION_NOT_RUN, REASON_NO_CHANGE } from "./remediation/plan.js";
export { InMemoryFileSource } from "./remediation/file-source.js";
export { isSafePath, hasIgnoredSegment, IGNORED_DIRECTORIES } from "./remediation/safe-path.js";
export { capFileSource, MAX_LISTED, MAX_READ, MAX_FILE_BYTES } from "./remediation/capped-source.js";
export type { CappedSource } from "./remediation/capped-source.js";
export { findReviewSites, MAX_REVIEW_SITES } from "./remediation/review-sites.js";
export { reviewComments } from "./remediation/review-comments.js";
export { gatherMigrationData } from "./remediation/gather-migration-data.js";
export { SASS_LOADER_MINIMUM } from "./remediation/migration-candidates.js";
export { NODE_SASS_RECIPE, NODE_SASS_RECIPE_ID } from "./remediation/node-sass-recipe.js";
export { RECIPE_NOTES } from "./remediation/recipe-notes.js";
export { runMigrations, runRecipe, REASON_RECIPE_FAILED } from "./remediation/run-migrations.js";
export { MAX_ADVISORY_IDS } from "./remediation/version-data.js";
export { readPackageScripts, MAX_SCRIPTS } from "./intake/scripts.js";
export { REVIEW_RULES } from "./types.js";
export type {
  FileSource,
  ReviewRule,
  ReviewSite,
  ReviewComment,
  ScanCounts,
  RecipeResult,
  RecipeOutcome,
  PackageJsonView,
  PackageJsonEdits,
  MigrationData,
  RecipeInput,
  MigrationDetail,
} from "./types.js";
export type { RecipeRegistry } from "./remediation/recipes.js";
export { createInMemoryRemediationLog } from "./remediation/in-memory-log.js";
export { LOG_REJECTED_REASON } from "./remediation/remediation-log.js";
export type { RemediationLog, AppendResult } from "./remediation/remediation-log.js";
export { attachRemediations } from "./remediation/attach.js";
export { failingRulesFor } from "./remediation/failing-rules.js";
export { queryVulnIdsBatch, OSV_BATCH_SOURCE } from "./clients/osv.js";
export { REMEDIATION_KINDS, REMEDIATION_STATUSES } from "./types.js";
export type {
  RemediationKind,
  RemediationStatus,
  UnhealthyState,
  PackageJsonEdit,
  RemediationPlan,
  PrIntent,
  RemediationEntry,
  Recipe,
  FailingRule,
  PrContext,
  RemediationLogEntry,
} from "./types.js";
