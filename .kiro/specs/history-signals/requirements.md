# Requirements Document

## Introduction

The history-signals module extends the Sexton Engine (`packages/engine`) with the signals that need either a second upstream or a memory: current maintainers, provenance attestations, transitive reach, an append-only snapshot history, the maintainer change and provenance regression events derived from that history, the new-install-script signal, and the Possessed state rule that those signals feed.

This spec implements R-SG-4, R-SG-5, R-SG-6, R-SN-1, R-SN-2, R-SN-3, and the Possessed rule of R-ST-2 from docs/requirements.md. It builds on the health-scoring spec (`.kiro/specs/health-scoring`) and reuses its Signal envelope, `CachedFetcher` and `CacheStore`, `Transport` with the Sexton User-Agent and backoff, and the state function. It extends the package health entry from four signals to ten. It does NOT change any health-scoring behaviour: WHEN the six new signals are absent or unavailable, the state, stateReason and missingSignals results for the original four signals are identical to health-scoring's for any inputs (Requirement 10.6).

The module adds a `SnapshotStore` contract with an in-memory implementation, and a snapshotter job function. It adds no database implementation, no scheduler, no UI, no CLI, no policy, no remediation, no evidence pack, and no agent. Snapshot history is empty at launch, so the history-derived signals report "history-insufficient" rather than "no change" only while the History is empty (docs/requirements.md section 9).

Health-scoring Requirement 11.7 (never Possessed from last-publish, deprecated and advisories) and Requirement 14.5 (all state signals unavailable gives Restless) remain true for the original signals. Possessed becomes producible only from the three signals defined here.

## Glossary

- **Engine**: the @sexton/engine package. Pure core with no AWS, no UI, and no filesystem writes. Network access goes only through the injected Transport.
- **Signal**, **Signal envelope**, **Available signal**, **Unavailable signal**, **Source**, **fetchedAt**, **Packument**, **Abbreviated packument**, **Severity**, **Health rank**, **Cache**, **Scoring dependencies**: as defined in health-scoring.
- **Transport**: the injectable HTTP seam from health-scoring. It stamps the Sexton User-Agent and applies retry with backoff on HTTP 429 and 503.
- **Reference time**: the instant passed into a function as an input so that evaluation never depends on wall-clock time.
- **Maintainers list**: the list of maintainer names read from the `maintainers` field of the full packument. A maintainer is identified by its name string. Order is not significant.
- **Provenance attestation**: an entry in the npm attestations response whose predicateType is `https://slsa.dev/provenance/v1`.
- **predicateType**: the string field of an attestation that names the kind of statement it carries.
- **Direct dependency**: a package listed in the input list of package references given to the scoring function.
- **Resolved dependency graph**: the nodes and edges returned by deps.dev GetDependencies for one package version, where each edge runs from a dependent node to the node it depends on.
- **Union graph**: the graph whose nodes are the distinct package names found in the resolved dependency graphs of all scanned direct dependencies and whose edges are the distinct (dependent name, dependency name) pairs found in those graphs.
- **Transitive reach**: for a package P, the count of distinct package names N in the Union graph, N not equal to P, from which P is reachable by following one or more edges in the dependency direction (from dependent to dependency) through the Union graph. Direct edges alone are not the definition.
- **graphsMissing**: the number of scanned packages whose deps.dev Resolved dependency graph failed to load or could not be parsed. It is reported next to every Transitive reach value so that an undercount is visible.
- **Version order**: Published versions are ordered by publish time ascending. Among versions with equal publish time, the version whose version string sorts last by plain string comparison is the later one. "Earlier", "later", "greatest" and "most recent" between versions in Requirements 7 and 8 refer to this order.
- **Published version**: a version present in the `versions` map of the packument that has a parseable publish time in the packument `time` map.
- **Snapshot**: one dated record of a package's name, capture time, Maintainers list, and, for at most the 20 Published versions with the greatest publish times, that version's publish time, hasInstallScript value, and provenance attestation presence.
- **Capture time**: the ISO 8601 UTC instant at which a Snapshot was taken, read from the injected clock.
- **SnapshotStore**: the storage contract for Snapshots and for the record of packages seen in scans. It exposes append and read operations only.
- **Append-only**: a property of the SnapshotStore: no operation overwrites or deletes a Snapshot that has been appended.
- **History**: the sequence of all Snapshots for one package, ordered by Capture time ascending, with ties ordered by append order.
- **Seen record**: a record that a package name was part of a scan at a given reference time.
- **Maintainer change event**: a record derived either from two consecutive Snapshots in a History, or from the most recent Snapshot and the current maintainers signal, whose Maintainers lists differ as sets. It carries the earlier list and the later list. Its event time is the later Snapshot's Capture time for a pair of Snapshots, or the maintainers signal's fetchedAt for the live comparison.
- **Recent (90 days)**: an instant T is Recent relative to a Reference time R when T is not later than R and R minus T is at most 90 times 24 hours.
- **History-insufficient**: the explicit state of a history-derived signal when the History does not contain the Snapshots the signal needs. It is not the same as "no change".
- **Provenance regression**: the condition in which the installed version has no Provenance attestation while at least one Published version earlier in the Version order has provenance presence true in the most recent Snapshot.
- **Possessed**: the State assigned when the first state rule of R-ST-2 matches.
- **Possession signals**: the three signals maintainerChange, provenanceRegression and newInstallScript.
- **New signals**: the six signals maintainers, provenance, transitiveReach, maintainerChange, provenanceRegression and newInstallScript.
- **Original signals**: the four signals lastPublish, deprecated, hasInstallScript and advisories.

## Requirements

### Requirement 1: Maintainers signal

**User Story:** As a security engineer, I want the current maintainers of each package recorded as a signal, so that a handover can later be detected by comparison with history.

#### Acceptance Criteria

1. FOR EACH direct dependency, THE Engine SHALL read the Maintainers list from the full packument that health-scoring already fetches for that package.
2. WHEN the Engine reads the Maintainers list for a package whose full packument was already fetched within the cache TTL, THE Engine SHALL serve it from the Cache and SHALL NOT issue a second upstream request for that packument.
3. WHEN the full packument is read successfully, THE Engine SHALL return an available maintainers signal whose value is the list of maintainer names, whose source is the packument URL, and whose fetchedAt is an ISO 8601 UTC timestamp of the moment the packument was fetched.
4. WHEN the full packument has no `maintainers` field, THE Engine SHALL return an available maintainers signal whose value is an empty list.
5. IF the full packument request fails after at most three retries, THEN THE Engine SHALL return an unavailable maintainers signal that carries a reason, SHALL continue the scan for every other signal and package, and SHALL NOT fail the scan.
6. WHEN a packument `maintainers` entry has no name, THE Engine SHALL exclude that entry from the list.
7. FOR ANY packument, extracting the Maintainers list twice SHALL produce equal lists in the same order (determinism), and the list SHALL contain each maintainer name at most once, keeping the position of its first appearance.

### Requirement 2: Provenance signal

**User Story:** As a security engineer, I want to know whether the installed version carries a provenance attestation, so that provenance can be required and its loss detected.

#### Acceptance Criteria

1. WHEN the Engine computes the provenance signal for a direct dependency, THE Engine SHALL request `https://registry.npmjs.org/-/npm/v1/attestations/{name}@{version}` for the installed version through the Transport and the Cache.
2. WHEN the attestations response is successful and contains at least one attestation whose predicateType is `https://slsa.dev/provenance/v1`, THE Engine SHALL return an available provenance signal whose value has present true and records that predicateType.
3. WHEN the attestations response is successful and contains no attestation whose predicateType is `https://slsa.dev/provenance/v1`, THE Engine SHALL return an available provenance signal whose value has present false.
4. WHEN the attestations endpoint returns HTTP 404, THE Engine SHALL return an available provenance signal whose value has present false and SHALL NOT mark the signal unavailable.
5. IF the attestations request fails with any status other than 404 after all retries, THEN THE Engine SHALL return an unavailable provenance signal whose reason records that status, SHALL leave the signals of other packages and other signal types for this scan unchanged, and SHALL NOT fail the scan.
6. IF the attestations request fails without an HTTP status (for example a network error or timeout) after all retries, THEN THE Engine SHALL return an unavailable provenance signal whose reason states that no status was received, and SHALL NOT fail the scan.
7. IF the attestations response is successful but its body cannot be parsed as an attestations document, THEN THE Engine SHALL return an unavailable provenance signal whose reason states that the body was malformed, and SHALL NOT fail the scan.
8. THE Engine SHALL set the source of every provenance signal, available or unavailable, to the attestations URL that was requested, and SHALL set its fetch timestamp to the time of the request.
9. FOR ANY attestations response body, THE Engine SHALL produce a provenance value whose present flag is true if and only if at least one attestation in the body has predicateType `https://slsa.dev/provenance/v1` (invariant).
10. WHEN the Engine requests the provenance signal for the same package and version twice within the cache TTL, THE Engine SHALL issue exactly one upstream request and SHALL return equal values for both calls (idempotence). The fetchedAt of the two signals MAY differ.

### Requirement 3: Transitive reach signal

**User Story:** As a maintainer, I want to know how many packages in my graph depend on each dependency, so that the blast radius of a bad package is visible.

#### Acceptance Criteria

1. FOR EACH direct dependency, THE Engine SHALL read the Resolved dependency graph of the installed version from deps.dev GetDependencies through the Transport and the Cache, and SHALL set the transitiveReach signal's source to the deps.dev URL of that package's own graph request.
2. THE Engine SHALL compute transitiveReach in two phases. In phase one, THE Engine SHALL fetch the Resolved dependency graph of every scanned package with a concurrency limit of 8 and, once every fetch has succeeded or failed after all retries, SHALL build the Union graph from the graphs that were read by merging the nodes by package name and the edges by (dependent name, dependency name) pair. In phase two, THE Engine SHALL score packages independently as health-scoring does, reading each package's reach from the Union graph built in phase one. A failure in one package's graph fetch SHALL NOT affect any other signal of any package.
3. THE Engine SHALL compute the Transitive reach of a package P as the count of distinct package names N, N not equal to P, in the Union graph such that P is reachable from N by following one or more edges in the dependency direction through the Union graph, not only by direct edges. The repository root SHALL NOT be a node and SHALL NOT count as a dependent. THE Engine SHALL return the transitiveReach value as an object { reach, graphsMissing }, where graphsMissing is the number of scanned packages whose graph failed to load.
4. FOR ANY Union graph, THE Engine SHALL compute a Transitive reach whose reach is a non-negative integer, that does not change when the input order of the Resolved dependency graphs changes, and that counts a package name once regardless of how many versions, edges or paths it contributes (determinism and invariant).
5. FOR ANY set of Resolved dependency graphs, THE Engine SHALL produce the same Transitive reach for every package when the same graphs are merged twice (idempotence of merging).
6. IF the deps.dev request for a direct dependency fails after all retries, THEN THE Engine SHALL exclude that package's graph from the Union graph, SHALL count it in graphsMissing, and SHALL still return an available transitiveReach signal for every package, computed from the graphs that were read.
7. WHEN a direct dependency has no dependents in the Union graph, THE Engine SHALL return an available transitiveReach signal whose value has reach 0 and the current graphsMissing.
8. IF the deps.dev response for a direct dependency cannot be parsed as a Resolved dependency graph, THEN THE Engine SHALL treat that request as failed, SHALL exclude that response from the Union graph, and SHALL count it in graphsMissing.
9. FOR ANY Union graph that is a simple chain of n distinct names, THE Engine SHALL compute a Transitive reach of n minus 1 for the last name in the dependency direction.

### Requirement 4: Snapshot model and append-only SnapshotStore

**User Story:** As a security engineer, I want package history stored so that it can never be rewritten, so that a handover can be proven from the record.

#### Acceptance Criteria

1. THE Engine SHALL define a Snapshot as a record carrying package name, Capture time as an ISO 8601 UTC string, the Maintainers list, and, for each of at most the 20 Published versions with the greatest publish times, its publish time, hasInstallScript value and provenance presence. A hasInstallScript value is recorded as false when the abbreviated packument entry for that version omits it, consistent with health-scoring 5.4. Provenance presence is null only for a version whose attestation read failed.
2. THE Engine SHALL define a SnapshotStore contract whose operations are limited to: append a Snapshot, read the History of a package, record a Seen record, and list the packages seen within a window. THE SnapshotStore contract SHALL NOT define any operation that overwrites or deletes a Snapshot.
3. THE Engine SHALL provide an in-memory SnapshotStore implementation for the CLI and for tests.
4. WHEN a Snapshot has been appended to a package's History and the History is read back, THE SnapshotStore SHALL return a Snapshot deeply equal to the appended Snapshot (round trip, for any Snapshot).
5. WHEN a further Snapshot is appended for any package, THE SnapshotStore SHALL leave every Snapshot already in any package's History deeply equal to what it was before the append (append-only invariant, for any sequence of appends).
6. WHEN the caller mutates a History returned by the SnapshotStore, THE SnapshotStore SHALL return the unchanged History on the next read (for any mutation of the returned value).
7. THE SnapshotStore SHALL return a History ordered by Capture time ascending, with ties ordered by append order (for any sequence of appends in any order).
8. WHEN the Engine appends a Snapshot for package A, THE SnapshotStore SHALL leave the History of every other package unchanged.
9. WHEN a Seen record is recorded for a package name and Reference time, THE SnapshotStore SHALL include that package name in the list of packages seen within 90 days for any Reference time at which the Seen record is Recent (90 days).
10. WHEN the Engine lists packages seen within 90 days of a Reference time, THE SnapshotStore SHALL return each package name exactly once, in ascending code-unit order, excluding every package none of whose Seen records is Recent (90 days) (for any set of Seen records).
11. WHEN the History is read for a package that has no appended Snapshot, THE SnapshotStore SHALL return an empty History and SHALL NOT raise an error.
12. IF a Snapshot is appended whose Capture time is not a valid ISO 8601 UTC string, THEN THE SnapshotStore SHALL reject the append with an error indicating the invalid Capture time and SHALL leave every History unchanged.
13. THE Engine SHALL treat a null provenance presence in a Snapshot as unknown, and a null provenance presence SHALL never satisfy a condition that requires provenance presence true or provenance presence false.

### Requirement 5: Snapshotter job function

**User Story:** As a maintainer, I want one function that records a snapshot of every recently scanned package, so that a scheduler elsewhere can call it daily.

#### Acceptance Criteria

1. WHEN the snapshotter function is called with a SnapshotStore, a Transport, a clock and a Cache, and optionally a list of package names, THE Engine SHALL read the clock's current time once and SHALL determine the seen list as follows. WHEN a list of package names is given, THE Engine SHALL deduplicate it, SHALL use it as the seen list, and SHALL NOT list packages from the SnapshotStore. WHEN no list is given, THE Engine SHALL list each distinct package name last seen in a scan at or after 90 days before that time (boundary inclusive). THE Engine SHALL attempt exactly one Snapshot for each package in the seen list. IF the seen list is empty, THEN THE Engine SHALL append no Snapshot and SHALL return empty snapshotted and failed lists.
2. FOR EACH package attempted, THE Engine SHALL read the current Maintainers list from the full packument, SHALL select at most the 20 Published versions with the greatest publish times, SHALL read the hasInstallScript value of each selected version from the abbreviated packument, and SHALL read the provenance presence of each selected version from the attestations endpoint, through the Transport and the Cache. THE Engine SHALL NOT read attestations for any Published version outside the selected 20. THE Engine SHALL record a version whose abbreviated packument entry omits hasInstallScript as false, and SHALL NOT record null for it.
3. WHEN the full packument read and the abbreviated packument read succeed for a package, THE Engine SHALL append exactly one Snapshot for that package, with a Capture time equal to the clock's current time as an ISO 8601 UTC string. A Maintainers list that is empty in a successful read SHALL be recorded as empty.
4. IF the full packument read or the abbreviated packument read for a package fails after all retries, or the SnapshotStore append for that package fails, THEN THE Engine SHALL append no Snapshot for that package, SHALL skip the package, and SHALL record the package name and a failure reason in the job result that identifies which read or append failed. IF an attestation read fails after all retries for one selected version, THEN THE Engine SHALL record provenance presence null for that version and SHALL still append the Snapshot for that package.
5. IF the Snapshot for one package fails, THEN THE Engine SHALL continue with every remaining package. The Snapshots appended for the remaining packages SHALL be identical to those appended when the failing package is absent from the seen list. This SHALL hold for any set of packages and any failing subset, and independent of the order in which packages are attempted (isolation).
6. THE Engine SHALL record provenance presence null only for a version whose attestation read failed, and never for a packument field.
7. THE snapshotter function SHALL return a result listing the package names snapshotted and the package names that failed. The two lists SHALL be disjoint and their union SHALL equal the seen list (invariant).
8. THE Engine SHALL contain no scheduler, timer or cron code for the snapshotter. (review constraint, not a correctness property)
9. IF listing the seen packages from the SnapshotStore fails, THEN THE Engine SHALL append no Snapshot, SHALL attempt no read, SHALL NOT raise, and SHALL return a result with an error field identifying the listing failure and with empty snapshotted and failed lists.

### Requirement 6: Maintainer change signal

**User Story:** As a maintainer, I want a maintainer handover detected from history, so that a package whose ownership just changed is flagged.

#### Acceptance Criteria

1. THE Engine SHALL compute the maintainerChange signal from the package's History read from the SnapshotStore plus the current maintainers signal, and SHALL NOT compute it from a single packument read alone.
2. WHEN a History is non-empty, THE Engine SHALL order the Snapshots by Capture time and, WHEN the History holds two or more Snapshots, SHALL derive exactly one Maintainer change event for each pair of consecutive Snapshots whose Maintainers lists differ as sets, recording both lists and the later Snapshot's Capture time as the event time. After those pairs, WHEN the maintainers signal is available, THE Engine SHALL compare the most recent Snapshot's Maintainers list with the maintainers signal value and, if they differ as sets, SHALL derive one further Maintainer change event recording both lists and using the maintainers signal's fetchedAt as the event time. The live comparison applies to every non-empty History, including a History of exactly one Snapshot.
3. THE Engine SHALL derive no Maintainer change event for a pair of consecutive Snapshots, and none for the comparison of the most recent Snapshot with the maintainers signal value, when the two Maintainers lists are equal as sets, regardless of list order or repeated entries.
4. IF the History is empty, THEN THE Engine SHALL return an available maintainerChange signal whose value marks History-insufficient and carries zero events, and SHALL NOT report that no change occurred.
5. WHEN the History is non-empty, THE Engine SHALL return an available maintainerChange signal whose value marks History-sufficient and lists all derived events in ascending event-time order, with events of equal event time kept in the order in which they were derived. WHEN the maintainers signal is unavailable, THE Engine SHALL derive events from Snapshot pairs only and SHALL skip the live comparison. The list is empty when no comparison differs. Every event SHALL carry a recent boolean computed per criterion 6.6.
6. WHEN the Engine is given a Reference time, THE Engine SHALL mark an event derived from a pair of Snapshots as Recent (90 days) if and only if its event time is Recent (90 days) relative to that Reference time, and SHALL mark the live comparison event as Recent (90 days) if and only if the most recent Snapshot's Capture time is Recent (90 days) relative to that Reference time, because the change happened between that Snapshot and now. All comparisons use numeric time values.
7. FOR ANY History and Reference time, THE Engine SHALL produce equal maintainerChange values on repeated evaluation (determinism).
8. WHEN a Snapshot with a Maintainers list equal as a set to that of the last Snapshot is appended to the end of a History, THE Engine SHALL derive the same event lists as before the append, ignoring the recent flags (invariant).
9. IF the SnapshotStore read fails, THEN THE Engine SHALL return an unavailable maintainerChange signal with a reason, SHALL carry no events, and SHALL NOT fail the evaluation of other signals.
10. THE Engine SHALL set the source of the maintainerChange signal to the packument URL and its fetchedAt to the maintainers signal's fetchedAt, or to the Reference time when the maintainers signal is unavailable.

### Requirement 7: Provenance regression signal

**User Story:** As a security engineer, I want to know when a package that used to publish with provenance stops doing so, so that a possible account compromise is flagged.

#### Acceptance Criteria

1. THE Engine SHALL take the installed version's provenance presence from the provenance signal of Requirement 2 and its publish time from the full packument time map, and SHALL take every earlier Published version and its provenance presence from the most recent Snapshot of the package's History. THE Engine SHALL ignore a version with null provenance presence as evidence on either side.
2. WHEN the installed version has no provenance attestation according to the provenance signal and at least one Published version earlier in the Version order has provenance presence true in the most recent Snapshot, THE Engine SHALL return an available provenanceRegression signal whose value marks a regression and names the installed version and the most recent such earlier version, meaning the latest of them in the Version order. Version comparison follows the Version order defined in the Glossary.
3. WHEN the data needed to evaluate the signal is sufficient and the condition in criterion 7.2 does not hold, THE Engine SHALL return an available provenanceRegression signal whose value marks no regression.
4. IF the History is empty, or no Published version earlier in the Version order has a non-null recorded provenance presence in the most recent Snapshot, THEN THE Engine SHALL return an available provenanceRegression signal whose value marks History-insufficient and SHALL NOT report that no regression occurred. IF the installed version is absent from the full packument or its publish time does not parse as a date, THEN THE Engine SHALL likewise return an available provenanceRegression signal whose value marks History-insufficient, with a reason naming that condition.
5. THE Engine SHALL set the source of every available provenanceRegression signal to the attestations URL of the provenance signal and its fetchedAt to the provenance signal's fetchedAt, and SHALL record in the value the Capture time of the Snapshot used.
6. FOR ANY most recent Snapshot and provenance signal, THE Engine SHALL report a regression if and only if the installed version has no provenance attestation according to the provenance signal and at least one Published version earlier in the Version order has provenance presence true in the most recent Snapshot (invariant).
7. FOR ANY History, installed version and provenance signal, THE Engine SHALL produce equal provenanceRegression values on repeated evaluation (determinism).
8. IF the SnapshotStore read fails, THEN THE Engine SHALL return an unavailable provenanceRegression signal with a reason, SHALL NOT return a regression, no-regression or History-insufficient value, and SHALL NOT fail evaluation of other signals. IF the provenance signal of Requirement 2 is unavailable, THEN THE Engine SHALL return an unavailable provenanceRegression signal with the reason "provenance unavailable", and SHALL NOT fail evaluation of other signals. WHEN more than one of these outcomes applies, THE Engine SHALL apply this precedence: unavailable first, then History-insufficient, then regression or no regression, so that an unavailable result always wins over History-insufficient.

### Requirement 8: New install script signal

**User Story:** As a security engineer, I want to know when a recent version of a package gained an install script, so that a newly added code-execution hook is flagged.

#### Acceptance Criteria

1. THE Engine SHALL compute the newInstallScript signal from the per-version hasInstallScript values in the abbreviated packument and the per-version publish times in the full packument, and SHALL NOT read the SnapshotStore.
2. WHEN the data needed to evaluate the signal is available, THE Engine SHALL return an available newInstallScript signal whose value is a list of events, one for every Published version whose publish time is Recent (90 days) relative to the Reference time and whose hasInstallScript is true while the latest Published version earlier in the Version order has hasInstallScript false or absent. Each event names the version and its publish time. The evaluation covers every such Published version, not only the installed version. Version comparison follows the Version order defined in the Glossary.
3. THE Engine SHALL treat the newInstallScript signal as true when its list of events is non-empty and as false when the list is empty.
4. WHEN a Published version has no Published version earlier in the Version order, THE Engine SHALL NOT derive an event for that version.
5. IF the full packument is unavailable or the abbreviated packument is unavailable, THEN THE Engine SHALL return an unavailable newInstallScript signal with a reason naming which of them is unavailable, and this result SHALL take precedence over criteria 2 to 4.
6. FOR ANY pair of packuments and Reference time, THE Engine SHALL produce equal newInstallScript results on repeated evaluation (determinism), and the value SHALL be false whenever no Published version has hasInstallScript true (invariant).
7. FOR ANY pair of packuments and Reference time, THE Engine SHALL derive no event for a Published version whose publish time is later than the Reference time.
8. THE Engine SHALL treat a version as Published only if the full packument gives it a publish time that parses as a date, and SHALL treat a Published version's publish time as Recent only if it is not later than the Reference time and not earlier than 90 days before the Reference time, with both bounds inclusive. THE Engine SHALL apply these definitions to each version individually and not only to the installed version.
9. THE Engine SHALL set the source of the newInstallScript signal to the packument URL and its fetchedAt to the hasInstallScript signal's fetchedAt.

### Requirement 9: Possessed state rule

**User Story:** As a maintainer, I want a package that shows a takeover pattern marked Possessed ahead of every other state, so that the most dangerous packages surface first.

#### Acceptance Criteria

1. THE Engine SHALL evaluate the Possessed rule first, before Dead, Haunted, Restless and Alive, and the first matching rule SHALL win.
2. WHEN the maintainerChange signal holds an event whose recent boolean is true, THE Engine SHALL assign Possessed.
3. WHEN the provenanceRegression signal marks a regression, THE Engine SHALL assign Possessed.
4. WHEN the newInstallScript signal has a non-empty list of events, THE Engine SHALL assign Possessed.
5. IF a Possession signal is unavailable or marks History-insufficient, THEN THE Engine SHALL treat that Possession signal as not matching and SHALL continue with the remaining conditions and rules, so that an unavailable or History-insufficient signal never produces Possessed on its own.
6. THE Engine SHALL assign exactly one State to every package, from the set Alive, Restless, Haunted, Dead, Possessed, and SHALL record the matching rule in stateReason (for any combination of signals).
7. THE Engine SHALL keep the state function pure and deterministic and SHALL take the Reference time as an input, so that equal inputs and an equal Reference time produce equal results.
8. THE Engine SHALL produce Possessed only from the Possession signals, so that for any inputs in which all three Possession signals are unavailable, History-insufficient or non-matching, the State is never Possessed.
9. THE Engine SHALL keep the Health rank ordering Possessed 0, Dead 1, Haunted 2, Restless 3, Alive 4.
10. FOR ANY pair of inputs equal in every signal except lastPublish, THE Engine SHALL assign the older lastPublish a Health rank no greater than the newer lastPublish (monotonic in age, health-scoring Requirement 13.2).
11. WHEN no Possessed condition matches and all of lastPublish, deprecated and advisories are unavailable, THE Engine SHALL assign Restless with the reason "all state signals unavailable", as health-scoring Requirement 14.5 requires.
12. WHEN a Possessed condition matches and some Original signals are unavailable, THE Engine SHALL assign Possessed and SHALL list each unavailable signal in missingSignals.

### Requirement 10: Health entry extension to ten signals

**User Story:** As an engine developer, I want the health entry to carry all ten signals with the same envelope and the same degradation rules, so that downstream code reads one shape.

#### Acceptance Criteria

1. THE Engine SHALL record on every package health entry the Original signals lastPublish, deprecated, hasInstallScript and advisories and the New signals maintainers, provenance, transitiveReach, maintainerChange, provenanceRegression and newInstallScript, so that every entry carries exactly these ten signals.
2. THE Engine SHALL represent each New signal as a Signal envelope carrying value, source, fetchedAt, available and an optional reason, with fetchedAt as an ISO 8601 UTC string.
3. THE Engine SHALL set missingSignals on every entry to exactly the names of the signals among all ten whose available is false, and SHALL NOT list a History-insufficient signal in missingSignals because it is an available signal (for any signal set).
4. IF an upstream request or a SnapshotStore read fails for one New signal, THEN THE Engine SHALL set available to false on that signal only, SHALL return the other nine signals with their own availability unchanged, and SHALL still return a State.
5. THE Engine SHALL fetch the New signals other than transitiveReach concurrently with the Original signals within a package, SHALL keep the concurrency limit of 8 across packages in phase two, and SHALL compute transitiveReach in the two phases of criterion 3.2.
6. WHEN the six New signals are absent or unavailable, THE Engine SHALL produce the same State, the same stateReason and the same Original-signal entries in missingSignals as health-scoring produces for the same Original signals and Reference time (for any inputs).
7. THE Engine SHALL accept an injected SnapshotStore among the Scoring dependencies and SHALL read History only through it.
8. THE Engine SHALL append no Snapshot during scoring, so that for any scan the History of every package is unchanged by scoring.
9. WHEN the Engine scores a package list, THE Engine SHALL record a Seen record for each scored package name at the Reference time through the SnapshotStore.
10. THE Engine SHALL send every upstream request for the New signals and the snapshotter through the injected Transport, so that the User-Agent, backoff and Cache of health-scoring apply and no test requires network access. (review constraint, not a correctness property)
11. THE Engine SHALL add no runtime dependency to implement the New signals. (review constraint, not a correctness property)
12. IF recording a Seen record through the SnapshotStore fails for a package, THEN THE Engine SHALL still return the health entry for that package with the same ten signals, State and missingSignals as it would return had the recording succeeded.
13. WHEN no SnapshotStore is injected, THE Engine SHALL evaluate history-derived signals as if the History were empty, so that they are available and marked History-insufficient and never listed in missingSignals.
