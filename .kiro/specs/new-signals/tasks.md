# Implementation Plan: new-signals

## Overview

Adds the publisherChange and newDependency signals and their two Possessed rules. Pure functions first, then the client, scoring, the state rules, the timeline, the outputs, fixtures and replays, measurement, and the web lines last. Gates (`npm run typecheck`, `npm run lint`, `npm test` at the root, zero warnings) and an independent review run before every commit.

- [ ] 1. Types and the contract tie
  - Adds the value types and the two signal names, and keeps every package compiling.
  - _Requirements: 1.2, 2.4, 6.5, 9.1_

  - [ ] 1.1 Extend packages/engine/src/types.ts
    - Add PublishMethod, PublishRecord, PublisherChangeValue, NewDependencyEntry, NewDependencyValue. Append "publisherChange" and "newDependency" to NEW_SIGNAL_NAMES and to NewSignals.
    - buildHealth fills both with "not evaluated" when absent. The signal-summary mapped type and the pr-body switch are exhaustive, so their final formatters are written here; their tests are task 6.
    - _Requirements: 1.2, 2.4, 6.5_

  - [ ] 1.2 Add the two names to packages/web/src/load/lists.ts, test/lists.test.ts and test/arbitraries.ts
    - Only these three web files, as listed in design.md Decisions 9, after the owner approves it.
    - _Requirements: 9.1_

  - [ ] 1.3 Update the tests that count ten signals to twelve
    - Each changed assertion listed in the task notes.
    - _Requirements: 6.5_

- [ ] 2. Pure derivations
  - _Requirements: 1.2, 1.3, 1.4, 1.5, 1.6, 1.8, 2.1, 2.2, 2.3, 2.4, 2.6, 2.8, 2.9, 2.11, 2.12_

  - [ ] 2.1 earlierVersion in src/history.ts
    - Property 6.
    - _Requirements: 1.2, 1.6, 2.1_

  - [ ] 2.2 src/publisher.ts: publishRecord and publisherChangeValue
    - Example tests: axios 1.14.0 to 1.14.1 shape, keyv rc.1 to 6.0.0, missing `_npmUser`, non-string name. Properties 2 (publisher half), 4 (publisher half), 8.
    - _Requirements: 1.2, 1.3, 1.4, 1.5, 1.6, 1.8_

  - [ ] 2.3 src/new-dependency.ts: dependencyDiff, detailNames, resolveDependency, isFresh, newDependencyValue
    - Example tests: plain-crypto-js shape, a non-semver range, an invalid name, a 404 dependency, the 7-day boundary (exactly 7 days is Fresh, one millisecond more is not, a publish after the parent is not). Properties 4 (pure half), 7, 8.
    - _Requirements: 2.2, 2.3, 2.4, 2.6, 2.8, 2.9, 2.11, 2.12_

- [ ] 3. Client and scoring
  - _Requirements: 1.1, 1.7, 1.9, 2.5, 2.7, 2.10, 2.13, 7.5_

  - [ ] 3.1 src/clients/new-dependency.ts: fetchNewDependencySignal
    - Reads each detail name through readFullPackument and readAbbreviatedPackument, one at a time. No request for an invalid name or when there is no Earlier version. Property 4 (client half) with a transport that fails or answers anything; a counting transport shows at most 10 requests and none for a repeated name within the TTL.
    - _Requirements: 2.5, 2.6, 2.7, 2.9, 2.10, 2.13_

  - [ ] 3.2 Wire both signals into scoreOne
    - publisherChange from the document already held. newDependency through the client. Unavailable with the packument failure reason when the full packument failed.
    - _Requirements: 1.1, 1.7, 1.9, 2.10, 7.5_

- [ ] 4. State rules
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9_

  - [ ] 4.1 Extend StateInputs, evaluateState and stateFromSignals
    - New dependency rule, then Publisher rule, then the Existing rules unchanged. Existing reason texts unchanged.
    - _Requirements: 3.1, 3.2, 3.4, 3.5_

  - [ ] 4.2 Properties 1, 2 (state half) and 5, 1000 runs, in test/state-new-signals.test.ts
    - Extend the history-signals Property 2 oracle and Property 12 equivalence with the two inputs absent.
    - _Requirements: 3.3, 3.6, 3.7, 3.8_

  - [ ] 4.3 Confirm the default policy and the policy schema are unchanged
    - _Requirements: 3.9_

- [ ] 5. Timeline
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

  - [ ] 5.1 Carry the two values in TimelineFactsInput and TimelineFacts, and use them in stateAsOf
    - Pass them from api/src/timelines.ts and the demo generator.
    - _Requirements: 4.1, 4.2, 4.3_

  - [ ] 5.2 Property 3 in test/timeline/as-of-new-signals.test.ts
    - _Requirements: 4.4, 4.5_

- [ ] 6. Evidence, PR body, CLI table
  - _Requirements: 6.1, 6.2, 6.3, 6.4_

  - [ ] 6.1 Signal summaries and PR body rows for both signals
    - Property 9 for both.
    - _Requirements: 6.1, 6.2, 6.4_

  - [ ] 6.2 CLI columns "Publisher" and "New deps"
    - Through safe(). Update the table tests.
    - _Requirements: 6.3, 6.4_

- [ ] 7. Fixtures, demo, version
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

  - [ ] 7.1 Recorder mode --signals in packages/engine/scripts/record-fixtures.mjs, and run it
    - Merges `_npmUser` (name, trustedPublisher presence), `dependencies` and `maintainers` of the Installed and Earlier versions into each packument.json, and the Earlier version's hasInstallScript into abbreviated.json; writes test/fixtures/new-dependencies/<name>. Every other field byte-identical (checked with git diff). Diff the demo signals and timelines before and after and record each change.
    - _Requirements: 7.1, 7.2_

  - [ ] 7.2 Fixture routes for new-dependencies in test/helpers.ts and api/scripts/lib/fixture-routes.mjs
    - _Requirements: 7.5_

  - [ ] 7.3 Bump the engine to 0.2.0 with the api and cli pins and the lockfile; regenerate the golden evidence files; record the demo digest before and after
    - _Requirements: 7.3, 7.4_

- [ ] 8. Replays
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7_

  - [ ] 8.1 Extend replay-facts.mjs and replayStateInputs / replaySignals in generate-demo-scan.mjs
    - Facts and sources as in design.md "Replays", the 1.14.1 publisher name left out. Update the axios replay summary text. Regenerate packages/web/public/replay/axios.json and keyv.json with the generator.
    - _Requirements: 5.1, 5.2, 5.5, 5.6, 5.7_

  - [ ] 8.2 Tests: axios 00:21 Segment `new dependency in 1.14.1: plain-crypto-js`; keyv 09:35 `install script added in 6.0.0`
    - Update the web replay tests that quote the old axios reason, listed in the task notes.
    - _Requirements: 5.3, 5.4_

- [ ] 9. Measurement and documents
  - _Requirements: 8.1, 8.2, 8.3, 8.4_

  - [ ] 9.1 Run the built CLI against https://github.com/expressjs/express into build/ns-express-after and record every package's state before and after
    - Stop and report if more than 2 packages turn Possessed through the new rules.
    - _Requirements: 8.1, 8.2_

  - [ ] 9.2 docs/requirements.md: R-SG-10, R-SG-11, the Possessed line of R-ST-2; README signal list; product.md is steering and stays for Kiro
    - The change-log number is set when main is merged in (task 10).
    - _Requirements: 8.3, 8.4_

- [ ] 10. Web lines, after main has Cemetery undead phase 2
  - _Requirements: 8.3, 9.2, 9.3, 9.4_

  - [ ] 10.1 Merge main into spec/new-signals; stop and report if main has no phase 2
    - Set the change-log number in docs/requirements.md to the next free one.
    - _Requirements: 8.3, 9.4_

  - [ ] 10.2 Add the approved epitaph and speech-bubble lines with tests
    - _Requirements: 9.2, 9.3_

- [ ] 11. Final checks
  - Root gates, a fresh clone with `npx npm@11 ci` and the gates, an independent review of the whole branch, the report in private/reports/K3-new-signals.md. Nothing is pushed.
  - _Requirements: 7.5, 8.1_
