# Design Document: health-scoring

## Overview

The health-scoring module is the pure core of `@sexton/engine`. It takes a list of npm packages with installed versions, reads three upstream signals per package, caches every upstream response, and assigns exactly one state per package. The state function is pure. Everything that touches the network is behind an injectable transport so the whole module is testable without network or wall-clock time.

Implements requirements 1 to 14 of this spec, which cover R-SG-1, R-SG-2, R-SG-3, R-SG-7, R-SG-8, R-SG-9, R-ST-1, R-ST-2, R-ST-3 and R-ST-4 from docs/requirements.md.

## Architecture

```
scorePackages(packages, deps)                      score.ts
  └─ mapWithConcurrency(8)
       └─ scoreOne(ctx, pkg)
            ├─ fetchPackumentSignals      clients/npm.ts   → lastPublish, deprecated
            ├─ fetchInstallScriptSignal   clients/npm.ts   → hasInstallScript
            ├─ fetchAdvisoriesSignal      clients/osv.ts   → advisories
            └─ buildHealth → stateFromSignals → evaluateState   state.ts (pure)

clients/* ─▶ cachedJson (clients/context.ts) ─▶ CachedFetcher (cache.ts) ─▶ requestWithRetry (http.ts) ─▶ Transport
```

Data flows one way. Clients produce `Signal<T>` envelopes. The state function reads envelopes and a reference time and returns a state and the rule that matched. No module below `score.ts` knows about any other package.

## Components and Interfaces

### types.ts
`Signal<T>` is a discriminated union of `AvailableSignal<T>` (available true, value T, no reason) and `UnavailableSignal` (available false, value null, reason). `Severity`, `State`, `STATE_ORDER`, `SIGNAL_NAMES`, `PackageSignals`, `PackageRef`, `PackageHealth`, `HealthReport`.

### signal.ts
`available(value, source, fetchedAt)` and `unavailable(reason, source, fetchedAt)`. Reasons are flattened to one line and cut at 200 characters. `toIso` and `fromIso` convert at the boundary. Dates are ISO strings in envelopes and `Date` objects inside the state function.

### state.ts
`evaluateState(inputs, now)` is the pure rule engine. Inputs use `undefined` for an unavailable signal and `null` for a publish date the registry could not supply. Rules run in order, first match wins: Dead (deprecated, or publish older than 24 calendar months), Haunted (any High or Critical advisory), Restless (publish between 12 and 24 months, or any Low or Moderate advisory), Alive. When all three state signals are unavailable the result is Restless with reason "all state signals unavailable". A publish date in the future never counts as age. Thresholds are computed with `monthsBefore(now, n)` using UTC calendar months. `healthRank` gives Possessed 0 to Alive 4. `stateFromSignals` adapts envelopes to inputs.

### severity.ts
`normaliseSeverity(text)` maps CRITICAL, HIGH, MODERATE or MEDIUM, LOW case-insensitively, else Unknown. `severityFromScore(n)` maps CVSS bands. `severityFromOsv(record)` prefers `database_specific.severity` text, then the first numeric score in the `severity` array. CVSS vector strings are never parsed.

### cache.ts
`CacheStore` is the storage contract (`get`, `set`) with `MemoryCacheStore` for the CLI and tests. `CachedFetcher` applies the TTL, shares in-flight fetches per key, and never stores a failed fetch. `cacheKey(source, pkg, version)`. The DynamoDB store arrives in a later spec and only has to implement `CacheStore`.

### http.ts
`Transport` is the only network seam. `createFetchTransport` wraps global fetch and stamps `User-Agent: sexton/{version} (+https://github.com/hsiddhu2/sexton)` on every request. `requestWithRetry` retries 429 and 503 at most three times with full-jitter backoff from 500 ms, doubling per attempt. Sleep and random are injectable. Any other status returns at once.

### clients/npm.ts
Full packument: last publish is the greatest version-keyed `time` entry, ignoring `created` and `modified`. Deprecated is true only for a non-empty string on the installed version. One failure marks both signals unavailable. Abbreviated packument with `Accept: application/vnd.npm.install-v1+json` gives `hasInstallScript`. A missing version in the abbreviated map is unavailable with reason "version not found". No tarball is ever requested.

### clients/osv.ts
`querybatch` with one query per package version, following `next_page_token` up to 10 pages. Each ID is fetched from `/v1/vulns/{id}` and normalised. Any failure marks the advisories signal unavailable.

### score.ts
`scorePackages` builds the context from `ScoringDependencies` (transport, clock, cache TTL, cache store, retry options), scores packages with a concurrency limit of 8, and stamps `generatedAt` from the clock. `buildHealth` is pure and lists `missingSignals` from the four envelopes.

## Data Models

```ts
interface PackageHealth {
  name: string; installedVersion: string;
  state: "Alive" | "Restless" | "Haunted" | "Dead" | "Possessed";
  stateReason: string;
  signals: {
    lastPublish: Signal<string | null>;   // ISO instant
    deprecated: Signal<boolean>;
    hasInstallScript: Signal<boolean>;
    advisories: Signal<Advisory[]>;        // { id, severity, summary }
  };
  missingSignals: ("lastPublish" | "deprecated" | "hasInstallScript" | "advisories")[];
}
interface HealthReport { generatedAt: string; packages: PackageHealth[]; }
```

Cache keys: `npm-packument|{name}|*`, `npm-abbreviated|{name}|*`, `osv-querybatch|{name}|{version}` (page tokens appended with `#`), `osv-vuln|{id}|*`.

## Error Handling

Clients never throw. Every upstream failure becomes an unavailable signal whose reason is the HTTP status or the error message. The state function still runs on the remaining signals. `scorePackages` therefore never rejects because of an upstream.

## Testing Strategy

Vitest. No network in tests. A routed transport answers from a route table and records calls. Recorded, trimmed fixtures for ten packages live under `test/fixtures/packages/` and are produced by `scripts/record-fixtures.mjs`. The fixture scan compares states to `test/fixtures/expected-states.json`, which is reviewed by hand.

## Correctness Properties

Property tests use fast-check 3.23.1. Security invariants run 1000 times.

1. State determinism. For any state inputs and reference time, evaluating twice gives equal results. Requirement 12.1.
2. Exactly one state. For any inputs, the state is one of the five allowed values and never Possessed. Requirements 11.1, 11.7.
3. Monotonic in age. For any inputs and any two publish dates, the older date never produces a healthier rank. Requirement 13.2.
4. Cache single fetch. For any request sequence of up to 50 keys with duplicates, outbound calls equal distinct keys. Requirement 7.2.
5. Cache round trip. Any JSON value stored under any key reads back deeply equal before the TTL. Requirement 7.6.
6. Severity normalisation is total. Any string and any double map to one of the five severities. Requirements 3.1, 3.3.
7. Severity from OSV is deterministic for any record shape. Requirement 3.5.
8. Last publish extraction is deterministic for any time map. Requirement 4.4.
9. Backoff delay stays within [0, 500 × 2^attempt) for any attempt and random draw. Requirement 9.3.
10. missingSignals equals exactly the unavailable signals for any signal set. Requirement 14.2.
