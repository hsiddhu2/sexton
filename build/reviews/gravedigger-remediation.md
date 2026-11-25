Date: 25 Nov 2026. Agent: gravedigger (.kiro/agents/gravedigger.md, corrected the same day), run once as a one-step subagent workflow (wf_0be26adcf452c627) over packages/engine/src/remediation on branch kiro/depth after merging main a01fcce (merge 718bbed). No code changed. Full output follows, unedited. This replaces the first review of the same day.

# Gravedigger review: packages/engine/src/remediation

**Verdict: unsafe.** D1, D2 and D3 all still stand.

**Coverage limits.** `git status` timed out after 120 s, so I did not confirm the branch (`kiro/depth`) or the merge at 718bbed. I did not open the spec files or `design.md`, so the requirement IDs are the ones in the checklist. I did not read `encoded-name.ts`, `clean-line.ts`, `safe-path.ts`, `pr-context.ts`, `failing-rules.ts`, `recipes.ts`, `unhealthy.ts`, `log-entry.ts`, `in-memory-log.ts`, `remediation-log.ts`, `file-source.ts`, `plan-options.ts` or the rest of `types.ts`. Checklist results for items that depend on them are partial. Cited lines come from grep output and my reading of each file.

## Checklist results

1. **Never downgrade: pass.**
   - `candidates.ts:60` requires a valid installed version.
   - `candidates.ts` skips any candidate that is not `semver.gt` the installed version.
   - `candidates.ts:72` admits a prerelease only when `hasPrereleaseComparator` is true and the version is in range.
   - `isPublishedVersion` rejects build-metadata forms.
   - Requirements 2.2 and 2.3, design decision 1.
2. **Lowest safe candidate: pass.**
   - `orderCandidates` sorts in-range candidates first, then out-of-range, and slices to 20 (`MAX_CANDIDATES`).
   - `isPassing` (`select-bump.ts`) requires not deprecated, an advisories entry, and every severity equal to `"Low"`. `Unknown` and a missing entry both fail.
   - `selectBump` returns the first passing candidate. Otherwise `plan.ts` returns `no-safe-version` with no Edit.
   - `severityFromOsv` yields `Unknown` for anything it cannot read, so unreadable advisories fail.
3. **Range style preserved: pass for registry ranges.**
   - `range-style.ts:15-26` maps exact to exact, tilde to tilde, and everything else to caret.
   - `styledRange` makes the chosen version the lowest match of the styled range.
   - A non-registry specifier is a defect (D1).
4. **Remove only with a complete listing: fail (D3).**
   - `chooseKind` (`choose-kind.ts:15`) removes only when the import-sites value is `=== 0`.
   - `importSitesFor` (`import-sites.ts:18-19`) applies the right guards: listing performed, nothing capped or skipped, `dependencies` origin only.
   - `plan-stage.ts` passes an empty map, so the hosted path never removes.
   - The count itself can be 0 for packages that are used without an import (D3).
5. **Structured edits: pass.**
   - Bump and remove each carry one Edit with `path: "package.json"` and op `set-range` or `remove-dependency` (`plan.ts:63`, `plan.ts:82`).
   - No Edit type has a content field, and `runRecipe` filters recipe Edits to `package.json` (`run-migrations.ts:39`).
   - A migration carries several edits, including `add-dependency`. I read that as the node-sass recipe's design (R-RM-7), not a violation.
6. **Nothing to the default branch: pass.**
   - `branchName` builds `sexton/<kind>-<encoded>` from a validated kind and name, capped at 200 characters. `isValidBranchName` rejects unsafe refs.
   - `pr-intent.ts` sets `baseRef` to `BASE_REF_DEFAULT`, and each intent covers one package.
7. **PR body evidence: fail for migrations (D2).**
   - Twelve rows are built from `SIGNAL_NAMES`, each with source and `fetchedAt`.
   - The body has the Possessed warning, a failing-rules section, the lockfile note for proposed plans and the footer.
   - Interpolated text goes through `escapeField` (`F`).
   - The unescaped `a.severity`, `site.rule`, `v.status` and `r.method` are normalised enums.
   - The declared range never appears: `versionOf(edit.range)` reads an engine-written range.
   - The "Review before merging: none" case is a defect (D2).

## Findings

### Defects

**1. `plan.ts:66-82` with `candidates.ts:48-72` and `range-style.ts:16`. Requirements 2.12, 4.13, 4.14, R-RM-2. Defect (D1).**
- **Input:** `dependencies: { "foo": "file:../foo" }`, or a git URL, an `npm:` alias or `workspace:*`, with a lockfile version like `1.0.0`. The package is Haunted, Dead or Possessed.
- **What happens:** `isUsableRange` is false, so every candidate is out of range and `majorUpgrade` is true. `rangeStyle` falls back to caret. The Edit is `set-range` with `^x.y.z` of the public npm package of the same name.
- **Result:** the repository's local or aliased dependency is replaced by a different public package.
- **Fix:** in `planOne`, return `unavailable` when `intake.declaredRange` is a string and `!isUsableRange(it)`, before calling `selectBump`.

**2. `pr-body.ts:163` (also `pr-body.ts:164`, `run-migrations.ts:37`, `node-sass-recipe.ts:101`). Requirements 5.2 to 5.17, R-RM-6 and R-RM-7. Defect (D2).**
- **Input:** a migration for node-sass in a repository with more than 500 listed files or more than 200 readable files, or with a file that was unreadable or over 256 KiB. Zero review sites were found in the part that was read.
- **What happens:** the Capped source sets `capped: true` or `skipped > 0` in `scan` (`run-migrations.ts:37`). `pr-body.ts:163` checks only `m.scan.performed` and prints `none` under "Review before merging". The recipe adds `NOTE_SITES_TRUNCATED` only for its own 200-site limit.
- **Result:** the PR claims a clean review for an incomplete scan.
- **Fix:** print `none` only when `performed && !capped && skipped === 0`. Otherwise print a fixed "scan incomplete" line from a new `RECIPE_NOTES` entry.

**3. `count-references.ts:16-22` and `:44-60`, `choose-kind.ts:15`, `import-sites.ts:19`. Requirements 1.7, 1.8, 3.2, cli-and-action 2.5 and 2.6, R-RM-3. Defect (D3).**
- **Input:** `@types/node`, or any `@types/*`, or `tslib` (used through `importHelpers`), listed under `dependencies` and Dead, for example a deprecated stub. No source file contains `"@types/node"` in quotes, so the count is 0 and the plan is `remove`.
- **Result:** the removal breaks type-checking or compilation.
- **Fix:** exclude `@types/*` and `tslib` in `importSitesFor` or `countReferences`, so they get no import-sites entry and fall back to bump.
- **Same cause, other inputs:** extensionless rc files (`.babelrc`, `.eslintrc`) are not counted, because `isCountedPath` needs one of `COUNTED_EXTENSIONS`. Unquoted YAML entries are not matched, because `lineReferences` needs a quote. Settings in `package.json`, such as `babel` and `jest` presets, are never counted (`NEVER_COUNTED`). A plugin or preset used only that way reports 0.
- **Fix for that part:** treat any dependency whose name appears anywhere in `package.json` outside its dependency sections as referenced. Also count extensionless rc files.

### Notes

**4. `plan.ts:63`, `apply-edits.ts` (`remove-dependency`). Requirement 4.12. Note.** The `remove-dependency` Edit carries one `section`, but `applyPackageJsonEdits` deletes the name from every dependency section, including `peerDependencies`. `REMOVE_SCOPE_LINE` discloses this. Fix: make the body or the Edit name the sections that list it, or restrict removal to the Edit's section.

**5. `import-sites.ts:19` against `precheck.ts` (`indexIntake`). Requirement cli-and-action 2.5. Note.** `importSitesFor` scans all intake entries. `indexIntake` keeps the first entry per name. If a name appears first in `devDependencies` and later in `dependencies`, the count comes from the later one while the plan uses the first. Fix: build `sites` from the same first-entry-wins index.

**6. `precheck.ts:19`. Requirements 8.2 and 8.4. Note.** `chooseKind` reads `recipes.has(pkg.name)` and `importSites.get(pkg.name)` before `isValidPackageName`. The lookups are harmless map reads, so the plan stays safe. Fix: validate the name first.

**7. `node-sass-recipe.ts:68-72`. Requirement R-RM-7. Note.** An existing `sass` entry, even in another section or at an old version, is left untouched and no sass candidate is checked. Fix: add a note when `sass` is already listed.

## D1 / D2 / D3 status

| ID | Status | Where | Detail |
|---|---|---|---|
| D1 | **Still stands** | `plan.ts:66-82`, `candidates.ts:48-72`, `range-style.ts:16` | An unusable declared range still yields a caret `set-range` of the public package. No guard exists in `planOne`. |
| D2 | **Still stands** | `pr-body.ts:163`, `run-migrations.ts:37`, `node-sass-recipe.ts:101` | The wrapper's `capped` and `skipped` counts reach `plan.migration.scan`, but `migrationSections` ignores them. |
| D3 | **Still stands** | `count-references.ts:16-60`, `choose-kind.ts:15`, `import-sites.ts:19` | There is no `@types/*` or `tslib` exemption anywhere in `packages/engine` or `packages/cli`. The count is imports-only. |

**unsafe**: three defects stand (D1, D2, D3), each with a concrete input that makes a repository worse or hides a missing review.