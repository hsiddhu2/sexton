# Reviews: spec 09 cli-and-action

Each review was run by an independent reviewer that had not seen the implementation, with the spec folder, the diff against main, docs/requirements.md, the handoff and the steering files.

## Review 1: spec (requirements, design, tasks), 21 Nov 2026

Verdict: NOT READY, 9 defects, all fixed before the spec commit.

1. Requirement 4.4 named two git commands while the working tree needs `ls-files`. Fixed: three fixed commands, design decision 7.
2. Security: git inside an untrusted checkout obeys its `.git/config`, and `core.fsmonitor` runs a command when the index is read. Fixed: every git call runs with `-c core.fsmonitor=false`.
3. Security: `scan.json` and the evidence files are written to the current directory and could follow a planted symbolic link. Fixed: Requirement 4.7, writes use `O_NOFOLLOW` and refuse non-regular files.
4. Security: the Action would update any comment starting with the marker, so another user could plant one and later rewrite it. Fixed: only a `github-actions[bot]` comment of type Bot is updated; Property 50.
5. Requirement 9.4 contradicted the dogfood workflow, where the action checkout is the scanned checkout. Fixed: 9.4 scoped to a separate action checkout; decision 10 records the trust.
6. Requirement 9.2 contradicted the install decision. Fixed.
7. The Error line definition contradicted the policy error output. Fixed: Safe-text lines with code and JSON pointer.
8. Requirement 1.2 could not hold for texts over 5 MiB or with a byte order mark. Fixed: domain named, decision 15.
9. Two wrong statements about existing code (`POLICY_FILE` location, `planRemediation` signature). Fixed.

Notes acted on: output safety covers stdout and stderr of every command and no colour; handoff points 1, 11, 16, 23 stated (decision 14); `--repo` errors, the evidence default target, missing or large verify files and the edited copy defined; token in env of the comment step only, `--` before the path, exit code flow (decision 12); links and vanished files dropped, not skipped (decision 11); reads stop at maxBytes + 1; no YAML library in the action tests; API version as documented (decision 13); 5.5 reworded to examples. Notes kept: EARS bundling in several criteria (each tested by examples); task 1 trace.

## Review 1b: spec re-review

Verdict: READY. Notes fixed: Requirement 4 renumbered in order; 4.7 says "existing" path; the working-tree paragraph shows `-c core.fsmonitor=false`; 9.2 names the three built packages; the README will say a personal token gives a new comment each run.

## Review 2: implementation (engine, api, cli, action, workflow, docs), 21 Nov 2026

Verdict: NOT READY, 1 defect, fixed and re-reviewed.

1. `countReferences` counted `~name"` but not `~name'` or `` ~name` `` in style files, so a package imported only as `@import '~bootstrap';` counted 0 and could be proposed for removal. Fixed: any quote after `~name`; the completeness property covers both forms; requirements glossary and 2.3 amended; design decision 18.

Probes clean: no expression inside any run block, inputs through env, every `uses` pinned; `--` before the path parses as the target; the exit code crosses composite steps through `GITHUB_OUTPUT`; the token is in the comment step's env only and the API base is fixed; only the three comment requests, at most 3 lists, updates only a `github-actions[bot]` comment; git through `execFile` with fixed arguments and `-c core.fsmonitor=false`; file reads lstat, O_NOFOLLOW, capped at maxBytes + 1, fatal UTF-8; writes O_NOFOLLOW; working-tree realpath check under the real root; importSites conditions; the summary cut; intakeFromManifests equivalence and the lockfile skip for an invalid package.json; no `node:` import under packages/engine/src; .kiro/steering, hooks, agents and settings untouched.

Notes acted on: a path git lists but missing on disk (sparse checkout) is skipped, so remove is not offered (decision 11 amended); the threat model lists what the remove check cannot see; table cells cut to 39 plus the ellipsis (decision 19); `writeText` refuses an existing non-regular entry before opening, so a FIFO cannot block; static import of repo-name. Notes kept: `test/index.test.ts` drops `cleanLine` from the "kept internal" list because Requirement 1.4 exports it, an earlier-test change outside the two named categories; time-of-check gaps between realpath and open are not reachable from a static checkout; a backslash file name turns off remove for the scan (the safe direction); the walk has no directory count limit, only the 20000-file cap.

## Review 2b: re-review of the fixes

Verdict: READY.
