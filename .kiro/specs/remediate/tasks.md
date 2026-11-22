# Implementation Plan: remediate

## Overview

Opens pull requests on the demo repository from the hosted plan: applyPackageJsonEdits in the Engine, the GitHub executor and `POST /api/remediate` in the API, the remediation log table and the remediate function in infra, the log in the hosted evidence pack, the drawer button, and the demo repository contents. No deploy.

- [ ] 1. Spec
  - Read the REST pages for every write shape, the WAF rate rule page and the OAC page; record the URLs; write requirements.md, design.md and tasks.md, and commit.
  - _Requirements: 2.1, 6.1, 8.3, 8.4_

- [ ] 2. Demo repository
  - _Requirements: 10.1_

  - [ ] 2.1 private/demo-repo files, the lockfile from `npm install --package-lock-only --ignore-scripts`, and the push commands for the report
    - _Requirements: 10.1_

- [ ] 3. Engine
  - _Requirements: 1.1 to 1.7_

  - [ ] 3.1 remediation/apply-edits.ts with Property 66 and examples; `TransportRequest.method` gains PUT
    - _Requirements: 1.1 to 1.7_

- [ ] 4. Executor
  - _Requirements: 2.1 to 2.4, 3.2 to 3.11, 4.1 to 4.4, 5.2, 5.3_

  - [ ] 4.1 allowlist, github-requests.ts, review-sites.ts, log-store.ts with Properties 64, 67, 68
    - _Requirements: 2.1 to 2.3, 4.2 to 4.4, 5.2_

  - [ ] 4.2 executor.ts against a fake GitHub with Properties 60, 62, 63, 65, and a concurrent create-ref test
    - _Requirements: 2.4, 3.2 to 3.11, 4.1, 5.3_

- [ ] 5. Handler
  - _Requirements: 3.1, 3.12, 6.1 to 6.5_

  - [ ] 5.1 request parser, response, remediate-handler, handlers/remediate.ts, Property 61, end-to-end test
    - _Requirements: 3.1, 3.12, 6.1 to 6.5_

- [ ] 6. Infra
  - _Requirements: 5.1, 5.4, 8.1 to 8.6_

  - [ ] 6.1 log table, function, role, URL, behavior, WAF rule, config, tests, cdk-nag; cdk synth --strict and cdk diff; stop if GithubTokenSecret changes
    - _Requirements: 5.1, 5.4, 8.1 to 8.6_

- [ ] 7. Scan and evidence
  - _Requirements: 7.1 to 7.3_

  - [ ] 7.1 evidence reads the log; scan sets actions.remediate
    - _Requirements: 7.1 to 7.3_

- [ ] 8. Contract and web
  - _Requirements: 9.1 to 9.4_

  - [ ] 8.1 contract, validator, remediate client, drawer button, tests, axe, e2e
    - _Requirements: 9.1 to 9.4_

- [ ] 9. Steering and docs
  - _Requirements: 10.2, 10.3_

  - [ ] 9.1 api-etiquette.md, pr-safety.md, architecture, threat model, README, runbook with the new smoke checks
    - _Requirements: 10.2, 10.3_

- [ ] 10. Close
  - Root gates and an independent review before each commit, build/reviews/10c-remediate.md, merge to main with --no-ff, PROGRESS, TRACKER, report with the push commands, the cdk diff summary, the deploy order and the smoke checks.
  - _Requirements: 1 to 10_
