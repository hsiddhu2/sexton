# Requirements Document

## Introduction

The health-scoring module is the pure core of the Sexton engine (`packages/engine`). Given a list of npm packages with installed versions, the Engine fetches three signals per package — last publish date and the per-version deprecated flag from the npm registry packument, install-script presence from the npm abbreviated packument, and known advisories from OSV — caches every upstream response for 24 hours, sends a Sexton-identifying User-Agent on every outbound request, backs off and retries on HTTP 429, and assigns each package exactly one state from {Alive, Restless, Haunted, Dead}.

The state type includes Possessed for forward compatibility with a later spec that adds maintainer-change and provenance-regression signals, but this module never assigns Possessed. The state function is pure, deterministic, and monotonic in age. An upstream failure degrades a single signal and never the whole result: a package with missing signals still receives a state and a missingSignals list.

This spec implements R-SG-1, R-SG-2, R-SG-3, R-SG-7, R-SG-8, R-SG-9, R-ST-1, R-ST-2, R-ST-3, and R-ST-4 from docs/requirements.md. It does not cover maintainer change (R-SG-4), provenance (R-SG-5), transitive reach from deps.dev (R-SG-6), the snapshotter (R-SN-*), policy (R-PO-*), remediation (R-RM-*), the evidence pack (R-EV-*), the UI, the CLI, or the agent.

## Glossary

- **Engine**: the @sexton/engine package — a pure core with no AWS, no UI, and no filesystem writes.
- **Signal**: a single observed fact about a package from a named upstream source at a timestamp, represented as a record carrying value, source, fetchedAt, available, and an optional reason.
- **Signal envelope**: the uniform record shape every Signal uses, defined by the Signal<T> type.
- **Available signal**: a signal whose upstream response was read successfully; value holds the data and available is true.
- **Unavailable signal**: a signal whose upstream response failed after all retries; value is null, available is false, and reason describes the failure.
- **Source**: the named upstream URL a value was read from.
- **fetchedAt**: an ISO 8601 timestamp marking when a value was fetched.
- **Packument**: the npm registry document for a package name. The full packument carries last publish date and per-version deprecated flags; the abbreviated packument carries install-script presence.
- **Abbreviated packument**: the npm registry packument served with Accept: application/vnd.npm.install-v1+json, used to read hasInstallScript without downloading the tarball.
- **Advisory**: a known vulnerability record from OSV, normalised to an id, a Severity, and a summary.
- **Severity**: one of Critical, High, Moderate, Low, Unknown, normalised before any state rule reads it.
- **State**: the single label assigned to a package. This module produces one of Alive, Restless, Haunted, Dead. Possessed is in the type union for forward compatibility but is never produced by this module.
- **Health rank**: an integer ordering of states from least healthy (Possessed = 0) to most healthy (Alive = 4), used to express monotonicity.
- **Reference time (now)**: the reference instant passed into the state function as an input, so state evaluation is deterministic and never depends on wall-clock time.
- **Upstream**: an external service the Engine reads from: registry.npmjs.org or api.osv.dev.
- **Cache**: a 24-hour TTL store keyed by package name and version that prevents fetching the same key twice within the window.
- **Scoring dependencies**: the injectable inputs to the scoring function — an HTTP transport, a clock, and a cache TTL — so that tests run without network and without wall-clock time.

## Requirements

### Requirement 1: Signal envelope

**User Story:** As an engine developer, I want a uniform signal envelope so that every observed fact carries its provenance and availability and missing signals can be recorded rather than thrown.

#### Acceptance Criteria

1. THE Engine SHALL represent every Signal as a record carrying value, source, fetchedAt, available, and an optional reason.
2. WHEN the Engine reads an upstream response successfully, THE Engine SHALL build an available signal whose value holds the observed data, whose available flag is true, and whose reason field is absent.
3. WHEN an upstream response fails after all retries, THE Engine SHALL build an unavailable signal whose value is null, whose available flag is false, and whose reason field holds a description of the failure with no newline characters and not exceeding 200 characters.
4. THE Engine SHALL populate the source field of every available signal with the named upstream URL the value was read from, and shall populate the source field of every unavailable signal with the named upstream URL whose fetch was attempted.
5. THE Engine SHALL populate the fetchedAt field of every signal with an ISO 8601 timestamp expressed in UTC (with the 'Z' designator) of the fetch.
6. WHEN the Engine builds two signals from the same source, timestamp, and value, THE Engine SHALL produce equal signal records where source, fetchedAt, value, available, and reason all match (determinism, for any source string, any ISO timestamp, and any value).

### Requirement 2: Date representation

**User Story:** As an engine developer, I want dates represented consistently so that comparisons never depend on string ordering and timezone issues are avoided.

#### Acceptance Criteria

1. THE Engine SHALL carry fetchedAt on every signal as an ISO 8601 string expressed in UTC (with the 'Z' designator) at the Engine boundary with upstreams.
2. THE Engine SHALL accept last publish dates and the reference time (the point in time against which publish age thresholds are measured) as Date objects inside the state function.
3. WHEN the Engine orders two dates, THE Engine SHALL order them by their numeric time value (milliseconds since the Unix epoch) so that date comparison never depends on string ordering.
4. WHEN the Engine converts a fetchedAt ISO 8601 string to a Date object, THE Engine SHALL preserve the original instant so that the resulting Date is independent of the runtime's local timezone.

### Requirement 3: Severity normalisation

**User Story:** As a security engineer, I want advisory severities normalised to a fixed set so that state rules compare consistent values regardless of how the upstream records them.

#### Acceptance Criteria

1. THE Engine SHALL normalise every advisory severity to exactly one of Critical, High, Moderate, Low, Unknown before any state rule reads it.
2. WHEN an OSV vulnerability record carries a textual severity in database_specific.severity, THE Engine SHALL match it case-insensitively and SHALL map CRITICAL to Critical, HIGH to High, MODERATE or MEDIUM to Moderate, and LOW to Low.
3. WHEN an OSV vulnerability record carries a numeric CVSS base score in its severity array and no textual severity matching criterion 2, THE Engine SHALL map 9.0 or above to Critical, 7.0 to 8.9 to High, 4.0 to 6.9 to Moderate, above 0 and below 4.0 to Low, and exactly 0.0 to Unknown. The Engine SHALL NOT parse or compute scores from CVSS vector strings.
4. WHEN an OSV vulnerability record carries no textual severity matching the values in criterion 2 and no CVSS v3 score, THE Engine SHALL assign severity Unknown.
5. WHEN the Engine normalises the same OSV vulnerability record twice, THE Engine SHALL produce the same Severity (determinism, for any OSV vulnerability record).

### Requirement 4: npm packument signal client

**User Story:** As a maintainer, I want the Engine to read last publish date and the deprecated flag from the npm registry so that stale or deprecated packages can be detected.

#### Acceptance Criteria

1. FOR EACH direct dependency, the Engine SHALL read the last publish date and the per-version deprecated flag from the npm registry full packument.
2. THE Engine SHALL take the last publish date as the time-map entry with the greatest numeric time value among entries whose keys are version strings, excluding the created and modified meta-entries. The dist-tags.latest field SHALL NOT be used.
3. THE Engine SHALL read the deprecated flag for the installed version from the packument versions map. IF a non-empty deprecated string is present for the installed version, THEN the Engine SHALL treat that version as deprecated and SHALL record the deprecated signal as available with value true. IF the installed version has no deprecated field or is absent from the versions map, THEN the Engine SHALL treat that version as not deprecated and SHALL record the deprecated signal as available with value false.
4. WHEN the Engine extracts the last publish date from a packument twice, THE Engine SHALL return equal results — the same numeric time value in both cases, or null in both cases (determinism, for any packument).
5. WHEN the npm registry returns a non-success response after all retries, or the packument request fails, THE Engine SHALL return an unavailable last-publish signal and an unavailable deprecated signal for that package.
6. WHEN the packument time map contains no version entry that parses to a valid date, THE Engine SHALL return an available last-publish signal whose value is null.

### Requirement 5: npm abbreviated packument signal client

**User Story:** As a maintainer, I want the Engine to detect install scripts without downloading tarballs so that packages that run code on install are flagged.

#### Acceptance Criteria

1. FOR EACH direct dependency, the Engine SHALL read hasInstallScript for the installed version from the npm abbreviated packument.
2. THE Engine SHALL request the abbreviated packument with Accept: application/vnd.npm.install-v1+json and SHALL NOT download the package tarball.
3. WHEN the abbreviated packument reports hasInstallScript as true for the installed version, THE Engine SHALL record the install-script signal as true.
4. WHEN the abbreviated packument omits hasInstallScript for the installed version, THE Engine SHALL record the install-script signal as false.
5. IF the npm registry request fails or returns a non-success response for a package, THEN THE Engine SHALL return an unavailable install-script signal for that package and SHALL NOT fail the scan.
6. IF the installed version is not present in the abbreviated packument's versions map, THEN THE Engine SHALL return an unavailable install-script signal for that package.

### Requirement 6: OSV advisory signal client

**User Story:** As a security engineer, I want the Engine to read known advisories from OSV so that vulnerable packages can be detected.

#### Acceptance Criteria

1. FOR EACH direct dependency, the Engine SHALL query known advisories for the installed version from OSV using the querybatch endpoint and SHALL record advisory ID, Severity, and summary for each result.
2. WHEN OSV querybatch returns vulnerability IDs, the Engine SHALL fetch the detail for each ID from the OSV vulns endpoint and SHALL normalise its Severity to exactly one of Critical, High, Moderate, Low, or Unknown.
3. WHEN OSV querybatch returns a next_page_token, the Engine SHALL follow the token and SHALL collect all vulnerability IDs across pages, up to a maximum of 10 pages.
4. WHEN OSV returns no vulnerabilities for a package version, the Engine SHALL record an empty advisory list as an available signal.
5. IF the OSV querybatch request or any OSV vulns detail fetch fails or returns a non-success response for a package version, THEN the Engine SHALL return an unavailable advisories signal for that package.

### Requirement 7: 24-hour response cache

**User Story:** As a security engineer, I want upstream responses cached for 24 hours so that repeated scans are fast and registries are not hammered.

#### Acceptance Criteria

1. THE Engine SHALL cache every npm registry and OSV response for an injectable cache TTL (default 24 hours) keyed by upstream source, package name, and version.
2. WHEN a cache key has been fetched within the TTL window, THE Engine SHALL serve subsequent requests for that key from the cache without an additional upstream fetch (idempotence, for any cacheable key).
3. WHEN a request for a key arrives while a fetch for that key is in flight, the Engine SHALL serve that request from the in-flight fetch and SHALL NOT start a second fetch for the same key.
4. WHEN a fetch fails, the Engine SHALL leave the cache entry absent so that a later scan may retry the key.
5. WHEN a cached entry's age reaches or exceeds the TTL, the Engine SHALL fetch the key again on the next request.
6. WHEN the Engine stores a value under a cache key and reads it back before the TTL elapses, the Engine SHALL return a value deeply equal to the stored value (cache invariant, for any cacheable value and any key).

### Requirement 8: Sexton User-Agent

**User Story:** As a project maintainer, I want every outbound request to identify Sexton so that upstreams can contact the project and rate-limit appropriately.

#### Acceptance Criteria

1. THE Engine SHALL send the header User-Agent: sexton/{version} (+https://github.com/hsiddhu2/sexton) on every outbound request, where {version} is the engine package version read at build time.

2. WHEN the Engine builds the default HTTP transport, THE Engine SHALL stamp this header on every request before the request reaches the network.

3. THE Engine SHALL NOT require any user configuration to construct the User-Agent value.

### Requirement 9: Backoff and retry on rate limiting

**User Story:** As a maintainer, I want the Engine to back off and retry on rate limits so that a single 429 does not fail an entire signal.

#### Acceptance Criteria

1. WHEN an upstream returns HTTP 429, the Engine SHALL back off with exponential delay and full jitter and SHALL retry at most three times, for a maximum of four requests including the initial request.
2. WHEN an upstream returns HTTP 503, the Engine SHALL back off with exponential delay and full jitter and SHALL retry at most three times, for a maximum of four requests including the initial request.
3. THE Engine SHALL start backoff at 500 milliseconds, SHALL double the base delay for each retry attempt, and SHALL apply full jitter by selecting the actual delay as a uniformly random value between 0 and the base delay for that attempt.
4. WHEN the Engine exhausts its retries on a rate-limited upstream, the Engine SHALL mark that signal as unavailable for that package with the HTTP status as the reason and SHALL continue the scan.
5. WHEN an upstream returns a status other than 429 or 503, the Engine SHALL return that response without retrying.

### Requirement 10: Health scoring entry point

**User Story:** As a maintainer, I want to score a list of packages so that each gets signals and a state in one pass.

#### Acceptance Criteria

1. THE Engine SHALL provide a scoring function that accepts a list of package references and scoring dependencies and SHALL return a health report with one entry per package.
2. THE Engine SHALL fetch the four signals for each package concurrently within a package and SHALL score packages independently, so that a failure in one package's signal fetch does not affect another package's results. THE Engine SHALL score packages with a concurrency limit of 8 across packages.
3. THE Engine SHALL accept an injectable HTTP transport, an injectable clock, and an injectable cache TTL as scoring dependencies so that tests run without network and without wall-clock time.
4. THE Engine SHALL stamp the health report with an ISO 8601 generatedAt timestamp taken from the injected clock.
5. THE Engine SHALL record the last-publish, deprecated, install-script, and advisories signals, the assigned State, and a missingSignals list on every package health entry.
6. IF a signal fetch fails for a package, THEN THE Engine SHALL mark that signal unavailable with a reason and SHALL still assign a State to that package from the remaining available signals.

### Requirement 11: State assignment

**User Story:** As a maintainer, I want each dependency assigned exactly one state so that I can see at a glance which packages need attention.

#### Acceptance Criteria

1. THE Engine SHALL assign exactly one State to each direct dependency from the set Alive, Restless, Haunted, Dead, Possessed, such that the same last-publish, deprecated and advisories signals with the same reference time always produce the same State.
2. THE Engine SHALL evaluate state rules in order, first match wins: Dead before Haunted, Haunted before Restless, and Restless before Alive.
3. IF the deprecated flag is set on the installed version or the last publish date is more than 24 months before the reference time, THEN THE Engine SHALL assign Dead.
4. IF one or more advisories of Severity High or Critical apply to the installed version, THEN THE Engine SHALL assign Haunted.
5. IF the last publish date is at least 12 months and not more than 24 months before the reference time, or one or more advisories of Severity Low or Moderate apply to the installed version, THEN THE Engine SHALL assign Restless.
6. IF none of the Dead, Haunted, or Restless rules match, THEN THE Engine SHALL assign Alive.
7. THE Engine SHALL include Possessed in the State type union for forward compatibility and SHALL NOT produce Possessed from the last-publish, deprecated and advisories signals.
8. THE Engine SHALL record the install-script signal in every package health entry, and the state function SHALL determine State from the last-publish, deprecated and advisories signals together with a reference time, and from no other signals.
9. IF any of the last-publish, deprecated or advisories signals is unavailable, THEN THE Engine SHALL evaluate each state rule using only the conditions that depend on available signals, SHALL still assign exactly one State by first match among the satisfied rules, and SHALL record each unavailable signal in the package health entry.
10. IF two state evaluations differ only in that one has an earlier last publish date, THEN THE Engine SHALL NOT assign a healthier State to the evaluation with the earlier date, where the health ordering from healthiest to least healthy is Alive, Restless, Haunted, Dead.

### Requirement 12: State determinism

**User Story:** As a security engineer, I want the state function to be deterministic so that the same inputs always produce the same state and scans are reproducible.

#### Acceptance Criteria

1. WHEN the Engine evaluates the state function twice on equal inputs and an equal reference time, THE Engine SHALL produce the same State both times (determinism, for any combination of the last-publish, deprecated, and advisories signals — each available with its value or unavailable — and any reference time).
2. THE Engine SHALL accept the reference time as an input parameter so that state evaluation never depends on wall-clock time.

### Requirement 13: State monotonicity in age

**User Story:** As a maintainer, I want older packages to never appear healthier than newer ones so that the state reflects staleness consistently.

#### Acceptance Criteria

1. THE Engine SHALL define a health rank ordering of states from least healthy to most healthy: Possessed, Dead, Haunted, Restless, Alive.
2. WHEN two packages have all state-affecting signals equal except for the last publish date, the package with the older last publish date SHALL receive a State with a health rank no greater than the package with the newer last publish date (monotonicity, for any pair of last-publish dates where one is older and all other state-affecting signals are equal).

### Requirement 14: Signal availability degradation

**User Story:** As a maintainer, I want a single upstream failure to degrade one signal rather than fail the whole package so that a flaky registry never hides the packages that still have data.

#### Acceptance Criteria

1. WHEN an upstream signal is unavailable for a package, THE Engine SHALL skip only the state-rule conditions that depend on that signal and SHALL continue evaluating the remaining conditions of each affected state rule and all unaffected state rules.
2. THE Engine SHALL record the names of all unavailable signals for a package in a missingSignals list.
3. THE Engine SHALL assign a State to every package, including packages with one or more unavailable signals.
4. WHEN the last-publish signal is unavailable, the Engine SHALL skip the age-based conditions of the Dead and Restless rules and SHALL continue evaluating the advisory-based conditions and all other state rules.
5. WHEN every signal that the state rules depend on is unavailable for a package, THE Engine SHALL assign Restless and SHALL list all four signal names in missingSignals, so that a package with no data is never shown as healthy.

## Correction, 21 Nov 2026 (spec state-age-rule)

Criteria 11.3 and 11.5 above stated a rule that rated a package Dead from age alone. Spec `.kiro/specs/state-age-rule` replaces them. The original text is left as written.

Old criterion 11.3, verbatim:

> 3. IF the deprecated flag is set on the installed version or the last publish date is more than 24 months before the reference time, THEN THE Engine SHALL assign Dead.

Old criterion 11.5, verbatim:

> 5. IF the last publish date is at least 12 months and not more than 24 months before the reference time, or one or more advisories of Severity Low or Moderate apply to the installed version, THEN THE Engine SHALL assign Restless.

New 11.3: IF the deprecated flag is set on the installed version, or the last publish date is more than 24 months before the reference time and one or more advisories of any Severity apply to the installed version, THEN THE Engine SHALL assign Dead. A last publish exactly 24 months before the reference time is not more than 24 months.

New 11.5: IF the last publish date is more than 24 months before the reference time, or one or more advisories of Severity Low or Moderate apply to the installed version, THEN THE Engine SHALL assign Restless. The 12 to 24 month band no longer assigns Restless. When the advisories signal is unavailable, the Dead condition that needs an advisory does not match and age alone gives Restless.

Still in force: criterion 11.2 (rule order, with Possessed first), criterion 11.10 (an earlier last publish never gives a healthier State) and requirement 13 (monotonicity in age) hold under the new rule. The spec's design checks this by cases, and its properties test it.
