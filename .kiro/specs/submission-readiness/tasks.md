# Implementation Plan: submission-readiness

## Overview

Gets the repository ready for judges on 2 December 2026: two claims corrected, the README in line with main, docs/JUDGES.md, ten cleanup items, a sweep of every tracked file, the browser tests in CI and a licence check. Every factual line is checked before it is written, and the check goes under "Checks" in design.md. Gates (`npm run typecheck`, `npm run lint`, `npm test` at the root, zero warnings) and an independent review run before every commit. Check `git branch --show-current` before every commit. Commits carry no trailer. Notes say what was done and found, in plain words, and name no tool.

- [x] 1. Claims A and B
  - Notes: six places changed (design.md Checks). npq is the closest overlap and is named as such. Change-log line 0.9; the version line is 0.9.
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 2.1, 2.2, 2.3, 2.4, 2.5, 9.4_

  - [x] 1.1 Search every tracked file outside packages/web/src and packages/web/e2e for both claims in any wording, and complete the before list in design.md
    - _Requirements: 1.1, 2.1_

  - [x] 1.2 Check the packument facts against a recorded packument and the registry documentation; read the Socket, npq and Renovate README or documentation; record each link and the date
    - _Requirements: 1.3, 2.3_

  - [x] 1.3 Rewrite docs/requirements.md section 2, docs/threat-model.md:9 and the README problem, history and comparison lines; add the change-log line 0.9; record the after text
    - _Requirements: 1.2, 1.4, 2.2, 2.4, 2.5, 9.4_

- [x] 2. README
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8_

  - [x] 2.1 Correct every stale status label and the replay links, and the replay-link assertions in packages/web/test/readme.test.ts; check the hosted evidence endpoint before its label changes; record each with its check
    - _Requirements: 3.5_

  - [x] 2.2 Check the state table against state.ts and the signal list against types.ts and docs/requirements.md
    - _Requirements: 3.3, 3.4_

  - [x] 2.3 Add the sections "Limits" and "Pre-existing code"; check the first commit with `git log --reverse`; link docs/JUDGES.md; add both headings to the list in packages/web/test/readme.test.ts
    - _Requirements: 3.2, 3.6, 3.7, 3.8_

  - [x] 2.4 Confirm "Try it in two minutes" and "Kiro project files" (or "Built with Kiro"), where present, are byte for byte unchanged with a diff of those sections
    - _Requirements: 3.1_

- [x] 3. docs/JUDGES.md
  - Notes: 58 lines. The three CLI commands ran against expressjs/express: exit 0, 1, 0.
  - Run every command it gives on the branch; check every control name against packages/web/src and the e2e tests.
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

- [x] 4. Code cleanup
  - _Requirements: 5.4, 5.5, 5.8, 5.10_

  - [x] 4.1 Move mapWithConcurrency and PACKAGE_CONCURRENCY to src/util/concurrency.ts; repoint every import; move their tests; Property 2
    - _Requirements: 5.4_

  - [x] 4.2 isValidOwner rejects orgs; parseRepoUrl drops its own check; Property 1 at 1000 runs
    - _Requirements: 5.8_

  - [x] 4.3 "unknown" in the evidence summary and the pull request row; check no fixture has a missing publisher name; Property 3
    - _Requirements: 5.10_

  - [x] 4.4 The recorder imports the URL builders from the built engine; the record scripts in packages/engine/package.json build first; the recorder test
    - _Requirements: 5.5_

- [x] 5. Repository cleanup
  - _Requirements: 5.1, 5.2, 5.3, 5.6, 5.7, 5.9_

  - [x] 5.1 Confirm the two ask rules in .kiro/agents/impl.md without editing it; add self-scan.out to .gitignore and check it with git check-ignore
    - _Requirements: 5.1, 5.2_

  - [x] 5.2 history-signals Glossary "Provenance regression"; build/reviews/05-remediation.md line 3
    - _Requirements: 5.3, 5.9_

  - [x] 5.3 Haunted and the matching rule name in sexton.policy.yml, the self-policy test, and `npm run scan:self` with its result recorded, or the documented reason to leave it out
    - _Requirements: 5.6_

  - [x] 5.4 Close the Task Dependency Graph item: the 22 tasks.md files keep their graph sections exactly as they are, none removed and none added (owner decision at go); confirm with a diff against main
    - _Requirements: 5.7_

- [x] 6. Sweep
  - Notes: 36 private-path mentions reworded in 20 files, review records included, each still saying what happened. No secret, no TODO, no dead link apart from the repository URL while it is private.
  - Every tracked file: tool or vendor names, private paths, secrets, TODO with no owner, links that do not resolve (relative links by file, absolute links by a request). Fix what is in this spec's paths, list the rest for its lane, keep every guard. Reword every private-path mention, review records under build/reviews included, without changing what any record says happened.
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

- [x] 7. Browser tests in CI
  - Notes: actions/cache v6.1.0 at 55cc8345863c7cc4c66a329aec7e433d2d1c52a9. The suite passed on the Mac apart from two tests that lost the preview server under load, which passed on a rerun. The job itself is proved by its first CI run on push.
  - Look up the actions/cache release SHA and record it with its tag. Run the job's commands in a clean clone first. Only the new job changes under .github. List .kiro/steering/structure.md for lane 3.
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

- [x] 8. Licence and About
  - Notes: LICENSE matches the Apache text, every licence field is Apache-2.0, the vendored schemas added to CREDITS.md, .kiro tracked and not ignored.
  - Compare LICENSE with the Apache License 2.0 text; check NOTICE, every package.json licence field, CREDITS.md against the font files and the vendored schemas, and that /.kiro is tracked and not ignored. List what the owner sets by hand on GitHub.
  - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

- [x] 9. Final checks
  - Notes: main is still a01fcce, so no merge was needed and the change-log line stays 0.9. Root gates 2,068 tests. Fresh clone of 90bbbb7 with `npx npm@11 ci`: gates exit 0, 2,068 tests, clean tree. Whole-branch review: three text defects, fixed before 90bbbb7 (design.md Review notes, build).
  - Merge main in, renumber the change-log line if needed, root gates, a fresh clone with `npx npm@11 ci` and the gates, an independent review of the whole branch. Nothing is pushed.
  - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5_
