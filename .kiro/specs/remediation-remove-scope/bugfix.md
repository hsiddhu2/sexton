# Bugfix Requirements Document

## Introduction

Two defects let a remove remediation change more than the evidence covers.

1. `applyPackageJsonEdits` in `packages/engine/src/remediation/apply-edits.ts` applies a `remove-dependency` Edit to every section in `DEPENDENCY_SECTIONS`: `dependencies`, `devDependencies`, `optionalDependencies` and `peerDependencies`. Intake reads only `dependencies` and `devDependencies`, so nothing Sexton scored or counted covers the other two. A library that lists a package in `dependencies` and also in `peerDependencies` loses its peer declaration on the remediation branch. Remediation requirement 4.12 makes the Edit a structured change to `package.json`, and HP decision 7 of 21 Nov 2026 (remediation design.md) says "A remove Edit applies to every section of package.json that lists the name, dependencies and devDependencies both."
2. The CLI's import-site count reads no file under `build/`, `dist/` or `coverage/` (they are Ignored directories), yet the listing is still treated as complete. A `dependencies` package that is used only from such a file, for example `build/webpack.config.js`, counts 0 references and gets a remove proposal. Remediation requirements 1.7 and 1.8 propose remove only with an Import sites value of exactly 0, and cli-and-action requirements 2.5 and 2.6 give `importSites` an entry only when nothing was skipped.

Found by a headless review run of the gravedigger agent on commit e3761ff (one defect and one related note). No deploy is part of this spec.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN a `remove-dependency` Edit for a name is applied to a `package.json` that lists the name in `optionalDependencies` or `peerDependencies` THEN the system deletes it from those sections too.

1.2 WHEN a `remove-dependency` Edit is applied to a `package.json` whose `optionalDependencies` or `peerDependencies` member is present and not an object THEN the system refuses the Edit with `section-not-object`, although that section is outside the Edit.

1.3 WHEN a local scan lists a tracked file under a `build/`, `dist/` or `coverage/` segment with a counted extension THEN the system leaves the file unread and still counts the listing as complete, so a `dependencies` package referenced only from that file gets Import sites 0 and a remove plan.

1.4 WHEN a local scan outside a git work tree walks the directory and finds a `build/`, `dist/` or `coverage/` directory THEN the system skips the whole directory and still counts the listing as complete, with the same result as 1.3.

### Expected Behavior (Correct)

2.1 WHEN a `remove-dependency` Edit for a name is applied THEN the system SHALL remove the name only from `dependencies` and `devDependencies`, wherever it is listed in those two, and SHALL leave `optionalDependencies`, `peerDependencies` and every other member of `package.json` unchanged (remediation 4.12, HP decision 7).

2.2 WHEN the name is listed in neither `dependencies` nor `devDependencies` THEN the system SHALL refuse the Edit with `name-absent`, even if `optionalDependencies` or `peerDependencies` lists it.

2.3 WHEN `optionalDependencies` or `peerDependencies` is present and not an object THEN the system SHALL apply a `remove-dependency` Edit as if that member were absent.

2.4 WHEN a local scan lists a path that has a `build`, `dist` or `coverage` segment, no `node_modules` or `.git` segment, a counted extension and a base name other than `package.json`, `package-lock.json` and `npm-shrinkwrap.json` THEN the system SHALL count the listing as skipped, so that `importSites` has no entry and no remove is proposed (remediation 1.7, 1.8, cli-and-action 2.5, 2.6).

2.5 WHEN a local scan walks a directory and skips a `build`, `dist` or `coverage` directory THEN the system SHALL count the listing as skipped, with the same result as 2.4.

2.6 WHEN a PR body is built for a plan with a remove-dependency Edit THEN the system SHALL print the fixed line "The edit removes it from dependencies and devDependencies in package.json.", and the demo scan, which carries the node-sass migrate body, SHALL be regenerated with it.

### Unchanged Behavior (Regression Prevention)

3.1 WHEN a `remove-dependency` Edit is applied to a name listed in `dependencies`, `devDependencies` or both THEN the system SHALL CONTINUE TO remove it from each of them and keep indentation, key order and the final newline.

3.2 WHEN a `set-range` or `add-dependency` Edit is applied THEN the system SHALL CONTINUE TO give the same result as before.

3.3 WHEN a local listing ran in full, nothing was capped, nothing was skipped and the only unread paths are under `node_modules` or `.git` THEN the system SHALL CONTINUE TO give `importSites` an entry for each `dependencies` package, so an unreferenced one still gets a remove plan.

3.4 WHEN a package is a `devDependencies` package, or the scan target is a GitHub repository THEN the system SHALL CONTINUE TO give it no `importSites` entry.

3.5 WHEN the node-sass migration runs THEN the system SHALL CONTINUE TO produce the same Edits, review sites and scan-incomplete flag, because its file scan does not use the import-site listing.

3.6 WHEN the demo evidence, the golden evidence pack and the replays are recomputed from the recorded fixtures THEN the system SHALL CONTINUE TO produce them byte for byte, because the hosted path never removes and none of them carries a PR body.
