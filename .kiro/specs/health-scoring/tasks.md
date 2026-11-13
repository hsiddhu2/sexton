# Implementation Plan: health-scoring

- [x] 1. Types and signal envelope
  - [x] 1.1 Define Signal, Severity, State, STATE_ORDER, SIGNAL_NAMES, PackageSignals, PackageRef, PackageHealth, HealthReport in src/types.ts
    - _Requirements: 1.1, 10.5, 11.7, 13.1_
  - [x] 1.2 Implement available, unavailable, cleanReason, toIso, fromIso in src/signal.ts
    - _Requirements: 1.2, 1.3, 1.4, 1.5, 1.6, 2.1, 2.4_

- [x] 2. Pure state function
  - [x] 2.1 Implement evaluateState with ordered rules, monthsBefore, healthRank, stateFromSignals in src/state.ts
    - _Requirements: 2.2, 2.3, 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 11.7, 11.8, 11.9, 11.10, 12.2, 13.1, 14.1, 14.4, 14.5_
  - [x] 2.2 Write example tests for every rule and boundary in test/state.test.ts
    - _Requirements: 11.3, 11.4, 11.5, 11.6, 14.4, 14.5_
  - [x] 2.3 Write property tests: determinism, exactly one state, monotonic in age
    - _Requirements: 11.1, 11.7, 12.1, 13.2_

- [x] 3. Severity normalisation
  - [x] 3.1 Implement normaliseSeverity, severityFromScore, severityFromOsv in src/severity.ts
    - _Requirements: 3.1, 3.2, 3.3, 3.4_
  - [x] 3.2 Write example and property tests in test/severity.test.ts
    - _Requirements: 3.1, 3.3, 3.5_

- [x] 4. Response cache
  - [x] 4.1 Implement CacheStore, MemoryCacheStore, CachedFetcher with TTL, in-flight sharing and no caching of failures, cacheKey in src/cache.ts
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_
  - [x] 4.2 Write example tests and the single-fetch and round-trip properties in test/cache.test.ts
    - _Requirements: 7.2, 7.3, 7.4, 7.5, 7.6_

- [x] 5. HTTP transport, User-Agent and backoff
  - [x] 5.1 Read the engine version from package.json and build USER_AGENT in src/version.ts
    - _Requirements: 8.1, 8.3_
  - [x] 5.2 Implement Transport, createFetchTransport, requestWithRetry, backoffDelay, UpstreamError in src/http.ts
    - _Requirements: 8.2, 9.1, 9.2, 9.3, 9.5_
  - [x] 5.3 Write tests for header stamping, retry counts, non-retry statuses and the backoff property in test/http.test.ts
    - _Requirements: 8.1, 8.2, 9.1, 9.2, 9.3, 9.5_

- [x] 6. npm registry clients
  - [x] 6.1 Implement cachedJson, describeFailure, ClientContext in src/clients/context.ts
    - _Requirements: 7.1, 9.4, 10.3_
  - [x] 6.2 Implement extractLastPublish, extractDeprecated, fetchPackumentSignals, fetchInstallScriptSignal in src/clients/npm.ts
    - _Requirements: 4.1, 4.2, 4.3, 4.5, 4.6, 5.1, 5.2, 5.3, 5.4, 5.5, 5.6_
  - [x] 6.3 Write tests with a routed transport in test/clients/npm.test.ts, including the extraction determinism property
    - _Requirements: 4.2, 4.3, 4.4, 4.5, 4.6, 5.2, 5.3, 5.4, 5.5, 5.6, 7.2_

- [x] 7. OSV client
  - [x] 7.1 Implement queryVulnIds with pagination, fetchAdvisory, fetchAdvisoriesSignal in src/clients/osv.ts
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_
  - [x] 7.2 Write tests in test/clients/osv.test.ts
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 9.2, 9.4_

- [x] 8. Scoring entry point
  - [x] 8.1 Implement scorePackages, scoreOne, buildHealth, mapWithConcurrency in src/score.ts and export the public surface from src/index.ts
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 14.2, 14.3_
  - [x] 8.2 Write tests in test/score.test.ts including the missingSignals property
    - _Requirements: 10.1, 10.2, 10.4, 10.6, 14.2, 14.3, 14.5_

- [x] 9. Fixture scan
  - [x] 9.1 Write scripts/record-fixtures.mjs and test/fixtures/packages.json for the ten reference packages
    - _Requirements: 4.1, 5.1, 6.1_
  - [x] 9.2 Write test/fixture-scan.test.ts comparing states to expected-states.json
    - _Requirements: 10.1, 11.1_
  - [x] 9.3 Record fixtures, review the resulting states by hand, commit expected-states.json
    - _Requirements: 11.3, 11.4, 11.5, 11.6_
