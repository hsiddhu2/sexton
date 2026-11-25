Date: 25 Nov 2026. Agent: gravedigger (.kiro/agents/gravedigger.md), run once as a one-step subagent workflow (wf_d49f03cc3c96f2c3) over packages/engine/src/remediation on branch kiro/depth at b513514. No code changed. Full output follows, unedited.

# Remediation safety review, `packages/engine/src/remediation`

Branch `kiro/depth`, HEAD b513514. I changed no file. The only commands I ran were `git status` and `git log`. I read all 39 files in the directory plus `intake/names.ts`, `intake/resolve.ts`, `clients/osv.ts`, `severity.ts`, `types.ts`, `cli/src/import-sites.ts`, `cli/src/compose.ts` and `api/src/plan-stage.ts`. I also read remediation requirements 1 to 5 and 8 and its design HP decisions, cli-and-action Requirement 2, hosted-plans, and the node-sass migration requirements.

## Checklist

**1. Never downgrade: pass.**
- `candidates.ts:59` rejects an installed version that is not its own normalised form.
- `candidates.ts:67-69` keeps only published versions where `semver.gt(v, installed)`.
- `candidates.ts:71` drops a prerelease unless `hasPrereleaseComparator(range)` is true and the version is in range. The generated `<X-0` bound is correctly not counted as a prerelease comparator (line 39).
- `gatherOne` and `planOne` use the same `orderCandidates` call, so the data and the choice cannot disagree.

**2. Lowest safe candidate: pass.**
- Candidates are in-range ascending, then out-of-range ascending, cut to 20 (`candidates.ts:76-79`).
- `isPassing` (`select-bump.ts:26-31`) requires not deprecated, an `advisories` entry, and every advisory Low.
- `severityFromOsv` maps anything unparseable to `"Unknown"`, which fails.
- A candidate with no entry fails closed. `version-data.ts:71-79` sets an entry for every candidate, and `queryVulnIdsBatch` throws on any shape error.
- `none` yields `no-safe-version` and no Edit (`plan.ts:75`).
- Limit: a Moderate advisory fails (R-RM-2).

**3. Range style: pass with the finding below.**
- `rangeStyle` returns exact, tilde or caret, and everything else becomes caret.
- `styledRange` writes the chosen version as the lowest match. I checked caret `0.0.x`, tilde, prerelease and `=`/`v` prefixes.
- The declared range is read only to pick a style (`range-style.ts`) and never copied. The finding below is about what happens when the range is not a semver range at all.

**4. Remove only with a complete listing: pass.**
- `chooseKind` (`choose-kind.ts:15`) requires `importSites.get(name) === 0`.
- `importSitesFor` (`cli/import-sites.ts:17-21`) returns nothing unless the listing ran, nothing was capped and nothing was skipped. It also skips non-`dependencies` packages.
- `plan-stage.ts:80` passes an empty map, so a hosted scan never produces `kind: remove`.
- A remove plan makes no upstream request.
- Gaps in what a count of 0 means are in the findings.

**5. Structured edits: pass for bump and remove.**
- The Edit is `{path:"package.json", op, section, name, range?}`. It has no content field and no lockfile.
- `buildPrIntent` makes `files = [plan.edit]` for bump and remove.
- `runRecipe` drops any Edit whose path is not `package.json` (`run-migrations.ts:39`).
- A migrate intent carries 1 to 3 Edits by design, which differs from the "exactly one" wording (see notes).

**6. Nothing to the default branch: pass.**
- `branchName` validates the name and kind, builds `sexton/{kind}-{encodeName}`, and returns null above 200 characters.
- `baseRef` is the constant `"@default"`.
- `attach.ts` and `plan.ts` allow one plan per package, so there is one package per intent.
- I traced the encoding against `isValidBranchName`. `..`, a trailing `.`, `.lock`, `~` and `_` are all escaped, so every produced branch passes.
- `buildPrIntent` does not call `isValidBranchName` at run time. The result is correct by construction. The executor re-checks it (`api/remediate/github-requests.ts:40`).

**7. PR body carries its evidence: pass, with the gap below on migrate.**
- The body has a heading, name and version, state and reason, and the Possessed warning only for Possessed.
- It has ten signal rows from `SIGNAL_NAMES`, each with `signal.source` and `fetchedAt`.
- It has the proposed change, failing rules (capped at 20 plus "and N more"), the lockfile note for a proposed plan, and the footer.
- Every external string goes through `escapeField`: backticks become `'`, `|` is escaped, control and bidi characters become spaces, and it truncates after escaping.
- The declared range never appears. A bump prints only the version and "Range style preserved."
- Worst-case size from the 20-item lists is about 30k, so it stays under 60000 (`pr-body.ts:177-179`).

**Also flagged.**
- Plan, intent and edit code never throws for typed input, and I found no input mutation.
- `isValidPackageName` runs in `precheck` before any URL, cache key, Edit or body.
- The cache key is `versions.join(",")`. No cache key or URL is built from the declared range.

## Defects

**D1. Unusable declared range is overwritten with a registry caret range.**
- File: `range-style.ts:16`, `candidates.ts:48-50`, `plan.ts:82`.
- Requirement: 2.12, 4.13, HP decision 10.
- Input: lockfile-resolved dependency with `"foo": "file:../foo"`, `"git+ssh://…"`, `"npm:@fork/foo@^1.2.0"` or `"workspace:*"`, in state Haunted, Dead or Possessed.
- Result: `isUsableRange` is false, so every candidate is out of range and the style is caret. The plan proposes `set-range` to `^X.Y.Z` of the public registry package called `foo`. The local, git or aliased source is replaced by a public package of the same name.
- Fix: when `declaredRange` is a non-empty string that fails `isResolvableRange`, return an `unavailable` plan with a fixed reason instead of a bump. Update requirement 2.12 and HP decision 10 to match. A dist-tag such as `latest` could be exempted.

**D2. A capped or partial migration scan is reported as "none".**
- File: `pr-body.ts:137`, `node-sass-recipe.ts:35-56`, `run-migrations.ts:36`.
- Requirement: R-RM-6, R-RM-7, migration-node-sass 2.x and 6.x.
- Input: a node-sass repo with more than 200 style and script files, or a stylesheet larger than 256 KiB, containing `/deep/` after the 200-read budget.
- Result: `readRelevant` reads files in path order and the Capped source silently refuses reads after 200. `scan.performed` stays true, so the body prints `Review before merging: none`. The user is told nothing is left to review when sites were never read. Only the not-performed case adds a note.
- Fix: in `migrationSections`, when `m.scan.capped || m.scan.skipped > 0`, print a fixed "scan incomplete" line instead of `none`. Also have `readRelevant` skip files that are not style or script before spending reads.

**D3. A count of 0 does not mean unused for `@types/*` and compiler-helper packages.**
- File: `count-references.ts:6-12`, `choose-kind.ts:15`, `cli/import-sites.ts:19`.
- Requirement: R-RM-3, cli-and-action 2.3 and 2.7.
- Input: `@types/node`, `@types/express` or `tslib` in `dependencies`, state Possessed (maintainer change) or Dead, with an imports-only count of 0.
- Result: types and `importHelpers` are used without an import by name, and dotfile configs such as `.babelrc` and `.eslintrc` are not counted. A remove plan is proposed and the build or typecheck breaks.
- This is spec-compliant and the fixed warning line is present. It still produces a worse repository.
- Fix: never offer a remove (leave `importSites` unset) for names starting with `@types/` or for known implicit-use packages like `tslib`. Add extensionless dotfiles and `.md` to the counted set.

## Notes

- **N1.** `pr-body.ts:15` Major-upgrade line says only "outside the declared range". Requirement 2.12 says the label must also say the range could not be used to confirm compatibility.
- **N2.** `apply-edits.ts:79-92`: `remove-dependency` strips the name from all four sections, including `peerDependencies` and `optionalDependencies`. Requirement 3.1 names only dependencies and devDependencies, and the body's `REMOVE_SCOPE_LINE` says "every dependency section". Intake skips peer and optional entries, so a peer declaration could be removed without ever being counted. Fix: restrict the loop to the two sections in 3.1.
- **N3.** `apply-edits.ts:137-138`: a CRLF `package.json` is rewritten with LF. This gives a whole-file diff.
- **N4.** `buildPrIntent` for migrate returns up to three Edits (remove node-sass, add sass, raise sass-loader), so "exactly one Edit" holds only for bump and remove. The hosted scan can therefore carry a `remove-dependency` Edit inside a migrate plan, although hosted never produces `kind: remove`. Both follow migration-node-sass.
- **N5.** `read-published.ts:30`: only a non-empty string counts as deprecated. A boolean `true` would pass. npm always sends a string, so this is low risk.
- **N6.** `pr-body.ts:134` prints `site.rule` unescaped, and `run-migrations.ts:40-42` does not check it. `filesChanged` (line 130) and `plan.edits` (line 102) are unbounded. This is reachable only through an injected recipe, but the 60000 bound in requirement 5.15 then depends on the recipe.
- **N7.** `candidates.ts:69`: an exact pin such as `"1.2.3"` makes every newer version out of range. A patch bump is therefore labelled Major. This is correct under 2.11 but misleading.
- **N8.** `review-sites.ts:10`: `.vue` and `.less` stylesheets are not scanned for `/deep/`. R-RM-7 says "every stylesheet", and `.vue` is where `/deep/` is most common.
- **N9.** `buildPrIntent` does not re-check `chosenVersion` or `edit.range` as Published versions (8.4). This is safe for plans from `planRemediation` and weaker for plans from elsewhere.

**Verdict: safe with notes.** The downgrade, lowest-safe, range-style, remove-listing, structured-edit, branch and body-escaping guarantees all hold. D1 (overwriting a non-registry range), D2 (a capped scan shown as "none") and D3 (remove for `@types/*` and `tslib`) each let a plan or PR body leave the repository worse or hide a gap.