# Implementation Plan: policy

## Overview

Adds the pure policy core to packages/engine: dependencies, types and schema, glob matcher, scope matching, the four rule functions, the evaluator, the parser and printer, the default policy, fixtures, the repository's own policy file, exports and final gates. Dependencies come first, then pure leaf modules, then the modules that compose them. All paths are under packages/engine unless stated. `monthsBefore` from src/state.ts, `fromIso` from src/signal.ts and the existing types in src/types.ts are reused, never duplicated.

- [x] 1. Dependencies
  - Adds the two runtime dependencies and checks the resulting dependency tree.
  - _Requirements: 1.8, 1.9_

  - [x] 1.1 Add exact-pinned runtime dependencies to packages/engine/package.json
    - Create a new "dependencies" block with "yaml": "2.9.1" and "ajv": "8.20.0". No ranges, no other runtime dependency.
    - _Requirements: 1.8, 1.9_

  - [x] 1.2 Run `npm install` at the repository root and confirm the lockfile
    - Confirm package-lock.json resolves exactly yaml 2.9.1 and ajv 8.20.0, and that the only other new runtime packages are fast-deep-equal, fast-uri, json-schema-traverse and require-from-string.
    - _Requirements: 1.8, 1.9_

  - [x] 1.3 Confirm no install scripts and record the PR justifications
    - Read the "scripts" field of node_modules/<pkg>/package.json for all six packages and confirm none declares install, preinstall or postinstall.
    - Record the one-line justification for each from design.md (yaml, ajv, and the four transitive packages) in a comment block in the task's commit message or PR draft, not in source.
    - _Requirements: 1.8, 1.9_

- [x] 2. Types and schema constant with the schema file script
  - Adds the shared policy types, the embedded schema constant, the compiled validator and the script that writes the published schema file. No property in this task.
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7_

  - [x] 2.1 Add the policy types to src/types.ts
    - Add RULE_TYPES, RuleType, Matchers, ForbidStateRule, ForbidInstallScriptsRule, MaxAgeMonthsRule, RequireProvenanceRule, Rule, Policy, ERROR_CODES, ErrorCode, ValidationError, ParseResult, PolicySource, Failure, Unevaluated, RuleOutcome, RuleResult and PolicyResult under a policy heading. Change no existing type.
    - Covered by the typecheck in 12.1 and by the tests in later tasks.
    - _Requirements: 1.1, 1.2, 1.3, 2.5, 8.2, 9.4, 9.5, 9.6, 9.7_

  - [x] 2.2 Implement src/policy/schema.ts
    - Export POLICY_SCHEMA as a plain JSON-serialisable object: draft 2020-12, additionalProperties false on the document and on every rule, if/then branches keyed on `type`, `name` with minLength 1 and maxLength 80, `pattern` keyword `^[A-Za-z0-9@/._*?-]+$` on matchPackagePatterns items, the oneOf for `packages` (exactly `["*"]` or a list with no "*"), and the `states` enum built from STATE_ORDER.
    - Export validatePolicySchema compiled once at module load with Ajv2020 and the options in design.md. Check the NodeNext import form of `ajv/dist/2020.js` under the repository tsconfig and use the single typed cast from design.md only if needed. No `require`.
    - Covered by tests in 2.4.
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6_

  - [x] 2.3 Add packages/engine/scripts/write-schema.mjs and the "schema:write" script
    - The script imports POLICY_SCHEMA from ../dist/policy/schema.js and writes `JSON.stringify(POLICY_SCHEMA, null, 2) + "\n"` to schemas/sexton.policy.schema.json at the repository root, creating the folder. Add `"schema:write": "node scripts/write-schema.mjs"` to packages/engine/package.json.
    - Build the engine, run `npm run schema:write -w @sexton/engine`, and commit the generated schemas/sexton.policy.schema.json.
    - Covered by the file-equality test in 2.4.
    - _Requirements: 1.4, 1.6_

  - [x] 2.4 Write example tests in test/policy/schema.test.ts
    - Cover: the module imports and the schema compiles; a DEFAULT-shaped document and a full document using all four rule types, names and all three matchers validate; additionalProperties is false on the document and each rule; `name` has minLength 1 and maxLength 80; the pattern and oneOf encodings are present; POLICY_SCHEMA survives JSON.parse(JSON.stringify(...)) unchanged; the test reads schemas/sexton.policy.schema.json (resolved from import.meta.url) and asserts it deeply equals POLICY_SCHEMA. The engine itself never reads the file.
    - No property in this sub-task.
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6_

- [x] 3. Glob matcher with property 17
  - Hand-written tokeniser and state-set walk. No RegExp is built from a pattern.
  - _Requirements: 2.18, 2.19, 3.3, 3.11_

  - [x] 3.1 Implement src/policy/glob.ts
    - Export GlobToken, isValidGlob, compileGlob and matchGlob. A run of two or more `*` is one doublestar token; `*` is star; `?` is question; every other character is a literal. matchGlob is a boolean-array state-set walk with epsilon closure, early exit on an empty set, anchored at both ends, with no backtracking and no RegExp.
    - Covered by tests in 3.2.
    - _Requirements: 2.18, 2.19, 3.3, 3.11_

  - [x] 3.2 Write tests in test/policy/glob.test.ts including Property 17
    - Property 17 (glob matcher agrees with a reference), numRuns 1000, against a naive recursive reference matcher written in the test that shares no code with glob.ts. Include the literal-name check: for literal names over `[A-Za-z0-9@/._-]`, the compiled pattern matches exactly the equal name.
    - Examples: `*` stops at `/`; `**` crosses `/`; `?` does not match `/`; `***` equals `**`; `@scope/*` matches `@scope/a` and not `@scope/a/b`; whole-name anchoring; a long wildcard pattern against a 200-character name returns the right result; `a(b)` matches the name `a(b)` as plain text; isValidGlob accepts and rejects by character class and rejects the empty string.
    - Tag: `Feature: policy, Property 17: Glob matcher agrees with a reference`.
    - _Requirements: 2.18, 2.19, 3.3, 3.11_

- [x] 4. inScope with properties 2, 3 and 4
  - Scope matching from the three matcher fields. Reads no signals.
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10_

  - [x] 4.1 Implement src/policy/match.ts
    - Export MatcherFields and inScope. Exclude wins by exact `===`; empty or absent include lists mean all packages; otherwise an exact name match or any pattern match. Memoise compileGlob in a module-level Map capped at 1000 entries. Takes only the matcher fields and a name.
    - Covered by tests in 4.2.
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.6, 3.10_

  - [x] 4.2 Write tests in test/policy/match.test.ts including Properties 2, 3 and 4
    - Property 2 (exclude wins), numRuns 1000. Property 3 (no matchers means all packages). Property 4 (order independence of matchers).
    - Examples: exact case-sensitive comparison; a name alone or a pattern alone is enough; monotonic in exclusions and in matches; determinism on repeated calls.
    - Tags: `Feature: policy, Property 2: Exclude wins`, `Property 3: No matchers means all packages`, `Property 4: Order independence of matchers`.
    - _Requirements: 3.1, 3.2, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9_

- [x] 5. The four rule functions with properties 5 to 8
  - One file per rule under src/policy/rules, all with the shared signature `(rule, report, reference) => RuleOutcome`.
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8, 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.9, 6.10, 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8, 7.9, 7.10_

  - [x] 5.1 Add report generators to test/arbitraries.ts
    - Add arbName, arbPackage, arbReport, arbRule and arbValidPolicy under a policy heading, reusing the existing ten-signal arbitraries. Package names collide on purpose, signals are available or unavailable, `lastPublish` instants sit around `generatedAt`, and `generatedAt` is occasionally unparseable. Used by tasks 5 to 8.
    - _Requirements: 4.6, 6.9, 9.2_

  - [x] 5.2 Implement src/policy/rules/forbid-state.ts
    - Failures for in-scope packages whose state is listed, in report order, with source null and fetchedAt equal to generatedAt, and a reason naming the state and stateReason. Never returns unevaluated entries.
    - Covered by tests in 5.3.
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

  - [x] 5.3 Write tests in test/policy/rules/forbid-state.test.ts including Properties 5 and 6
    - Property 5 (forbid_state exactness). Property 6 (monotonic in states).
    - Examples: evidence fields (state, stateReason, source null, fetchedAt); no unevaluated entries for a report full of unavailable signals.
    - Tags: `Feature: policy, Property 5: forbid_state exactness`, `Property 6: Monotonic in states`.
    - _Requirements: 4.2, 4.3, 4.4, 4.5, 4.6, 4.7_

  - [x] 5.4 Implement src/policy/rules/forbid-install-scripts.ts
    - Skip packages in `allow` (absent equals empty, exact match). For the rest in scope: available true gives a failure with value, source and fetchedAt; available false gives nothing; unavailable gives an unevaluated entry naming hasInstallScript with the signal's reason.
    - Covered by tests in 5.5.
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7_

  - [x] 5.5 Write tests in test/policy/rules/forbid-install-scripts.test.ts including Property 7
    - Property 7 (monotonic in allow).
    - Examples: true, false, unavailable and allowed cases; allowed package with an unavailable signal produces nothing; absent `allow` equals `[]`; evidence fields.
    - Tag: `Feature: policy, Property 7: Monotonic in allow`.
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8_

  - [x] 5.6 Implement src/policy/rules/max-age-months.ts
    - Reuse monthsBefore from src/state.ts and fromIso from src/signal.ts. A null `reference` makes every in-scope package unevaluated with "reference time invalid" before any other check. An Invalid Date boundary gives no failures and never calls toISOString on it. A failure needs an available, parseable `lastPublish` strictly earlier than the boundary. Unavailable gives unevaluated with the signal's reason; null or unparseable gives unevaluated with "no usable publish date exists". Failure evidence carries the optional `boundary` ISO string.
    - Covered by tests in 5.7.
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.10_

  - [x] 5.7 Write tests in test/policy/rules/max-age-months.test.ts including Property 8
    - Property 8 (monotonic in months).
    - Examples: a `lastPublish` exactly at the monthsBefore boundary is not older and one millisecond earlier is; a future date is not older; null and unparseable `lastPublish`; unparseable `generatedAt` with and without an unavailable signal; an extreme `months` value giving an Invalid Date boundary; evidence including `boundary`; equal reports give equal results.
    - Tag: `Feature: policy, Property 8: Monotonic in months`.
    - _Requirements: 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.9, 6.10_

  - [x] 5.8 Implement src/policy/rules/require-provenance.ts
    - Select a package when it is in scope and either `packages` is the single entry "*" or the name is in `packages`. Failure when `provenance` is available with present false; nothing when present true; unevaluated naming provenance when unavailable. `notFound` lists non-wildcard entries absent from the report by name, in first-appearance order without repeats, judged on report presence only (an in-report package excluded by a matcher is found).
    - Covered by tests in 5.9.
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8_

  - [x] 5.9 Write example tests in test/policy/rules/require-provenance.test.ts
    - Cover: selection by name and by "*" with matchers applied; failure, success and unavailable cases with evidence; notFound order and dedupe; a found-but-excluded package is not in notFound; notFound empty when every named package is present; the wildcard failing set contains the failing set of any named list.
    - No property in this sub-task.
    - _Requirements: 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8, 7.9, 7.10_

- [x] 6. evaluate with properties 1 and 9 to 13
  - Composes inScope and the four rule functions into the policy result.
  - _Requirements: 8.2, 8.3, 8.4, 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8, 9.9, 9.10, 9.11, 9.12, 9.13, 9.14, 9.15, 9.16_

  - [x] 6.1 Implement src/policy/evaluate.ts
    - Export evaluatePolicy(policy, report, source). Compute `reference` once with fromIso (null when not finite), drop repeated package names keeping the first, dispatch by `rule.type`, build each RuleResult with `index`, `type`, `name` only when the rule has one, `pass` equal to no failures, failures, unevaluated and notFound. Overall `pass` is every rule passing (true for no rules). Copy `source` unchanged. No try/catch, no clock, no mutation of inputs.
    - Covered by tests in 6.2.
    - _Requirements: 8.2, 8.3, 8.4, 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8, 9.13_

  - [x] 6.2 Write tests in test/policy/evaluate.test.ts including Properties 1, 9, 10, 11, 12 and 13
    - Property 1 (evaluator determinism and non-mutation). Property 9 (unevaluated never fails), numRuns 1000. Property 10 (pass is exactly the absence of failures). Property 11 (disjointness of failures and unevaluated). Property 12 (scope containment and report order). Property 13 (rule isolation).
    - Examples: an empty rules list passes with an empty rules result; `name` is copied only when the rule has one; duplicate package names keep the first entry; `source` "default" and "file" are copied; removing out-of-scope packages changes nothing except notFound; result shape for each rule type.
    - Tags: `Feature: policy, Property 1: Evaluator determinism and non-mutation`, `Property 9: Unevaluated never fails`, `Property 10: Pass is exactly the absence of failures, overall and per rule`, `Property 11: Disjointness of failures and unevaluated`, `Property 12: Scope containment`, `Property 13: Rule isolation`.
    - _Requirements: 8.2, 8.3, 8.4, 9.2, 9.3, 9.4, 9.8, 9.9, 9.10, 9.11, 9.12, 9.13, 9.14, 9.15, 9.16_

- [x] 7. Parse and format with properties 14 and 15
  - YAML parsing, schema validation with mapped errors, plain-policy construction and the printer.
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 2.10, 2.11, 2.12, 2.13, 2.14, 2.15, 2.16, 2.17, 2.18, 2.19, 2.20, 2.21, 2.22, 2.23, 2.24, 2.25_

  - [x] 7.1 Implement src/policy/parse.ts
    - Export parsePolicy. Use parseAllDocuments with uniqueKeys. Any non-duplicate-key YAML error gives one YAML_SYNTAX at `$` and no schema validation; more than one document gives MULTIPLE_DOCUMENTS; duplicate-key errors give one DUPLICATE_KEY per mapping that holds a repeat, with the path found by an AST walk; an empty or non-mapping value gives NOT_OBJECT at the empty path. Validate with validatePolicySchema and map each Ajv error with the table in design.md, including the dropped keywords (`if`, and the pattern, minLength, oneOf, const and not errors on the matchPackagePatterns and packages paths). Add the Engine checks for INVALID_PATTERN (using isValidGlob) and INVALID_WILDCARD. Dedupe by (path, code, message), sort by path then code then message by code unit, and wrap every library call so nothing throws. buildPolicy copies only schema keys into fresh plain objects.
    - Covered by tests in 7.3.
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 2.10, 2.11, 2.12, 2.13, 2.14, 2.15, 2.16, 2.17, 2.18, 2.19, 2.20, 2.24, 2.25_

  - [x] 7.2 Implement src/policy/format.ts
    - Export formatPolicy. Build an ordered plain object (version, rules; per rule: name, type, the type's parameters in schema order, then the three matcher fields when present) and print it with the yaml package using lineWidth 0, indent 2 and sortMapEntries false.
    - Covered by tests in 7.4.
    - _Requirements: 2.21, 2.22, 2.23_

  - [x] 7.3 Write tests in test/policy/parse.test.ts including Property 15
    - Property 15 (parsePolicy never throws, and ok matches the errors), numRuns 1000, with generators for arbitrary strings, YAML-ish fragments and corruptions of a formatted valid policy.
    - One example input per error code asserting code and path, as in the design table: YAML_SYNTAX, MULTIPLE_DOCUMENTS, DUPLICATE_KEY, NOT_OBJECT, MISSING_FIELD, VERSION_UNSUPPORTED, UNKNOWN_RULE_TYPE, UNKNOWN_FIELD, WRONG_TYPE, EMPTY_LIST, INVALID_MONTHS, INVALID_WILDCARD, INVALID_PATTERN.
    - Further examples: a multi-error text whose errors are all reported and sorted; a nested duplicate key path such as `/rules/0`; a text with both a syntax error and a duplicate key gives YAML_SYNTAX; months 0, -1, 1.5, `.nan`, `.inf`; name length 0, 1, 80 and 81 code points; pattern characters outside the set; empty pattern gives INVALID_PATTERN; `["*", "*"]` gives INVALID_WILDCARD; `__proto__` gives UNKNOWN_FIELD; returned patterns are plain strings.
    - Tag: `Feature: policy, Property 15: parsePolicy never throws, and ok matches the errors`.
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 2.10, 2.11, 2.12, 2.13, 2.14, 2.15, 2.16, 2.17, 2.18, 2.19, 2.20, 2.24, 2.25_

  - [x] 7.4 Write tests in test/policy/format.test.ts including Property 14
    - Property 14 (schema round trip and format determinism), with rule and package names drawn from full Unicode strings and tricky scalars, including the check that a parsed policy holds only schema keys.
    - Examples: fixed key order in the output text; empty rules prints `rules: []`; `"*"`, `"@scope/pkg"`, `"yes"` and `"123"` are quoted and read back as strings.
    - Tag: `Feature: policy, Property 14: Schema round trip and format determinism`.
    - _Requirements: 2.21, 2.22, 2.23, 2.24_

- [x] 8. Default policy with property 16
  - _Requirements: 1.7, 8.1, 8.5, 8.6_

  - [x] 8.1 Implement src/policy/default.ts
    - Export DEFAULT_POLICY: version 1 with one forbid_state rule, states `["Possessed", "Dead"]`, no matchers.
    - Covered by tests in 8.2.
    - _Requirements: 8.1_

  - [x] 8.2 Write tests in test/policy/default.test.ts including Property 16
    - Property 16 (the default policy fails exactly when a package is Possessed or Dead), numRuns 1000, including a variant whose states are only Alive, Restless and Haunted.
    - Examples: DEFAULT_POLICY validates against the schema; DEFAULT_POLICY contents; the round trip of 8.6: results for DEFAULT_POLICY and for parsePolicy(formatPolicy(DEFAULT_POLICY)) are deeply equal apart from `source` when the same source is passed.
    - Tag: `Feature: policy, Property 16: The default policy fails exactly when a package is Possessed or Dead`.
    - _Requirements: 1.7, 8.1, 8.5, 8.6_

- [x] 9. Fixtures
  - Recorded policy files and expected results. The expected JSON is a human review step.
  - _Requirements: 2.5, 2.6, 2.7, 2.8, 2.9, 2.10, 2.11, 2.12, 2.13, 2.14, 2.15, 2.16, 2.17, 2.18, 2.19, 9.4, 9.5, 9.6, 9.7, 9.8, 9.9, 9.10, 9.11, 9.12, 9.13_

  - [x] 9.1 Add test/fixtures/policy/valid-full.yml
    - A valid policy using all four rule types, rule names and all three matcher fields.
    - _Requirements: 2.1, 9.4_

  - [x] 9.2 Add 13 invalid files under test/fixtures/policy/invalid/
    - One file per error code, named `<code>.yml` (YAML_SYNTAX, MULTIPLE_DOCUMENTS, DUPLICATE_KEY, NOT_OBJECT, MISSING_FIELD, VERSION_UNSUPPORTED, UNKNOWN_RULE_TYPE, UNKNOWN_FIELD, WRONG_TYPE, EMPTY_LIST, INVALID_MONTHS, INVALID_WILDCARD, INVALID_PATTERN), each producing that code.
    - _Requirements: 2.5, 2.6, 2.7, 2.8, 2.9, 2.10, 2.11, 2.12, 2.13, 2.14, 2.15, 2.16, 2.17, 2.18, 2.19_

  - [x] 9.3 Propose the expected results for the recorded ten-package report
    - Using the existing fixture-scan helpers, build the report for the ten recorded packages, evaluate it under valid-full.yml and under DEFAULT_POLICY, and write the proposed results to test/fixtures/policy/expected-valid-full.json and test/fixtures/policy/expected-default.json. Do not treat these as approved.
    - _Requirements: 9.4, 9.5, 9.6, 9.7, 9.8, 9.13_

  - [x] 9.4 Write test/policy/fixtures.test.ts
    - Parse every file under test/fixtures/policy/invalid and assert the reported code equals the file name; parse valid-full.yml and assert ok; evaluate the recorded report under valid-full.yml and under DEFAULT_POLICY and compare each result deeply with its expected file. Reads only recorded files, no network.
    - No property in this sub-task.
    - _Requirements: 2.5, 2.6, 2.7, 2.8, 2.9, 2.10, 2.11, 2.12, 2.13, 2.14, 2.15, 2.16, 2.17, 2.18, 2.19, 9.4, 9.9, 9.10, 9.12_

  - [x] 9.5 HUMAN REVIEW STEP, do not do this silently: review and approve the expected results
    - The agent stops and asks the user to read expected-valid-full.json and expected-default.json against the recorded report, confirm every failure, unevaluated entry and notFound value is what the policy should produce, and approve before they are committed. The agent must not commit or edit them on its own after proposing.
    - _Requirements: 9.4, 9.6, 9.7, 9.13_

- [x] 10. sexton.policy.yml at the repository root
  - The repository's own policy, which its own scan must pass (N-7).
  - _Requirements: 8.4, 9.13_

  - [x] 10.1 Write sexton.policy.yml at the repository root
    - Version 1. Rules chosen to pass this repository: forbid_state for Possessed and Dead, forbid_install_scripts, and require_provenance only for packages where it holds.
    - Covered by tests in 10.2.
    - _Requirements: 8.4, 9.13_

  - [x] 10.2 Write test/policy/self-policy.test.ts
    - Read ../../sexton.policy.yml from the test and assert parsePolicy returns ok. Evaluate the parsed policy with source "file" against the recorded ten-package report and assert it returns a result without throwing.
    - No property in this sub-task.
    - _Requirements: 8.4, 9.2_

  - [x] 10.3 HUMAN REVIEW STEP, do not do this silently: live self-scan
    - The agent stops and asks the user to run a live scan of this repository's own dependencies (the engine has no CLI yet, so through a small script or a REPL using scorePackages) and evaluate sexton.policy.yml against that report, and to confirm the policy passes. The agent must not run it.
    - _Requirements: 8.4, 9.13_

- [x] 11. index.ts exports
  - _Requirements: 1.6, 2.1, 2.21, 8.1, 9.1_

  - [x] 11.1 Export the public surface from src/index.ts
    - Export parsePolicy, formatPolicy, evaluatePolicy, DEFAULT_POLICY, inScope and POLICY_SCHEMA, and the types Policy, Rule, RuleType, ForbidStateRule, ForbidInstallScriptsRule, MaxAgeMonthsRule, RequireProvenanceRule, ParseResult, ValidationError, ErrorCode, PolicySource, PolicyResult, RuleResult, Failure and Unevaluated.
    - Covered by the test in 11.2.
    - _Requirements: 1.6, 2.1, 2.21, 8.1, 9.1_

  - [x] 11.2 Extend test/index.test.ts
    - Assert each new runtime export exists and has the expected kind (functions and constants). No property in this sub-task.
    - _Requirements: 1.6, 2.1, 2.21, 8.1, 9.1_

- [x] 12. Root gates
  - _Requirements: 1.8, 1.9, 3.11, 9.1_

  - [x] 12.1 Run npm run typecheck, npm run lint and npm test at the repository root and fix anything until all three are green with zero warnings
    - If the agent's shell Node differs from Node 22 or lacks the platform rollup binary, the three commands are run in the user's own terminal and the results reported.
    - _Requirements: 9.1_

  - [x] 12.2 Review checks
    - No RegExp is built from a pattern anywhere in src/policy (3.11). No file read and no network call in src/policy (the engine rule; only the test and write-schema.mjs touch the schema file). packages/engine/package.json has exactly two new runtime dependencies, yaml 2.9.1 and ajv 8.20.0, pinned exact, and the lockfile's new runtime packages are the six listed in task 1 (1.8, 1.9).
    - _Requirements: 1.8, 1.9, 3.11, 9.1_

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2"] },
    { "id": 2, "tasks": ["1.3", "2.1"] },
    { "id": 3, "tasks": ["2.2", "3.1"] },
    { "id": 4, "tasks": ["2.3", "2.4", "3.2", "4.1", "5.1"] },
    { "id": 5, "tasks": ["4.2", "5.2", "5.4", "5.6", "5.8", "7.1", "7.2", "8.1"] },
    { "id": 6, "tasks": ["5.3", "5.5", "5.7", "5.9", "6.1", "7.3", "7.4", "9.1", "9.2"] },
    { "id": 7, "tasks": ["6.2", "8.2", "9.3"] },
    { "id": 8, "tasks": ["9.4", "10.1"] },
    { "id": 9, "tasks": ["9.5", "10.2", "11.1"] },
    { "id": 10, "tasks": ["10.3", "11.2"] },
    { "id": 11, "tasks": ["12.1", "12.2"] }
  ]
}
```
