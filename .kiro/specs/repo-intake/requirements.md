# Requirements Document

## Introduction

The repo-intake module adds to the Sexton Engine (`packages/engine`) the step that turns a public GitHub repository URL into the list of direct dependencies with installed versions that scoring consumes. It adds a pure URL parser, a client that fetches `package.json` and `package-lock.json` through the existing injectable Transport, a pure manifest parser that reads the direct dependencies and the lockfile, a pure range resolver for repositories without a lockfile, the 300-dependency Cap, a composing function `intakeRepo` that returns a result and never throws, and an optional `scan` metadata field on the `HealthReport`.

This spec implements R-IN-1, R-IN-2, R-IN-3 and R-IN-4 of docs/requirements.md in full on the engine side, and N-2 in part. The engine-side split is as follows. R-IN-1: the Engine takes a repository URL, fetches the two manifests from the default branch (always `HEAD`) and resolves the direct dependencies; accepting the URL from a user is the caller's job. R-IN-2: the Engine resolves installed versions from ranges and records `unlocked` in the report metadata; printing the "unlocked" label in every output (CLI table, `scan.json`, evidence pack, UI) is the caller's job and reads the metadata defined here. R-IN-3: the Engine returns an error naming the missing file and produces no partial scan; rendering that error is the caller's job. R-IN-4: the Engine applies the Cap and sets `capped` and `totalDirect`; telling the user is the caller's job and reads those fields. N-2: the Engine reads only `package.json` and `package-lock.json` from public repositories without a token, and retains only package names, declared ranges and versions; the public-only rule is enforced by having no credentials, so a private repository answers 404.

The spec reuses, and does not change, the Signal envelope, the `Transport` and `requestWithRetry` (User-Agent, backoff on 429 and 503, R-SG-8, R-SG-9), `CachedFetcher` and `cacheKey` (R-SG-7), `ClientContext`, `readFullPackument` and the `npm-packument` cache key. Every upstream request goes through the Transport and the Cache. The new upstream source is `github-raw`, in `packages/engine/src/clients/github-raw.ts`, one file per upstream.

Three changes touch existing code and need review. First, `TransportResponse` today exposes only `json()`. The manifest client must read the body as text with a byte limit before `JSON.parse` (Requirement 2). The design must add a text-reading method to `TransportResponse` (for example `text(maxBytes)`) without breaking existing clients, which keep using `json()`. Second, `HealthReport` gains an optional `scan` field (Requirement 9). Third, `scorePackages` gives a package whose installed version is the sentinel `"unresolved"` all-unavailable signals and issues no upstream request for it (Requirement 5). All other scoring and policy behaviour is unchanged.

This spec adds one runtime dependency, `semver` (Requirement 5).

This spec does NOT add filesystem reads, private repositories, the GitHub API, tokens or any other authentication, npm workspaces, monorepo packages below the root, branch or commit selection, pnpm or yarn lockfiles, transitive scoring, the CLI, the API handler, the UI, the evidence pack or any rendering of the intake result. The Engine never writes files.

## Glossary

- **Engine**: the @sexton/engine package. Pure core with no AWS, no UI, and no filesystem writes. Network access goes only through the injected Transport. This spec adds no filesystem access to it.
- **Signal**, **Signal envelope**, **Available signal**, **Unavailable signal**, **Source**, **fetchedAt**, **Cache**, **Packument**: as defined in health-scoring and history-signals.
- **Transport**: the injectable HTTP seam from health-scoring. It stamps the Sexton User-Agent and applies retry with backoff on HTTP 429 and 503.
- **Full packument**: the npm registry document for a package name, as read by `readFullPackument` under the cache key source `npm-packument`. Its `versions` map is the set of candidate versions for Unlocked resolution.
- **Repository reference**: the pair of an Owner and a Repo that names one public GitHub repository.
- **Owner**: the first path segment of a GitHub repository URL, a string of one or more characters from `[A-Za-z0-9_.-]` with no leading dot and no `..`.
- **Repo**: the second path segment of a GitHub repository URL after one trailing `.git` is removed, a string of one or more characters from `[A-Za-z0-9_.-]` with no leading dot, no `..`, and not ending in `.git`.
- **Canonical URL**: the string `https://github.com/{owner}/{repo}` built from a Repository reference, with no `.git`, no trailing slash and no suffix. Case is preserved as given.
- **github-raw source**: the cache source name `github-raw` and the upstream host `raw.githubusercontent.com` that serves the Manifests at `https://raw.githubusercontent.com/{owner}/{repo}/HEAD/{file}`.
- **Manifest**: one of the two files the Engine fetches from a repository, `package.json` or `package-lock.json`.
- **package.json**: the root Manifest of the repository, a JSON object that declares dependencies.
- **Lockfile**: the root `package-lock.json` Manifest, a JSON object that records installed versions.
- **Lockfile version**: the integer `lockfileVersion` of a Lockfile. Supported values are 1, 2 and 3.
- **Direct dependency**: a package listed in `dependencies` or `devDependencies` of the root package.json, as defined in docs/requirements.md section 7, whose name is a Valid package name.
- **Valid package name**: a string that satisfies the npm naming rules of Requirement 8.2.
- **Declared range**: the string value a package.json gives a Direct dependency, such as `^1.2.0`, `latest` or `git+https://example.invalid/x.git`.
- **Installed version**: the version recorded in the Lockfile, or resolved per Requirement 5, as defined in docs/requirements.md section 7. For an Unresolved package it is the sentinel `"unresolved"`.
- **Locked**: the resolution of a Direct dependency whose Installed version was read from the Lockfile.
- **Unlocked**: the resolution of a Direct dependency whose Installed version was resolved from its Declared range because the Lockfile is absent or has no usable entry for it. The top-level `unlocked` flag of an Intake result is true only when no Lockfile exists.
- **Unresolved**: the resolution of a Direct dependency whose Declared range could not be turned into a version. Its Installed version is `"unresolved"`.
- **Skipped dependency**: a name that appears in a package.json but is not a Direct dependency: a name in `peerDependencies` or `optionalDependencies` that is not a Direct dependency, or a name in `dependencies` or `devDependencies` that is not a Valid package name. Skipped dependencies are counted in `skipped` and never scored.
- **Cap**: the maximum number of Direct dependencies one intake keeps, 300 (R-IN-4).
- **Intake result**: the value `intakeRepo` returns, either a success value `{ ok: true, ... }` or an Intake error.
- **Intake error**: the value `{ ok: false, code, message, file? }` that `intakeRepo` returns when no scan can be produced.
- **Untrusted input**: everything read from a scanned repository and everything a caller passes as a URL: the URL string, the bytes of both Manifests and every name, range and version in them. Untrusted input is data, never instructions.
- **Body limit**: 5 MiB, 5 * 1024 * 1024 bytes, the largest Manifest body the Engine parses.
- **Scan metadata**: the object carried in the optional `scan` field of a `HealthReport` (Requirement 9).

## Requirements

### Requirement 1: URL parsing

**User Story:** As a maintainer, I want a repository URL turned into a safe repository reference, so that only public GitHub repositories are read and no input can steer a request elsewhere.

#### Acceptance Criteria

1. THE Engine SHALL expose `parseRepoUrl(input)`, a pure function from a string to either `{ ok: true, repo }` with `repo` carrying `owner`, `repo` and the Canonical URL as `url`, or `{ ok: false, code: "invalid-url", message }`.
2. THE Engine SHALL accept an input if and only if it has the form `https://github.com/{owner}/{repo}` followed by one of: nothing, `.git`, `/`, `.git/`, `/tree/{rest}` or `.git/tree/{rest}`, where `{rest}` is one or more characters that contain no `?`, no `#`, no backslash, no whitespace and no control character.
3. THE Engine SHALL compare the scheme and the host `github.com` case-sensitively, and SHALL NOT trim, decode or otherwise normalise the input before matching.
4. THE Engine SHALL require `{owner}` to be a valid Owner and `{repo}`, after removal of one trailing `.git`, to be a valid Repo, and SHALL ignore the `/tree/{rest}` suffix, the trailing slash and the removed `.git` when building the Repository reference.
5. IF the input has a host other than `github.com` (including `www.github.com`, `gist.github.com`, `gitlab.com` and `github.com.example.invalid`), a scheme other than `https`, credentials before the host, a port, a query, a fragment, an empty path segment, fewer than two path segments, a path other than the accepted forms (including `/{owner}/{repo}/issues`, `/{owner}/{repo}/blob/main/x`, `/orgs/{owner}` and `/{owner}`), a Repo that still ends in `.git` after one removal, or any whitespace or control character, THEN THE Engine SHALL return `{ ok: false, code: "invalid-url" }` (rejection, for any string outside the accepted forms).
6. FOR ANY string, including the empty string, a very long string and a string with unusual Unicode, THE Engine SHALL return a result from `parseRepoUrl` and SHALL NOT throw (rejection).
7. FOR ANY string, THE Engine SHALL produce deeply equal results from two calls to `parseRepoUrl` (determinism).
8. THE Engine SHALL expose `formatRepoUrl(reference)`, which returns the Canonical URL `https://github.com/{owner}/{repo}` for a Repository reference.
9. FOR ANY accepted input, parsing the Canonical URL of the returned Repository reference SHALL return a deeply equal result (idempotence).
10. FOR ANY valid Owner and valid Repo, parsing the output of `formatRepoUrl` SHALL return `{ ok: true }` with the same Owner and Repo (round-trip).
11. FOR ANY valid Owner and valid Repo, THE Engine SHALL return the same Repository reference for the Canonical URL, the URL with a trailing `.git`, the URL with a trailing slash and the URL with a `/tree/{rest}` suffix (metamorphic).
12. FOR ANY accepted input, THE Engine SHALL preserve the case of the Owner and the Repo exactly as given.

### Requirement 2: Manifest fetch

**User Story:** As a maintainer, I want the two manifests fetched once, politely and without credentials, so that a scan costs little and a private repository is never read.

#### Acceptance Criteria

1. THE Engine SHALL expose `fetchRepoManifests(ctx, reference)`, which takes a `ClientContext` and a Repository reference and returns, for each of `package.json` and `package-lock.json`, an outcome that is found with its body text, not found, too large, or failed with a reason.
2. THE Engine SHALL request each Manifest from `https://raw.githubusercontent.com/{owner}/{repo}/HEAD/{file}` through the Transport and the Cache, where `{file}` is exactly `package.json` or `package-lock.json`.
3. FOR ANY Repository reference, THE Engine SHALL request no URL other than these two, so that the set of requested URLs is a subset of the two Manifest URLs (invariant).
4. THE Engine SHALL send no token, no Authorization header and no Cookie header on a github-raw request, and SHALL send the Sexton User-Agent through the Transport on every request.
5. THE Engine SHALL cache each Manifest outcome of found or not found under the source `github-raw`, keyed by source, repository and file name, built as `cacheKey("github-raw", "{owner}/{repo}", file)`, with the 24-hour TTL.
6. WHEN the same repository and file are requested twice within the TTL, THE Engine SHALL issue exactly one upstream request and SHALL return equal outcomes for both calls (idempotence).
7. WHEN an upstream request returns HTTP 429 or 503, THE Engine SHALL back off with jitter and retry at most three times through `requestWithRetry`, and on final failure SHALL return a failed outcome whose reason records the status.
8. WHEN the response status is 2xx, THE Engine SHALL return a found outcome holding the body as text.
9. WHEN the response status is 404, THE Engine SHALL return a not-found outcome and SHALL cache it, so that a repository without a Lockfile is not asked again within the TTL.
10. IF the response status is neither 2xx nor 404 after all retries, or the request fails without a status, THEN THE Engine SHALL return a failed outcome, SHALL NOT cache it, and SHALL NOT treat it as not found.
11. THE Engine SHALL read each response body as text with a byte limit equal to the Body limit before any call to `JSON.parse`, and SHALL stop reading once the limit is exceeded.
12. IF a Manifest body exceeds the Body limit, THEN THE Engine SHALL return a too-large outcome for that file and SHALL NOT cache it.
13. THE Engine SHALL fetch `package.json` first and SHALL fetch the Lockfile only after `package.json` was fetched and parsed without error.
14. THE Engine SHALL extend `TransportResponse` with a method that reads the body as text under a byte limit, and SHALL leave `json()` and every existing client unchanged. (review constraint, not a correctness property)
15. THE Engine SHALL run no test of this module against the network; every upstream response in tests SHALL be a recorded fixture under `test/fixtures`. (review constraint, not a correctness property)

### Requirement 3: Direct dependency list

**User Story:** As a maintainer, I want the direct dependencies listed in a fixed order from the package.json, so that scans are reproducible and the scored set is predictable.

#### Acceptance Criteria

1. THE Engine SHALL expose `parseManifests(packageJsonText, lockfileText)`, a pure function whose second argument is a string or null, and which returns either `{ ok: true, ... }` with the ordered list of Direct dependencies, the Lockfile facts of Requirement 4 and the `skipped` counts, or an Intake error.
2. THE Engine SHALL parse `packageJsonText` with `JSON.parse` only.
3. IF `packageJsonText` is not valid JSON, or its parsed value is not a JSON object, THEN THE Engine SHALL return an Intake error with code `invalid-package-json` and file `package.json`.
4. WHERE `dependencies` or `devDependencies` is present in the package.json, THE Engine SHALL require it to be a JSON object whose values are all strings, and IF it is not, THEN THE Engine SHALL return an Intake error with code `invalid-package-json` and file `package.json`.
5. WHERE `dependencies` or `devDependencies` is absent, THE Engine SHALL treat it as an empty map, so that a package.json with no dependency maps yields an empty list and no error.
6. THE Engine SHALL list the Direct dependencies from `dependencies` first and from `devDependencies` second, each group sorted by name in ascending UTF-16 code-unit order.
7. WHEN a name appears in both `dependencies` and `devDependencies`, THE Engine SHALL list it once, with the Declared range and the origin `dependencies`.
8. THE Engine SHALL record for each Direct dependency its name, its Declared range and its origin, which is `dependencies` or `devDependencies`.
9. THE Engine SHALL NOT list a name from `peerDependencies` or `optionalDependencies` as a Direct dependency, unless the name is also a Direct dependency through `dependencies` or `devDependencies`, and SHALL count in `skipped.peer` and `skipped.optional` the distinct Valid package names in those maps that are not Direct dependencies. A `peerDependencies` or `optionalDependencies` value that is not a JSON object SHALL count as zero names and SHALL NOT cause an error.
10. FOR ANY package.json text, THE Engine SHALL return a result from `parseManifests` and SHALL NOT throw, including for text that is empty, binary-looking or deeply nested (rejection).
11. FOR ANY pair of texts, THE Engine SHALL produce deeply equal results from two calls (determinism).
12. FOR ANY valid package.json, THE Engine SHALL list names that are distinct, with every `dependencies` entry before every `devDependencies` entry and each group in ascending code-unit order (invariant).
13. FOR ANY valid package.json, THE Engine SHALL satisfy `totalDirect + skipped.invalidName` equal to the number of distinct keys of `dependencies` and `devDependencies` taken together, and SHALL report every `skipped` count as a non-negative integer (invariant).
14. FOR ANY valid package.json, THE Engine SHALL produce an equal result when the keys of any dependency map are reordered in the text (metamorphic).
15. FOR ANY valid package.json and any added top-level key other than `dependencies`, `devDependencies`, `peerDependencies` and `optionalDependencies`, THE Engine SHALL produce an equal result (metamorphic).

### Requirement 4: Lockfile resolution

**User Story:** As a security engineer, I want installed versions read from the lockfile when there is one, so that the versions scored are the versions that ship.

#### Acceptance Criteria

1. WHEN `lockfileText` is null, THE Engine SHALL report that no Lockfile exists, SHALL set `unlocked` to true, and SHALL leave every Direct dependency without an Installed version for Requirement 5 to resolve.
2. WHEN `lockfileText` is a string, THE Engine SHALL parse it with `JSON.parse` only.
3. IF `lockfileText` is not valid JSON, or its parsed value is not a JSON object, or `lockfileVersion` is absent or is not one of the integers 1, 2 and 3, THEN THE Engine SHALL return an Intake error with code `invalid-lockfile` and file `package-lock.json`, and SHALL NOT fall back to Unlocked resolution.
4. WHERE the Lockfile version is 1, THE Engine SHALL read the Installed version of a Direct dependency from `dependencies[name].version`.
5. WHERE the Lockfile version is 2 or 3, THE Engine SHALL read the Installed version of a Direct dependency from `packages["node_modules/{name}"].version`.
6. THE Engine SHALL read every Lockfile entry as an own property of its map, so that an inherited property never supplies a version.
7. WHEN the Lockfile entry for a Direct dependency is absent, has no `version`, or has a `version` that is not a string equal to its own semver-normalised form, THE Engine SHALL treat that one Direct dependency as Unlocked and SHALL leave every other Direct dependency Locked.
8. WHEN a Lockfile exists, THE Engine SHALL set the top-level `unlocked` to false, even when some Direct dependencies are Unlocked, and SHALL list the names of every Direct dependency that is not Locked in `unlockedPackages`, in list order. WHEN no Lockfile exists, `unlockedPackages` SHALL list every Direct dependency.
9. THE Engine SHALL use the Lockfile version as the Installed version even when it does not satisfy the Declared range.
10. THE Engine SHALL ignore Lockfile entries for names that are not Direct dependencies, and the Lockfile entries of `peerDependencies`, `optionalDependencies` and transitive packages SHALL NOT change the result.
11. IF both texts are invalid, THEN THE Engine SHALL report the `package.json` error and not the Lockfile error.
12. FOR ANY Lockfile text, THE Engine SHALL return a result and SHALL NOT throw (rejection), and for any pair of texts SHALL return deeply equal results from two calls (determinism).
13. FOR ANY valid package.json and any Lockfile, adding to the Lockfile an entry for a name that is not a Direct dependency SHALL leave the result unchanged (metamorphic).
14. FOR ANY valid package.json and any Lockfile in which every Direct dependency has a usable entry, THE Engine SHALL return `unlocked` false, an empty `unlockedPackages` and, for each Direct dependency, the Installed version recorded in the Lockfile (invariant).

### Requirement 5: Unlocked resolution

**User Story:** As a maintainer, I want a repository without a lockfile to be scanned from its declared ranges, so that I still see the risk, with the lack of a lockfile stated.

#### Acceptance Criteria

1. THE Engine SHALL expose `resolveUnlocked(range, versions)`, a pure function from a Declared range and a list of version strings to one version string or the sentinel `"unresolved"`, where `UNRESOLVED_VERSION` is exported as `"unresolved"`.
2. THE Engine SHALL consider as candidates only the entries of `versions` that are valid semver versions, and SHALL return the candidate that satisfies the range and has the greatest semver precedence, breaking an exact tie by ascending code-unit order of the version string.
3. THE Engine SHALL exclude prerelease candidates unless the range itself contains a prerelease comparator, following the semver default for `satisfies`.
4. WHEN the range is not a valid semver range, including a git URL, a `file:` or `link:` path, a dist-tag such as `latest`, an `http:` or `https:` URL, a `workspace:` specifier, an `npm:` alias and a range longer than 256 characters, THE Engine SHALL return `"unresolved"`.
5. WHEN the range is valid and no candidate satisfies it, or `versions` is empty, THE Engine SHALL return `"unresolved"`.
6. FOR ANY range and any list of strings, THE Engine SHALL return a result from `resolveUnlocked` and SHALL NOT throw, and SHALL return deeply equal results from two calls (determinism).
7. FOR ANY range and list where the result is not `"unresolved"`, THE Engine SHALL return a string that is an entry of the list, that satisfies the range, and that is not less than any other satisfying non-prerelease candidate (invariant).
8. FOR ANY range and list, THE Engine SHALL return the same result when the list is reordered or an entry is repeated (order independence), and the same result when an entry that does not satisfy the range is added (metamorphic).
9. FOR ANY range and list, WHEN a satisfying non-prerelease version greater than the current result is added, THE Engine SHALL return the added version, or a greater satisfying version (monotonic).
10. WHEN a Direct dependency is Unlocked, THE Engine SHALL read its Full packument through `readFullPackument` and the shared `npm-packument` cache key, and SHALL use the keys of the packument `versions` map as the candidates.
11. WHEN the Full packument for an Unlocked package was read during intake, THE Engine SHALL NOT issue a second upstream request for it during scoring within the TTL (idempotence, for any package).
12. IF the Full packument request for an Unlocked package fails after all retries, or the packument has no `versions` map, THEN THE Engine SHALL treat that package as Unresolved with the same code path as an unresolvable range, SHALL NOT fail the intake, and SHALL leave every other package unchanged.
13. THE Engine SHALL resolve Unlocked packages with a concurrency limit of 8 and SHALL return the same Installed versions whatever the order of completion (determinism).
14. WHEN `scorePackages` receives a package whose Installed version is `"unresolved"`, THE Engine SHALL issue no upstream request for it, SHALL give all ten signals the unavailable form with the reason "unresolvable range" and the packument URL of the package as source, SHALL list all ten signal names in `missingSignals`, and SHALL still assign a state (for any package name).
15. WHEN `scorePackages` receives a package whose Installed version is `"unresolved"`, THE Engine SHALL leave that package out of the deps.dev phase and SHALL count it in `graphsMissing` of every other package's transitiveReach value.
16. FOR ANY list of package references none of which has the Installed version `"unresolved"`, THE Engine SHALL return from `scorePackages` a report equal to the report it returned before this spec (invariant). The sentinel cannot collide with a real version, because an npm version is a semver string.
17. THE Engine SHALL add `semver` as the only new runtime dependency of this spec, at the exact version 7.8.6 (licence ISC), pinned with no range. The justification is that range satisfaction and version ordering are npm's own semantics and are error-prone to write by hand. WHERE types are needed, `@types/semver` SHALL be added as an exact-pinned development dependency only. (dependency constraint, review constraint, not a correctness property)

### Requirement 6: Dependency cap

**User Story:** As an operator of the hosted demo, I want a scan capped at 300 direct dependencies, so that one repository cannot cause unbounded upstream traffic.

#### Acceptance Criteria

1. THE Engine SHALL export `MAX_DIRECT_DEPENDENCIES` with the value 300.
2. WHEN the list of Direct dependencies has more than 300 entries, THE Engine SHALL keep the first 300 in Direct dependency order, SHALL set `capped` to true, and SHALL report `totalDirect` as the number of Direct dependencies before the Cap.
3. WHEN the list has 300 or fewer entries, THE Engine SHALL keep all of them, SHALL set `capped` to false, and SHALL report `totalDirect` as the length of the list.
4. FOR ANY list of Direct dependencies, THE Engine SHALL return `packages.length` equal to `min(totalDirect, 300)` and `capped` true if and only if `totalDirect` is greater than 300 (invariant).
5. FOR ANY list of Direct dependencies, THE Engine SHALL return a `packages` list equal to the first `packages.length` entries of the uncapped list, so that `devDependencies` are dropped before `dependencies` (invariant).
6. THE Engine SHALL apply the Cap after Skipped dependencies are removed and duplicates are merged, and before any packument request for Unlocked resolution.
7. FOR ANY list longer than 300 entries, THE Engine SHALL issue no Full packument request for an entry beyond the first 300 (invariant).
8. FOR ANY list of exactly 300 entries THE Engine SHALL set `capped` to false, and for any list of exactly 301 entries SHALL set `capped` to true (boundary).

### Requirement 7: Intake result and errors

**User Story:** As a caller, I want one result that is either a complete scan input or a clear error, so that I never score a partial repository.

#### Acceptance Criteria

1. THE Engine SHALL expose `intakeRepo(url, ctx)`, which composes `parseRepoUrl`, `fetchRepoManifests`, `parseManifests`, the Cap and Unlocked resolution in that order, and returns a promise of an Intake result.
2. FOR ANY string and any Transport behaviour, including a Transport that throws, rejects or never returns a status, THE Engine SHALL resolve `intakeRepo` with an Intake result and SHALL NOT throw or reject (rejection).
3. WHEN intake succeeds, THE Engine SHALL return `{ ok: true, repo, packages, unlocked, unlockedPackages, lockfileVersion, capped, totalDirect, skipped, unresolved }`, where `repo` holds the Owner, the Repo and the Canonical URL, `packages` is the ordered list of kept Direct dependencies, `skipped` is `{ peer, optional, invalidName }`, `lockfileVersion` is 1, 2, 3 or null, and `unresolved` is the list of package names whose Installed version is `"unresolved"`.
4. THE Engine SHALL give each entry of `packages` the fields `name`, `installedVersion`, `declaredRange`, `origin` and `resolution`, where `resolution` is `locked`, `unlocked` or `unresolved`, so that each entry can be passed to `scorePackages` as a package reference.
5. THE Engine SHALL return an Intake error as `{ ok: false, code, message }` with the optional `file`, where `code` is exactly one of the closed set `invalid-url`, `missing-package-json`, `invalid-package-json`, `invalid-lockfile`, `manifest-too-large`, `fetch-failed` and `internal-error`.
6. THE Engine SHALL map causes to codes as follows: a URL outside the grammar gives `invalid-url`; HTTP 404 for `package.json` gives `missing-package-json` with file `package.json`; a package.json that fails Requirement 3 gives `invalid-package-json`; a Lockfile that fails Requirement 4 gives `invalid-lockfile`; a Manifest over the Body limit gives `manifest-too-large` with its file; any other failed outcome for either Manifest gives `fetch-failed` with its file; an unexpected exception gives `internal-error`.
7. WHEN the request for `package-lock.json` fails with anything other than 404, THE Engine SHALL return `fetch-failed` with file `package-lock.json` and SHALL NOT treat the scan as unlocked, so that a transient failure never silently weakens a scan.
8. THE Engine SHALL give `file` the Manifest name for every code except `invalid-url` and `internal-error`, for which `file` is absent.
9. THE Engine SHALL evaluate in this order and stop at the first error: URL, `package.json` fetch, `package.json` parse, Lockfile fetch, Lockfile parse, Cap, Unlocked resolution.
10. IF intake returns an Intake error, THEN THE Engine SHALL return no `packages`, no partial list and no scan metadata (invariant, for any failing input), so that R-IN-3 holds.
11. THE Engine SHALL build every `message` only from fixed text, the file name and an HTTP status, and SHALL NOT include any part of the input URL, the Manifest text or a parser message, for any input (invariant).
12. THE Engine SHALL give the message of a `missing-package-json` error the file name `package.json`, and SHALL say that the repository may not exist or may be private.
13. WHEN `package.json` has no Direct dependencies, THE Engine SHALL return a success result with an empty `packages` list, `capped` false and `totalDirect` 0.
14. FOR ANY inputs and the same recorded fixtures and clock, THE Engine SHALL return deeply equal Intake results from two calls (determinism).
15. FOR ANY successful result, THE Engine SHALL satisfy `unresolved` equal to the names of the entries with `resolution` `unresolved` in list order, and `unresolved` a subset of `unlockedPackages` and of the names in `packages` (invariant).
16. FOR ANY successful result, THE Engine SHALL satisfy `unlocked` true if and only if `lockfileVersion` is null, and `unlockedPackages` equal to the names of the entries whose `resolution` is not `locked` (invariant).

### Requirement 8: Untrusted input handling

**User Story:** As a security engineer, I want everything read from a scanned repository treated as hostile data, so that a crafted repository cannot steer requests, pollute objects or run code.

#### Acceptance Criteria

1. THE Engine SHALL parse every Manifest with `JSON.parse` and no reviver, and SHALL use no `eval`, no `Function` constructor, no YAML parser, no dynamic `import` or `require`, no shell command and no template rendering on Untrusted input. (review constraint, not a correctness property)
2. THE Engine SHALL treat a name as a Valid package name if and only if it has at most 214 characters in total, has an optional `@scope/` prefix, and has a scope part (when present) and a name part that are each non-empty and do not begin with `.` or `_`, where the scope part consists only of lowercase letters `a-z`, digits, `-`, `.`, `_` and `~`, and the name part consists only of letters `a-z` and `A-Z`, digits, `-`, `.`, `_` and `~`. Uppercase letters are allowed in the name part, and not in the scope part, because this matches the `validForOldPackages` rule of npm's validate-npm-package-name, and many published packages that exist today have uppercase letters in their names. Rules that apply only to new packages, such as lowercase-only names, are not a concern of Sexton, because Sexton scans packages that already exist.
3. THE Engine SHALL validate every name against Requirement 8.2 before it is used in a URL, a cache key, a result or a report.
4. WHEN a key of `dependencies` or `devDependencies` is not a Valid package name, THE Engine SHALL drop it, SHALL count it once in `skipped.invalidName`, and SHALL NOT include it in `packages` or request it from any upstream.
5. The key `__proto__` fails Requirement 8.2 because it starts with an underscore, so THE Engine SHALL drop it and count it in `skipped.invalidName`. The keys `constructor` and `prototype` are Valid package names, and THE Engine SHALL handle each as an ordinary name, read by own-property access with no prototype-chain lookup, so that each gets its own Declared range from the manifest and never a value inherited from `Object.prototype`. FOR ANY package.json that holds these keys in any dependency map, THE Engine SHALL leave `Object.prototype` unchanged (invariant).
6. THE Engine SHALL read manifest maps by own-property access and SHALL NOT merge, spread or assign a parsed manifest object into another object.
7. THE Engine SHALL use a Declared range only as the argument of `semver` and as an output string, and SHALL NOT use it in a URL or a cache key.
8. THE Engine SHALL use an Installed version in a URL or a cache key only after it equals its own semver-normalised form.
9. FOR ANY package.json and Lockfile, THE Engine SHALL build every outbound URL only from the validated Owner and Repo, a fixed file name, and a Valid package name, so that every requested URL begins with `https://raw.githubusercontent.com/` or `https://registry.npmjs.org/` and no URL, `repository`, `resolved` or `tarball` value from a Manifest is ever requested (invariant).
10. FOR ANY package.json that holds extra fields such as `scripts`, `repository` or `bin`, THE Engine SHALL retain none of them in the Intake result or the report, and SHALL retain only package names, Declared ranges, versions and counts, so that N-2 holds.
11. THE Engine SHALL log no Manifest body, and SHALL send no credentials. (review constraint, not a correctness property)
12. THE Engine SHALL treat the strings it returns from Untrusted input (names, Declared ranges, versions) as data for its callers, who escape them in any rendering. (review constraint, not a correctness property)

### Requirement 9: Report metadata

**User Story:** As a security engineer, I want the report to say which repository was scanned and how complete the scan was, so that unlocked, capped and unresolved results are never hidden.

#### Acceptance Criteria

1. THE Engine SHALL add to `HealthReport` an optional field `scan` of the type Scan metadata, and SHALL leave `generatedAt` and `packages` unchanged.
2. THE Engine SHALL give Scan metadata the fields `repo` (Owner, Repo and Canonical URL), `unlocked`, `unlockedPackages`, `lockfileVersion`, `capped`, `totalDirect`, `skipped` (`peer`, `optional`, `invalidName`) and `unresolved`, each with the value of the same name in the successful Intake result.
3. THE Engine SHALL expose `scanMetadata(intake)`, a pure function from a successful Intake result to Scan metadata, and `attachScan(report, scan)`, a pure function that returns a new report with the `scan` field set and does not mutate its arguments.
4. FOR ANY report and Scan metadata, THE Engine SHALL return from `attachScan` a report whose `generatedAt` and `packages` are deeply equal to those of the input report (invariant).
5. WHEN a report has no `scan` field, THE Engine SHALL return from `scorePackages` and `evaluatePolicy` the same values as before this spec (invariant, for any report).
6. FOR ANY valid policy and report, THE Engine SHALL return the same `evaluatePolicy` result for a report with a `scan` field as for the same report without it (invariant).
7. FOR ANY Scan metadata, serialising it to JSON and parsing the text SHALL return a deeply equal value (round-trip).
8. FOR ANY successful Intake result, THE Engine SHALL produce Scan metadata in which `capped` is true if and only if `totalDirect` is greater than 300, `unlocked` is true if and only if `lockfileVersion` is null, and every name in `unresolved` is a name in `unlockedPackages` (invariant).
9. FOR ANY successful Intake result and the report scored from its `packages`, THE Engine SHALL give every package named in `unresolved` the ten unavailable signals with the reason "unresolvable range" (invariant).
10. FOR ANY successful Intake result, THE Engine SHALL return deeply equal Scan metadata from two calls to `scanMetadata` (determinism).
11. THE Engine SHALL leave the labelling of an unlocked scan in every output, the notice that the Cap was hit and the rendering of unresolved names to callers, who read the Scan metadata. (review constraint, not a correctness property)
