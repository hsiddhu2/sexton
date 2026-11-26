# Implementation Plan: remediation

## Overview

Adds the remediation planner to packages/engine: shared types, the candidate orderer and bump selector, range style, the batched OSV query and the bump data fetch, kind choice and pre-check, branch-name encoding, the planner, the PR body and its escaper, the PR intent, the append-only log, `attachRemediations`, the contract move, the web validator, recorded fixtures with hand-checked expected plans, and remediations in the demo scan. All paths are under packages/engine unless stated. Pure leaf modules come first, then the modules that compose them, then the I/O edge, then the consumers. Existing helpers (`isValidPackageName`, `isResolvableRange`, `readFullPackument`, `fetchAdvisory`, `mapWithConcurrency`, `ENGINE_VERSION`) are reused, never duplicated.

- [x] 1. Spec
  - Apply the 14 owner decisions for spec 05 to requirements.md and design.md, relabel the review-findings heading, give .kiro/specs/cemetery-ui/.config.kiro a fresh UUID, and commit the spec.
  - _Requirements: 1.1, 2.2, 2.3, 2.13, 2.15, 3.1, 4.13, 5.5, 5.6, 5.13, 5.14, 5.15, 5.17, 7.13_

- [x] 2. Types and the contract move
  - Adds the remediation types to src/types.ts and moves `RemediationEntry` into the engine, re-exported by the API contract.
  - _Requirements: 4.12, 6.1, 7.1_

  - [x] 2.1 Add the remediation types to src/types.ts
    - REMEDIATION_KINDS, RemediationKind, REMEDIATION_STATUSES, RemediationStatus, UnhealthyState, PackageJsonEdit, RemediationPlan, PrIntent, RemediationEntry, Recipe, FailingRule, PrContext, RemediationLogEntry under a remediation heading. Change no existing type.
    - _Requirements: 1.1, 4.12, 6.1, 7.1_

  - [x] 2.2 Re-export from packages/api/src/contract.ts
    - Delete the placeholder interface and the local REMEDIATION_KINDS. Re-export the types and the two runtime lists from @sexton/engine and add RemediationStatusList. Update api/test/contract.test.ts and contract.test-d.ts.
    - _Requirements: 7.1_

- [x] 3. Bump selector
  - Pure candidate ordering, range style and selection with their properties.
  - _Requirements: 2.1 to 2.16, 4.13, 4.14, 8.4, 8.5_

  - [x] 3.1 src/remediation/published-version.ts and candidates.ts
    - `isPublishedVersion`, `orderCandidates` with the prerelease-comparator rule, the 20-candidate budget across in-range then out-of-range, ties by code units.
    - _Requirements: 2.2, 2.3, 2.4, 2.5, 2.12, 2.14, 8.4_

  - [x] 3.2 src/remediation/range-style.ts
    - `rangeStyle` and `styledRange`. Exact stays exact, tilde stays tilde, caret stays caret, everything else is caret.
    - _Requirements: 4.13, 4.14, 8.5_

  - [x] 3.3 src/remediation/select-bump.ts
    - First passing candidate in Candidate order, `majorUpgrade` from `inRange`, `style` from the range, total.
    - _Requirements: 2.1, 2.6, 2.7, 2.8, 2.9, 2.10, 2.11, 2.13, 2.16_

  - [x] 3.4 Properties 2, 3, 4, 5 and 14 and example tests
    - test/remediation/select-bump.test.ts and candidates.test.ts with a brute-force model that shares no code with candidates.ts, the severity table, a prerelease-comparator range, and range style examples.
    - _Requirements: 2.2 to 2.16, 4.13, 4.14_

- [x] 4. Batched OSV query and bump data
  - The one I/O module, with the call bounds and failure isolation as properties.
  - _Requirements: 2.17 to 2.24, 3.6, 8.2, 8.6, 8.7, 8.9_

  - [x] 4.1 queryVulnIdsBatch and OSV_BATCH_SOURCE in src/clients/osv.ts
    - One cached exchange per package under `osv-querybatch-multi`, continuation queries only for tokens, at most OSV_MAX_PAGES requests, strict response shape, pairs not objects in the cache.
    - _Requirements: 2.18, 2.19, 2.21, 2.22, 8.6, 8.7_

  - [x] 4.2 src/remediation/read-published.ts and gather-bump-data.ts
    - Own-property packument reads, fixed failure reasons, one detail fetch per distinct ID, concurrency 8, never rejects.
    - _Requirements: 2.17, 2.20, 2.21, 2.22, 2.23, 8.4, 8.6, 8.7, 8.9, 8.10_

  - [x] 4.3 test/remediation/routes.ts, properties 6 and 19, and osv-batch tests
    - A scripted OSV model with page tokens and faults, a recording transport, pre-warmed cache arms.
    - _Requirements: 2.17 to 2.22, 3.6, 8.2, 8.6, 8.7_

- [x] 5. Kind, pre-check and branch names
  - _Requirements: 1.4 to 1.8, 1.10, 3.2, 4.2 to 4.9, 8.2, 8.3_

  - [x] 5.1 src/remediation/recipes.ts, choose-kind.ts, precheck.ts, bump-targets.ts
    - EMPTY_RECIPE_REGISTRY, migrate then remove (exactly 0) then bump, the ordered pre-check, bump targets only for plannable bump packages.
    - _Requirements: 1.4, 1.5, 1.6, 1.7, 1.8, 1.10, 2.17, 3.2, 3.6, 8.2_

  - [x] 5.2 src/remediation/encoded-name.ts, is-valid-branch-name.ts, branch-name.ts with property 8
    - Injective encoding with its inverse, the git ref predicate, the 200-character limit, the git-valid and git-invalid table. numRuns 1000.
    - _Requirements: 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9, 8.3_

- [x] 6. Planner
  - [x] 6.1 src/remediation/plan.ts with properties 1, 9, 15 (plan arm) and 17
    - One plan per unhealthy package in report order, statuses and fixed reasons, the styled range on bump Edits, the remove Edit, no mutation, locality.
    - _Requirements: 1.1 to 1.13, 2.13, 3.1 to 3.6, 4.13, 4.14, 8.2_

- [x] 7. PR body, intent and entries
  - [x] 7.1 src/remediation/escape-field.ts and clean-line.ts with property 11
    - Escape first, then truncate, never split `\|`, at most 203 code points. numRuns 1000.
    - _Requirements: 5.6, 5.7, 5.17, 8.8_

  - [x] 7.2 src/remediation/failing-rules.ts, pr-context.ts, pr-body.ts with properties 7, 12 and 13
    - Ten signal rows, the proposed change with "Range style preserved", the remove text, failing rules capped at 20, the lockfile note for bump and remove, the footer, the reduced re-render. Property 7 at 1000 runs.
    - _Requirements: 5.1 to 5.16, 7.6, 8.8_

  - [x] 7.3 src/remediation/pr-intent.ts with properties 15 and 16
    - Intent only for proposed bump and remove, `baseRef` `@default`, one Edit, titles at most 200 characters.
    - _Requirements: 4.1, 4.10, 4.11, 4.12, 4.15, 4.16_

  - [x] 7.4 src/remediation/attach.ts with property 18
    - One entry per plan, skips absent and repeated names, summaries by `cleanLine`, JSON round trip.
    - _Requirements: 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8, 7.9_

- [x] 8. Remediation log
  - [x] 8.1 src/remediation/log-entry.ts, remediation-log.ts, in-memory-log.ts with property 10
    - Two-method interface, validation, frozen copies, fixed rejection reason. numRuns 100.
    - _Requirements: 6.1 to 6.8_

- [x] 9. Exports
  - [x] 9.1 src/index.ts and test/index.test.ts
    - Export the public names of design.md; keep cleanLine, precheck, chooseKind, readPublished, buildPrContext and isValidLogEntry internal.
    - _Requirements: 1.1, 2.1, 2.17, 4.1, 4.2, 5.1, 6.3, 7.2_

- [x] 10. Fixtures and expected plans
  - [x] 10.1 Extend scripts/record-fixtures.mjs with --remediation and record
    - Full version lists with deprecation markers, OSV IDs per release above the installed version, details, for request, uuid, lodash, event-stream, node-sass, left-pad and colors.
    - _Requirements: 2.24_

  - [x] 10.2 test/fixtures/remediation/expected-plans.json and expected-plans.md, and test/remediation/fixtures.test.ts
    - Run gatherBumpData and planRemediation over the recorded data through the scripted transport and compare with the hand-checked plans. Write the reasoning per package.
    - _Requirements: 1.2, 2.9, 2.13, 2.17, 2.24_

- [x] 11. Web validator
  - [x] 11.1 packages/web/src/load/lists.ts and validate-scan-response.ts with property 20
    - REMEDIATION_STATUSES tied to the contract, the new required and optional fields, the old shape rejected with MISSING_FIELD. Update arbitraries, drawer test literal and lists test. numRuns 1000.
    - _Requirements: 7.10, 7.11, 7.12_

- [x] 12. Demo scan
  - [x] 12.1 packages/api/scripts/generate-demo-scan.mjs and lib/remediation-routes.mjs
    - Plan the demo report offline from the recorded remediation fixtures, attach the entries, regenerate packages/web/public/demo/scan.json, and test that a Dead package has a title and body and the scan passes the web validator.
    - _Requirements: 7.13_

- [x] 13. Gates and merge
  - [x] 13.1 Root gates, independent review, merge to main with --no-ff, gates on main
    - npm run typecheck, npm run lint, npm test at the root with zero warnings. Reviews in build/reviews/05-remediation.md.
    - _Requirements: 1.14, 2.23, 2.24, 3.7, 4.17, 6.9, 8.1, 8.9_
