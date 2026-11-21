# Reviews: spec 06 migration-node-sass

Each review was run by an independent reviewer that had not seen the implementation, with the spec folder, the diff against main, docs/requirements.md, the handoff and the steering files.

## Review 1: spec (requirements, design, tasks), 21 Nov 2026

Verdict: NOT READY, 3 defects, all fixed before the spec commit.

1. Remediation 5.9 (no repository string in the body), 5.2 (section order) and 5.14 (lockfile note for bump or remove only) contradicted the migrate body. Fixed: Requirement 9.3 amends them; remediation requirements edited; Correction item 3; design decision 17.
2. Safe path admitted C1 controls, U+2028/2029, bidi controls, direction marks and lone surrogates, and review comment paths are copied raw into the API output. Fixed: a Safe path must satisfy `neutralise(p) === p`.
3. Five parent tasks had no `_Requirements:_` line. Fixed.

Notes acted on: 3.7 scoped to "sass not listed"; property 24 matches 1.7 on the size limit; Data Models counts (listed 4); decisions 13 to 16 recorded (`unavailable` for no safe sass, `--migration` flag, excerpts stored via cleanLine, no fetch without node-sass); EARS shapes; 1.2 traced to 3.1; remediation 2.22 lists the 200-ID failure; criterion 4.11 for the sample repository; `gatherMigrationData` skips sass when listed.

## Review 1b: spec re-review

Verdict: READY. Notes fixed: task 7 lists all seven amended criteria; 9.2 names 2.22; Requirement 9 story mentions the body amendment. Note kept: 4.11 needs node-sass and sass-loader both in devDependencies in the sample package.json (handoff says so).

## Review 2: implementation (engine, api, web, fixtures, demo), 21 Nov 2026

Verdict: READY, no defects. Checked: no node:/fetch/fs under src/remediation; every cap (500, 200, 256 KiB, 200 sites, 200 IDs, 100 scripts); every repository string through escapeField or the Safe-path filter; Edits only to package.json; sample repository and demo results; .kiro/steering, hooks, agents, settings untouched.

Notes acted on before commit:
1. `runRecipe` now keeps only package.json Edits and sites on package.json or a listed Safe path, for injected recipes (test with a rogue recipe). Design decision 18.
2. Excerpts were up to 121 code points (120 plus ellipsis); now 119 plus ellipsis. Decision 19.
3. The migrate body now prints the remove-scope line (remediation HP decision 7) after a remove Edit.
4. The review list says "Stylesheets and scripts: not scanned." when there was no scan (handoff decision 9). Decision 20.

Notes kept: O(n) path filtering before the 500 cap (a raw-entry limit belongs with the 09 and 10b sources); the validator checks `reviewComments` is a list, not each element (7.2 asks no more); a re-scan before `npm install` would propose the sass-loader raise again because the lockfile is unchanged (the lockfile note covers it); only the demo calls `runMigrations` today, the hosted path comes with 10b.
