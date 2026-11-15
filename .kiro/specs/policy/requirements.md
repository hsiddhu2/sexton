# Requirements Document

## Introduction

The policy module adds to the Sexton Engine (`packages/engine`) the pure core of the repository policy: a version-1 policy document, a JSON Schema for it, a parser and validator, a pretty printer, a built-in default policy, the package matchers, the four rule types, and an evaluator that turns a policy and a health report into a policy result.

This spec implements R-PO-2, R-PO-3, R-PO-4 and R-PO-5 of docs/requirements.md in full. It implements the engine half of R-PO-1 (the built-in default policy and the result's source) and the engine half of R-PO-6 (the result carries an overall pass or fail that a caller can map to an exit code). It also serves N-7 (permissive licences for the two new runtime dependencies) and N-8 (the policy evaluator is a property-tested component).

The module consumes the ten-signal `PackageHealth` entry and the `HealthReport` produced by the health-scoring and history-signals specs, with the Signal envelope `{ value, source, fetchedAt, available, reason? }`. It changes no scoring behaviour.

The Engine never reads files. It exposes `parsePolicy(text)`, `formatPolicy(policy)`, `evaluatePolicy(policy, report, source)` and `DEFAULT_POLICY`. Reading `sexton.policy.yml` from the repository root, deciding between the file and the default, and saying in every output which one applied are the caller's job. The Engine supports that by carrying a source of "default" or "file" in every policy result.

This spec does NOT add file reading, GitHub access, process exit codes, the CLI `check` command, the evidence pack, a fifth rule type, policy merging or inheritance, or remote schemas.

## Glossary

- **Engine**: the @sexton/engine package. Pure core with no AWS, no UI, and no filesystem writes. This spec adds no network access and no filesystem access to it.
- **Signal**, **Signal envelope**, **Available signal**, **Unavailable signal**, **Source URL**, **fetchedAt**: as defined in health-scoring and history-signals. A Signal carries `{ value, source, fetchedAt, available, reason? }`.
- **State**: one of Alive, Restless, Haunted, Dead, Possessed, as defined in health-scoring and history-signals.
- **PackageHealth**: the ten-signal health entry for one direct dependency. It carries name, installedVersion, state, stateReason, the ten signals and missingSignals.
- **HealthReport**: the object `{ generatedAt, packages }` produced by scoring. `packages` is an ordered list of PackageHealth entries.
- **Reference time**: the instant used to judge age. For policy evaluation it is the report's `generatedAt`, parsed to a Date. The Engine never reads a wall clock in this module.
- **Policy**: the set of Rules that a repository commits to, as a Policy document after successful parsing.
- **Policy document**: the YAML text of a policy, as read by a caller from `sexton.policy.yml`. Its shape is `{ version: 1, rules: [...] }`.
- **Rule**: one entry of the `rules` list. A Rule has a Rule type, the parameters of that type, the three Matcher fields and an optional name.
- **Rule type**: one of exactly four values: `forbid_state`, `forbid_install_scripts`, `max_age_months`, `require_provenance`.
- **Matcher**: one of the three Rule fields `matchPackageNames`, `matchPackagePatterns` and `excludePackageNames`. Each is an optional list of strings.
- **Pattern**: an entry of `matchPackagePatterns`. A Pattern is a glob over the full package name, including any `@scope/` prefix. In a Pattern, `*` matches any run of characters (including none) except `/`, `**` matches any run of characters (including none) including `/`, `?` matches exactly one character except `/`, and every other character matches itself. A Pattern matches a name only if it matches the whole name. The Engine compiles each Pattern into a list of tokens (literal, star, doublestar, question) and matches it with a hand-written state-set walk over the name. No regular expression is built from a Pattern.
- **Scope**: the set of packages in a report to which a Rule applies, determined by the Matchers of that Rule.
- **Schema**: the JSON Schema, draft 2020-12, published at `schemas/sexton.policy.schema.json` at the repository root, that describes the Policy document.
- **Validation error**: a record `{ path, message, code }` describing one problem found while parsing a Policy document. `path` is a JSON Pointer into the parsed document (the empty string for the whole document) or the literal `$` for a problem with the text as a whole. `message` is human-readable. `code` is one of the stable codes listed in Requirement 2.
- **Default policy**: `DEFAULT_POLICY`, the Policy that applies when a repository has no policy file. It holds a single `forbid_state` Rule with states `[Possessed, Dead]` and no Matchers.
- **Source**: the string "default" or "file" carried by a Policy result. "default" means the Default policy applied. "file" means a Policy parsed from a Policy document applied.
- **Policy result**: the object returned by `evaluatePolicy`. It carries the Source, an overall pass flag, and one Rule result per Rule.
- **Rule result**: the part of a Policy result for one Rule. It carries the Rule's index and type, a pass flag, a list of Failures, a list of Unevaluated entries and a list of not-found names.
- **Failure**: an entry in a Rule result that names a package that breaks the Rule, together with the evidence for it.
- **Unevaluated**: an entry in a Rule result that names a package in the Rule's Scope that the Rule could not judge because a Signal it needs is unavailable or has no usable value.
- **Policy evaluator**: the function `evaluatePolicy` together with the matcher and rule functions it calls.

## Requirements

### Requirement 1: Policy document and schema

**User Story:** As a security engineer, I want a versioned, schema-described policy document, so that a policy can be committed, reviewed and validated by any tool.

#### Acceptance Criteria

1. THE Engine SHALL define a Policy document as a mapping with exactly the keys `version` and `rules`, where `version` is the integer 1 and `rules` is a list of Rules that may be empty.
2. THE Engine SHALL define each Rule as a mapping with a `type` key naming one of the four Rule types, the parameters of that Rule type, an optional `name` that is a string of 1 to 80 characters, and the optional Matcher fields `matchPackageNames`, `matchPackagePatterns` and `excludePackageNames`, each a list of non-empty strings.
3. THE Engine SHALL define the parameters of the four Rule types as follows: `forbid_state` has a required `states` list; `forbid_install_scripts` has an optional `allow` list of package names; `max_age_months` has a required `months` positive integer; `require_provenance` has a required `packages` list of package names or the single entry "*".
4. THE Engine SHALL publish the Schema as a JSON Schema draft 2020-12 document at `schemas/sexton.policy.schema.json` at the repository root, with `additionalProperties` set to false on the Policy document and on every Rule. The Schema SHALL define the optional Rule key `name` as a string with minLength 1 and maxLength 80. The Schema SHALL encode the Pattern character set with the `pattern` keyword, so that every entry of `matchPackagePatterns` matches `^[A-Za-z0-9@/._*?-]+$`. The Schema SHALL encode the wildcard rule for `packages` so that `packages` is either exactly the list `["*"]` or a list that contains no entry equal to `"*"`.
5. THE Engine SHALL validate every Policy document against the Schema before the Policy is used.
6. THE Engine SHALL embed the Schema as a constant so that validation needs no file read, and the embedded constant SHALL be deeply equal to the content of `schemas/sexton.policy.schema.json`.
7. THE Engine SHALL define `DEFAULT_POLICY` such that validating it against the Schema succeeds (for the exported constant).
8. THE Engine SHALL add exactly two runtime dependencies for this spec, `yaml` at the exact version 2.9.1 (licence ISC) and `ajv` at the exact version 8.20.0 (licence MIT), and SHALL pin both with no version range. (dependency constraint, review constraint, not a correctness property)
9. THE Engine SHALL add no other runtime dependency for this spec, so that the only new packages in the runtime dependency tree are `yaml`, `ajv`, and the permissively licensed runtime dependencies of `ajv`: `fast-deep-equal` (MIT), `fast-uri` (BSD-3-Clause), `json-schema-traverse` (MIT) and `require-from-string` (MIT), none of which declares an install, preinstall or postinstall script. (dependency constraint, review constraint, not a correctness property)

### Requirement 2: Parsing and validation

**User Story:** As a security engineer, I want an invalid policy to fail with clear, located errors, so that a broken policy never silently weakens enforcement.

#### Acceptance Criteria

1. WHEN `parsePolicy` is called with a text, THE Engine SHALL parse the text as YAML with the `yaml` package, validate the resulting value against the Schema with `ajv` in draft 2020-12 mode, and return either `{ ok: true, policy }` or `{ ok: false, errors }`.
2. FOR ANY input string, including the empty string, binary-looking text and extremely nested or malformed YAML, THE Engine SHALL return a result from `parsePolicy` and SHALL NOT throw (rejection).
3. FOR ANY input string, THE Engine SHALL return a result in which `ok` is true if and only if `errors` is absent and `policy` is present, and in which `ok` is false if and only if `errors` is a non-empty list (invariant).
4. FOR ANY text, THE Engine SHALL produce deeply equal results from two calls to `parsePolicy` with that text (determinism), and SHALL order the `errors` list by `path` in ascending code-unit order, then by `code`, then by `message`.
5. THE Engine SHALL give every Validation error a `path`, a `message` and a `code`, where `code` is exactly one of: `YAML_SYNTAX`, `MULTIPLE_DOCUMENTS`, `DUPLICATE_KEY`, `NOT_OBJECT`, `MISSING_FIELD`, `VERSION_UNSUPPORTED`, `UNKNOWN_RULE_TYPE`, `UNKNOWN_FIELD`, `WRONG_TYPE`, `EMPTY_LIST`, `INVALID_MONTHS`, `INVALID_WILDCARD`, `INVALID_PATTERN`.
6. IF the text is not valid YAML for a reason other than a duplicate mapping key, THEN THE Engine SHALL return one error with code `YAML_SYNTAX` and path `$`, and SHALL run no schema validation.
7. IF the text holds more than one YAML document, THEN THE Engine SHALL return one error with code `MULTIPLE_DOCUMENTS` and path `$`.
8. IF a YAML mapping in the text contains the same key twice, THEN THE Engine SHALL return an error with code `DUPLICATE_KEY` whose path names the mapping that holds the duplicate, and SHALL NOT use either value.
9. IF the parsed document is empty or is not a mapping, THEN THE Engine SHALL return one error with code `NOT_OBJECT` and path the empty string.
10. IF the `version` key is absent, THEN THE Engine SHALL return an error with code `MISSING_FIELD` and path `/version`. IF the `rules` key is absent, THEN THE Engine SHALL return an error with code `MISSING_FIELD` and path `/rules`.
11. IF `version` is present and is not the integer 1, THEN THE Engine SHALL return an error with code `VERSION_UNSUPPORTED` and path `/version` when its value is an integer other than 1, and an error with code `WRONG_TYPE` and path `/version` otherwise.
12. IF a Rule has a `type` that is not one of the four Rule types, THEN THE Engine SHALL return an error with code `UNKNOWN_RULE_TYPE` and path `/rules/{index}/type`.
13. IF a mapping at any level holds a key that the Schema does not define for it, THEN THE Engine SHALL return an error with code `UNKNOWN_FIELD` whose path names that key, for any mapping at the document level or Rule level.
14. IF a value has the wrong type, including `rules` not a list, a Rule not a mapping, a Matcher not a list of strings, an entry in a Matcher or in `allow` or `packages` not a non-empty string, `states` holding a value that is not one of the five State names, `months` not a number, or a `name` that is not a string, THEN THE Engine SHALL return an error with code `WRONG_TYPE` and the path of that value.
15. IF `states` or `packages` is an empty list, THEN THE Engine SHALL return an error with code `EMPTY_LIST` and the path of that list.
16. IF `months` is a number that is not a positive integer (zero, negative, fractional, NaN or infinite), THEN THE Engine SHALL return an error with code `INVALID_MONTHS` and path `/rules/{index}/months`.
17. IF `packages` holds the entry "*" together with any other entry, THEN THE Engine SHALL return an error with code `INVALID_WILDCARD` and the path of the `packages` list.
18. IF a Pattern in `matchPackagePatterns` is the empty string, THEN THE Engine SHALL return an error with code `INVALID_PATTERN` and path `/rules/{ruleIndex}/matchPackagePatterns/{patternIndex}`.
19. IF a Pattern in `matchPackagePatterns` contains any character outside the set `[A-Za-z0-9@/._*?-]`, THEN THE Engine SHALL return an error with code `INVALID_PATTERN` and path `/rules/{ruleIndex}/matchPackagePatterns/{patternIndex}`, at parse time and before any evaluation. No other condition makes a Pattern invalid, and there is no length limit.
20. WHEN a text parses without error, THE Engine SHALL have checked every Pattern at parse time, and the returned Policy SHALL hold Patterns as plain strings.
21. THE Engine SHALL expose `formatPolicy(policy)`, which returns YAML text for a valid Policy, so that Policies can be written back and round-tripped.
22. FOR ANY valid Policy, parsing the output of `formatPolicy` SHALL return `{ ok: true }` with a Policy deeply equal to the original (round-trip).
23. FOR ANY valid Policy, THE Engine SHALL produce the same text from two calls to `formatPolicy` (determinism), and parsing then formatting then parsing SHALL produce a Policy deeply equal to the first parse (idempotence).
24. THE Engine SHALL return a Policy that carries only the keys defined by the Schema, so that a Policy held in memory is a plain value that can be serialised to JSON without loss.
25. IF a Rule's `name` is a string of fewer than 1 or more than 80 characters, THEN THE Engine SHALL return an error with code `WRONG_TYPE` and path `/rules/{index}/name`.

### Requirement 3: Matchers

**User Story:** As a maintainer, I want to scope each rule to the packages it should judge, so that one policy can treat different packages differently.

#### Acceptance Criteria

1. THE Engine SHALL expose a function `inScope(rule, packageName)` that returns true if and only if both of the following hold: (a) the Rule has no `matchPackageNames` entries and no `matchPackagePatterns` entries, OR `packageName` is exactly equal to an entry of `matchPackageNames`, OR at least one Pattern of `matchPackagePatterns` matches `packageName`; and (b) `packageName` is not exactly equal to any entry of `excludePackageNames`.
2. THE Engine SHALL compare package names against `matchPackageNames`, `excludePackageNames` and `allow` by exact, case-sensitive string equality, with no normalisation, no globbing and no prefix matching.
3. THE Engine SHALL match a Pattern against the full package name, including any `@scope/` prefix, using the glob rules defined in the Glossary, and a Pattern SHALL match only when it matches the whole name.
4. FOR ANY Rule and any package name that is an entry of `excludePackageNames`, THE Engine SHALL return false from `inScope`, whatever the other Matchers hold (exclude wins).
5. FOR ANY Rule, any package name and any name added to `excludePackageNames`, THE Engine SHALL NOT turn a false `inScope` result into true (monotonic in exclusions).
6. FOR ANY Rule with empty or absent `matchPackageNames` and `matchPackagePatterns`, THE Engine SHALL return true from `inScope` for every package name not in `excludePackageNames` (no matchers means all packages).
7. FOR ANY Rule and any package name, THE Engine SHALL return the same `inScope` result when the entries of `matchPackageNames`, `matchPackagePatterns` and `excludePackageNames` are reordered or repeated (order independence).
8. FOR ANY Rule, package name and added matcher entry, THE Engine SHALL NOT turn a true `inScope` result into false by adding an entry to `matchPackageNames` or `matchPackagePatterns` when at least one of those two lists already had an entry (monotonic in matches).
9. FOR ANY Rule and package name, THE Engine SHALL return equal `inScope` results on repeated calls (determinism).
10. THE Engine SHALL compute Scope without using Signals, so that `inScope` takes only the Rule and the package name.
11. FOR ANY Pattern and any package name, THE Engine SHALL match without building or running a regular expression, using a state-set walk over the name whose running time is at most proportional to the length of the name multiplied by the number of tokens in the Pattern, with no backtracking. (review constraint, not a correctness property)

### Requirement 4: forbid_state rule

**User Story:** As a security engineer, I want to forbid dependencies in certain states, so that a Possessed or Dead package cannot enter the repository unnoticed.

#### Acceptance Criteria

1. THE Engine SHALL accept a `forbid_state` Rule with a required non-empty `states` list whose entries are State names.
2. WHEN a `forbid_state` Rule is evaluated, THE Engine SHALL produce one Failure for each package in the Rule's Scope whose `state` is an entry of `states`, in report order.
3. WHEN a package's `state` is not an entry of `states`, THE Engine SHALL produce no Failure for it.
4. THE Engine SHALL treat the `state` of a PackageHealth as always present, so that a `forbid_state` Rule produces no Unevaluated entries (for any report).
5. WHEN the Engine produces a `forbid_state` Failure, THE Engine SHALL record the package's `state` and `stateReason` as its evidence.
6. FOR ANY report, `states` list and Scope, THE Engine SHALL fail exactly the packages that are in Scope and whose state is listed, so that the failing set equals the intersection of the Scope with the listed states (invariant).
7. FOR ANY report and two `states` lists where one contains the other, THE Engine SHALL produce a failing package set for the larger list that contains the failing package set for the smaller list (monotonic in states).

### Requirement 5: forbid_install_scripts rule

**User Story:** As a security engineer, I want to forbid install scripts except for packages I have reviewed, so that no unreviewed code runs at install time.

#### Acceptance Criteria

1. THE Engine SHALL accept a `forbid_install_scripts` Rule with an optional `allow` list of package names, and SHALL treat an absent `allow` as an empty list.
2. THE Engine SHALL treat `allow` as a list of exact package names only, compared by exact, case-sensitive string equality, with no patterns.
3. WHEN a `forbid_install_scripts` Rule is evaluated, THE Engine SHALL produce one Failure for each package in the Rule's Scope whose `hasInstallScript` signal is available with value true and whose name is not an entry of `allow`, in report order.
4. WHEN a package in the Rule's Scope has a `hasInstallScript` signal that is available with value false, THE Engine SHALL produce neither a Failure nor an Unevaluated entry for it.
5. WHEN a package in the Rule's Scope has an unavailable `hasInstallScript` signal and is not an entry of `allow`, THE Engine SHALL produce one Unevaluated entry for it that names the signal `hasInstallScript` and carries the signal's reason, and SHALL produce no Failure for it.
6. WHEN a package in the Rule's Scope is an entry of `allow`, THE Engine SHALL produce neither a Failure nor an Unevaluated entry for it, whatever its `hasInstallScript` signal holds.
7. WHEN the Engine produces a `forbid_install_scripts` Failure, THE Engine SHALL record the `hasInstallScript` value, source and fetchedAt as its evidence.
8. FOR ANY report, `allow` list and Scope, THE Engine SHALL NOT turn a Failure into a non-failure by removing an entry from `allow`, and SHALL NOT add a Failure by adding an entry to `allow` (monotonic in allow).

### Requirement 6: max_age_months rule

**User Story:** As a maintainer, I want to fail on dependencies that have not been published for too long, so that abandoned packages are caught by policy.

#### Acceptance Criteria

1. THE Engine SHALL accept a `max_age_months` Rule with a required `months` that is a positive integer.
2. THE Engine SHALL define a package as older than N months when its `lastPublish` instant is strictly earlier than the instant obtained by subtracting N whole calendar months in UTC from the Reference time, using the same `monthsBefore` helper that health-scoring uses for the Dead and Restless thresholds. A `lastPublish` instant equal to that boundary is not older.
3. WHEN a `max_age_months` Rule is evaluated, THE Engine SHALL produce one Failure for each package in the Rule's Scope whose `lastPublish` signal is available, has a non-null value that parses as a date, and is older than `months` months, in report order.
4. WHEN a package's `lastPublish` instant is later than the Reference time, THE Engine SHALL treat it as not older and SHALL produce no Failure for it.
5. WHEN a package in the Rule's Scope has an unavailable `lastPublish` signal, THE Engine SHALL produce one Unevaluated entry for it that names the signal `lastPublish` and carries the signal's reason, and SHALL produce no Failure for it.
6. WHEN a package in the Rule's Scope has an available `lastPublish` signal whose value is null, or whose value does not parse as a date, THE Engine SHALL produce one Unevaluated entry for it that names the signal `lastPublish` with a reason stating that no usable publish date exists, and SHALL produce no Failure for it.
7. IF the report's `generatedAt` does not parse as a date, THEN THE Engine SHALL produce one Unevaluated entry with the reason "reference time invalid" for each package in the Rule's Scope of a `max_age_months` Rule, SHALL produce no Failure, and SHALL NOT throw.
8. WHEN the Engine produces a `max_age_months` Failure, THE Engine SHALL record the `lastPublish` value, source and fetchedAt, and the boundary instant, as its evidence.
9. FOR ANY report and any two positive integers `a` less than `b`, THE Engine SHALL produce a failing package set for `b` that is contained in the failing package set for `a` (monotonic: increasing months never adds a Failure).
10. FOR ANY report and Reference time, THE Engine SHALL produce results that depend on the Reference time only through the report's `generatedAt`, so that two calls with deeply equal reports give deeply equal results regardless of the wall clock.

### Requirement 7: require_provenance rule

**User Story:** As a security engineer, I want to require provenance attestations for chosen packages, so that unattested builds of critical dependencies are rejected.

#### Acceptance Criteria

1. THE Engine SHALL accept a `require_provenance` Rule with a required non-empty `packages` list whose entries are exact package names, or whose only entry is "*".
2. THE Engine SHALL select a package for a `require_provenance` Rule if and only if the package is in the Rule's Scope and either `packages` is the single entry "*" or the package's name is exactly equal to an entry of `packages`. Both the Matchers and `packages` SHALL select the package.
3. WHEN a `require_provenance` Rule is evaluated, THE Engine SHALL produce one Failure for each selected package whose `provenance` signal is available with `present` false, in report order.
4. WHEN a selected package has a `provenance` signal that is available with `present` true, THE Engine SHALL produce neither a Failure nor an Unevaluated entry for it.
5. WHEN a selected package has an unavailable `provenance` signal, THE Engine SHALL produce one Unevaluated entry for it that names the signal `provenance` and carries the signal's reason, and SHALL produce no Failure for it.
6. WHEN the Engine produces a `require_provenance` Failure, THE Engine SHALL record the `provenance` value, source and fetchedAt as its evidence.
7. WHEN an entry of `packages` other than "*" names a package that is absent from the report, THE Engine SHALL produce neither a Failure nor an Unevaluated entry for it, and SHALL list that name in the Rule result's not-found list, so that a typo in a policy is visible without failing the Rule. The not-found list of a Rule result SHALL be empty for every Rule type other than `require_provenance`.
8. THE Engine SHALL list not-found names in order of first appearance in `packages`, without repeats.
9. FOR ANY report and any `packages` list that names only packages present in the report, THE Engine SHALL produce an empty not-found list (invariant).
10. FOR ANY report and Rule, THE Engine SHALL produce a failing package set for `packages` equal to ["*"] that contains the failing package set for any other `packages` list (monotonic: the wildcard selects the most).

### Requirement 8: Default policy and source

**User Story:** As a maintainer, I want a sensible policy to apply when my repository has none, so that Sexton enforces something useful out of the box and says that it did.

#### Acceptance Criteria

1. THE Engine SHALL export `DEFAULT_POLICY` as a Policy with `version` 1 and exactly one Rule, a `forbid_state` Rule whose `states` are `["Possessed", "Dead"]` and which has no Matchers.
2. THE Engine SHALL give `evaluatePolicy` a third argument `source` that is either "default" or "file", and SHALL copy it unchanged into the Policy result. THE Engine SHALL NOT carry the source on the Policy itself, so that a Policy holds only the keys defined by the Schema.
3. WHEN `evaluatePolicy` is called with `DEFAULT_POLICY` and the source "default", THE Engine SHALL return a Policy result whose `source` is "default".
4. WHEN `evaluatePolicy` is called with a Policy returned by `parsePolicy` and the source "file", THE Engine SHALL return a Policy result whose `source` is "file".
5. FOR ANY report, THE Engine SHALL fail the default policy if and only if at least one package in the report is in the state Possessed or Dead (for any report).
6. FOR ANY report, THE Engine SHALL return, for `DEFAULT_POLICY` and for the Policy obtained by parsing `formatPolicy(DEFAULT_POLICY)`, results that are deeply equal apart from `source` when the same `source` argument is supplied (round-trip).

### Requirement 9: Policy result and evaluator

**User Story:** As a security engineer, I want a complete, evidence-carrying result for every rule, so that a CI gate and an auditor can both see exactly why a policy passed or failed.

#### Acceptance Criteria

1. THE Engine SHALL expose `evaluatePolicy(policy, report, source)` as a pure function that reads no clock, no file and no network, and SHALL take the Reference time from `report.generatedAt`.
2. FOR ANY valid Policy and any HealthReport, including a report with no packages, entries with unavailable signals and an unparseable `generatedAt`, THE Engine SHALL return a Policy result from `evaluatePolicy` and SHALL NOT throw.
3. FOR ANY valid Policy, report and source, THE Engine SHALL return deeply equal results from two calls (determinism), and the call SHALL NOT mutate the Policy or the report.
4. THE Engine SHALL return a Policy result with a `source`, an overall `pass` flag, and a list of Rule results containing exactly one Rule result per Rule, in Policy order, each carrying the Rule's zero-based `index` and `type`. WHEN a Rule has a `name`, THE Engine SHALL copy it unchanged into that Rule's result as `name`, and WHEN a Rule has no `name`, the Rule result SHALL have no `name` key.
5. THE Engine SHALL give each Rule result a `pass` flag, a list of Failures, a list of Unevaluated entries and a not-found list.
6. THE Engine SHALL give each Failure the package name, the installed version, the name of the signal that was judged (or "state" for `forbid_state`), the judged value, the signal's `source` and `fetchedAt`, and a reason text that names the signal and the value, so that the result carries its evidence. For `forbid_state` the Engine SHALL record the `source` as null and the `fetchedAt` as the report's `generatedAt`.
7. THE Engine SHALL give each Unevaluated entry the package name, the installed version, the name of the missing signal, and the reason carried by that signal or stated by the rule.
8. FOR ANY valid Policy and report, THE Engine SHALL set a Rule result's `pass` to true if and only if its Failures list is empty (invariant).
9. FOR ANY valid Policy and report, THE Engine SHALL list no package in both the Failures and the Unevaluated lists of one Rule result (disjointness), and SHALL list each package at most once in each of those two lists.
10. FOR ANY valid Policy and report, THE Engine SHALL list only packages that are in the Rule's Scope in the Failures and Unevaluated lists of that Rule result (invariant).
11. FOR ANY valid Policy and report, THE Engine SHALL order the Failures and Unevaluated lists of each Rule result by the order of the packages in `report.packages`.
12. FOR ANY valid Policy and report, THE Engine SHALL NOT turn a Rule result's `pass` from true to false because of an Unevaluated entry, so that an Unevaluated entry never fails a Rule.
13. FOR ANY valid Policy and report, THE Engine SHALL set the overall `pass` to true if and only if every Rule result's `pass` is true, and a Policy with an empty `rules` list SHALL produce an overall `pass` of true and an empty list of Rule results.
14. FOR ANY valid Policy and report, THE Engine SHALL return a result that is unchanged when the packages in the report that are not in any Rule's Scope are removed from the report, apart from Rule results that depend on those packages being present (not-found lists).
15. FOR ANY valid Policy, report and Rule, THE Engine SHALL evaluate that Rule independently of the other Rules, so that removing a Rule from the Policy leaves every other Rule result unchanged apart from its `index` (isolation).
16. THE Engine SHALL treat the Policy evaluator (`evaluatePolicy`, `inScope` and the four rule functions) as a property-tested component in line with N-8 of docs/requirements.md, with the properties of Requirements 3 to 9 above as its tests.
