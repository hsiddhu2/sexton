# Implementation Plan: repo-intake

## Overview

Adds repo intake to packages/engine: the shared types, the pure leaf modules (names, url, manifest, resolve, cap, scan), the byte-limited text reader in http.ts, the github-raw client, the composing `intakeRepo`, the `"unresolved"` handling in score.ts, recorded and synthetic fixtures, exports and the final gates. Pure modules come first, then the I/O edge, then the composition. All paths are under packages/engine unless stated. No test touches the network; upstream responses are recorded fixtures under test/fixtures/intake/ or in-test fakes. Existing tests stay unchanged; edits to existing test files (test/http.test.ts, test/index.test.ts, test/arbitraries.ts) are additive only.

Deviations from the requested order and from design.md, recorded here:

- The semver dependency sub-task is moved from task 3 to 2.1. `manifest.ts` needs `semver.valid` for the 4.7 normalisation check (`semver.valid(v) === v`), so the dependency must exist before task 2 is implemented. Task 3 keeps the install verification as 3.1. The install itself is run by the orchestrator, not the impl agent.
- Property 17 is split. Task 1 covers its names part (prototype key names against `isValidPackageName`). Its `parseManifests` part, which needs `manifest.ts`, is completed in task 2 (2.6).
- Property 18 is split. Task 5 covers the `fetchManifest` arm with unvalidated references in test/clients/github-raw.test.ts. Task 6 covers the `intakeRepo` arm in test/intake/intake.test.ts.
- Property 20 sits in test/intake/scan.test.ts (with 19 and 21) instead of design.md's test/policy/scan-ignored.test.ts, to keep one test file per source file as the brief asks.
- design.md names test/http-text.test.ts for the text reader tests. test/http.test.ts exists, so the tests extend it additively.
- design.md lists lockfile fixture files (package-lock-v1/v2/v3.json and others). The lockfile v1, v2 and v3 example tests build their lockfile texts inline in the test, so only the fixtures listed in task 8 are committed.
- `@types/semver` is added to the root devDependencies as the brief asks, not to the engine package as design.md's table says.
- [x] 1. Types, names and url with properties 1, 2 and 17 (names part)
  - Adds the intake types, the package-name validator and the URL parser. Property 17 is completed in task 2: the names part is covered here, the parseManifests part in 2.6.
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 1.10, 1.11, 1.12, 8.2, 8.3, 8.4, 8.5_
  - [x] 1.1 Add the intake types to src/types.ts
    - Add RepoRef, ParseRepoUrlResult, DependencyOrigin, Resolution, LockfileVersion, IntakePackage, SkippedCounts, ParsedDependency, PackageJsonOk, ManifestParseError, PackageJsonParse, ManifestsOk, ManifestsParse, INTAKE_ERROR_CODES, IntakeErrorCode, IntakeError, IntakeSuccess, IntakeResult and ScanMetadata under an intake heading, exactly as in design.md. Add `readonly scan?: ScanMetadata` to HealthReport. Change no other existing type.
    - Covered by the typecheck in 10.1 and by tests in later tasks.
    - _Requirements: 1.1, 3.1, 7.3, 7.4, 7.5, 9.1, 9.2_
  - [x] 1.2 Implement src/intake/names.ts
    - Export MAX_PACKAGE_NAME_LENGTH (214) and isValidPackageName, hand-written per design.md: length 1 to 214, optional `@scope/`, scope and name parts non-empty and not starting with `.` or `_`, scope characters `a-z 0-9 - . _ ~`, name-part characters also allow `A-Z`, checked per UTF-16 code unit. No regular expression with repetition over unbounded input.
    - Covered by tests in 1.5.
    - _Requirements: 8.2, 8.3, 8.4_
  - [x] 1.3 Implement src/intake/url.ts
    - Export parseRepoUrl, formatRepoUrl, isValidOwner and isValidRepo with the hand-written scanner of design.md: literal case-sensitive prefix `https://github.com/`, whitespace and control rejection over the whole input with `/[\s\p{Cc}]/u`, rejection of `?`, `#` and backslash, tail forms `""`, `/` and `/tree/{rest}`, one trailing `.git` removed. Every rejection returns the single constant invalid-url result with a fixed message that holds no input. The message constant is defined here.
    - Covered by tests in 1.6.
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8_
  - [x] 1.4 Add generators to test/arbitraries.ts (additive)
    - Add arbOwner, arbRepo, arbValidName and arbInvalidName under an intake heading, as in design.md. Change no existing export.
    - _Requirements: 1.4, 8.2, 8.4_
  - [x] 1.5 Write tests in test/intake/names.test.ts including Property 17 (names part)
    - Examples for 8.2: `left-pad`, `@babel/core`, `JSONStream` valid; `@Scope/x` invalid; `__proto__` invalid; `constructor` and `prototype` valid; also `a`, `~x`, a 214-character name valid, a 215-character name, `_x`, `.x`, `@x`, `@/x`, `@x/`, `a/b`, `a b`, the empty string and `naïve` invalid.
    - Property 17 (prototype keys are inert), names part only, numRuns 1000: for names drawn from `__proto__`, `constructor`, `prototype`, `toString`, `hasOwnProperty`, `valueOf`, isValidPackageName gives the expected verdict (`__proto__` false, the others true), is deterministic, and `Object.getOwnPropertyNames(Object.prototype)` is unchanged. The parseManifests part is in 2.6.
    - Tag: `Feature: repo-intake, Property 17: Prototype keys are inert`.
    - _Requirements: 8.2, 8.4, 8.5_
  - [x] 1.6 Write tests in test/intake/url.test.ts including Properties 1 and 2
    - Property 1 (the URL parser never throws and is deterministic), numRuns 1000 (rejection side; the near-miss generator of design.md), asserting ok implies the prefix and no whitespace, control, `?`, `#` or backslash, and not-ok is the single fixed invalid-url result.
    - Property 2 (URL round trip and equivalence of accepted forms), numRuns 100, over the six forms, idempotence and case preservation.
    - Examples: the accepted forms for `https://github.com/octocat/hello-world`, `/tree/main`, `/tree/feature/x/y`, `.git/tree/main`; every rejected row of design.md's 1.5 list (`http://`, `HTTPS://`, `GitHub.com`, `www.`, `gist.`, `gitlab.com`, `github.com.example.invalid`, credentials, port, query, fragment, `o//r`, `o`, root, `/issues`, `/blob/main/x`, `/orgs/o`, `r.git.git`, `/.git`, `/tree/`, `/tree`, `/tree/a b`, tab and newline, leading space, `%2F`, empty string, 10,000 characters); `formatRepoUrl({ owner: "O", repo: "R" })` is `https://github.com/O/R`.
    - Tags: `Feature: repo-intake, Property 1: The URL parser never throws and is deterministic`, `Property 2: URL round trip and equivalence of accepted forms`.
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 1.10, 1.11, 1.12_
- [x] 2. Manifest parsing with properties 3 to 8 and 17 (parseManifests part)
  - Adds the pure package.json and lockfile parsers. `manifest.ts` calls `semver.valid`, so the semver dependency is added first in this task (moved from task 3, see the Overview).
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10, 3.11, 3.12, 3.13, 3.14, 3.15, 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9, 4.10, 4.11, 4.12, 4.13, 4.14, 5.17, 8.5, 8.6, 8.10_
  - [x] 2.1 Add the semver dependency (moved from task 3 because manifest.ts needs semver.valid)
    - Add `"semver": "7.8.6"` to the "dependencies" block of packages/engine/package.json, exact, no range. Add `@types/semver` to the root package.json devDependencies at an exact version chosen at task time (the latest 7.x type package, no `^` or `~`).
    - The impl agent edits the two package.json files only. The orchestrator runs the install, not the impl agent: `npx --yes npm@11 install --no-progress --logs-dir build/npm-logs --loglevel http` at the repository root. The verification is 3.1.
    - _Requirements: 5.17_
  - [x] 2.2 Implement src/intake/manifest.ts
    - Export parsePackageJson, applyLockfile and parseManifests per design.md. `JSON.parse` with no reviver is the only parser; each call is in try/catch. Private `own` and `ownRecord` helpers read with `Object.hasOwn`; no parsed object is spread, assigned or merged; collections keyed by untrusted names are `Map` or `Object.create(null)`. Lockfile version 1 reads `dependencies[name].version`, versions 2 and 3 read `packages["node_modules/" + name].version`. A version is usable only when `semver.valid(v) === v`. Error messages are fixed text defined here (`package.json is not a valid manifest.`, `package-lock.json is not a valid lockfile.`).
    - Try `import semver from "semver"` first and fall back to named imports if the NodeNext tsconfig rejects it. No `require`.
    - Covered by tests in 2.4, 2.5 and 2.6.
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10, 3.11, 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9, 4.10, 4.11, 4.12, 8.5, 8.6, 8.10_
  - [x] 2.3 Add manifest generators to test/arbitraries.ts (additive)
    - Add arbVersion, arbPackageJson (model object and text, with overlap, peer and optional maps, extra top-level keys) and arbLockfile(model, version) for lockfile versions 1, 2 and 3, as in design.md. Texts that need a real own `__proto__` key are built by string templates, not `JSON.stringify` of an object literal.
    - _Requirements: 3.12, 3.13, 4.4, 4.5_
  - [x] 2.4 Write tests in test/intake/manifest.test.ts including Properties 3 to 6
    - Property 3 (parseManifests never throws), numRuns 100, including deep nesting up to 50,000 `[` and the package.json error winning when both texts are invalid. Property 4 (direct list ordering and distinctness), checked against a model computed in the test. Property 5 (totalDirect accounting). Property 6 (key order and extra keys do not change the result).
    - Examples: no dependency maps gives an empty list and no error; `dependencies: []`, `dependencies: { a: 1 }` and a top-level array give invalid-package-json; a package.json holding `scripts`, `repository` and `bin` gives a result whose `JSON.stringify` contains none of those values; a BOM-stripped text parses.
    - Tags: `Feature: repo-intake, Property 3: parseManifests never throws`, `Property 4: Direct list ordering and distinctness`, `Property 5: totalDirect accounting`, `Property 6: Key order and extra keys do not change the result`.
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10, 3.11, 3.12, 3.13, 3.14, 3.15, 4.11, 4.12, 8.10_
  - [x] 2.5 Add lockfile tests and Properties 7 and 8 to test/intake/manifest.test.ts
    - Property 7 (the lockfile ignores non-direct entries) and Property 8 (a fully locked lockfile gives no unlocked packages), numRuns 100, over lockfile versions 1, 2 and 3.
    - Example tests with lockfile texts built inline: the same dependency set in lockfile v1, v2 and v3 gives equal locked versions, and version 2 reads `packages` and not `dependencies`; rows for `lockfileVersion` absent, `0`, `4`, `"2"`, `2.5`, `null`, a JSON array and invalid JSON each give invalid-lockfile; rows for a missing entry, no `version`, a numeric `version`, `v1.0.0`, `^1.0.0` and `1.0.0+build` each make only that dependency unlocked; `lockfileText: null` gives `unlocked` true and every name in `unlockedPackages`; a partial lockfile gives `unlocked` false and a non-empty `unlockedPackages`; a locked version outside the declared range is kept; 4.11 precedence (both texts invalid reports the package.json error).
    - Tags: `Feature: repo-intake, Property 7: The lockfile ignores non-direct entries`, `Property 8: A fully locked lockfile gives no unlocked packages`.
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9, 4.10, 4.11, 4.13, 4.14_
  - [x] 2.6 Add Property 17 (parseManifests part) to test/intake/manifest.test.ts
    - Property 17 (prototype keys are inert), numRuns 1000, completing the names part from 1.5. Texts are built by string templates so `__proto__`, `constructor`, `prototype`, `toString`, `hasOwnProperty` and `valueOf` are real own keys in dependencies, devDependencies, peerDependencies, optionalDependencies, `packages["node_modules/{name}"]` and v1 `dependencies[name]`, plus a top-level `"__proto__": {"polluted": "yes"}`. Snapshot `Object.getOwnPropertyNames(Object.prototype)` before and after, assert `({}).polluted === undefined`, `__proto__` counted in `skipped.invalidName`, and each listed entry has its own string declared range and is unlocked when it has no own lockfile entry.
    - Examples: `constructor` and `prototype` in the manifest get their own declared ranges.
    - Tag: `Feature: repo-intake, Property 17: Prototype keys are inert`.
    - _Requirements: 4.6, 8.5, 8.6_
- [x] 3. Range resolution with properties 9 to 12
  - Adds the pure Unlocked resolver. The semver dependency itself was added in 2.1.
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8, 5.9, 5.17, 8.7, 8.8_
  - [x] 3.1 Confirm semver 7.8.6 in the lockfile, ISC licence, no install scripts
    - After the orchestrator's install of 2.1, confirm package-lock.json resolves semver exactly 7.8.6, that node_modules/semver/package.json declares licence ISC and no install, preinstall or postinstall script and no runtime dependencies, and that @types/semver is MIT and exact-pinned. Record the one-line justification from design.md in the commit message or PR draft, not in source.
    - _Requirements: 5.17_
  - [x] 3.2 Implement src/intake/resolve.ts
    - Export UNRESOLVED_VERSION (`"unresolved"`), MAX_RANGE_LENGTH (256), isResolvableRange and resolveUnlocked per design.md. A range over 256 characters or one for which `semver.validRange` is null (dist-tag, git URL, `file:`, `link:`, `http(s):`, `workspace:`, `npm:`) resolves to the sentinel; the empty string is `*`. Candidates are entries with `semver.valid(v) === v`; default `satisfies` options so prereleases are excluded unless the range names one; greatest `semver.compare`, ties by ascending code-unit order. The whole body is in try/catch returning the sentinel.
    - Covered by tests in 3.4.
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 8.7, 8.8_
  - [x] 3.3 Add resolver generators to test/arbitraries.ts (additive)
    - Add arbRange (valid ranges, unresolvable specifiers, arbitrary strings, a 300-character range) and validRangeArb (ranges built from arbVersion parts, including prerelease comparators), as in design.md.
    - _Requirements: 5.4, 5.7_
  - [x] 3.4 Write tests in test/intake/resolve.test.ts including Properties 9 to 12
    - Property 9 (resolveUnlocked never throws), Property 10 (the chosen version satisfies the range and is maximal, with the oracle `semver.satisfies` and `semver.compare`), Property 11 (order independence), Property 12 (monotonic, built by construction from `^M.0.0` and a version above every entry). Each numRuns 100.
    - Edge specifier examples (5.4): each of `latest`, `next`, `git+https://example.invalid/x.git`, `github:o/r`, `o/r`, `file:../x`, `link:../x`, `http://example.invalid/x.tgz`, `https://example.invalid/x.tgz`, `workspace:*`, `npm:other@1`, a 257-character range resolves to `"unresolved"`. The empty string and `*` pick the greatest release. `^1.0.0` with `1.2.0` and `1.3.0-beta.1` picks `1.2.0`; `>=1.3.0-beta.0` with `1.3.0-beta.1` picks the prerelease; an empty versions array gives `"unresolved"`.
    - Tags: `Feature: repo-intake, Property 9: resolveUnlocked never throws`, `Property 10: The chosen version satisfies the range and is maximal`, `Property 11: Order independence`, `Property 12: Monotonic`.
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8, 5.9_
- [x] 4. Dependency cap with property 13
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.8_
  - [x] 4.1 Implement src/intake/cap.ts
    - Export MAX_DIRECT_DEPENDENCIES (300), CapResult and the generic applyCap(list, max) returning `list.slice(0, max)`, `capped: list.length > max` and `totalDirect: list.length`.
    - Covered by tests in 4.2.
    - _Requirements: 6.1, 6.2, 6.3_
  - [x] 4.2 Write tests in test/intake/cap.test.ts including Property 13
    - Property 13 (cap invariant and boundary), numRuns 100, over lists of 0 to 700 items with 299, 300 and 301 forced into the generator: length equals `min(totalDirect, 300)`, `capped` equals `totalDirect > 300`, `packages` is the prefix of the input.
    - Examples: exactly 300 entries is not capped; exactly 301 is capped and drops the last entry; the constant is 300.
    - Tag: `Feature: repo-intake, Property 13: Cap invariant and boundary`.
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.8_
- [x] 5. Text reader, github-raw client and property 18 (fetchManifest arm)
  - Adds the byte-limited text reader to http.ts and the github-raw client. Existing clients and tests are untouched.
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 2.10, 2.11, 2.12, 2.13, 2.14, 2.15, 8.9_
  - [x] 5.1 Add text(limitBytes) to src/http.ts
    - Export TextBody. Add the optional `text?: (limitBytes: number) => Promise<TextBody>` to TransportResponse, leaving `json()` unchanged. Implement it in createFetchTransport: Content-Length early reject with body cancel, streamed byte count that cancels the reader once the total exceeds the limit (inclusive limit: exactly the limit is accepted, one more is rejected), a null body gives the empty string, one fatal `TextDecoder("utf-8", { fatal: true })` decode that strips a leading BOM, `invalid-encoding` on a decode error.
    - Covered by tests in 5.2.
    - _Requirements: 2.11, 2.14_
  - [x] 5.2 Extend test/http.test.ts with text() tests (additive, existing tests unchanged)
    - Use a fake `fetch` returning a `Response` built on a `ReadableStream`; no network. Cases: exactly 5 MiB across several chunks is ok; 5 MiB + 1 is too-large and the stream's cancel callback ran and `pull` stopped; a Content-Length above the limit is too-large with `pull` never called; a too-small Content-Length does not defeat the byte counter; a multi-byte character split across chunks decodes; invalid UTF-8 gives invalid-encoding; a leading BOM is stripped; a null body gives the empty string; `json()` still parses; a fake transport returning only `{ status, json }` still satisfies TransportResponse (compile-time check).
    - No property in this sub-task.
    - _Requirements: 2.11, 2.14, 2.15_
  - [x] 5.3 Implement src/clients/github-raw.ts
    - Export GITHUB_RAW_SOURCE, GITHUB_RAW_HOST, MAX_MANIFEST_BYTES, ManifestFile, ManifestOutcome, ManifestFailure, LockfileOutcome, manifestUrl, fetchManifest and fetchRepoManifests per design.md. manifestUrl takes the file from a constant table, re-checks isValidOwner and isValidRepo and throws on an invalid reference. fetchManifest calls `ctx.cache.get` directly with `cacheKey("github-raw", "{owner}/{repo}", file)`; `download` returns a value for found and 404 (cached) and throws for every other outcome, a body over the limit and a missing `text` method (not cached); the outcome is converted outside the cache call to a closed failure kind with no upstream text. Request headers are `Accept` only. fetchRepoManifests makes the lockfile request only after the package.json gate (default `parsePackageJson(text).ok`) and otherwise returns `{ kind: "not-attempted" }`.
    - Covered by tests in 5.5.
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 2.10, 2.11, 2.12, 2.13, 8.9_
  - [x] 5.4 Add test/intake/routes.ts, the routed transport helper
    - A new file: a transport that answers by URL, records every request (URL, method, headers), supports per-URL behaviours (status, body text, thrown error, delay), returns responses that implement both `json()` and `text()` (with the byte-limit semantics), and an optional completion-order control. A second helper wraps a string or byte array in a `ReadableStream`. No existing helper is changed.
    - _Requirements: 2.15_
  - [x] 5.5 Write tests in test/clients/github-raw.test.ts including Property 18 (fetchManifest arm)
    - Examples with the routed transport and a MemoryCacheStore with a controllable clock: 2xx gives found; 404 gives not-found and a second call issues no request (cached); 429 forever with a fake sleep gives failed with status 429 after exactly four requests and is not cached; 429 twice then 200 gives found after two sleeps; a body of 5 MiB + 1 gives too-large and is not cached (generated at runtime, not committed); a body of exactly 5 MiB is accepted; invalid UTF-8 gives a failed outcome; a response with no `text` method gives a failed outcome and a later 200 for the same key is fetched; a 500 and a throwing transport give failed and are not cached; the cache key is `github-raw|o/r|package.json` and a call after the 24-hour TTL issues a new request; no Authorization or Cookie header is sent; the requested URLs are exactly the two Manifest URLs; `fetchRepoManifests` makes zero lockfile requests and returns not-attempted when package.json is 404, too large, failed or invalid JSON, and one request when it is valid.
    - Property 18 (every outbound URL has the fixed prefix), `fetchManifest` arm, numRuns 1000: called with `fc.record({ owner: fc.string(), repo: fc.string(), url: fc.string() })` including `/`, `..`, `?`, `#` and whitespace, an unvalidated reference makes no request and returns a failed outcome. The `intakeRepo` arm is in 6.4.
    - Tag: `Feature: repo-intake, Property 18: Every outbound URL has the fixed prefix`.
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 2.10, 2.11, 2.12, 2.13, 2.15, 8.9_
- [x] 6. intakeRepo with properties 14 to 16 and 18 (intakeRepo arm)
  - Composes the URL parser, the manifest client, the parsers, the Cap and Unlocked resolution.
  - _Requirements: 5.10, 5.11, 5.12, 5.13, 6.6, 6.7, 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8, 7.9, 7.10, 7.11, 7.12, 7.13, 7.14, 7.15, 7.16, 8.7, 8.8, 8.9_
  - [x] 6.1 Implement src/intake/intake.ts
    - Export intakeRepo, one async function inside a top-level try/catch that returns `internal-error` and never rejects. Order: parseRepoUrl, fetchManifest package.json, parsePackageJson, fetchManifest package-lock.json (404 means no lockfile, any other failure is an error), applyLockfile, applyCap, then resolve each unlocked dependency with `mapWithConcurrency` and `PACKAGE_CONCURRENCY` (8): unresolvable ranges give the sentinel with no request, otherwise `readFullPackument` and `resolveUnlocked` over the own keys of `versions`, with a failed request or a packument with no `versions` object giving the sentinel. Results are written by index. `unlockedPackages` and `unresolved` are derived from the final list, `unlocked` is `lockText === null`. The fixed messages and `file` values follow design.md's Error Handling table (messages for the other codes are defined here).
    - Covered by tests in 6.3, 6.4 and 6.5.
    - _Requirements: 5.10, 5.12, 5.13, 6.6, 6.7, 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8, 7.9, 7.10, 7.11, 7.12, 7.13, 7.15, 7.16, 8.7, 8.8, 8.9_
  - [x] 6.2 Add intake generators to test/arbitraries.ts (additive)
    - Add arbIntakeTransport (the per-upstream behaviour generator of Property 14: 200 with text, 404, 500, 429 forever with an immediate sleep and `maxRetries` 1, a transport that throws or rejects with an Error or a non-Error, a rejecting `text()`, too-large and invalid-encoding bodies, a response without `text`, `status: NaN`) and the model-based routed packument generator of Property 16, built on test/intake/routes.ts.
    - _Requirements: 7.2, 7.15, 7.16_
  - [x] 6.3 Write Properties 14 and 15 in test/intake/intake.test.ts
    - Property 14 (intakeRepo never rejects for any transport behaviour), numRuns 100: resolves for any string and any behaviour; a failure has a code from the closed set of seven, a non-empty message and none of `packages`, `scan` or the success fields. Property 15 (messages never echo input), numRuns 1000: a canary token planted in the URL, in both Manifest bodies, in names and ranges, and in a thrown Error message never appears in `message`, and `message` equals one of the fixed templates with only the file name and status substituted.
    - Tags: `Feature: repo-intake, Property 14: intakeRepo never rejects for any transport behaviour`, `Property 15: Messages never echo input`.
    - _Requirements: 7.2, 7.5, 7.10, 7.11_
  - [x] 6.4 Write Property 16 and Property 18 (intakeRepo arm) in test/intake/intake.test.ts
    - Property 16 (unresolved and unlockedPackages invariants), numRuns 100, with dependency counts up to 320 so the Cap applies, also asserting `scanMetadata` agreement (`capped` iff `totalDirect > 300`, every unresolved name in unlockedPackages) once task 7.1 exists. Property 18, `intakeRepo` arm, numRuns 1000: with hostile extras (`repository`, `scripts`, `bin`, `dist.tarball`, URL-like names and ranges, `resolved` and `tarball` pointing at `https://evil.invalid/`), every requested URL starts with `https://raw.githubusercontent.com/` or `https://registry.npmjs.org/`, the raw URLs are exactly the two Manifest URLs, each registry URL is `packumentUrl(name)` for a valid unlocked resolvable name, and no request carries Authorization or Cookie.
    - Tags: `Feature: repo-intake, Property 16: Unresolved and unlockedPackages invariants`, `Property 18: Every outbound URL has the fixed prefix`.
    - _Requirements: 7.3, 7.4, 7.15, 7.16, 8.7, 8.8, 8.9, 9.8_
  - [x] 6.5 Write example tests in test/intake/intake.test.ts
    - Error mapping and order (7.6 to 7.9): one test per row of design.md's Error Handling table asserting code, file, the exact message, and no `packages` or `scan`; a request log asserting the order URL, package.json fetch, parse, lockfile fetch; a package.json that is invalid JSON makes no lockfile request; a lockfile 500 gives fetch-failed with file package-lock.json and is not treated as unlocked; a lockfile 404 gives `unlocked` true. 7.12: the missing-package-json message names `package.json` and says the repository may not exist or may be private. 7.13: an empty-dependency package.json gives ok, `packages: []`, `capped` false, `totalDirect` 0. 7.14: two calls with the same fixtures, cache and clock are deeply equal.
    - 5.10 to 5.13: an unlocked dependency requests `packumentUrl(name)` and no tarball URL; a failing packument (500, non-object, no `versions`) gives `resolution: "unresolved"` without failing the intake or touching other packages; unresolvable ranges make no registry request; a transport completing in reverse order gives the same installed versions and never has more than 8 packument requests in flight; a MemoryCacheStore shared with `scorePackages({ cacheStore })` gives zero packument requests during scoring for names intake read.
    - 6.6, 6.7: 305 unlocked dependencies request packuments for 300 names only, and the dropped five are devDependencies.
    - `fetchRepoManifests` and `intakeRepo` request the same URLs in the same order for the same inputs.
    - No property in this sub-task.
    - _Requirements: 5.10, 5.11, 5.12, 5.13, 6.6, 6.7, 7.1, 7.3, 7.6, 7.7, 7.8, 7.9, 7.12, 7.13, 7.14, 2.13_
- [x] 7. Scan metadata and unresolved scoring with properties 19 to 21
  - Adds scan.ts and the sentinel handling in score.ts.
  - _Requirements: 5.14, 5.15, 5.16, 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8, 9.9, 9.10_
  - [x] 7.1 Implement src/intake/scan.ts
    - Export scanMetadata (fresh copies of the arrays, `repo` and `skipped`; the eight named fields only, no `packages`) and attachScan (`{ ...report, scan }`, mutating neither argument).
    - Covered by tests in 7.3.
    - _Requirements: 9.2, 9.3, 9.4, 9.10_
  - [x] 7.2 Add the unresolved handling to src/score.ts
    - Add the isUnresolved partition on `UNRESOLVED_VERSION`, unresolvedHealth (ten `unavailable("unresolvable range", sourceFor(name), reference)` signals through `buildHealth`) and the guarded sourceFor (`packumentUrl` in try/catch, falling back to the registry root). Exclude unresolved packages from collectReach and add their count to `graphsMissing`. Keep ScoreOneOptions, scoreOne, buildHealth and collectReach signatures. Input with no sentinel must give the same report as before.
    - Covered by tests in 7.4 and the regression run in 7.5.
    - _Requirements: 5.14, 5.15, 5.16, 9.5_
  - [x] 7.3 Write tests in test/intake/scan.test.ts including Properties 19 to 21
    - Add arbScanMetadata to test/arbitraries.ts (additive) and reuse the existing arbReport and arbValidPolicy. Property 19 (attachScan preserves the report), with structuredClone comparison and deep-frozen inputs. Property 20 (evaluatePolicy ignores scan) over `arbValidPolicy`, `arbReport`, `arbScanMetadata` and both sources. Property 21 (scan metadata JSON round trip) with `toStrictEqual`, plus a second arm applying scanMetadata to a generated IntakeSuccess. Each numRuns 100.
    - Examples: scanMetadata returns the eight fields and copies arrays; two calls are deeply equal; a report from scorePackages has no `scan` key; a type-level test (`expectTypeOf`) that IntakePackage is assignable to PackageRef and `HealthReport.scan` is optional.
    - Tags: `Feature: repo-intake, Property 19: attachScan preserves the report`, `Property 20: evaluatePolicy ignores scan`, `Property 21: Scan metadata JSON round trip`.
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8, 9.10_
  - [x] 7.4 Write tests in test/score-unresolved.test.ts
    - A new file; test/score.test.ts is not edited. With a recording transport: a list with one real and one unresolved package (a plain name, a scoped name, and a name holding a lone surrogate) issues no request for the unresolved package, gives it ten unavailable signals with reason `unresolvable range` and source `packumentUrl(name)` (the registry root for the lone-surrogate name), lists all ten names in `missingSignals`, assigns a state, and raises the real package's `graphsMissing` by one; order is preserved with the unresolved package first, middle and last; a list with no sentinel gives a report equal to the one produced without the new code path.
    - No property in this sub-task.
    - _Requirements: 5.14, 5.15, 5.16, 9.9_
  - [x] 7.5 Run the full engine suite and confirm every test from specs 01 health-scoring, 02 history-signals and 03 policy passes unchanged
    - Run `npm test -w @sexton/engine`. Confirm no existing test file was edited except additively (test/http.test.ts, test/index.test.ts, test/arbitraries.ts), by diffing the test tree against the base commit. Fix any regression in source, never by editing an existing test.
    - _Requirements: 5.16, 9.5_

- [x] 8. Fixtures
  - Recorded repository fixtures, synthetic hostile fixtures and the fixture test. The expected files need a human review.
  - _Requirements: 1.1, 3.6, 3.9, 4.8, 6.2, 6.8, 7.3, 8.4, 8.5, 8.10_
  - [x] 8.1 Extend scripts/record-fixtures.mjs to record the three repository manifests
    - Read packages/engine/scripts/record-fixtures.mjs first and reuse its backoff and Sexton User-Agent. Add an `--intake` option to the existing script and an npm script `"fixtures:record:intake": "node scripts/record-fixtures.mjs --intake"` in packages/engine/package.json; a run without the option behaves as today. The option fetches `https://raw.githubusercontent.com/{owner}/{repo}/HEAD/{file}` for package.json and package-lock.json of exactly expressjs/express, chalk/chalk and lodash/lodash, with no token and no cookies.
    - Storage format: one JSON file per fetched file at test/fixtures/intake/repos/{owner}__{repo}/{file}.json (so `package.json.json` and `package-lock.json.json`) holding `{ status, body? }`, where `body` is the response text on 200. If a lockfile body exceeds 5 MiB, record `{ status: 200, tooLarge: true }` instead of the body.
    - The recording is run by the orchestrator with network access, never by tests.
    - _Requirements: 2.15_
  - [x] 8.2 Add synthetic hostile fixtures under test/fixtures/intake/synthetic/
    - Files: a package.json with 305 direct dependencies split between dependencies and devDependencies so the Cap drops devDependencies; one with own `__proto__`, `constructor` and `prototype` keys; one with a git URL range and a tag range (`latest`); one with the uppercase legacy name `JSONStream`. The oversize body is generated in the test at runtime (5 MiB + 1 bytes) and not committed. The fixture test says in a comment that these files are synthetic, since JSON has no comments.
    - _Requirements: 3.6, 6.2, 6.8, 8.4, 8.5_
  - [x] 8.3 Write test/intake/fixtures.test.ts and propose the expected files
    - Replay the three recorded repositories through intakeRepo with a fake transport built on test/intake/routes.ts (packument requests answered by recorded packument fixtures where the lockfile is absent) and assert the package lists against test/fixtures/intake/expected/{owner}__{repo}.json. Run the synthetic fixtures through parseManifests and intakeRepo: 305 dependencies gives `capped` true, `totalDirect` 305 and 300 kept; prototype keys leave `Object.prototype` unchanged; the git range and `latest` are unresolved with no registry request; `JSONStream` is kept; the runtime-generated oversize body gives manifest-too-large. Reads only recorded and synthetic files, no network.
    - Propose the expected files from one replay run through a temporary script that is deleted afterwards, and do not treat them as approved.
    - No property in this sub-task.
    - _Requirements: 1.1, 3.6, 3.9, 4.8, 6.2, 7.3, 8.4, 8.5, 8.10_
  - [x] 8.4 HAND REVIEW STEP, do not do this silently: review and approve the three recorded package lists
    - The orchestrator stops here and asks the user. A human reviews the three proposed expected files (names, declared ranges, installed versions, lockfileVersion, unlocked, skipped counts) against the real repositories on GitHub and approves them before they are committed. The agent must not commit or edit them on its own after proposing.
    - _Requirements: 3.6, 3.9, 4.8, 7.3_

- [x] 9. index.ts exports
  - _Requirements: 1.1, 1.8, 2.1, 3.1, 5.1, 6.1, 7.1, 9.3_

  - [x] 9.1 Export the public surface from src/index.ts
    - Add the exports listed in design.md's "index.ts additions" block: parseRepoUrl, formatRepoUrl, isValidOwner, isValidRepo, isValidPackageName, MAX_PACKAGE_NAME_LENGTH, parsePackageJson, applyLockfile, parseManifests, resolveUnlocked, isResolvableRange, UNRESOLVED_VERSION, MAX_RANGE_LENGTH, applyCap, MAX_DIRECT_DEPENDENCIES, intakeRepo, scanMetadata, attachScan, fetchManifest, fetchRepoManifests, manifestUrl, GITHUB_RAW_SOURCE, GITHUB_RAW_HOST, MAX_MANIFEST_BYTES, INTAKE_ERROR_CODES, and the types ManifestFile, ManifestOutcome, LockfileOutcome, ManifestFailure, CapResult, RepoRef, ParseRepoUrlResult, DependencyOrigin, Resolution, IntakePackage, SkippedCounts, LockfileVersion, ParsedDependency, PackageJsonOk, PackageJsonParse, ManifestsOk, ManifestsParse, ManifestParseError, IntakeErrorCode, IntakeError, IntakeSuccess, IntakeResult, ScanMetadata and TextBody. Keep every existing export.
    - Covered by the test in 9.2.
    - _Requirements: 1.1, 1.8, 2.1, 3.1, 5.1, 6.1, 7.1, 9.3_

  - [x] 9.2 Extend test/index.test.ts
    - Additively assert each new runtime export exists with the expected kind (functions and constants, `UNRESOLVED_VERSION` equals `"unresolved"`, `MAX_DIRECT_DEPENDENCIES` equals 300). No property in this sub-task.
    - _Requirements: 1.1, 2.1, 3.1, 5.1, 6.1, 7.1, 9.3_

- [x] 10. Root gates
  - _Requirements: 2.15, 5.17, 8.1_

  - [x] 10.1 Run npm run typecheck, npm run lint and npm test at the repository root and fix anything until all three are green with zero warnings
    - Every package must pass. If the agent's shell Node differs from Node 22 or lacks the platform rollup binary, the three commands are run in the user's own terminal and the results reported.
    - _Requirements: 2.15, 8.1_

  - [x] 10.2 Review checks
    - Grep the test tree for `fetch(` and confirm every hit is a fake or a stub, so no test makes a network call. Confirm every dependency pin in package.json files is exact (no `^`, `~` or range), that semver 7.8.6 is the only new runtime dependency, and that the no-eval and no-new-func lint rules cover src/intake and src/clients/github-raw.ts.
    - _Requirements: 2.15, 5.17, 8.1_

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "2.1", "5.1"] },
    { "id": 1, "tasks": ["1.2", "1.3", "1.4", "3.1", "4.1", "5.2", "5.4", "7.1", "8.1", "8.2"] },
    { "id": 2, "tasks": ["1.5", "1.6", "2.2", "2.3", "3.2", "4.2"] },
    { "id": 3, "tasks": ["2.4", "3.3", "5.3", "7.2"] },
    { "id": 4, "tasks": ["2.5", "3.4", "5.5", "6.1", "6.2", "7.4"] },
    { "id": 5, "tasks": ["2.6", "6.3", "7.3", "8.3", "9.1"] },
    { "id": 6, "tasks": ["6.4", "8.4", "9.2"] },
    { "id": 7, "tasks": ["6.5"] },
    { "id": 8, "tasks": ["7.5"] },
    { "id": 9, "tasks": ["10.1", "10.2"] }
  ]
}
```
