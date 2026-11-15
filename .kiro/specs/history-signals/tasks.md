# Implementation Plan: history-signals

## Overview

Extends packages/engine from four signals to ten, adds the append-only SnapshotStore and snapshotter, and adds the Possessed state rule. Pure rules come first, then clients, then scoring wiring, fixtures, exports and final verification.

- [x] 1. New types and the append-only snapshot store
  - Adds the types and `SnapshotStore` that every later task builds on. All work is in packages/engine.
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9, 4.10, 4.11, 4.12, 4.13_

  - [x] 1.1 Add the new types to src/types.ts additively
    - Add ProvenanceValue, TransitiveReachValue, MaintainerChangeEvent, MaintainerChangeValue, ProvenanceRegressionValue, NewInstallScriptEvent, NewSignals, ORIGINAL_SIGNAL_NAMES and NEW_SIGNAL_NAMES.
    - Leave PackageSignals, SIGNAL_NAMES and missingSignals unchanged until task 7.1, so typecheck and existing tests stay green.
    - Covered by tests in 1.3, 2.5, 3.2 and 4.3.
    - _Requirements: 10.1, 10.2, 1.3, 2.2, 3.3, 6.5, 7.2, 8.2_

  - [x] 1.2 Implement src/snapshot.ts
    - Export Snapshot, SnapshotVersion, SnapshotStore (append, history, recordSeen, listSeenWithin only), InMemorySnapshotStore, InvalidCaptureTimeError, MAX_SNAPSHOT_VERSIONS (20) and RECENT_WINDOW_MS (90 days).
    - append validates the ISO 8601 UTC capture time before touching state, stores a structuredClone, and keeps an append sequence number. history returns a clone ordered by numeric capture time then append order. listSeenWithin returns each name once, ascending, when any Seen record is Recent (inclusive at both ends).
    - Covered by tests in 1.3 and 1.4.
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9, 4.10, 4.11, 4.12, 4.13_

  - [x] 1.3 Write example tests in test/snapshot.test.ts
    - Cover ordering by capture time and append order (4.7), isolation between packages (4.8), the seen window with an inclusive 90-day boundary and inclusion when any Seen record is Recent (4.9, 4.10), unknown package gives an empty History (4.11), invalid capture time rejected with no state change (4.12), and null provenance kept as null and never treated as true or false (4.13).
    - No property in this sub-task.
    - _Requirements: 4.7, 4.8, 4.9, 4.10, 4.11, 4.12, 4.13_

  - [x] 1.4 Write Property 4 (append-only store round trip and immutability) in test/snapshot.test.ts
    - Property 4, numRuns 1000. Add an arbSnapshot generator to test/arbitraries.ts.
    - Tag: `Feature: history-signals, Property 4: Append-only store round trip and immutability`.
    - _Requirements: 4.4, 4.5, 4.6, 4.7, 4.8_

- [x] 2. Pure history rules in history.ts
  - Version order, maintainer change, provenance regression and new install script, all pure and taking the Reference time as an input.
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8, 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8_

  - [x] 2.1 Implement compareVersionOrder, publishedVersions and isRecent in src/history.ts
    - compareVersionOrder: publish time ascending, equal publish time ordered by plain string comparison of the version. publishedVersions keeps only versions with a parseable time-map entry. isRecent is numeric and inclusive at both ends.
    - Covered by tests in 2.5 and 2.6.
    - _Requirements: 7.2, 8.2, 8.7, 8.8, 6.6_

  - [x] 2.2 Implement maintainerDiff and maintainerChangeValue in src/history.ts
    - One pair event per consecutive Snapshot pair whose lists differ as sets. Then, when the maintainers signal is available, one live event if the most recent Snapshot differs from it, for any non-empty History including exactly one Snapshot.
    - Recent flag per 6.6: pair events by event time, live event by the most recent Snapshot's capture time. History-insufficient only when the History is empty. When the maintainers signal is unavailable, derive pair events only. Events sorted ascending by numeric event time, ties in derivation order.
    - Covered by tests in 2.5 and 2.6 (Property 5).
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8_

  - [x] 2.3 Implement evaluateProvenanceRegression in src/history.ts
    - Precedence: unavailable, then History-insufficient, then regression or no-regression. If the provenance signal is unavailable and the store read also failed, the reason is "provenance unavailable". Null presence is ignored on both sides.
    - History-insufficient when the History is empty, when the installed version is absent from the packument or its publish time does not parse (with a reason), or when no earlier version has non-null presence in the most recent Snapshot.
    - Covered by tests in 2.5.
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8_

  - [x] 2.4 Implement newInstallScriptEvents in src/history.ts
    - Evaluate every Published version, not only the installed one. Emit an event when the version is Recent, has hasInstallScript true, and its predecessor in Version order has it false or absent. The first Published version never emits. A publish time later than the Reference time never qualifies. Reads no store.
    - Covered by tests in 2.5 and 2.6 (Property 9).
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.6, 8.7, 8.8_

  - [x] 2.5 Write example tests in test/history.test.ts
    - Cover: tie rule on equal publish time; 90-day inclusive boundary; future publish time never qualifies; first version never emits; single-Snapshot live comparison; 6.8 equal-set append derives the same event lists ignoring recent; 7.8 precedence including both failing; 7.4 absent or unparseable installed version; null presence ignored; each History-insufficient reason; maintainers signal unavailable gives pair events only.
    - No property in this sub-task.
    - _Requirements: 6.2, 6.4, 6.5, 6.6, 6.8, 7.1, 7.4, 7.8, 8.2, 8.4, 8.7, 8.8_

  - [x] 2.6 Write Properties 5 and 9 in test/history.test.ts
    - Property 5 (maintainer difference symmetry), including that sets equal in any order and with repeats give no event from maintainerChangeValue.
    - Property 9 (newInstallScript is false when no version has an install script), plus determinism and no event for a publish time later than the Reference time.
    - Tags: `Feature: history-signals, Property 5: Maintainer difference symmetry` and `Feature: history-signals, Property 9: newInstallScript is false when no version has an install script`.
    - _Requirements: 6.3, 8.6, 8.7_

- [ ] 3. Transitive reach in reach.ts
  - Pure union graph and reverse search.
  - _Requirements: 3.2, 3.3, 3.4, 3.5, 3.7, 3.9_

  - [x] 3.1 Implement unionGraph and transitiveReach in src/reach.ts
    - Export NameEdge, ResolvedGraph, UnionGraph, unionGraph and transitiveReach. Merge nodes by name and edges by (dependent, dependency) pair. Drop self edges. The repository root is never a node. Reverse breadth-first search with a visited set. A name absent from the union has reach 0.
    - Covered by tests in 3.2 and 3.3.
    - _Requirements: 3.2, 3.3, 3.4, 3.5, 3.7, 3.9_

  - [x] 3.2 Write example tests in test/reach.test.ts
    - Cover: diamond, cycle, duplicate edges, name absent from the union gives 0, direct and transitive dependents both counted, a name counted once across several versions.
    - No property in this sub-task.
    - _Requirements: 3.3, 3.4, 3.7_

  - [x] 3.3 Write Properties 6, 7 and 8 in test/reach.test.ts
    - Property 6 (reach bounds and order independence), Property 7 (chain reach is n minus 1, graph split across several graphs), Property 8 (merge idempotence).
    - Tags: `Feature: history-signals, Property 6: Transitive reach bounds and order independence`, `Property 7: Chain reach is n minus 1`, `Property 8: Merge idempotence`.
    - _Requirements: 3.4, 3.5, 3.9_

- [x] 4. Possessed rule in state.ts
  - Extends the state function without changing any existing result.
  - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8, 9.9, 9.10, 9.11, 9.12, 10.6_

  - [x] 4.1 Copy the current evaluateState verbatim into test/support/health-scoring-oracle.ts, before any edit to src/state.ts
    - Plain copy with a header comment saying it is the frozen health-scoring rule table and must never change. It is test support, not production code.
    - Used by Property 12 in 4.4.
    - _Requirements: 10.6, 9.11_

  - [x] 4.2 Extend StateInputs, evaluateState and stateFromSignals in src/state.ts
    - Add optional maintainerChange, provenanceRegression and newInstallScript inputs. Possessed is the first rule: a maintainerChange event with recent true, a regression status, or a non-empty newInstallScript list. stateReason names the matching condition.
    - Unavailable, undefined, History-insufficient and no-regression values never match. Possessed runs before the "all state signals unavailable" shortcut so 9.12 holds. healthRank and STATE_ORDER unchanged.
    - stateFromSignals takes the original three signals plus Partial<NewSignals> from task 1.1, not PackageSignals, and passes a possession input only when its envelope is available. Existing callers behave exactly as before.
    - Covered by tests in 4.3 and 4.4.
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8, 9.9, 9.11, 9.12, 10.6_

  - [x] 4.3 Write example tests in test/state-possessed.test.ts
    - Cover: each of the three Possessed conditions; History-insufficient and no-regression never match; unavailable never matches; Possessed with all original signals unavailable; Possessed before Dead; old inputs unchanged.
    - The existing test/state.test.ts stays unchanged and green.
    - No property in this sub-task.
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.11, 9.12, 10.6_

  - [x] 4.4 Write Properties 1, 2, 3 and 12 in test/state-possessed.test.ts
    - Property 1 (Possessed determinism), Property 2 (exactly one state, Possessed only from the Possession signals, numRuns 1000), Property 3 (monotonic in age with ten signals), Property 12 (health-scoring equivalence when the new signals are unavailable, numRuns 1000, compared with the oracle from 4.1).
    - Extend test/arbitraries.ts with the ten-signal and inert-new-signal generators.
    - Tags: `Feature: history-signals, Property 1: Possessed determinism`, `Property 2: Exactly one state, and Possessed only from the Possession signals`, `Property 3: Monotonic in age with all ten signals`, `Property 12: Health-scoring equivalence when the new signals are unavailable`.
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8, 9.10, 9.11, 9.12, 10.6_

- [x] 5. Upstream clients: attestations, deps.dev, maintainers
  - One file per upstream under src/clients. Reuse ClientContext, CachedFetcher, cacheKey, requestWithRetry, available, unavailable and encodePackageName. Do not duplicate them.
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 2.10, 3.1, 3.6, 3.8_

  - [x] 5.1 Implement src/clients/attestations.ts
    - Export ATTESTATIONS_SOURCE, SLSA_PROVENANCE_PREDICATE, attestationsUrl, parseAttestations and fetchProvenanceSignal.
    - Cache the parsed outcome through ctx.cache.get under cacheKey("npm-attestations", name, version), so a 404 is cached as present false.
    - 404 gives available present false. Another status after retries gives unavailable "HTTP {status}". No status gives unavailable "no status received: ...". Malformed body gives unavailable "malformed attestations body". Source is the requested URL in every case.
    - Covered by tests in 5.4.
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 2.10_

  - [x] 5.2 Implement src/clients/deps-dev.ts
    - Export DEPS_DEV_API, DEPS_DEV_SOURCE, dependenciesUrl (percent-encode name and version), parseDependencyGraph and fetchDependencyGraph.
    - parseDependencyGraph reads nodes with versionKey and edges with fromNode and toNode as node indexes, maps them to names, drops edges with bad indexes, and returns null for a body that is not a graph.
    - fetchDependencyGraph never throws. A transport error, non-2xx status, retry exhaustion or unparseable body gives ok:false. Cache only parsed graphs under cacheKey("deps-dev-dependencies", name, version). Source is that package's own request URL, also on failure.
    - Covered by tests in 5.5.
    - _Requirements: 3.1, 3.6, 3.8_

  - [x] 5.3 Implement src/clients/maintainers.ts
    - Export fetchFullPackumentDocument (through the existing npm-packument cache key and the same request as fetchPackumentSignals), extractMaintainers, maintainersSignalFrom and fetchMaintainersSignal.
    - extractMaintainers drops entries without a name and keeps first-appearance order without repeats. A missing maintainers field gives an available empty list. A failed read gives an unavailable signal.
    - Covered by tests in 5.6.
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7_

  - [x] 5.4 Write test/clients/attestations.test.ts including Property 11
    - Property 11 (provenance present if and only if a slsa predicateType exists).
    - Examples: scoped and unscoped URL, 404 gives available present false, 429 retries then unavailable, other status, thrown transport error, malformed body, two calls inside the TTL give one upstream request and equal values, including the 404 case.
    - Tag: `Feature: history-signals, Property 11: Provenance present if and only if a slsa predicateType exists`.
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 2.10_

  - [x] 5.5 Write example tests in test/clients/deps-dev.test.ts
    - Cover: scoped name percent-encoding, recorded graph parsed to names and edges, bad edge indexes dropped, malformed body gives ok:false and is not cached, failed fetch gives ok:false with the request URL as source.
    - No property in this sub-task.
    - _Requirements: 3.1, 3.6, 3.8_

  - [x] 5.6 Write example tests in test/clients/maintainers.test.ts
    - Cover: no second upstream request when the full packument was already read, missing field gives an empty list, entries without a name dropped, duplicates removed keeping first position, extraction determinism, failure gives an unavailable signal.
    - No property in this sub-task.
    - _Requirements: 1.2, 1.3, 1.4, 1.5, 1.6, 1.7_

- [x] 6. Snapshotter
  - A job function only. No scheduler, timer or database.
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.9_

  - [x] 6.1 Implement runSnapshotter(store, ctx, names?) in src/snapshotter.ts
    - Read ctx.clock() once. A given names list is deduplicated and used as the seen list, and store.listSeenWithin is never called. An omitted list uses store.listSeenWithin(now, RECENT_WINDOW_MS), deduplicated; a throw returns an error result with empty lists and no reads.
    - Per package, through mapWithConcurrency with PACKAGE_CONCURRENCY: read the full and abbreviated packuments (a failure of either skips the package with a reason), keep at most the 20 greatest Published versions in Version order, read attestations for those only, record omitted hasInstallScript as false, record null provenance only for a failed attestation read, append exactly one Snapshot. Never raises. Result is { snapshotted, failed, error? } with sorted lists.
    - Covered by tests in 6.2 and 6.3.
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.9_

  - [x] 6.2 Write example tests in test/snapshotter.test.ts
    - Cover: empty seen list on both paths; 5.9 listing failure on the store path gives an error result, empty lists and zero reads; names path never calls listSeenWithin; 21 published versions record 20 and read only 20 attestations; one failed attestation records null and the Snapshot is still appended; hasInstallScript omitted recorded false; capture time from the single clock read; append failure lists the package as failed.
    - No property in this sub-task.
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.6, 5.9_

  - [x] 6.3 Write Property 10 in test/snapshotter.test.ts, covering both paths
    - Property 10 (snapshotter result lists are disjoint and complete). Store path: names omitted, seen list from store.listSeenWithin with Seen records inside and outside the window including the exact boundary. Names path: names passed with duplicates and a store whose listSeenWithin throws if called, so it is asserted never called and error is undefined.
    - On both paths, assert disjoint lists, union equals the deduplicated seen list, and appends equal those made with the failing packages absent, for any failure mode (none, full read, abbreviated read, append) and any attempt order.
    - Tag: `Feature: history-signals, Property 10: Snapshotter result lists are disjoint and complete`.
    - _Requirements: 5.1, 5.5, 5.7_

- [x] 7. Two-phase scoring and ten-signal health entry
  - Wires the new signals into scoring. Existing behaviour for the original four signals must not change.
  - _Requirements: 3.1, 3.2, 3.3, 3.6, 3.7, 3.8, 6.9, 6.10, 7.5, 7.8, 8.5, 8.9, 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 10.8, 10.9, 10.12_

  - [x] 7.1 Switch to ten signals in src/types.ts and update existing tests
    - PackageSignals becomes OriginalSignals & NewSignals, SIGNAL_NAMES becomes the ten names, and missingSignals becomes SignalName[].
    - Update existing tests that assert missingSignals so they filter to ORIGINAL_SIGNAL_NAMES where they mean the original four. Unrouted attestations and deps.dev URLs in existing routed-transport tests degrade to unavailable signals and must not change any state.
    - Covered by tests in 7.4 and the existing suites.
    - _Requirements: 10.1, 10.3, 10.6_

  - [x] 7.2 Add collectReach and buildHistorySignals to src/score.ts
    - collectReach fetches every package's graph with mapWithConcurrency at 8, waits for all to settle, builds the union from the ok graphs and counts graphsMissing. It records each package's own source and fetchedAt.
    - buildHistorySignals is pure. maintainerChange: store read failure gives unavailable with no events; otherwise source is the packument URL and fetchedAt is the maintainers signal's, or the Reference time when it is unavailable (6.10). provenanceRegression: source and fetchedAt from the provenance signal (7.5). newInstallScript: unavailable naming the missing packument (8.5); otherwise fetchedAt from the hasInstallScript signal, with the Reference time fallback (8.9).
    - Covered by tests in 7.4.
    - _Requirements: 3.1, 3.2, 3.6, 3.8, 6.9, 6.10, 7.5, 7.8, 8.5, 8.9_

  - [x] 7.3 Extend scoreOne, buildHealth and scorePackages in src/score.ts
    - scoreOne takes an optional third options parameter (snapshotStore, reach, reference). Within a package, fetch the original signals, full and abbreviated packuments, provenance, History and the Seen record concurrently.
    - transitiveReach is always available with { reach, graphsMissing }, with the source and fetchedAt of that package's own graph request. Without a reach phase it is unavailable with reason "reach phase not run".
    - Read History only through the injected SnapshotStore, record a Seen record per scored package at the Reference time (a throw is swallowed), and never call append.
    - buildHealth accepts the optional new signals and fills missing ones with unavailable "not evaluated", computes missingSignals over the ten names and calls stateFromSignals.
    - scorePackages runs phase one (collectReach) to completion, then phase two at concurrency 8.
    - Covered by tests in 7.4.
    - _Requirements: 3.2, 3.3, 3.7, 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 10.8, 10.9, 10.12_

  - [x] 7.4 Write example tests in test/score-history.test.ts
    - Cover: phase one completes before phase two; in-flight count never exceeds 8 in either phase; one failed graph increments graphsMissing and leaves every other signal and package unchanged; ten-name missingSignals equals exactly the unavailable names; History-insufficient is not listed in missingSignals; store read failure degrades only the two history signals; recordSeen failure leaves the entry identical; no append during scoring (spy store); provenance unavailable wins when the store read also fails; buildHealth fills missing new signals.
    - No property in this sub-task.
    - _Requirements: 3.2, 3.6, 6.9, 7.8, 10.1, 10.3, 10.4, 10.5, 10.8, 10.9, 10.12_

- [x] 8. Fixtures and fixture scan
  - Recorded data only. Tests never touch the network.
  - _Requirements: 2.1, 3.1, 6.2, 6.6, 9.2, 10.6_

  - [x] 8.1 Extend scripts/record-fixtures.mjs
    - Also record attestations responses (including at least one 404) and deps.dev GetDependencies responses for the existing ten reference packages into test/fixtures. The script is run by the user, never by a test.
    - _Requirements: 2.1, 3.1_

  - [x] 8.2 Add test/fixtures/seed-maintainer-change.json
    - Two Snapshots 30 days apart for one package where one maintainer is replaced, in the shape given in design.md.
    - Used by the test in 8.3.
    - _Requirements: 6.2, 6.6_

  - [x] 8.3 Extend test/fixture-scan.test.ts
    - The routed transport serves the recorded attestations and deps.dev fixtures.
    - Add a test that feeds seed-maintainer-change.json into an InMemorySnapshotStore and asserts the maintainerChange event is recent and the state is Possessed for a Reference time inside the window.
    - No property in this sub-task.
    - _Requirements: 6.2, 6.6, 9.2, 10.6_

  - [x] 8.4 HUMAN REVIEW STEP, do not do this silently: record fixtures and review states
    - The user runs the recorder (needs network), reviews the resulting states by hand (a fixture package that recently added an install script can turn Possessed), then updates test/fixtures/expected-states.json and commits it. The agent must stop and ask the user to do this and must not edit expected-states.json on its own.
    - _Requirements: 8.2, 9.4, 10.6_

- [x] 9. Public exports
  - _Requirements: 10.1, 10.7_

  - [x] 9.1 Export the public surface listed in design.md from src/index.ts
    - New types, Snapshot, SnapshotStore, InMemorySnapshotStore, InvalidCaptureTimeError, RECENT_WINDOW_MS, unionGraph, transitiveReach, maintainerDiff, maintainerChangeValue, evaluateProvenanceRegression, newInstallScriptEvents, compareVersionOrder, publishedVersions, runSnapshotter, fetchProvenanceSignal, fetchDependencyGraph, fetchMaintainersSignal, extractMaintainers, collectReach, buildHistorySignals, ORIGINAL_SIGNAL_NAMES and NEW_SIGNAL_NAMES.
    - Covered by the test in 9.2.
    - _Requirements: 10.1, 10.7_

  - [x] 9.2 Write test/index.test.ts
    - Assert every new export exists. No property in this sub-task.
    - _Requirements: 10.1, 10.7_

- [x] 10. Final verification
  - _Requirements: 5.8, 10.6, 10.10, 10.11_

  - [x] 10.1 Run npm run typecheck, npm run lint and npm test at the repository root and fix anything until all three are green with zero warnings
    - Review checks: no scheduler, timer or cron in src/snapshotter.ts (5.8); no network in tests (10.10); no new runtime dependency in packages/engine/package.json (10.11).
    - If the agent's shell Node differs from Node 22 or lacks the platform rollup binary, the three commands are run in the user's own terminal and the results reported.
    - _Requirements: 5.8, 10.6, 10.10, 10.11_

## Notes

- Every task is required, including tests.
- Each task cites the requirements it implements. Test sub-tasks name their file and the properties from design.md they cover.
- Implementation sub-tasks point to the test sub-task that covers them.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "4.1", "8.1", "8.2"] },
    { "id": 1, "tasks": ["1.2", "3.1", "4.2", "5.1", "5.3"] },
    { "id": 2, "tasks": ["1.3", "2.1", "3.2", "4.3", "5.2", "5.4", "5.6"] },
    { "id": 3, "tasks": ["1.4", "2.2", "3.3", "4.4", "5.5", "6.1"] },
    { "id": 4, "tasks": ["2.3", "6.2", "7.1"] },
    { "id": 5, "tasks": ["2.4", "6.3"] },
    { "id": 6, "tasks": ["2.5", "7.2"] },
    { "id": 7, "tasks": ["2.6", "7.3"] },
    { "id": 8, "tasks": ["7.4", "8.3", "9.1"] },
    { "id": 9, "tasks": ["8.4", "9.2"] },
    { "id": 10, "tasks": ["10.1"] }
  ]
}
```
