# Requirements Document

## Introduction

The migration-node-sass module fills the `migrate` kind that the remediation spec left as a placeholder. It adds to the Sexton Engine (`packages/engine`) one migration recipe, node-sass to sass, a File source port through which the recipe sees repository files, a recipe runner that enforces the read caps, a review-site scanner, a migration data fetch `gatherMigrationData` built like `gatherBumpData`, and the migrate branches of the planner, the PR intent, the PR body and `attachRemediations`. It changes the Edit type (a third operation, `add-dependency`), the PR intent (one or more Edits and a list of review comments), the API contract that re-exports them, the web validator, and the demo scan generator.

This spec implements R-RM-4 and R-RM-7 of docs/requirements.md, and the migration half of R-RM-6 (the list of files changed and the list of sites left for human review). R-RM-1, R-RM-2, R-RM-3, R-RM-5 and R-RM-8 stay as the remediation spec implements them. The split is as before: the Engine plans and describes, an Executor acts. The Engine never reads a repository itself. It sees files only through the File source port, whose implementations live outside the planner: this spec ships an in-memory one for tests and the demo; the CLI spec (09) adds a working-tree source and the hosted remediate spec (10b) adds a GitHub source.

The spec reuses, and does not change, the Signal envelope, `scorePackages`, `evaluatePolicy`, the Transport, `requestWithRetry`, `CachedFetcher`, `readFullPackument`, `queryVulnIdsBatch`, `fetchAdvisory`, `isValidPackageName`, `isPassing`, `rangeStyle`, `styledRange`, `branchName`, `escapeField`, `cleanLine` and the remediation log. Two small corrections to the remediation spec ride along (Requirement 9).

This spec does NOT add a second recipe, fetching repository files from GitHub or from disk, executing an intent, posting review comments, editing any file other than `package.json`, editing a stylesheet or a script, or a change to `IntakeSuccess`. It adds no runtime dependency.

## Glossary

- **Engine**, **Signal**, **Transport**, **ClientContext**, **Cache**, **Full packument**, **Published version**, **Passing candidate**, **Range style**, **Styled range**, **Bump data**, **Bump failure**, **Edit**, **PR intent**, **RemediationPlan**, **Plan status**, **Recipe registry**, **Valid package name**, **Executor**, **escapeField**, **cleanLine**: as defined in the remediation spec.
- **Recipe**: a migration description for one package: `{ id, from, to, run(input) }`. `run` receives a Recipe input and resolves to a Recipe outcome. Release 0.1 ships one Recipe, `node-sass-to-sass`.
- **Recipe input**: `{ packageJson, files, data }`: the Package.json view, a File source or `undefined`, and the Migration data.
- **Recipe outcome**: either `{ ok: true, result }` with a Recipe result, or `{ ok: false, reason }` with a fixed reason.
- **Recipe result**: `{ edits, reviewSites, filesChanged, scan, notes }`: the Edits, the Review sites, the list of files the Edits change, the Scan counts and fixed note lines.
- **Package.json view**: `{ packages, scripts }`: the IntakePackage list of the scanned repository and the Scripts map of its `package.json`.
- **Scripts map**: the `scripts` object of `package.json` read as a map from script name to command, strings only, at most 100 entries.
- **File source**: the port `{ listFiles(): Promise<readonly string[]>; readFile(path): Promise<string | undefined> }` through which a Recipe sees repository files. Untrusted: paths and contents are attacker-controlled.
- **Capped source**: the File source the recipe runner hands to a Recipe, wrapping the caller's File source and enforcing the Caps.
- **Caps**: at most 500 listed paths considered, at most 200 files read, and a file larger than 262144 bytes (256 KiB) in UTF-8 skipped.
- **Ignored directory**: a path segment equal to `node_modules`, `.git`, `dist`, `build` or `coverage`. A path with such a segment is never considered.
- **Safe path**: a relative path of 1 to 400 characters whose segments are separated by `/`, none empty, none `.` or `..`, with no backslash, and which `neutralise` leaves unchanged: no control character (C0, DEL or C1), no line or paragraph separator, no bidirectional control or direction mark, and no lone surrogate.
- **Scan counts**: `{ performed, listed, read, skipped, capped }`: whether a File source was supplied and listed, the number of paths considered, the number of files read, the number of files skipped (too large, unreadable, or not a Safe path), and whether any Cap was reached.
- **Review site**: `{ path, line, rule, excerpt }`: a place the Engine does not edit and a human must check. `rule` is `deep-combinator`, `legacy-render` or `node-sass-script`. `line` is 1-based, or `null` for a script. `excerpt` is the line (trimmed) or the script name, passed through `cleanLine` and cut to 120 code points.
- **Style file**: a path ending `.scss`, `.sass` or `.css`.
- **Script file**: a path ending `.js`, `.mjs`, `.cjs`, `.ts`, `.mts`, `.cts`, `.jsx` or `.tsx`.
- **node-sass reference**: any of the substrings `require("node-sass")`, `require('node-sass')`, `from "node-sass"`, `from 'node-sass'`, `import("node-sass")`.
- **Review comment**: `{ path, line, body }` derived from a Review site, with a fixed body per rule and the excerpt in an inline code span. The Executor posts it.
- **Migration data**: a map from package name (`sass`, `sass-loader`) to Bump data or a Bump failure, read by `gatherMigrationData`.
- **sass-loader minimum**: 7.2.0, the lowest sass-loader release that loads `sass` without an `implementation` option when `node-sass` is not installed (design, Research findings).
- **Migrate plan**: a RemediationPlan of kind `migrate`. When proposed it carries `edits` (one or more Edits) and `migration` (`{ recipeId, from, to, reviewSites, filesChanged, scan, notes }`).

## Requirements

### Requirement 1: File source and caps

**User Story:** As a maintainer, I want the migration to read my repository only through a narrow, capped port, so that a huge or hostile repository cannot exhaust the scan and the Engine stays pure.

#### Acceptance Criteria

1. THE Engine SHALL define the File source port and SHALL expose `InMemoryFileSource`, built from a map of path to text, whose `listFiles` returns its paths and whose `readFile` returns the text of an own entry or `undefined`.
2. THE Engine SHALL read repository files in the recipe path only through a File source, and SHALL contain no filesystem or GitHub read for repository files in `packages/engine/src`. (review constraint, not a correctness property)
3. THE recipe runner SHALL wrap the caller's File source in a Capped source and SHALL give the Recipe only the Capped source.
4. THE Capped source SHALL call `listFiles` of the wrapped source at most once, SHALL drop every path that is not a string, not a Safe path or has an Ignored directory segment, SHALL sort the rest by UTF-16 code units, remove repeats, and keep the first 500.
5. THE Capped source SHALL read through the wrapped source only paths it listed, at most 200 of them, and SHALL return `undefined` without a read for any other path and for any read beyond the 200th.
6. WHEN a read text is longer than 262144 bytes in UTF-8, or the read resolves to a non-string, or the read rejects, THE Capped source SHALL return `undefined` and count the file as skipped.
7. FOR ANY wrapped File source, THE Scan counts SHALL satisfy `listed <= 500`, `read <= 200`, and `capped` SHALL be true exactly when more than 500 considered paths existed or a read was refused because 200 files had been read (invariant, bound).
8. IF `listFiles` rejects or resolves to a non-array, THEN THE Capped source SHALL behave as an empty listing and the Scan counts SHALL have `performed` false, and the runner SHALL NOT throw.
9. WHEN the Recipe input has no File source, THE Scan counts SHALL be `{ performed: false, listed: 0, read: 0, skipped: 0, capped: false }`.

### Requirement 2: Review sites

**User Story:** As a maintainer, I want every place the migration cannot safely change listed for me, so that I check the stylesheets and scripts by hand before merging.

#### Acceptance Criteria

1. THE Engine SHALL report a `deep-combinator` Review site for every line of a Style file that contains the substring `/deep/`.
2. THE Engine SHALL report a `legacy-render` Review site for every line that contains `.render(` or `.renderSync(` in a Script file whose text contains a node-sass reference, one site per line.
3. THE Engine SHALL report a `node-sass-script` Review site with path `package.json` and line `null` for every Scripts map entry whose command contains `node-sass`, with the script name as excerpt.
4. THE Engine SHALL match by plain substring, SHALL split lines on `\n` and drop one trailing `\r`, and SHALL number lines from 1.
5. THE Engine SHALL list script sites first in script-name code-unit order, then file sites by path in code-unit order and by line.
6. THE Engine SHALL report at most 200 Review sites and, WHEN more exist, SHALL add the note "further review sites were not listed".
7. FOR ANY File source, every Review site path SHALL be `package.json` or a path the Capped source listed, and no Review site path SHALL have an Ignored directory segment (invariant).
8. THE Engine SHALL NOT edit any file in which it finds a Review site; Review sites appear only in the PR body and the review comments.

### Requirement 3: Migration data and version choice

**User Story:** As a maintainer, I want the new `sass` dependency and any raised `sass-loader` to be versions with no known serious advisory, so that the migration does not trade one problem for another.

#### Acceptance Criteria

1. THE Engine SHALL expose `gatherMigrationData(ctx, packageJson)`, which reads the Full packument and OSV for `sass` only WHEN the Package.json view lists `node-sass` and not `sass`, and for `sass-loader` only WHEN the view lists `node-sass` and `sass-loader` and its Effective version is below the sass-loader minimum, and returns a map from those names to Bump data or a Bump failure.
2. THE Engine SHALL evaluate as `sass` candidates the Published versions with no prerelease part, in descending semver order, cut to the first 20, and SHALL choose the first Passing candidate (the newest), because `sass` is a new dependency.
3. THE Engine SHALL evaluate as `sass-loader` candidates the Published versions with no prerelease part that are at or above the sass-loader minimum and above the Effective version, in ascending order, cut to the first 20, and SHALL choose the first Passing candidate (the lowest).
4. THE Effective version of `sass-loader` SHALL be its installed version when that is a valid semver version, otherwise `semver.minVersion` of its usable Declared range, otherwise unknown.
5. THE Engine SHALL send per package at most 1 packument request, at most 10 `querybatch` requests carrying the evaluated candidates, and at most one `/v1/vulns/{id}` request per distinct advisory ID, through the same caches as scoring and `gatherBumpData`.
6. IF a read fails, THEN THE Engine SHALL return a Bump failure with a fixed reason for that package, SHALL NOT reject, and SHALL leave the other package unchanged.
7. WHEN the view lists `node-sass` but not `sass` and the data for `sass` is missing, a failure or has no Passing candidate, or the data for a needed `sass-loader` is missing, a failure or has no Passing candidate, THE Recipe SHALL resolve to a failure with the reason `migration data unavailable: {reason}`, where `{reason}` is the Bump failure reason, `{name} data was not gathered`, or `no safe version of {name} found among {n} evaluated candidate versions`.

### Requirement 4: The node-sass to sass recipe

**User Story:** As a maintainer, I want node-sass replaced by sass in package.json with a working loader, so that my build leaves a dead native package without me editing the manifest.

#### Acceptance Criteria

1. THE Engine SHALL ship `DEFAULT_RECIPE_REGISTRY` with exactly one entry, key `node-sass`, Recipe id `node-sass-to-sass`, `from` `node-sass`, `to` `sass`, and SHALL keep `EMPTY_RECIPE_REGISTRY`.
2. WHEN the Package.json view lists `node-sass`, THE Recipe SHALL emit, in this order: a `remove-dependency` Edit for `node-sass` with the section intake found it in; an `add-dependency` Edit for `sass` in that same section with the caret Styled range of the chosen `sass` version, unless the view already lists `sass`; and a `set-range` Edit for `sass-loader` in its own section with the Styled range (its Range style preserved) of the chosen `sass-loader` version, only WHEN the view lists `sass-loader` and its Effective version is below the sass-loader minimum.
3. WHEN the view does not list `node-sass`, THE Recipe SHALL emit no Edit.
4. WHEN the view lists `sass-loader` with an unknown Effective version, THE Recipe SHALL emit no `sass-loader` Edit and SHALL add the note "sass-loader version could not be read, check that it is 7.2.0 or later".
5. THE Recipe SHALL add the note "sass-loader was raised, check that your webpack version is supported by the new sass-loader" WHEN it raises `sass-loader`, the note "sass-loader unchanged, already Dart Sass compatible" WHEN `sass-loader` is listed at or above the minimum, and nothing about `sass-loader` WHEN it is not listed.
6. WHEN the Recipe input has no File source, or the Capped source could not list, THE Recipe SHALL add the note "stylesheets and scripts were not scanned, search the repository for /deep/ and node-sass render() calls before merging", and SHALL still emit the Edits.
7. THE Recipe SHALL set `filesChanged` to `["package.json"]` when it emits an Edit and to `[]` otherwise.
8. FOR ANY input, every Edit SHALL have `path` `package.json` and `name` `node-sass`, `sass` or `sass-loader`, and SHALL appear in the order of 4.2 (invariant).
9. FOR ANY input that yields Edits, running the Recipe again on the Package.json view with those Edits applied SHALL yield no Edit (idempotence).
10. FOR ANY two runs with deeply equal input, THE Recipe SHALL resolve to deeply equal outcomes, and SHALL NOT reject for any File source behaviour (determinism, rejection).
11. WHEN run on the sample repository `test/fixtures/migration/node-sass-app` with the recorded Migration data, THE Recipe SHALL emit 3 Edits (remove node-sass, add sass, raise sass-loader, all in devDependencies), 4 Review sites (one `deep-combinator`, one `legacy-render` for `.render(`, one for `.renderSync(`, one `node-sass-script`), `filesChanged` `["package.json"]`, and SHALL ignore the file under `node_modules/` (example, checked by hand in `expected-migration.md`).

### Requirement 5: Planner, intent and attachment

**User Story:** As a maintainer, I want the migration to appear as one proposal with a branch, a title and review comments, so that the Executor can open it like any other remediation.

#### Acceptance Criteria

1. THE Engine SHALL expose `runMigrations(report, options, input)`, which runs the Recipe of each Unhealthy package whose planned Kind is `migrate` through the recipe runner and returns a map from package name to Recipe outcome, and SHALL turn a Recipe rejection into the failure reason "migration could not be run".
2. THE Engine SHALL accept in `PlanOptions` the map `migrations` that `runMigrations` returns, and `planRemediation` SHALL use `DEFAULT_RECIPE_REGISTRY` WHEN `options.recipes` is undefined.
3. THE planner SHALL give a Migrate plan the status `unavailable` with the reason "migration was not run" WHEN `migrations` has no entry for the package, the failure reason WHEN the entry is a failure, "branch name too long" WHEN the branch exceeds the limit, and "the recipe proposed no change to package.json" WHEN the result has no Edit.
4. WHEN none of the conditions of 5.3 holds, THE planner SHALL give the Migrate plan the status `proposed`, `edits` equal to the Recipe result's Edits, and `migration` carrying the Recipe id, `from`, `to`, Review sites, `filesChanged`, Scan counts and notes, and no `edit`.
5. THE Engine SHALL return from `buildPrIntent` an intent for a proposed Migrate plan with Edits, with branch `branchName("migrate", packageName)`, title `Sexton: migrate {from} to {to}`, `files` equal to the plan's Edits, and `reviewComments` built from the Review sites; and for a bump or remove intent `reviewComments` SHALL be empty.
6. FOR ANY plan, every Edit in `PrIntent.files` SHALL have `path` `package.json`, `files` SHALL hold at least one Edit and no file text (invariant, security).
7. FOR ANY input, every Review comment path SHALL be `package.json` or a path the File source listed, and every Review comment body SHALL contain the excerpt only inside an inline code span made by `escapeField` (invariant, security).
8. THE Engine SHALL give, in `attachRemediations`, a Migrate entry with an intent the intent title, and SHALL keep the "no change proposed" title only for a Migrate entry without an intent. `RemediationEntry` keeps its shape.

### Requirement 6: PR body migration sections

**User Story:** As a reviewer, I want the PR body to say exactly what changed and what I must still check, so that I can merge the migration with confidence.

#### Acceptance Criteria

1. WHEN the plan is a proposed Migrate plan, THE PR body SHALL render under "Proposed change" one line per Edit: `Remove {name} from {section}.`, `Add {name} {version} to {section} with a caret range.` and `Raise {name} to {version}, range style preserved.`, with every name, version and section through `escapeField`.
2. WHEN the plan is a proposed Migrate plan, THE PR body SHALL add after "Failing policy rules", in this order: a "Files changed" section listing every `filesChanged` path through `escapeField`; a "Review before merging" section listing Review sites as `- {path:line} {rule}: {excerpt}` with `{path:line}` and `{excerpt}` through `escapeField`, at most 20 shown then "and N more" (5 in the reduced body), "none" when there are none and the scan was performed; the Recipe notes, one per line; and the lockfile note.
3. THE PR body SHALL render Recipe notes only from the fixed set of note texts of Requirements 2.6, 4.4, 4.5 and 4.6.
4. FOR ANY File source whose files hold arbitrary lines, including Markdown, HTML and a planted marker, THE PR body SHALL NOT contain any such line outside an `escapeField` code span (invariant, no echo, 1000 runs).
5. THE PR body for a Migrate plan SHALL stay within the 60000-character bound of the remediation spec.

### Requirement 7: Contract, validator and demo

**User Story:** As a user of the demo, I want the node-sass drawer to show the migration and its review list, so that I see what Sexton proposes for a dead native package.

#### Acceptance Criteria

1. THE Engine SHALL add to `PackageJsonEdit` the operation `{ path: "package.json", op: "add-dependency", section, name, range }`, `PrIntent.files` SHALL be a non-empty list of Edits, and `PrIntent` SHALL gain `reviewComments`; the API contract SHALL keep re-exporting these types from the Engine.
2. THE web validator SHALL accept an intent whose `files` and `reviewComments` are lists, and SHALL report an error for an intent without `reviewComments`.
3. THE demo scan generator SHALL plan node-sass with `DEFAULT_RECIPE_REGISTRY`, an InMemoryFileSource built from the sample repository and recorded Migration data, so that the node-sass entry has the title "Sexton: migrate node-sass to sass" and a review list; node-sass SHALL stay Dead.

### Requirement 8: Scripts map

**User Story:** As the recipe, I need the `scripts` of package.json, so that I can flag scripts that call node-sass.

#### Acceptance Criteria

1. THE Engine SHALL expose `readPackageScripts(packageJsonText)`, which returns the Scripts map: own string-valued entries of a plain-object `scripts`, in key order, at most 100, and an empty map for invalid JSON, a missing or non-object `scripts`, and non-string values.
2. FOR ANY text, `readPackageScripts` SHALL NOT throw and SHALL return at most 100 entries (rejection, bound).

### Requirement 9: Corrections to the remediation spec

**User Story:** As a maintainer, I want two gaps the remediation review found closed and its body rules widened for migrations, so that hidden direction marks and advisory floods cannot slip through and a migration can list what to review.

#### Acceptance Criteria

1. THE Engine SHALL make `escapeField` and `cleanLine` also replace U+200E, U+200F and U+061C with a space (remediation Requirement 5.6, corrected).
2. THE Engine SHALL fetch, in `gatherBumpData` and `gatherMigrationData`, details for at most 200 distinct advisory IDs per package, and WHEN a package has more SHALL return the Bump failure "too many advisories" without fetching any detail (remediation Requirements 2.20, 2.21 and 2.22, corrected).
3. WHEN the plan is a proposed Migrate plan, THE PR body MAY render Review site paths, line numbers, script names and excerpts taken from the repository, each only through `escapeField`, after the failing policy rules and before the lockfile note, and SHALL carry the lockfile note (remediation Requirements 5.2, 5.9 and 5.14, amended).
