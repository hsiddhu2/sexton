# Implementation Plan: evidence-pack

## Overview

Builds the evidence pack: canonical JSON and SHA-256, purl and the CycloneDX 1.5 SBOM checked against the official schema, the builder and verifier, the Markdown report, intake with manifests, `GET /api/evidence` on the scan Lambda, the demo files and two header links. Paths are under packages/engine unless stated.

- [x] 1. Spec
  - Read RFC 8785, the purl npm type and ECMA-427 encoding, and the CycloneDX property taxonomy; record the URLs; write requirements.md, design.md and tasks.md, and commit.
  - _Requirements: 1.1, 2.2, 2.8_

- [x] 2. Types, canonical JSON and SHA-256
  - _Requirements: 1.1 to 1.6_

  - [x] 2.1 src/types.ts evidence types; src/evidence/canonical-json.ts with property 30 and the key-order half of property 31
    - _Requirements: 1.1 to 1.4_

  - [x] 2.2 src/evidence/sha256.ts with property 34, and a test that no file under src imports a node: module
    - _Requirements: 1.5, 1.6_

- [x] 3. purl and SBOM
  - _Requirements: 2.1 to 2.8, 9.3_

  - [x] 3.1 src/evidence/purl.ts with property 37 and the @types/node example
    - _Requirements: 2.8_

  - [x] 3.2 test/fixtures/cyclonedx copied from the handoff assets; src/evidence/sbom.ts with the schema test and properties 35, 36 and 38
    - _Requirements: 2.1 to 2.7, 9.3_

- [x] 4. Intake manifest texts
  - src/intake/intake.ts `intakeRepoWithManifests`, `intakeRepo` as a wrapper; equivalence test over the recorded intake fixtures; examples for the lockfile and failure cases.
  - _Requirements: 6.1, 6.2_

- [x] 5. Build and verify
  - _Requirements: 3.1 to 3.10, 4.1 to 4.6_

  - [x] 5.1 src/evidence/build-pack.ts with the failure examples, log filtering and property 40 (builder half)
    - _Requirements: 3.1 to 3.10_

  - [x] 5.2 src/evidence/verify-pack.ts with the reason examples and properties 31, 32 and 33
    - _Requirements: 4.1 to 4.6_

- [x] 6. Markdown
  - _Requirements: 5.1 to 5.10_

  - [x] 6.1 src/evidence/signal-summary.ts, one formatter per SIGNAL_NAMES entry
    - _Requirements: 5.4_

  - [x] 6.2 src/evidence/render-markdown.ts with the section and fixed-text examples, property 39 and the Markdown half of property 40; src/index.ts exports and the index test
    - _Requirements: 5.1 to 5.10_

- [x] 7. Fixtures
  - _Requirements: 9.1 to 9.3_

  - [x] 7.1 scripts/record-fixtures.mjs `--package <name>`; semver 7.8.6 recorded alone; expected-states.json row; every consumer that counts the fixture packages updated
    - _Requirements: 9.1_

  - [x] 7.2 test/fixtures/evidence expected-pack.json, expected-report.md and README.md checked by hand; the golden test, the edited copy and the fixture schema test
    - _Requirements: 9.2, 9.3_

- [x] 8. API
  - packages/api: src/http/evidence-request.ts with property 42; src/http/evidence-response.ts with property 41 and the size limit; responses.ts `evidence-too-large`; scan.ts `scanWithInputs`; src/evidence.ts `runEvidence` with the log line; scan-handler.ts routing; contract.ts re-export; infra origin request policy forwards `format` and its test.
  - _Requirements: 7.1 to 7.11_

- [x] 9. Demo and web
  - packages/api/scripts/generate-demo-scan.mjs writes evidence.json and evidence.md; run the jq trial against the demo pack, fill design Decisions item 9 and keep VERIFY_TEXT or switch to the fallback; .gitignore; demo generator test; packages/web load source, header-model.ts `evidenceLinks`, Header.tsx links, header and axe tests, e2e checks both demo links.
  - _Requirements: 8.1 to 8.4_

- [x] 10. Close
  - docs/architecture.md, docs/threat-model.md, README.md, ROADMAP.md; root gates; independent reviews before each commit in build/reviews/07-evidence-pack.md; merge to main with --no-ff; gates on main; PROGRESS, TRACKER, private/reports/07-evidence-pack.md.
  - _Requirements: 9.4_
