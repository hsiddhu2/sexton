# Implementation Plan: cli-and-action

## Overview

Adds the `sexton` CLI (scan, check, evidence, verify) and a composite GitHub Action, with local intake, the policy client in the Engine, import-site counting for remove, and a workflow that runs the Action on this repository. Paths are under packages/engine, packages/cli or packages/action as named.

- [x] 1. Spec
  - Read the GitHub REST issue comment pages, the composite action syntax page and the hardening guide; record the URLs; write requirements.md, design.md and tasks.md, and commit.
  - _Requirements: 9.3, 9.6_

- [x] 2. Engine
  - _Requirements: 1.1 to 1.6, 2.1 to 2.4, 2.7_

  - [x] 2.1 intake/intake.ts `intakeFromManifests` with property 51; clients/github-policy.ts moved from packages/api with the api re-export
    - _Requirements: 1.1 to 1.3_

  - [x] 2.2 neutralise and cleanLine exports; capFileSource limits with examples; index test
    - _Requirements: 1.4, 1.5_

  - [x] 2.3 remediation/count-references.ts with property 46
    - _Requirements: 2.1 to 2.4_

  - [x] 2.4 pr-body.ts remove line, body tests, Correction section in the remediation design
    - _Requirements: 2.7_

- [x] 3. CLI skeleton
  - packages/cli package, tsconfig, vitest config, root references; args.ts, run-cli.ts, bin.ts, messages; help and version; properties 43 and 44.
  - _Requirements: 3.1 to 3.5_

- [x] 4. Ports and the working tree
  - file-port.ts, git-port.ts, repo-name.ts, working-tree.ts, with tests in temporary directories including a link outside the root and a file over the cap.
  - _Requirements: 4.1 to 4.4, 4.7, 5.1 to 5.6_

- [x] 5. scan
  - compose.ts, import-sites.ts with property 47, safe-text.ts, table.ts with property 45, commands/scan.ts and the scan file.
  - _Requirements: 2.5, 2.6, 4.5, 4.6, 6.1 to 6.6_

- [x] 6. check
  - check-output.ts, summary.ts with property 48, commands/check.ts; exit 1 on a failing fixture policy and 0 on a passing one.
  - _Requirements: 7.1 to 7.5_

- [x] 7. evidence
  - commands/evidence.ts and --verify; written pack verifies, an edited copy exits 1.
  - _Requirements: 8.1 to 8.4_

- [x] 8. Action
  - action.yml, src/event.ts, src/comment-client.ts, src/post-comment.ts with properties 49 and 50; the action.yml test; .github/workflows/sexton.yml.
  - _Requirements: 9.1 to 9.11_

- [x] 9. Docs
  - README CLI and Action sections and the evidence sentence correction; ROADMAP 0.2; docs/architecture.md; docs/threat-model.md.
  - _Requirements: 10.1 to 10.3_

- [x] 10. Close
  - Run the built CLI by hand against this repository and against expressjs/express; root gates; independent reviews before each commit in build/reviews/09-cli-and-action.md; merge to main with --no-ff.
  - _Requirements: 6.1, 7.2_
