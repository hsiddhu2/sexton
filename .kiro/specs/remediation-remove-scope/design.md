# Design Document: remediation-remove-scope

## Overview

Two narrow fixes, both on the remove remediation, and a decision on six review notes.

1. `applyOne` in `packages/engine/src/remediation/apply-edits.ts` loops over `REMOVE_SECTIONS = ["dependencies", "devDependencies"]` for a `remove-dependency` Edit instead of `DEPENDENCY_SECTIONS`. `DEPENDENCY_SECTIONS` stays as it is: `withSection` uses it to place a new section, which `add-dependency` needs. (bugfix 2.1, 2.2, 2.3)
2. The engine exports `UNREAD_SOURCE_DIRECTORIES = ["build", "dist", "coverage"]` and a pure `isUnreadSourcePath(path)` from `remediation/count-references.ts`. The CLI uses them in two places:
   - `compose.ts` `importSites` counts the listed paths for which `isUnreadSourcePath` is true and adds that count to `skipped`. (bugfix 2.4)
   - `working-tree.ts` `walk` counts each directory it skips whose name is in `UNREAD_SOURCE_DIRECTORIES`, and `counts()` returns the total as a new `unread` field of `TreeCounts`. `importSites` adds `unread` to `skipped`. The existing `skipped` field is unchanged, so the node-sass migration, which reads `skipped` for its scan-incomplete flag, does not change. (bugfix 2.5, 3.5)

`importSitesFor` already returns no entry when `skipped !== 0`, so no other code changes.

## Glossary

- **Unread source path**: a listed path with a `build`, `dist` or `coverage` segment, no `node_modules` or `.git` segment, an extension in `COUNTED_EXTENSIONS` and a base name other than `package.json`, `package-lock.json` and `npm-shrinkwrap.json`. These are the files `isCountedPath` drops only because of the directory.

## Decisions

1. **Remove scope is the two intake sections.** HP decision 7 names `dependencies` and `devDependencies`. Intake reads only those two, and the import count covers only `dependencies`, so nothing supports touching `optionalDependencies` or `peerDependencies`. A peer declaration is part of a library's public contract.
2. **The PR body line says what the code does (owner decision, 27 Nov 2026).** `REMOVE_SCOPE_LINE` was "The edit removes it from every dependency section of package.json that lists it." It is now "The edit removes it from dependencies and devDependencies in package.json." The first version of this design kept the old line, reading "dependency section" as the two intake sections; the owner chose the plain wording. The line appears in every PR body with a remove-dependency Edit, which today means remove plans and node-sass migrate plans. The demo scan's node-sass plan carries it, so the demo scan is regenerated; the demo evidence pack does not carry PR bodies, so its digest does not change.
3. **Skipping a build folder blocks remove; it does not read the folder.** Reading `build/`, `dist/` and `coverage/` would count generated bundles that inline every dependency, so a used package could look used for the wrong reason and an unused one could look used. The safe reading is that Sexton did not look, so it must not remove. A repository that tracks a hand-written `build/webpack.config.js` loses remove proposals; the bump and migrate plans are unaffected.
4. **Only build, dist and coverage count.** `node_modules` and `.git` are not project source, and skipping them is part of a complete listing. Counting them as skipped would end remove proposals for every repository.
5. **A new `unread` field, not a larger `skipped`.** `TreeCounts.skipped` also feeds the migration scan's incomplete flag. A separate field keeps the migration's output unchanged (bugfix 3.5).

## Deliberate test changes

- `packages/cli/test/ports.test.ts`: the two `counts()` assertions of the existing working-tree tests gain `unread: 0`, because `TreeCounts` has the new field.
- `packages/cli/test/support.ts`: the fake working tree returns `unread: 0`.
- `packages/api/test/fresh-clone.test.ts`: `packages/cli/test/ports.test.ts` joins to the allowlist, because the new walk test makes folders named `build`, `dist` and `coverage` inside its own temporary directory, which the static check reads as a generated path.
- `packages/engine/test/remediation/migration-plan.test.ts` quotes the new `REMOVE_SCOPE_LINE`, and the apply-edits test "removes a name from every dependency section" is renamed "removes a name from dependencies and devDependencies" (owner decision of 27 Nov 2026).
- No existing assertion about a remove Edit changes: the existing apply-edits test uses `dependencies` and `devDependencies` only.

## The Power's Bundle

`powers/sexton/server/sexton-mcp.mjs` contains the Engine and the CLI composition, so it is rebuilt with this change and its freshness test stays green. The new SHA-256 is recorded in the commit that carries the fix. The MCP tools never propose a remove of their own: they show the CLI's plans, so the fix reaches them through the rebuilt Bundle.

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

fast-check 3.23.1, `numRuns` 100.

### Property 1: A remove touches only dependencies and devDependencies

For any `package.json` object whose four dependency sections each are absent, an object, or a non-object value, and any name: applying a `remove-dependency` Edit for the name either returns `name-absent` (exactly when neither `dependencies` nor `devDependencies` is an object that lists the name) or returns a document in which `optionalDependencies`, `peerDependencies` and every member other than `dependencies` and `devDependencies` are deep-equal to the input, the name is in neither `dependencies` nor `devDependencies`, and every other key of those two keeps its value and order.

**Validates: bugfix 1.1, 1.2, 2.1, 2.2, 2.3, 3.1**

### Property 2: An unread source path blocks remove

For any listing that holds at least one Unread source path, the CLI's `importSites` is empty, so no remove is proposed; and for any listing whose only uncounted paths are under `node_modules` or `.git`, `importSites` is computed as before.

**Validates: bugfix 1.3, 2.4, 3.3**

### Property 3: isUnreadSourcePath is the gap of isCountedPath

For any path, `isUnreadSourcePath(path)` is true exactly when `isCountedPath(path)` is false, the path has a `build`, `dist` or `coverage` segment, and the same path with those segments removed would satisfy `isCountedPath`.

**Validates: bugfix 2.4**

## Testing Strategy

- Exploration tests first, run on the unfixed code and seen to fail: the peer and optional sections in `apply-edits.test.ts`, `build/webpack.config.js` in the CLI scan test, and the walked `build/` folder in a real temporary directory.
- Preservation tests, passing before and after: remove from `dependencies` and `devDependencies` (existing test and Property 1's positive half), the existing remove proposal for `left-pad` with only `src/` files, the same with `node_modules/` and `.git/` paths in the listing, and the node-sass migration output unchanged.
- The root gates, `npm run scan:self`, and the existing demo, golden pack and replay tests, which must pass unchanged.

## The other six notes of the review run

The same run reported seven notes. Note 2 (build, dist, coverage) is defect 2 above. For the other six, the rule was: fix only a one-line safe change with a test; otherwise record why it is accepted.

1. **Checklist item 5 says exactly one Edit, but a migrate intent has several, including `add-dependency`.** Accepted, no code change. The code follows migration-node-sass Requirement 7.1, which amended remediation 4.12 for migrate intents. The gap is in the gravedigger agent's checklist wording, not in the code. Changing the checklist changes a review agent's instructions, which is outside this bugfix.
2. (Defect 2 above.)
3. **`severity`, `method` and `rule` are put into the PR body without `escapeField`.** Accepted. `escapeField` wraps its value in a code span, so the fix changes every PR body that shows an advisory, a publisher or a review site, the golden pack and the demo digest: not a one-line safe change. The values are closed enums at their source: `normaliseSeverity`, `publishRecord` and `REVIEW_RULES`.
4. **An invalid package name reaches a plan's `title` and `summary` through `cleanLine` only.** Accepted. Such a plan has status `unavailable` and no intent, so it never reaches GitHub. `cleanLine` removes control, line-separator and bidi characters and cuts at 200 code points, and the web app renders the text as text. A fixed title would change the plan text of a tested path; not a one-line change.
5. **`log-entry.ts` and `in-memory-log.ts` read each field twice, so an entry with getters could differ between the reads.** Accepted. Entries are plain data: built by the executor from strings it holds, or parsed from DynamoDB items. Copying first and then validating touches two files and the validator's tests; not a one-line change.
6. **A bump candidate is judged on deprecation and advisories only, so for a Possessed package the chosen version can carry the same signal.** Accepted, as specified by R-RM-2 and remediation 2.4 to 2.13. The PR body of a Possessed plan carries the Possessed warning, so a reviewer sees it.
7. **A `set-range` Edit overwrites the range found at the commit the executor reads, which may differ from the scanned range.** Accepted. The hosted executor re-scans the repository at request time (POST /api/remediate), and `applyPackageJsonEdits` refuses an Edit whose name is absent. Comparing the current range with the scanned one would change the executor's contract (remediate spec); not a one-line change.
