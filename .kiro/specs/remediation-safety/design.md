# remediation-safety Bugfix Design

## Overview

Three small guards in `packages/engine/src/remediation`, one per defect. No package outside the engine changes, and nothing is added to the engine's public exports.

- D1: `precheck` refuses a bump when the declared range fails `isResolvableRange`. The planner and `bumpTargets` both call `precheck`, so the plan becomes unavailable and no request is made. `selectBump`, `orderCandidates`, `rangeStyle` and `gatherBumpData` do not change.
- D2: `migrationSections` in `pr-body.ts` prints one new fixed line when the scan was capped or skipped a file, and suppresses `none` in that case. Two lines change and one constant is added, all inside `migrationSections` and the constants beside it.
- D3: `chooseKind` skips `remove` for Implicit-use names and falls through to `bump`.

## Glossary

- **Registry range**: a declared range that passes `isResolvableRange` (`semver.validRange` is not null and it is at most `MAX_RANGE_LENGTH` = 256 characters).
- **Non-registry range**: a declared range that fails `isResolvableRange`. It covers `file:`, `link:`, git and URL forms, `github:` shorthand, `npm:` aliases and `workspace:` ranges. It also covers dist-tags such as `latest` and ranges over 256 characters (see Decisions).
- **Complete scan**: a migration scan with `performed` true, `capped` false and `skipped` 0.
- **Incomplete scan**: a scan with `performed` true and either `capped` true or `skipped` > 0.
- **Implicit-use name**: a package name that starts with `@types/`, or is one of `tslib`, `@babel/runtime`, `@swc/helpers`, `core-js`, `regenerator-runtime`.
- **Unfixed code**: kiro/depth at 58b157d.

## Bug Details

Each defect was confirmed with a throwaway script against `packages/engine/dist` built from the unfixed code. No test file was written.

### D1. Non-registry range overwritten by a caret bump

Code path:
- `remediation/plan.ts:64-83` (`planOne`, bump branch) calls `selectBump` with `intake.declaredRange` and writes `edit.range = styledRange(result.style, result.version)` at line 82.
- `remediation/candidates.ts:48-50` (`isUsableRange`) and `:60-62`: for a non-registry range no candidate is in range, but every candidate is kept as out of range.
- `remediation/range-style.ts:16`: a non-registry range gives style `caret`.
- `remediation/precheck.ts:17-26` checks the name, migrate, the intake entry and the branch length, but not the range. `remediation/bump-targets.ts:19-22` therefore returns the package as a target.

Bug condition: `isBugConditionD1(pkg, intake) = unhealthy(pkg) AND chooseKind(pkg.name) = "bump" AND intake exists AND NOT isResolvableRange(intake.declaredRange)`.

Observed, with installed 1.0.0, Haunted, `dependencies`, bump data `published ["1.0.0","1.0.1"]` and no advisories:

| declaredRange | status | edit | majorUpgrade | bumpTargets |
|---|---|---|---|---|
| `file:../foo` | proposed | set-range `^1.0.1` | true | `["foo"]` |
| `link:../foo` | proposed | set-range `^1.0.1` | true | `["foo"]` |
| `git+https://github.com/o/foo.git` | proposed | set-range `^1.0.1` | true | `["foo"]` |
| `github:o/foo` | proposed | set-range `^1.0.1` | true | `["foo"]` |
| `https://example.com/foo-1.0.0.tgz` | proposed | set-range `^1.0.1` | true | `["foo"]` |
| `npm:@fork/foo@^1.2.0` | proposed | set-range `^1.0.1` | true | `["foo"]` |
| `workspace:*` | proposed | set-range `^1.0.1` | true | `["foo"]` |
| `latest` | proposed | set-range `^1.0.1` | true | `["foo"]` |

### D2. Incomplete scan reported as "none"

Code path:
- `remediation/pr-body.ts:163`: `if (m.reviewSites.length === 0 && m.scan.performed) lines.push(NONE_LINE);` reads only `performed`.
- `remediation/capped-source.ts:75` sets `capped` when more than 500 paths are listed. `:101-104` sets it when a read is refused after 200 reads. `:69` and `:88` count `skipped` for an unsafe path, an unreadable file, or a file over 262144 bytes.
- `remediation/run-migrations.ts:36` copies those counts into `plan.migration.scan`, so the body has the data and ignores it.

Bug condition: `isBugConditionD2(plan) = plan.kind = "migrate" AND plan.status = "proposed" AND scan.performed AND (scan.capped OR scan.skipped > 0)`.

Observed (node-sass Dead, `runMigrations` with an `InMemoryFileSource`):
- 201 stylesheets, `/deep/` only in the last: `scan {"performed":true,"listed":201,"read":200,"skipped":0,"capped":true}`, body section `## Review before merging` then `none`.
- One stylesheet over 256 KiB containing `/deep/`: `scan {"performed":true,"listed":1,"read":1,"skipped":1,"capped":false}`, body `## Review before merging` then `none`.

### D3. Remove offered for an Implicit-use name

Code path:
- `remediation/choose-kind.ts:15`: `if (options.importSites?.get(name) === 0) return "remove";` for any name.
- `remediation/count-references.ts:26-32` counts only quoted names and paths in counted files. A `@types/*` package is used by the compiler with no import. `tslib` is imported by code that `tsc` emits with `importHelpers`, not by source.
- `packages/cli/src/import-sites.ts:17-21` already gives no entry to a devDependencies package, so the defect is reachable for these names in `dependencies`.

Bug condition: `isBugConditionD3(pkg, options) = unhealthy(pkg) AND isImplicitUse(pkg.name) AND NOT recipes.has(pkg.name) AND importSites.get(pkg.name) = 0`.

Observed (Possessed, `dependencies`, Import sites 0): `@types/node`, `@types/express`, `tslib` and `@babel/runtime` each give `kind remove, status proposed, edit remove-dependency`.

## Expected Behavior

### Fix checking

- D1: for any input meeting `isBugConditionD1`, the plan is `{ kind: "bump", status: "unavailable", reason: REASON_RANGE_NOT_REGISTRY }` with no `chosenVersion`, no `majorUpgrade` and no `edit`. `bumpTargets` omits it, `buildPrIntent` returns null, and the body says "No change proposed" and the reason.
- D2: for any plan meeting `isBugConditionD2`, the "Review before merging" section contains `INCOMPLETE_SCAN_LINE` once, after any sites and before the notes, and does not contain a line equal to `none`.
- D3: for any input meeting `isBugConditionD3`, the kind is not `remove`. With no Recipe it is `bump`, and the status follows the bump rules.

### Preservation requirements

Everything outside the three bug conditions keeps its current output. Preservation is checked three ways:
1. Every existing test and property in `packages/engine/test`, `packages/cli/test`, `packages/api/test` and `packages/web/test` passes unchanged. The listed Deliberate test changes are the only exceptions, and there are none.
2. New preservation properties P4 to P9 below, written and run on the unfixed code first.
3. The goldens of bugfix 3.10, compared byte for byte.

## Hypothesized Root Cause

- D1: remediation Requirement 2.12 and design decision 10 were written for an absent or unparseable range. They treat it as "cannot confirm compatibility, label it Major", which is right for a registry package with a dist-tag. They never considered that the range names a different source. The planner then writes a registry range over it.
- D2: migration-node-sass added `capped` and `skipped` to the scan counts, but the body only read `performed`, so "performed" was taken to mean "complete".
- D3: R-RM-3 equates "zero import sites" with "unused". That holds for libraries imported by name and fails for packages the toolchain consumes.

## Correctness Properties

Each property is a fast-check property in `packages/engine/test/remediation/remediation-safety.test.ts`. numRuns is 1000, because these are security invariants. The exploration properties come first.

Property 1 (Bug condition D1, exploration). For any Non-registry range from the D1 table, plus `fc.string({ maxLength: 40 })` filtered to fail `isResolvableRange`, plus one 257-character caret range, and any passing bump data, the plan is unavailable with `REASON_RANGE_NOT_REGISTRY`, has no Edit, gives no intent, and the package is not a `bumpTargets` target. Fails on unfixed code.

Property 2 (Bug condition D2, exploration). For any proposed migrate plan built through `runMigrations` from an Incomplete scan, the body's "Review before merging" section has `INCOMPLETE_SCAN_LINE` and no `none` line. Three generators: more than 200 counted files with `/deep/` only past the read cap; one file over 262144 bytes; and one listed path that fails `isSafePath`. Fails on unfixed code.

Property 3 (Bug condition D3, exploration). For any Implicit-use name, any origin, Import sites 0 and no Recipe, the kind is not `remove`. The examples `@types/node`, `@types/express` and `tslib` are written out as their own cases. Fails on unfixed code.

Property 4 (Preservation, never downgrade). For any `arbReportAndOptions`, every proposed bump has `semver.gt(chosenVersion, installedVersion)`.

Property 5 (Preservation, lowest safe candidate). For any `arbSelectInput` whose range is a Registry range, the planner's `chosenVersion` and `majorUpgrade`, or its `no-safe-version` status and evaluated count, equal `selectBump` on the same input.

Property 6 (Preservation, range style for Registry ranges). For any proposed bump whose declared range is a Registry range, `edit.range === styledRange(rangeStyle(range), chosenVersion)`, `semver.validRange(edit.range)` is not null, and `semver.minVersion(edit.range)` is the chosen version.

Property 7 (Preservation, branch names). For any plan from `arbReportAndOptions` with an intent, `intent.branch === branchName(plan.kind, plan.packageName)`, it passes `isValidBranchName`, `baseRef` is `@default`, and branches are pairwise distinct.

Property 8 (Preservation, body escaping and complete scans). For any plan from `arbReportAndOptions` and any `arbHostileHealth`, the body contains no declared range, every signal name in `SIGNAL_NAMES` appears once in the table, and the body is under 60000 code units. For any migrate plan from a Complete scan, the section holds `none` exactly when there is no Review site, and never `INCOMPLETE_SCAN_LINE`. For a scan that was not performed, it holds `NOT_SCANNED_LINE` and not the new line.

Property 9 (Preservation, plans outside the bug conditions). For any `arbReportAndOptions` filtered so that every intake range is a Registry range or the kind is not bump, and no Implicit-use name has Import sites 0, each plan's kind follows the old rule: `migrate` if a Recipe exists, else `remove` if Import sites are 0, else `bump`. Its status is the one the old bump rules give.

P5, P6 and P9 have domains that exclude the bug conditions, so they pass on the unfixed code. P4, P7 and P8 cover the full domain, and they already hold on the unfixed code: D1 makes some plans unavailable, which can only remove bumps; D3 swaps a remove for a bump; and D2 only applies to Incomplete scans, which P8 excludes.

## Fix Implementation

### Changes required

`remediation/precheck.ts`
- Add `export const REASON_RANGE_NOT_REGISTRY = "declared range is not a registry semver range, so a bump would replace its source";`. The text avoids the words name, intake, branch and installed, which Property 6 (no-request arm) in `gather-bump-data.test.ts` forbids in reasons.
- After the intake-entry check and before the branch check: `if (kind === "bump" && !isResolvableRange(intake.declaredRange)) return { ok: false, kind, reason: REASON_RANGE_NOT_REGISTRY };`. Import `isResolvableRange` from `../intake/resolve.js`.
- Update the comment on line 16 to name the new check.

`remediation/plan.ts`: no change. `planOne` already returns `{ ...base, kind: check.kind, status: "unavailable", reason: check.reason }` when `precheck` fails (line 57). `bump-targets.ts`: no change, because it already skips when `!check.ok`.

`remediation/pr-body.ts` (keep the change inside these lines, because another branch edits the signal rows of this file)
- Beside `NOT_SCANNED_LINE` (line 32): `export const INCOMPLETE_SCAN_LINE = "Stylesheets and scripts: scan incomplete, some files were not read. Check them by hand.";`
- In `migrationSections`, replace line 163 with:
  - `const incomplete = m.scan.performed && (m.scan.capped || m.scan.skipped > 0);`
  - `if (m.reviewSites.length === 0 && m.scan.performed && !incomplete) lines.push(NONE_LINE);`
  - `if (incomplete) lines.push(...(shown.length > 0 ? [""] : []), INCOMPLETE_SCAN_LINE);`
- Line 164 (`NOT_SCANNED_LINE`) is unchanged.

`remediation/choose-kind.ts`
- Add `export const IMPLICIT_USE_NAMES: ReadonlySet<string> = new Set(["tslib", "@babel/runtime", "@swc/helpers", "core-js", "regenerator-runtime"]);`, `export const IMPLICIT_USE_PREFIX = "@types/";` and `export function isImplicitUse(name: string): boolean`.
- Line 15 becomes `if (options.importSites?.get(name) === 0 && !isImplicitUse(name)) return "remove";`.
- Update the comment on line 11.

`docs/requirements.md`: one change-log line, `0.9, <date>. R-RM-2: a bump is never proposed over a declared range that is not a registry semver range. R-RM-3: no remove for @types/* or compiler helper runtimes. R-RM-6: a migration body says when its scan was incomplete. Spec remediation-safety.` The requirement texts are not edited.

No change to `packages/cli`: the D3 guard sits in the engine, so the CLI, the hosted scan and any later caller all get it. No change to `index.ts`: none of the new constants is a public export, so `test/index.test.ts` keeps its export list.

### Decisions

1. Dist-tags and over-long ranges count as Non-registry. The prompt names `file:`, `link:`, git, URL, `npm:` and `workspace:`. The guard uses `isResolvableRange`, the predicate the spec already uses to define "usable", rather than a list of prefixes. So `latest`, `next` and a range over 256 characters also become unavailable. Reason: one predicate with no prefix list can't miss a form (`github:`, `gitlab:`, `bitbucket:`, a bare `user/repo`, a tarball URL). A dist-tag rewritten to a caret range also changes what the author declared. The gravedigger review suggested exempting dist-tags; this design does not, and the decision is reversible by adding one condition.
2. The guard applies to bump only (bugfix 3.11). Removing an unused `file:` dependency does not swap its source, and migrate plans have their own edits. Migrate over a Non-registry node-sass is out of scope and recorded as a note.
3. The guard is in `precheck`, not in `selectBump`. `selectBump` stays a pure selector whose unit tests (`select-bump.test.ts:200`, "an unusable range makes every pick a major upgrade") keep passing. Putting the guard in `precheck` also stops the upstream request, through `bumpTargets`.
4. D3 is a fixed name list in the engine, not a CLI change. The prompt allows a CLI change only if D3 needs one; it does not. The list is `@types/*` and five compiler or polyfill runtimes. Each is imported by generated code or consumed by the toolchain, never by source. `tslib` is the one the prompt names; the other four have the same mechanism (`@babel/runtime` and `@swc/helpers` for helper imports, `core-js` and `regenerator-runtime` for injected polyfills).
5. Presets and plugins named only in config files are a note, not part of this fix. They are almost always devDependencies, and the CLI never offers remove for a devDependencies package (cli-and-action 2.5, `import-sites.ts:19`). Config files with a counted extension (`.json`, `.yml`, `.yaml`, `.js`) are already read and match a quoted full name. The remaining gaps are extensionless rc files (`.babelrc`, `.eslintrc`), short preset names (`env` for `@babel/preset-env`) and `package.json` keys such as `babel` and `eslintConfig`. Closing them needs a per-tool name rule in `count-references.ts`, which is a counting change rather than a name guard, and it needs its own requirements and fixtures. Recorded as a note for a later spec.
6. The incomplete line replaces `none` and adds to listed sites. A scan that found sites and then hit the cap still reports the cap. The line is fixed text and interpolates nothing, so escaping is unaffected.
7. `skipped` counts as incomplete even when the skipped path was unsafe (`capped-source.ts:69`). An unsafe path is a file Sexton chose not to read, so the reviewer should be told.
8. The remediation spec's Requirement 2.12 and design decision 10 are superseded here for present Non-registry ranges, and its Requirement 1.8 is narrowed for Implicit-use names. The remediation spec files are not edited, because the allowed paths for this fix do not include them. The supersession is recorded in this spec's Introduction and in the docs/requirements.md change log.

### Notes, not fixed here

- N-a. Config-only presets and plugins (Decision 5).
- N-b. `readRelevant` in `node-sass-recipe.ts` spends reads in path order before filtering to Style and Script files. A large repository therefore hits the read cap sooner than it needs to. After this fix the body says so; making the reads go further is a separate change.
- N-c. Gravedigger notes N1 to N9 of the first review and notes 4 to 7 of the second are not addressed.

## Testing Strategy

### Exploratory bug condition checking

Write Properties 1 to 3 and run them on the unfixed code. Record the shrunk counterexamples in tasks.md. Expected: all three fail. If one passes on the unfixed code, stop and re-check the root cause before writing a fix.

### Fix checking

After each fix, the matching exploration property passes with no edit to the test.

### Preservation checking

Write Properties 4 to 9, run them on the unfixed code, and record that they pass. Run them again after each fix. Run the full engine, cli, api and web suites after each fix. Compare the goldens of bugfix 3.10 with `git diff --exit-code` on those paths.

### Unit tests

- `precheck` returns `REASON_RANGE_NOT_REGISTRY` for each D1 table form, and is unchanged for `^1.0.0`, `~1.2.0`, `1.2.3`, `*`, `""` and `>=1 <3`.
- `chooseKind` gives `bump` for `@types/node`, `tslib`, `@babel/runtime`, `@swc/helpers`, `core-js` and `regenerator-runtime` with Import sites 0. It gives `remove` for `types-node`, `@typesx/a`, `tslib-extra` and `left-pad`. It gives `migrate` for an Implicit-use name that has a Recipe.
- The body for a migrate plan with `{ performed: true, capped: true }` and two sites lists both, then a blank line, then the incomplete line.

### Deliberate test changes

None. No existing test or golden changes its expectation. Three facts behind that:
- `arbPlanName` (`test/remediation/arbitraries.ts:105-108`) never draws an Implicit-use name, so Property 9 "Remove needs import sites" in `plan.test.ts` holds unchanged.
- Property 15 "Edit shape (plan arm)" in `plan.test.ts:86-110` maps an absent range to `latest`, and it returns early for a plan that is not proposed. Its Non-registry draws now return early, so the property still passes; the new Property 1 covers those draws.
- `migration-plan.test.ts:119` expects `none` for a one-file Complete scan, which is unchanged.

If any existing test fails after a fix, stop and report it. Do not edit the test. Decide whether it reveals a fourth bug condition or a wrong fix, and record that before going on.

### Reviews

The last sub-task of every top-level task runs the gravedigger agent (`.kiro/agents/gravedigger.md`) over `packages/engine/src/remediation` and the security-reviewer agent (`.kiro/agents/security-reviewer.md`) over the task's diff, and records both verdict lines in tasks.md. The spec is done only when gravedigger's last line is "safe" or "safe with notes".
