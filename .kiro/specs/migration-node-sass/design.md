# Design Document: migration-node-sass

## Overview

The remediation spec left `migrate` as a placeholder: an empty Recipe registry, a `Recipe { id }` type and a "no change proposed" title. This spec fills it with one recipe, node-sass to sass (R-RM-4, R-RM-7), and the migration half of the PR body (R-RM-6).

The Engine stays pure and never reads a repository itself (remediation decision 4). A recipe sees files only through the File source port. The recipe runner wraps that port in a Capped source, so the caps hold whichever source a caller passes. `planRemediation` stays synchronous: recipes are asynchronous because files are, so the caller runs them first with `runMigrations`, the same way it gathers bump data first with `gatherBumpData`, and passes the outcomes to the planner in `options.migrations`.

Flow for a caller (the demo today, the CLI in 09, the hosted remediate endpoint in 10b):

```
report, intake, scripts ──► gatherMigrationData(ctx, view)       (network, through Transport and Cache)
                        ──► runMigrations(report, options, { packageJson: view, files, data })
                                 └─ per migrate package: capFileSource(files) ─► recipe.run(input)
                        ──► planRemediation(report, { ...options, migrations, bumpData })
                        ──► attachRemediations(report, policy, plans)   (intent, body, review comments)
```

### Research findings that shape the design

1. **sass-loader minimum is 7.2.0.** The sass-loader changelog (https://raw.githubusercontent.com/webpack-contrib/sass-loader/master/CHANGELOG.md) lists under 7.2.0 (2019-08-08): "support auto resolving `dart-sass`". The 7.2.0 source (https://raw.githubusercontent.com/webpack-contrib/sass-loader/v7.2.0/lib/loader.js) resolves the implementation with `options.implementation || getDefaultSassImpl()`, where `getDefaultSassImpl` tries `require.resolve('node-sass')` and, when that fails, `require.resolve('sass')` and loads `sass`. The 7.1.0 source (https://raw.githubusercontent.com/webpack-contrib/sass-loader/v7.1.0/lib/loader.js) uses `options.implementation || require("node-sass")`, so 7.1.0 fails without node-sass unless `implementation` is set. The commit that added the feature (https://github.com/webpack-contrib/sass-loader/commit/ff90dd6) warns that when both packages are installed node-sass wins. The recipe removes node-sass, so 7.2.0 and later load sass. Later releases (9.0.0 "prefer `sass` (`dart-sass`) by default", 17.0.0 "Remove `node-sass` support") only strengthen this.
2. **Edits stay structured.** R-RM-7 says "replace node-sass with sass in package.json". The intent keeps carrying Edits, never file text (remediation decision 12); the Executor applies them. Removing and adding are two Edits, in that order, so an Executor applying them in sequence never has both packages listed.
3. **Review sites are never edited.** `/deep/` has no single correct replacement (`::v-deep`, `:deep()`, `>>>` depend on the framework), and the legacy `render()` API still exists, deprecated, in Dart Sass with different option semantics. Both need a human.

## Architecture

New files, all under `packages/engine/src` unless stated, one exported concept per file:

```
intake/scripts.ts                     readPackageScripts                       pure
remediation/file-source.ts            FileSource type, InMemoryFileSource      no I/O of its own
remediation/safe-path.ts              isSafePath, hasIgnoredSegment            pure
remediation/capped-source.ts          capFileSource, CAPS                      wraps a port
remediation/review-sites.ts           findReviewSites                          pure
remediation/review-comments.ts        reviewComments                           pure
remediation/version-data.ts           gatherVersionData (shared by bump and migration), MAX_ADVISORY_IDS
remediation/migration-candidates.ts   sassCandidates, sassLoaderCandidates, effectiveVersion, SASS_LOADER_MINIMUM   pure
remediation/gather-migration-data.ts  gatherMigrationData                      Transport via ctx
remediation/node-sass-recipe.ts       NODE_SASS_RECIPE                         pure given its input
remediation/recipe-notes.ts           the fixed note texts                     constants
remediation/run-migrations.ts         runRecipe, runMigrations                 async, no I/O of its own
```

Changed files: `types.ts` (Recipe types, Edit op, PrIntent, RemediationPlan), `remediation/recipes.ts` (DEFAULT registry), `choose-kind.ts` (default registry), `plan-options.ts`, `plan.ts`, `pr-intent.ts`, `pr-body.ts`, `attach.ts`, `escape-field.ts` (Requirement 9.1), `gather-bump-data.ts` (now calls `version-data.ts`), `index.ts`, `scripts/record-fixtures.mjs`; `packages/web/src/load/validate-scan-response.ts`; `packages/api/scripts/generate-demo-scan.mjs` and `lib/remediation-routes.mjs`.

Dependency direction: `plan.ts` imports `recipes.ts` and the result types only; it never calls a recipe. `run-migrations.ts` imports `precheck.ts` and `capped-source.ts`. `node-sass-recipe.ts` imports `review-sites.ts`, `migration-candidates.ts`, `select-bump.ts` (`isPassing`) and `range-style.ts`. No module under `remediation/` imports `node:fs`, `fetch` or a GitHub client.

## Components and Interfaces

### types.ts changes (Requirements 4, 5, 7.1)

```ts
export type PackageJsonEdit =
  | { path: "package.json"; op: "set-range"; section: DependencyOrigin; name: string; range: string }
  | { path: "package.json"; op: "remove-dependency"; section: DependencyOrigin; name: string }
  | { path: "package.json"; op: "add-dependency"; section: DependencyOrigin; name: string; range: string };

export const REVIEW_RULES = ["deep-combinator", "legacy-render", "node-sass-script"] as const;
export type ReviewRule = (typeof REVIEW_RULES)[number];
export interface ReviewSite { path: string; line: number | null; rule: ReviewRule; excerpt: string }
export interface ReviewComment { path: string; line: number | null; body: string }
export interface ScanCounts { performed: boolean; listed: number; read: number; skipped: number; capped: boolean }
export interface RecipeResult { edits: PackageJsonEdit[]; reviewSites: ReviewSite[]; filesChanged: string[]; scan: ScanCounts; notes: string[] }
export type RecipeOutcome = { ok: true; result: RecipeResult } | { ok: false; reason: string };
export interface PackageJsonView { packages: readonly IntakePackage[]; scripts: ReadonlyMap<string, string> }
export type MigrationData = ReadonlyMap<string, BumpDataResult>;   // BumpData and BumpFailure move to types.ts
export interface RecipeInput { packageJson: PackageJsonView; files: FileSource | undefined; data: MigrationData }
export interface Recipe { id: string; from: string; to: string; run(input: RecipeInput): Promise<RecipeOutcome> }
export interface MigrationDetail { recipeId: string; from: string; to: string; reviewSites: ReviewSite[]; filesChanged: string[]; scan: ScanCounts; notes: string[] }

RemediationPlan  += edits?: readonly [PackageJsonEdit, ...PackageJsonEdit[]]; migration?: MigrationDetail
PrIntent.files    = readonly [PackageJsonEdit, ...PackageJsonEdit[]]
PrIntent         += reviewComments: readonly ReviewComment[]
```

All fields are `readonly`. `RemediationPlan.edit` stays for bump and remove only; a Migrate plan carries `edits`. `RemediationEntry` is unchanged except through `PrIntent`.

`Recipe.run` resolves to a `RecipeOutcome` rather than the bare `RecipeResult` the handoff sketched, because a data failure is a value, never a throw (steering: missing data is recorded, never thrown).

### intake/scripts.ts (Requirement 8)

`readPackageScripts(text: string): ReadonlyMap<string, string>`. `JSON.parse` with no reviver inside try; plain-object root; own `scripts` property that is a plain object; own keys in order; string values only; stop at 100 entries. Any failure gives an empty map. `IntakeSuccess` is not changed (decision 2).

### remediation/file-source.ts (Requirement 1.1)

```ts
export interface FileSource { listFiles(): Promise<readonly string[]>; readFile(path: string): Promise<string | undefined> }
export class InMemoryFileSource implements FileSource { constructor(files: ReadonlyMap<string, string> | Readonly<Record<string, string>>) }
```

The constructor copies into a private `Map`. `readFile` answers only own entries, so `__proto__` or `constructor` never reach `Object.prototype`.

### remediation/safe-path.ts (Requirements 1.4, 2.7)

`isSafePath(p)`: string, length 1 to 400, no `\`, `neutralise(p) === p` (so no C0, DEL or C1 control, no U+2028 or U+2029, no bidirectional control or direction mark, no lone surrogate), no leading `/`, split on `/` gives no empty, `.` or `..` segment. Review comment paths are copied raw for the Executor, so this filter is what keeps Trojan-source names out of the output. `hasIgnoredSegment(p)`: any segment in `IGNORED_DIRECTORIES = ["node_modules", ".git", "dist", "build", "coverage"]`.

### remediation/capped-source.ts (Requirement 1)

```ts
export const MAX_LISTED = 500, MAX_READ = 200, MAX_FILE_BYTES = 262144;
export function capFileSource(source: FileSource): { source: FileSource; counts(): ScanCounts };
```

`listFiles` lists the wrapped source once (memoised promise), keeps strings that are Safe paths without an Ignored segment, sorts by code units, removes repeats, sets `capped` when more than 500 remain, keeps 500. A rejection or non-array marks the listing failed: `performed` false. `readFile(p)` returns `undefined` for a path not in the kept list, for a repeat read of the same path (answered from the first result, not counted again), and for any read after 200 (sets `capped`). Otherwise it reads, counts `read`, and counts `skipped` and returns `undefined` for a non-string, a rejection, or a text over 262144 UTF-8 bytes (counted by code units without allocating: 1 byte below U+0080, 2 below U+0800, 4 for a surrogate pair, 3 otherwise). Invalid listed paths are counted in `skipped`.

### remediation/review-sites.ts (Requirement 2)

```ts
export const MAX_REVIEW_SITES = 200, EXCERPT_MAX = 120;
export function findReviewSites(files: readonly { path: string; text: string }[], scripts: ReadonlyMap<string, string>): { sites: ReviewSite[]; truncated: boolean };
```

Script sites first (names sorted by code units), then files sorted by path, lines in order. A Style file gives a `deep-combinator` site per line with `/deep/`. A Script file whose text contains a node-sass reference gives a `legacy-render` site per line with `.render(` or `.renderSync(`. Excerpt: `cleanLine(line.trim(), 120)`, or `cleanLine(scriptName, 120)`. Stops at 200, `truncated` true when a 201st site exists. Plain `includes`, no regular expression over contents.

### remediation/review-comments.ts (Requirement 5.5, 5.7)

`reviewComments(sites): ReviewComment[]`, one per site, `path` and `line` copied, body by rule:

- deep-combinator: ``Sexton: this line uses the `/deep/` combinator, which Dart Sass does not support. Replace it by hand, for example with `::v-deep` or `:deep()`. Line: {F(excerpt)}``
- legacy-render: ``Sexton: this file calls the legacy node-sass `render()` API. Check the call against the sass JavaScript API before merging. Line: {F(excerpt)}``
- node-sass-script: ``Sexton: the script {F(excerpt)} runs node-sass, which this branch removes. Change it to the `sass` command line.``

`F` is `escapeField`; everything else is fixed text.

### remediation/version-data.ts (Requirements 3.5, 3.6, 9.2)

The body of the old `gatherOne` of `gather-bump-data.ts`, made generic over the candidate list:

```ts
export const MAX_ADVISORY_IDS = 200;
export async function gatherVersionData(ctx, name, candidatesOf: (published: readonly string[]) => readonly string[]): Promise<BumpDataResult>;
```

It reads the packument, takes `readPublished`, asks `candidatesOf` for the versions to query, sends one `queryVulnIdsBatch` (pagination bounded by `OSV_MAX_PAGES`), fails with "too many advisories" when more than 200 distinct IDs come back, fetches each detail once with concurrency 8, and returns the same `BumpData` shape. Reason texts are the fixed texts of remediation decision 6. `gatherBumpData` keeps its signature and checks and calls this with `orderCandidates`. Its observable behaviour is unchanged for 200 IDs or fewer.

### remediation/migration-candidates.ts (Requirement 3.2 to 3.4)

```ts
export const SASS_LOADER_MINIMUM = "7.2.0";
export function sassCandidates(published): string[];                       // releases, descending, first 20
export function sassLoaderCandidates(published, effective: string): string[]; // releases >= minimum and > effective, ascending, first 20
export function effectiveVersion(pkg: IntakePackage): string | null;
export function sassLoaderNeed(packages): { kind: "absent" } | { kind: "compatible" | "unknown"; pkg } | { kind: "raise"; pkg; effective };
```

Releases are Published versions (`isPublishedVersion`) with no prerelease part, repeats removed, ties broken by code units as in `candidates.ts`.

### remediation/gather-migration-data.ts (Requirement 3.1, 3.5, 3.6)

`gatherMigrationData(ctx, view): Promise<MigrationData>`. Nothing unless the view lists `node-sass`. `sass` with `sassCandidates` only when the view does not list `sass`. `sass-loader` only when `sassLoaderNeed` is `raise`, with `sassLoaderCandidates(published, effective)`. The two run concurrently. Each is wrapped so an unexpected throw becomes "migration data could not be read". Never rejects.

### remediation/recipe-notes.ts (Requirements 2.6, 4.4 to 4.6, 6.3)

```ts
export const NOTE_SITES_TRUNCATED = "further review sites were not listed";
export const NOTE_SASS_LOADER_RAISED = "sass-loader was raised, check that your webpack version is supported by the new sass-loader";
export const NOTE_SASS_LOADER_UNCHANGED = "sass-loader unchanged, already Dart Sass compatible";
export const NOTE_SASS_LOADER_UNKNOWN = "sass-loader version could not be read, check that it is 7.2.0 or later";
export const NOTE_NOT_SCANNED = "stylesheets and scripts were not scanned, search the repository for /deep/ and node-sass render() calls before merging";
export const RECIPE_NOTES: ReadonlySet<string>;
```

`pr-body.ts` renders a note only when `RECIPE_NOTES` has it, so a custom recipe cannot inject Markdown through notes.

### remediation/node-sass-recipe.ts (Requirement 4)

`NODE_SASS_RECIPE: Recipe` with id `node-sass-to-sass`, from `node-sass`, to `sass`. `run(input)`:

1. `nodeSass = view.packages.find(name === "node-sass")`. Absent: ok with no Edits, the sites, the scan.
2. sass: unless the view lists `sass`, take `data.get("sass")`; failure: `migration data unavailable: {reason}`; else the first Passing version of `sassCandidates(published)`; none: `migration data unavailable: no safe version of sass found among {n} evaluated candidate versions`.
3. sass-loader by `sassLoaderNeed`: `raise` takes `data.get("sass-loader")` and the first Passing version of `sassLoaderCandidates`, with the same two failure reasons; the Edit range is `styledRange(rangeStyle(declaredRange), version)`.
4. Files: when `files` is defined, list, keep Style files and Script files, read each (the Capped source enforces the caps), and call `findReviewSites` with the texts read and `view.scripts`. When `files` is undefined only script sites are found.
5. Edits in the order of 4.2; notes in the order: truncated, sass-loader, not scanned.

The scan counts in the result are filled by the runner, not by the recipe.

### remediation/recipes.ts and choose-kind.ts (Requirements 4.1, 5.2)

`DEFAULT_RECIPE_REGISTRY = new Map([["node-sass", NODE_SASS_RECIPE]])`. `chooseKind` defaults to it. `EMPTY_RECIPE_REGISTRY` stays.

### remediation/run-migrations.ts (Requirements 1.3, 1.9, 5.1)

```ts
export async function runRecipe(recipe: Recipe, input: RecipeInput): Promise<RecipeOutcome>;
export async function runMigrations(report, options: PlanOptions, input: RecipeInput): Promise<ReadonlyMap<string, RecipeOutcome>>;
```

`runRecipe` wraps `input.files` with `capFileSource` (a fresh wrapper per run), calls `recipe.run`, and on success replaces `result.scan` with the wrapper's counts (`performed` false when there is no source or the listing failed) and adds `NOTE_NOT_SCANNED` when not performed and absent. A rejection or a malformed outcome becomes `{ ok: false, reason: "migration could not be run" }`. `runMigrations` walks the report like `bumpTargets` (first entry per name, Unhealthy only, `precheck` kind `migrate`) and runs each package's recipe in report order.

### remediation/plan.ts (Requirements 5.2 to 5.4)

The migrate branch: outcome missing gives `migration was not run`; failure gives its reason; `branchName("migrate", name) === null` gives `branch name too long`; no Edit gives `the recipe proposed no change to package.json`; otherwise `proposed` with `edits` and `migration`. Bump and remove are unchanged.

### remediation/pr-intent.ts (Requirements 5.5, 5.6)

`intentTitle` gains `Sexton: migrate {from} to {to}` for a Migrate plan with `migration`. `buildPrIntent` returns an intent for proposed bump and remove with an `edit` (`files: [edit]`, `reviewComments: []`) and for a proposed Migrate plan with `edits` and `migration` (`files: edits`, `reviewComments: reviewComments(sites)`).

### remediation/pr-body.ts (Requirement 6)

```
## Proposed change
**Kind:** `migrate`

Remove `node-sass` from `devDependencies`.
Add `sass` `{sass}` to `devDependencies` with a caret range.
Raise `sass-loader` to `{sass-loader}`, range style preserved.

## Failing policy rules
...
## Files changed                     <- proposed migrate only
- `package.json`

## Review before merging             <- proposed migrate only
- `src/styles/app.scss:3` deep-combinator: `.a /deep/ .b { color: red; }`
- `package.json` node-sass-script: `build:css`
and N more                          <- when more than the limit
none                                <- when no site and the scan was performed
{notes, one per line, from RECIPE_NOTES only}

## Lockfile                          <- proposed bump, remove or migrate
```

The version printed for an add or raise Edit is the range with a leading `^` or `~` removed (the Engine wrote the range itself). The list limit is 20, and 5 in the reduced body, as for the other lists.

### remediation/attach.ts (Requirement 5.8)

No code change is needed beyond what `buildPrIntent` returns: an entry with an intent already takes its title. The summary of a proposed Migrate plan becomes `Migrate {from} to {to}`.

### escape-field.ts (Requirement 9.1)

`UNSAFE` gains `‎‏؜`. `cleanLine` shares `neutralise`, so it follows.

### Web and API (Requirement 7)

`validate-scan-response.ts` checks `reviewComments` as a required list on an intent. The contract keeps re-exporting the Engine types and adds `ReviewComment`. The demo generator builds a Package.json view from the demo intake list and the sample repository's scripts, an InMemoryFileSource from the sample repository files, gathers Migration data through the remediation transport, which now also answers from `test/fixtures/migration/packages`, and calls `runMigrations` before `planRemediation`.

## Data Models

Migrate plan for the sample repository (versions are the recorded ones, see `test/fixtures/migration/expected-migration.md`):

```json
{
  "packageName": "node-sass", "installedVersion": "7.0.3", "state": "Dead", "kind": "migrate", "status": "proposed",
  "edits": [
    { "path": "package.json", "op": "remove-dependency", "section": "devDependencies", "name": "node-sass" },
    { "path": "package.json", "op": "add-dependency", "section": "devDependencies", "name": "sass", "range": "^{sass}" },
    { "path": "package.json", "op": "set-range", "section": "devDependencies", "name": "sass-loader", "range": "^{sass-loader}" }
  ],
  "migration": { "recipeId": "node-sass-to-sass", "from": "node-sass", "to": "sass", "filesChanged": ["package.json"],
    "reviewSites": [4 sites], "scan": { "performed": true, "listed": 4, "read": 3, "skipped": 0, "capped": false }, "notes": [...] }
}
```

Fixtures:

- `test/fixtures/migration/packages/{sass,sass-loader}/`: packument (all versions, deprecation markers), `osv-by-version.json` for every release, `vulns/`. Recorded with `node scripts/record-fixtures.mjs --migration`. Kept apart from `test/fixtures/remediation/packages` so the remediation fixture test, which lists that directory, is unchanged.
- `test/fixtures/migration/node-sass-app/`: the sample repository of handoff decision 14.

## Error Handling

| Situation | Result |
|---|---|
| `listFiles` rejects or is not an array | scan `performed` false, note "not scanned", Edits still proposed |
| a read rejects, is not a string, or is too large | file skipped and counted, no site from it |
| more than 500 paths, more than 200 readable files | first 500 by code-unit order, first 200 read, `capped` true |
| unsafe or ignored path | never read, never in a site |
| packument, querybatch or detail fails | Bump failure with fixed reason; Migrate plan `unavailable`, `migration data unavailable: {reason}` |
| more than 200 advisory IDs | Bump failure "too many advisories" |
| no safe sass or sass-loader | `unavailable`, `migration data unavailable: no safe version of {name} found among {n} evaluated candidate versions` |
| recipe throws | `unavailable`, "migration could not be run" |
| `runMigrations` not called | `unavailable`, "migration was not run" |
| node-sass not in the view | `unavailable`, "the recipe proposed no change to package.json" |

Nothing in this module throws for well-typed input. No error message from a source, a Transport or a recipe is copied into a reason.

## Security

- File contents and paths are attacker-controlled. Paths are filtered to Safe paths before any read and before reaching a Review comment, so an Executor never posts a comment on `../x` or an absolute path. Contents reach output only as excerpts through `cleanLine` (storage) and `escapeField` (Markdown).
- Edits only ever name `package.json` and the three package names; the range is built by `styledRange` from a Published version, never from repository text.
- Caps bound memory and requests whatever the source.
- Notes are rendered only from the fixed set.

## Dependencies

None added. `semver` 7.8.6 is already present.

## Testing Strategy

Vitest and fast-check 3.23.1, `numRuns` 100, 1000 for the security properties (23, 24, 25, 26, 27). Arbitraries in `test/remediation/migration-arbitraries.ts`: `arbPath` (safe and unsafe paths, ignored segments, `__proto__`, long, control characters), `arbFileSet` (0 to 700 paths with Style and Script files, texts holding `/deep/`, node-sass references, `.render(` lines, hostile lines from `arbHostileString`, a few over 256 KiB), `arbFlakySource` (listing or reads that reject or return non-strings), `arbView` (node-sass, sass, sass-loader present or absent in either section with installed versions around 7.2.0 and unresolved, ranges of every style), `arbMigrationData` (Bump data or failure for sass and sass-loader from `arbSelectInput`-like versions).

Example tests: InMemoryFileSource, `readPackageScripts`, each review rule, each note, each unavailable reason, the PR body sections, the recorded sample repository against `expected-migration.md`, a `gatherMigrationData` request count against the recorded transport, the escape correction, the 201-ID failure.

Remediation tests updated (not deleted): `plan.test.ts` example "a recipe gives migrate" now passes a migration outcome; the fixture test passes `EMPTY_RECIPE_REGISTRY`; `arbitraries.ts` builds full Recipe stubs; property 16 accepts migrate intents and `files` of one or more; property 11 adds the three marks; the bound test adds the ID cap.

## Correctness Properties

Each property is one test tagged `Feature: migration-node-sass, Property {n}: {title}`. Numbering continues from the remediation spec's twenty.

### Property 21: Recipe idempotence

For any view with node-sass and any Migration data that yields Edits, applying the Edits to the view (remove drops the name, add inserts it with its range and the installed version of the chosen version, set-range changes the range and installed version) and running the Recipe again yields no Edit.

**Validates: Requirement 4.9**

### Property 22: Edit names and order

For any view and data, every Edit has path `package.json`, a name among node-sass, sass and sass-loader, ops in the order remove, add, set-range, at most one of each, and the add and remove share a section.

**Validates: Requirements 4.2, 4.3, 4.8**

### Property 23: Review sites come only from listed, non-ignored files (1000 runs)

For any file set and scripts, every Review site path is `package.json` or a path the Capped source listed, never has an Ignored segment, is a Safe path, and every file site's line is between 1 and the number of lines of that file.

**Validates: Requirements 1.4, 2.7**

### Property 24: Caps hold for any file set (1000 runs)

For any file set and any flaky source, the wrapped source is listed at most once, read at most 200 times and never for an unlisted path; `listed <= 500`, `read <= 200`, sites at most 200, no text over 262144 UTF-8 bytes reaches the recipe, and `capped` is true exactly when more than 500 considered paths existed or a read was refused after 200 reads (a file over the size limit is counted as skipped, not capped).

**Validates: Requirements 1.4 to 1.8, 2.6**

### Property 25: Only package.json is ever edited (1000 runs)

For any report, options and Recipe outcomes, every intent's `files` is non-empty, every Edit has path `package.json`, no Edit has a key other than path, op, section, name and range, and bump and remove intents have empty `reviewComments`.

**Validates: Requirement 5.6**

### Property 26: No unescaped file line in the body (1000 runs)

For any file set whose lines carry a planted marker with Markdown, HTML, pipes, backticks and newlines, the PR body of the Migrate plan contains no planted line outside a code span: removing every `escapeField` span from the body leaves no marker.

**Validates: Requirements 6.4, 2.8**

### Property 27: Review comment paths and bodies (1000 runs)

For any file set, every Review comment path is `package.json` or a listed path, and removing every code span from a comment body leaves one of the three fixed templates.

**Validates: Requirement 5.7**

### Property 28: Version choice

For any published list, deprecations and advisories, the chosen sass is the newest Passing release among the first 20 releases in descending order, and the chosen sass-loader is the lowest Passing release at or above 7.2.0 and above the Effective version among its first 20; a chosen version is never a prerelease and never deprecated.

**Validates: Requirements 3.2 to 3.4**

### Property 29: Migration data bound and isolation

For any Transport behaviour, `gatherMigrationData` never rejects, sends at most 1 packument, 10 querybatch and 200 detail requests per package, sends nothing for sass-loader unless a raise is needed, and a failure for one package leaves the other's data equal to a run where it succeeded.

**Validates: Requirements 3.1, 3.5, 3.6, 9.2**

## Requirement Traceability

| Criterion | Covered by |
|---|---|
| 1.1, 1.9 | examples |
| 1.2 | review constraint, plus a test that greps `src/remediation` for `node:fs` and `fetch(` |
| 1.3 to 1.8 | properties 23, 24 |
| 2.1 to 2.5 | examples, sample repository |
| 2.6, 2.7 | properties 23, 24 |
| 2.8 | properties 25, 26 |
| 3.1, 3.5, 3.6 | property 29, recorded request count |
| 3.2 to 3.4 | property 28 |
| 3.7 | examples |
| 4.1 | example |
| 4.2, 4.3, 4.8 | property 22 |
| 4.4 to 4.7 | examples |
| 4.9 | property 21 |
| 4.11 | sample repository test |
| 4.10 | determinism example inside property 22 |
| 5.1 to 5.4 | examples, remediation property 1 and 17 |
| 5.5, 5.6 | property 25, remediation property 16 |
| 5.7 | property 27 |
| 5.8 | remediation property 18 |
| 6.1 to 6.3, 6.5 | examples |
| 6.4 | property 26 |
| 7.1 | api type tests |
| 7.2 | web validator tests, remediation property 20 |
| 7.3 | demo generator test |
| 8.1, 8.2 | examples and a small property |
| 9.1 | remediation property 11 |
| 9.2 | example, property 29 |
| 9.3 | property 26, body examples |

## Decisions made during implementation

Each is the choice that keeps the smallest surface.

1. **The planner stays synchronous.** Recipes are asynchronous because File sources are, so `runMigrations` runs them before planning and `planRemediation` reads `options.migrations`, as it reads `options.bumpData`. `Recipe.run` resolves to a `RecipeOutcome` union so a data failure is a value.
2. **The Scripts map comes from `readPackageScripts`, not from `IntakeSuccess`.** Adding a field to the intake result would change the intake fixtures and the manifest tests that compare whole results. A pure reader over the `package.json` text the caller already holds gives the recipe the same map and leaves every intake test unchanged.
3. **Ignored directories match any path segment**, so a nested `packages/a/node_modules/x.scss` is ignored too.
4. **Unsafe paths are dropped before any read** and counted as skipped.
5. **`sass` already listed means no add Edit**, and **node-sass not listed means no Edit at all** (plan unavailable, "the recipe proposed no change to package.json"). Both are needed for idempotence.
6. **Effective sass-loader version** is the installed version, else the lowest version of its declared range, else unknown; unknown gives no sass-loader Edit and a fixed note, so the recipe never risks a downgrade.
7. **sass candidates are the newest 20 releases** (descending) and sass-loader candidates the lowest 20 releases at or above 7.2.0 and above the Effective version; both use the remediation Passing rule.
8. **`version-data.ts` is extracted from `gather-bump-data.ts`** so the bump and migration fetches share one bounded implementation, including the 200-ID cap.
9. **Migration fixtures live in `test/fixtures/migration/packages`**, apart from the remediation fixtures, so the remediation fixture test is unchanged. The demo transport looks in both.
10. **The demo Package.json view** is the demo intake list (node-sass as `^7.0.3` in dependencies) plus the scripts of the sample repository; its File source is the sample repository. The demo has no sass-loader, so its body says nothing about sass-loader.
11. **Script sites are listed before file sites**, both in code-unit order, so the order is total and stable.
12. **The body prints the chosen version, not the range**, for add and raise Edits, matching remediation Requirement 5.5.
13. **No safe sass or sass-loader gives status `unavailable`, not `no-safe-version`.** `no-safe-version` is defined in the remediation spec for a bump of the package itself; here the package (node-sass) is not bumped, the migration cannot be built, so the plan reuses `unavailable` with the reason `migration data unavailable: no safe version of {name} found among {n} evaluated candidate versions`. Missing data gives `migration data unavailable: {name} data was not gathered`.
14. **The recorder flag is `--migration`, not an extension of `--remediation`.** Re-running `--remediation` would re-record the seven remediation packages and could move their hand-checked expected plans; a separate flag records only sass and sass-loader.
15. **Excerpts are stored as plain text through `cleanLine` (one line, at most 120 code points) and escaped with `escapeField` wherever Markdown is written** (PR body, review comment bodies). Storing them already wrapped in a code span would double-escape them in the body. `reviewSites` lives in the plan, not in `RemediationEntry`.
16. **`gatherMigrationData` asks for nothing when node-sass is not listed and skips sass when sass is already listed**, so no request is spent on data the recipe will not read.
17. **Remediation Requirements 5.2, 5.9 and 5.14 are amended** (Requirement 9.3) because the migrate body must render repository paths and excerpts (R-RM-6) and needs the lockfile note; the amendment is recorded in the Correction section of the remediation design.
