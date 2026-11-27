# Implementation Plan: release

## Overview

Prepares release 0.1: package settings, the release check, the release workflow, server.json, the README section. Nothing is published, no secret is created and no account setting is changed. The owner's steps are in design.md "Owner steps". Branch `release/prep` from origin/main 581de6b.

- [x] 1. Names
  - [x] 1.1 Check the npm names, read-only
    - `npm view` for each package name; the registry's scope endpoint for `@sexton`, checked against a made-up scope. Result in design.md "Name check". No name changed.
    - _Requirements: 1.1, 1.2, 1.3_
- [x] 2. Package settings
  - [x] 2.1 Settings for engine, CLI and server
    - `files`, `repository` with `directory`, `homepage`, `bugs`, `author`, `keywords`, `publishConfig` (`access: public`, `provenance: true`), `engines.node >=20.19.0`; the server's `mcpName`. A README, and copies of LICENSE and NOTICE, in each package.
    - _Requirements: 2.1, 2.3, 2.4, 2.5, 2.6_
  - [x] 2.2 Settle the server's Node version against the Bundle
    - Bundle stays `node20` (Kiro runs Node 20.19.5); all three packages say `>=20.19.0`. Shown by installing the three tarballs under Node 20.19.5 and running both bins. design.md Decision 2.
    - _Requirements: 2.5_
  - [x] 2.3 Pack each package
    - `npm pack --dry-run` and a real `npm pack`; file lists and sizes in design.md "Results"; search the unpacked files for maps, tests, fixtures, private paths and machine paths.
    - _Requirements: 2.1, 2.2_
- [x] 3. Release check and workflow
  - [x] 3.1 Release check
    - `scripts/lib/release-check.mjs` (pure `releaseProblems`) and `scripts/release-check.mjs` (reads the files, exit 0, 1 or 2).
    - _Requirements: 3.5_
  - [x] 3.2 Release workflow
    - `.github/workflows/release.yml`: version tag only; `contents: read` and `id-token: write`, gates job `contents: read`; actions at the SHAs of `ci.yml`; no cache; gates and self-scan on Node 22; release check, build and publish in order on Node 24 with trusted publishing; skip a version already on npm.
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.6, 3.7_
- [x] 4. MCP Registry
  - [x] 4.1 server.json
    - `packages/mcp/server.json` for `io.github.hsiddhu2/sexton`, validated with ajv against `server.schema.json` 2025-12-11. No registry command run.
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_
- [x] 5. Tests
  - [x] 5.1 `packages/mcp/test/release.test.ts`
    - Properties 1 to 4 of design.md, fast-check numRuns 100, no network.
    - _Requirements: 2.1, 2.3, 2.4, 2.5, 2.6, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 4.1, 4.2, 4.3, 4.4_
- [x] 6. Documentation
  - [x] 6.1 README "Install (coming with release 0.1)"
    - No command in it. Points to the clone steps and the Kiro Power until the release.
    - _Requirements: 5.1, 5.2_
  - [x] 6.2 Sources in design.md
    - npm, Node, GitHub and MCP Registry documents with URLs, read on 27 Nov 2026.
    - _Requirements: 5.3_
- [x] 7. Gates and commit
  - [x] 7.1 Typecheck, lint with `--max-warnings=0`, every package's tests; search the changed files for private terms and machine paths
    - _Requirements: 2.2_
- [ ] 8. Release (owner)
  - [ ] 8.1 Owner steps for npm, in design.md
    - Names, 2FA, placeholder first publish, trusted publishers, tag `v0.1.0`, provenance check, disallow tokens.
    - _Requirements: 1.3, 3.6, 3.7_
  - [ ] 8.2 Owner steps for the MCP Registry, in design.md
    - `mcp-publisher validate`, `login github`, `publish`, search check.
    - _Requirements: 4.5_
