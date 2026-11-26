# Reviews: spec 05 remediation

Independent reviews run before each commit by a subagent that had not seen the implementation. Verdict rules from the project review rules: "not ready" only for a code or spec defect, everything else a note.

## Review 1: spec (requirements.md, design.md, cemetery-ui .config.kiro), before 2cb0ec6

Verdict: NOT READY, 5 defects, all fixed before the commit.

1. design.md Notes item 3 still said the remove Edit targets only the origin. Marked superseded by HP decision 7.
2. design.md C8 and item 4 still said no lockfile note for remove. Marked superseded by HP decision 6.
3. design.md C4 still said the range operator is always `^` and the body shows the new range. Marked superseded by HP decision 4.
4. design.md escapeField said its order differs from 5.6. Parenthetical corrected.
5. requirements.md glossary "Escaped field" listed truncation before escaping. Rewritten to escape then truncate.

Notes taken: "Five changes" corrected to six; R-RM-2 departures listed in the introduction; stale "please confirm" prompts marked resolved; uuid reasoning now says Major upgrade. Notes left: the decision 13 wording ("demo scan unchanged") against the owner's task 4 (demo shows a plan), resolved in favour of task 4 and recorded as HP decision 13 in design.md; EARS bundling in 4.13, 5.5, 5.6; 5.11 wording. Fixture claims checked true against the recorded data. UUID unique.

## Review 2: engine (types, remediation module, OSV batch, fixtures, recorder), before the engine commit

Verdict: READY, no defects. Checked: only gather-bump-data.ts and clients/osv.ts touch the Transport; every outside string in the body goes through escapeField; escape then truncate, never splitting `\|`, at most 203 code points; branch encoding injective and git-valid; candidate order matches HP decisions 1 to 4, 8 and 10; OSV batch bounded at 10 requests with nothing cached on failure; gatherBumpData isolates failures per package; precheck order name, migrate, intake, branch. Properties 1 to 19 present, 7, 8, 11 and 19 at 1000 runs.

Notes taken and fixed after the review: `hasPrereleaseComparator` no longer counts the `<X.Y.Z-0` bound that semver adds for `^` and `~` (results were already correct, the name misled; example test added); the recorder rejects an implausible OSV ID before using it in a file path; a non-object target no longer escapes the per-package guard. Notes left: U+200E, U+200F and U+061C are not replaced by escapeField (open item 8, not part of 5.6); `a\|b` relies on GitHub's table parsing of a backslash before an escaped pipe; names differing only in case get distinct branches that collide on a case-insensitive filesystem; property 6 bounds querybatch at 10 but does not assert the exact page count; up to 64 detail requests in flight (open item 15).

## Review 3: contract, web validator, demo scan, before the contract and web commit

Verdict: READY, no defects. Checked: contract re-exports the engine types and both runtime lists; web imports from @sexton/api stay type-only and REMEDIATION_STATUSES is a local literal tied at compile time; the old placeholder shape fails with MISSING_FIELD at status and summary; errors carry no input; property 20 runs 1000 single faults; the demo generator is offline, throws on any unrouted URL, deterministic, and its output passes the validator.

Notes: the vuln lookup in remediation-routes.mjs now rejects an ID that is not a plausible advisory ID (fixed). Left: the validator checks `intent.files` as an array only and `baseRef` as a string (the drawer never reads intent); no cross-field checks such as proposed without chosenVersion; the web intent generator always makes a remove-dependency file.
