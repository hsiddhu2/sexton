# Implementation Plan: hosted-plans

## Overview

Adds the read side of hosted remediation: a token from Secrets Manager, two authenticated GitHub API reads, pinned manifest and policy reads, a GitHub File source, plans on `GET /api/scan`, and the commit and plans in the hosted evidence pack. Nothing writes to GitHub and nothing is deployed.

- [x] 1. Spec
  - Read the GitHub REST commit and tree pages, the fine-grained token page and the GetSecretValue page; record the URLs; measure express; write requirements.md, design.md and tasks.md, and commit.
  - _Requirements: 2.1, 2.3, 4.1_

- [x] 2. Engine: pinned reads
  - _Requirements: 1.1 to 1.4_

  - [x] 2.1 clients/github-ref.ts; optional ref on manifestUrl, fetchManifest, fetchRepoManifests, policyUrl, fetchPolicyText, intakeRepoWithManifests; Property 54 for the raw builders
    - _Requirements: 1.1 to 1.4_

- [x] 3. Engine: GitHub API reads
  - _Requirements: 2.1 to 2.10_

  - [x] 3.1 http.ts `redirect: "manual"` option and fetch Transport mapping
    - _Requirements: 2.10_

  - [x] 3.2 clients/github-api.ts with examples and Properties 52 (client level) and 54 (treeUrl)
    - _Requirements: 2.1 to 2.9_

- [x] 4. Engine: GitHub File source
  - _Requirements: 3.1 to 3.7_

  - [x] 4.1 clients/github-file-source.ts with examples and Property 56
    - _Requirements: 3.1 to 3.7_

- [x] 5. API: token provider
  - _Requirements: 4.1 to 4.5_

  - [x] 5.1 github-token.ts, aws-secret-port.ts, the dependency at the client-dynamodb version (licence Apache-2.0, `npm run scan:self` passes), Property 59 and cache examples. The secret value is never read; describe-secret is the only allowed check
    - _Requirements: 4.1 to 4.5_

- [x] 6. API: scan order and plans
  - _Requirements: 5.1 to 5.5, 6.1 to 6.7_

  - [x] 6.1 plan-stage.ts with the cap and the guards; scan.ts order; handler wiring
    - _Requirements: 5.1 to 5.5, 6.1 to 6.7_

  - [x] 6.2 Scan tests: pinned read with a fake token, null-token path, Properties 52, 53, 55, 57, 58
    - _Requirements: 5.1 to 5.5, 6.1 to 6.7, 4.5_

- [x] 7. API: evidence path
  - _Requirements: 7.1 to 7.3_

  - [x] 7.1 commit and remediations into the pack, tests
    - _Requirements: 7.1 to 7.3_

- [x] 8. Infra
  - _Requirements: 8.1 to 8.7_

  - [x] 8.1 DataRefs field, IAM statement, environment variable, nag reason in nag-suppressions.ts and the infra design.md, superseded infra tests, .gitignore line; cdk synth --strict and cdk diff of both stacks. If the diff shows any change to GithubTokenSecret, stop and write it under Waiting on HP
    - _Requirements: 8.1 to 8.7_

- [x] 9. Steering, web, docs
  - _Requirements: 9.1 to 9.4_

  - [x] 9.1 api-etiquette.md edits; logging test for Authorization; web render test
    - _Requirements: 9.1 to 9.3_

  - [x] 9.2 architecture, threat model (token travel, shared rate budget, private sexton-demo, raw path log lines), well-architected, README (only states that exist after the next deploy), deploy runbook (rotation with `read -s`, two smoke checks, the export note)
    - _Requirements: 9.4_

- [x] 10. Close
  - Root gates and an independent review before each commit, build/reviews/10b-hosted-plans.md, merge to main with --no-ff, a summary with the express timings, the cap, the cdk diff summary and the 10c items (request shapes, write permissions, where the remediation log plugs in, every reviewComments element validated, case-insensitive branch collision).
  - _Requirements: 1 to 9_
