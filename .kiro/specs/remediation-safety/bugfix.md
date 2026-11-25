# Bugfix Requirements Document

## Introduction

The gravedigger review of 25 Nov 2026 (`build/reviews/gravedigger-remediation.md`, run over `packages/engine/src/remediation` on kiro/depth after main a01fcce was merged at 718bbed) ended "unsafe" with three defects. In each one a remediation plan or its pull request body can leave a repository worse than it was. Each defect was reproduced on the built engine at 58b157d before this document was written. The inputs and outputs are in design.md under "Bug Details".

- D1. A dependency whose declared range is not a registry semver range gets a bump plan. The plan overwrites the range with a caret range of the public npm package of the same name. Forms affected: `file:`, `link:`, git and URL forms, `npm:` aliases and `workspace:`. A local, forked or workspace package is silently swapped for whatever the public registry holds under that name.
- D2. A node-sass migration whose file scan was capped, or that skipped a file, prints `none` under "Review before merging". The reviewer is told nothing needs checking, but some stylesheets or scripts were never read.
- D4 (added 25 Nov 2026, found by the gravedigger review of task 1). The node-sass migration has the D1 overwrite for `sass-loader`. When it is listed below 7.2.0 with a non-registry range, the recipe raises it with a registry range.
- D3. A remove is offered for a package that code uses without importing it by name. `@types/*` packages are used by the compiler. Compiler helper runtimes such as `tslib` are imported by generated code, not by source. Removing them breaks the typecheck or the build.

This spec implements R-RM-1, R-RM-2, R-RM-3 and R-RM-6 of docs/requirements.md as corrected here. For a present declared range that fails `isResolvableRange`, it supersedes remediation Requirement 2.12 and that spec's design decision 10: the plan is now unavailable, not a Major upgrade bump. It narrows remediation Requirement 1.8 and cli-and-action Requirement 2 so that no remove is offered for the Implicit-use names. It adds to migration-node-sass the rule that an incomplete scan is said so in the body. The remediation, migration-node-sass and cli-and-action spec files are not edited. docs/requirements.md gets one change-log line. No dependency is added.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN an unhealthy package's planned kind is bump, its IntakePackage `declaredRange` fails `isResolvableRange` (for example `file:../foo`, `link:../foo`, `git+https://github.com/o/foo.git`, `github:o/foo`, `https://example.com/foo-1.0.0.tgz`, `npm:@fork/foo@^1.2.0`, `workspace:*`), and Bump data has a passing candidate THEN the system returns a plan with status `proposed`, `majorUpgrade` true and an Edit `{ op: "set-range", range: "^<chosen>" }`, which replaces the declared source with the public registry package.
1.2 WHEN the same package is passed to `bumpTargets` THEN the system returns it as a target, so `gatherBumpData` fetches the public packument and OSV for a package that is not from the registry.
1.3 WHEN a proposed migrate plan's scan was performed but capped (a read was refused after `MAX_READ` = 200 files were read, or more than `MAX_LISTED` = 500 paths were listed) or skipped a file (unsafe path, unreadable file, or a file over `MAX_FILE_BYTES` = 262144), and no Review site was found among the files read THEN the system prints `none` under "## Review before merging".
1.4 WHEN the scan was capped or skipped a file and Review sites were found THEN the system lists them and says nothing about the files that were not read.
1.5 WHEN an unhealthy package named `@types/<anything>`, or `tslib`, has an Import sites value of exactly 0 and no Recipe THEN the system chooses kind `remove` and proposes a `remove-dependency` Edit.
1.6 (D4, found by the task 1 gravedigger review) WHEN a node-sass migration runs and `sass-loader` is listed with a valid installed version below 7.2.0 and a declared range that fails `isResolvableRange` (for example `file:../loader` or `github:o/sass-loader`) THEN `sassLoaderNeed` returns `raise`, `gatherMigrationData` fetches the public sass-loader, and the recipe emits a `set-range` Edit with a registry range over the non-registry source.

### Expected Behavior (Correct)

2.1 WHEN an unhealthy package's planned kind is bump and its IntakePackage `declaredRange` fails `isResolvableRange` THEN the system SHALL return a plan with kind `bump`, status `unavailable`, the fixed reason `REASON_RANGE_NOT_REGISTRY` ("declared range is not a registry semver range, so a bump would replace its source"), no `chosenVersion`, no `majorUpgrade` and no Edit.
2.2 WHEN such a package is passed to `bumpTargets` THEN the system SHALL NOT return it as a target, so no upstream request is made for it.
2.3 WHEN such a plan is passed to `buildPrIntent` THEN the system SHALL return no intent, and `buildPrBody` SHALL render "No change proposed" with the fixed reason.
2.4 WHEN a proposed migrate plan's scan was performed and `scan.capped` is true or `scan.skipped` is greater than 0 THEN the system SHALL print the fixed line `INCOMPLETE_SCAN_LINE` ("Stylesheets and scripts: scan incomplete, some files were not read. Check them by hand.") under "## Review before merging", after any listed sites, and SHALL NOT print the `none` line.
2.5 WHEN an unhealthy package is an Implicit-use name (a name that starts with `@types/`, or one of `tslib`, `@babel/runtime`, `@swc/helpers`, `core-js`, `regenerator-runtime`) THEN the system SHALL NOT choose kind `remove` for it, whatever its Import sites value, and SHALL choose by the remaining rules (`migrate` if a Recipe exists, else `bump`).
2.6 WHEN docs/requirements.md is read THEN its change log SHALL carry one line for this spec naming R-RM-2, R-RM-3 and R-RM-6.
2.7 WHEN a node-sass migration runs and `sass-loader` is listed with a declared range that fails `isResolvableRange` THEN `sassLoaderNeed` SHALL return `unknown`, so the recipe emits no sass-loader Edit, adds the existing note `NOTE_SASS_LOADER_UNKNOWN`, and `gatherMigrationData` makes no sass-loader request.

### Unchanged Behavior (Regression Prevention)

3.1 WHEN any bump is proposed THEN the system SHALL CONTINUE TO choose a version strictly greater than the installed version, so a downgrade is never proposed.
3.2 WHEN the declared range passes `isResolvableRange` THEN the system SHALL CONTINUE TO choose the first passing candidate in Candidate order, with at most 20 evaluated, in range first, with the same `majorUpgrade` label.
3.3 WHEN the declared range passes `isResolvableRange` THEN the system SHALL CONTINUE TO write the Styled range of the chosen version in the declared Range style (exact, tilde, caret, every other form caret), whose lowest match is the chosen version.
3.4 WHEN any intent is built THEN the system SHALL CONTINUE TO name the branch `sexton/<kind>-<encoded name>`, valid under `isValidBranchName`, injective, with `baseRef` `@default`, one package per intent.
3.5 WHEN any body is built THEN the system SHALL CONTINUE TO pass every interpolated string through `escapeField`, never echo the declared range, render one row per name in `SIGNAL_NAMES` (twelve), and stay under 60000 UTF-16 code units.
3.6 WHEN a migrate scan was performed with `capped` false and `skipped` 0 THEN the system SHALL CONTINUE TO print `none` when no Review site was found, and the sites otherwise, with no new line.
3.7 WHEN a migrate scan was not performed THEN the system SHALL CONTINUE TO print `NOT_SCANNED_LINE` and not the new line.
3.8 WHEN a package is not an Implicit-use name THEN the system SHALL CONTINUE TO choose `remove` if and only if it has no Recipe and an Import sites value of exactly 0.
3.9 WHEN the declared range is usable and the name is not an Implicit-use name THEN the system SHALL CONTINUE TO return the same plan, intent and body as before this spec.
3.10 WHEN the committed goldens are regenerated or compared THEN they SHALL CONTINUE TO match byte for byte: `test/fixtures/remediation/expected-plans.json`, `test/fixtures/migration/expected-migration.md` (checked by `migration-fixtures.test.ts`), `test/fixtures/evidence/expected-pack.json` and `expected-report.md` (checked by `evidence/golden.test.ts`), and `packages/web/public/replay/axios.json` and `keyv.json`. None meets a bug condition: the recorded plans use `^<installed>` ranges and no Implicit-use name, and the migration golden's scan is `{ performed: true, listed: 4, read: 3, skipped: 0, capped: false }`.
3.11 WHEN a package's planned kind is not bump THEN the planner's declared-range guard SHALL NOT apply, so a remove of an unused `file:` dependency and the node-sass and sass edits of a migrate plan are unchanged. Only the sass-loader raise of 2.7 changes.
3.12 WHEN `sass-loader` has a declared range that passes `isResolvableRange` THEN `sassLoaderNeed` SHALL CONTINUE TO return `absent`, `compatible`, `unknown` or `raise` exactly as before.
