# Implementation Plan: cemetery-time-fixes

## Overview

Fixes six problems found after cemetery-time merged and after the first CI run. F1: the test suites pass on a fresh clone in any workspace order. F2: the replays use the npm registry publish times, so they start Alive. F3: a replay opens at its first Stop and a Play control steps through the Stops. F4: the hosted scan drops `timelines` above 5 MiB and says why. F5: a compact header with the canvas at or above y 190 at 1440 by 900, and a "Replay an attack" group. F6: the two screenshots. Then web.md, the README, the root gates and a second fresh-clone run on the final tree. Paths are relative to the repository root. No test touches the network.

Run-time notes for the agents:

- The impl agent edits files and runs only the test and typecheck commands. The orchestrator runs the Playwright tests (3.6, 5.4, 6.2, 9.4), the fresh-clone runs (1.6, 9.6), looks at the screenshots (6.3) and runs the root gates (9.x). No task installs a dependency in the working tree: this spec adds none and changes no `package.json`. The fresh-clone runs use `npx npm@11 ci` inside `build/fresh-clone` only.
- Every test sub-task names its test file and the property numbers of design.md. `numRuns` is 100 for every new property. Existing properties keep their `numRuns` (Property 21 of cemetery-time keeps 1000). Every new property test carries the tag `Feature: cemetery-time-fixes, Property N: <title>`.
- Tests change only where design.md lists a Deliberate test change (numbered 1 to 19 there). Any other existing test that fails is a regression: fix the source, not the test.
- Change only `packages/engine`, `packages/api`, `packages/web`, `README.md`, `docs/cemetery.png`, `docs/replay-axios.png`, `.kiro/steering/web.md` and `.kiro/specs/cemetery-time-fixes`. Nothing under `infra`, `packages/cli`, `packages/action` or `.github`, and no `package.json` or `package-lock.json`.
- Regenerate derived files with `npm run demo:generate -w @sexton/api` (offline). Never run `fixtures:record` and never use the network in a test.
- Each top-level task ends with a security review. Invoke the security-reviewer agent with the list of files that the task changed, ask it to review them against this spec's requirements and the security steering, record its findings in a "Review notes" line under that sub-task, and fix every finding of kind "defect" inside the same task before it is marked done.
- Run vitest one package at a time. Under load a first run can time out. Run the failing file alone before reading it as a regression.
- No task asks the user a question. Every call that needed a decision is recorded in design.md "Calls made without a user decision". Dates written by a task are 24 Nov 2026 (UTC) or the date of the run.

## Tasks

- [x] 1. Fresh-clone independence (F1)
  - Stops the api suite reading the gitignored demo scan, lets the web suite create the demo files itself, adds a static check against cross-workspace reads of generated files, and proves the result on a fresh clone.
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8_
  - [x] 1.1 Update `packages/api/test/timeline-size.test.ts`
    - Apply Deliberate test change 1: drop `DEMO` and `readFileSync`, build the template package, the report and the policy in a `beforeAll` with `buildDemoScan({ fixturesDir })` from `../scripts/generate-demo-scan.mjs` and `ENGINE_FIXTURES` from `./support/fixture-transport.js`. Keep both assertions. The file stays in the `tsconfig.test.json` exclude list.
    - _Requirements: 1.3_
    - Notes: the template package, report and policy come from `buildDemoScan({ fixturesDir: ENGINE_FIXTURES })` in a `beforeAll`. Both assertions kept. The file stays in the tsconfig.test.json exclude list.
  - [x] 1.2 Add `packages/web/test/global-setup.ts` and update `packages/web/vitest.config.ts`
    - `setup()` checks `packages/web/public/demo/scan.json`. When it is missing it runs `execFileSync("npm", ["run", "demo:generate", "-w", "@sexton/api"], { cwd: <repository root>, stdio: "inherit" })` with fixed arguments and no shell. Add `globalSetup: ["test/global-setup.ts"]`. Keep `pretest`.
    - _Requirements: 1.4_
    - Notes: `setup()` runs the generator only when `public/demo/scan.json` is missing, with `execFileSync`, fixed arguments and no shell. `pretest` kept.
  - [x] 1.3 Add `packages/api/test/fresh-clone.test.ts`
    - The static check of design.md "F1": walk `packages/*/test`, `packages/web/e2e` and `infra/test` (skip `fixtures` and `node_modules`), flag path-building lines that match the generated-path patterns, allow only the listed files with their reasons. Add the negative example (a synthetic line like the old `timeline-size.test.ts` line 8 is flagged). Add the static checks of requirement 1.7: `eslint.config.js` ignores `build/**`, the root `tsconfig.json` has `"files": []`, and each package `vitest.config.ts` includes only `test/**` paths.
    - _Requirements: 1.3, 1.5, 1.6, 1.7_
    - Notes: the check reads one line at a time and flags a line with a path call and a generated-path pattern. The allow list is the five files of design.md. The negative examples build their trigger strings by concatenation, so the test file does not flag itself. Also checks that the walk finds more than 100 files in every workspace and that each allowed file still names a generated path.
  - [x] 1.4 Run the api and web suites alone
    - `npm test -w @sexton/api` then `npm test -w @sexton/web`, one at a time. Both exit 0. Confirm `replay-facts.test.ts` "are byte-identical on two generator runs and equal the files on disk" passes (requirement 1.5). Record the file and test counts in "Notes".
    - _Requirements: 1.2, 1.4, 1.5_
    - Notes: `npm test -w @sexton/api` exit 0, 32 files, 286 tests (279 before, plus 7 in fresh-clone.test.ts). `npm test -w @sexton/web` exit 0, 39 files, 368 tests. `replay-facts.test.ts` "are byte-identical on two generator runs and equal the files on disk" passed.
  - [x] 1.5 Orchestrator checks the bare web Vitest run
    - In a fresh clone (made in 1.6) with `packages/web/public/demo` absent, run `npx vitest run` in `packages/web` and confirm that the global setup creates the demo files and the suite exits 0.
    - _Requirements: 1.4_
    - Notes: in the clone of 1.6, after the root run, `packages/web/public/demo` deleted. `npx vitest run` in `packages/web`: the global setup wrote the three demo files, exit 0, 39 files, 368 tests.
  - [x] 1.6 Orchestrator runs the fresh-clone proof
    - Commit the task's work. From the repository root: `git clone --branch <branch under test> <local repository path> build/fresh-clone`. In `build/fresh-clone`: `npx npm@11 ci`, then `npm test -w @sexton/api` (before any other workspace has run), then `npm test`. Record in design.md "Notes and open items" ("Fresh-clone proof after task 1"): each exit code and the files and tests per package. Then run 1.5 in the same clone, and remove `build/fresh-clone`.
    - _Requirements: 1.1, 1.2, 1.8_
    - Notes: commit 80c7543. api alone exit 0 (32 files, 286 tests, no demo folder created). Root `npm test` exit 0, 1836 tests. Per-package counts in design.md "Notes and open items". Clone removed.
  - [x] 1.7 Security review of task 1
    - Invoke the security-reviewer agent on the files of 1.1 to 1.3. Record the findings in "Review notes". Fix every defect in this task.
    - _Requirements: 11.5_
    - Review notes: READY, no defect. Notes kept: the check reads single lines, so a path call split over lines is not flagged; only .ts, .tsx and .mjs are walked, as design.md says; the allow list is per file; the global setup checks only scan.json, which is the file the web tests read; `execFileSync("npm")` needs npm.cmd on Windows, and CI runs on Ubuntu and macOS only; the nag.test.ts entry is not strictly needed, kept because design.md lists it.

- [x] 2. Registry publish times for the replays (F2)
  - Adds the registry times, the keyv 5.6.0 deprecated and provenance facts and the two registry sources, moves the windows, regenerates the fixtures and updates the tests that pin the old values.
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 2.10_
  - [x] 2.1 Update `packages/api/scripts/lib/replay-facts.mjs`
    - As in design.md "F2" and "Replay facts": `SOURCE_URLS` gains `registryAxios` and `registryKeyv` (comment: eight URLs), each replay gains its registry source last, the five publish times, keyv 5.6.0 `deprecated: false` and `provenance: false`, the new `stops` (axios 23:21:58.168Z, 00:21:58.168Z, 03:29:00.000Z; keyv 08:35:00.763Z, 09:35:00.763Z), keyv `generatedAt` 2026-08-04T09:35:00.763Z, `factSources.publishedAt` the registry URL, keyv `factSources.deprecated`. Titles, summaries and the six older URLs stay.
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.7, 2.8_
    - Notes: eight URLs, the registry source last in each replay, the five publish times, keyv 5.6.0 deprecated false and provenance false, Stops and keyv Scan date moved, `factSources.publishedAt` the registry, keyv `factSources.deprecated`. Titles, summaries and the six older URLs unchanged.
  - [x] 2.2 Update `packages/api/scripts/generate-demo-scan.mjs`
    - `replayStateInputs` sets `inputs.deprecated` when the version has a boolean `deprecated`. `replaySignals` sets the `deprecated` signal from the installed version when it has a boolean `deprecated` (source `factSources.deprecated`), else unavailable as before. No other change.
    - _Requirements: 2.2, 2.6_
    - Notes: `replayStateInputs` sets `deprecated` from a boolean fact. `replaySignals` sets the `deprecated` signal from a boolean fact of the installed version, else unavailable. The installed versions have none, so both reports keep it unavailable.
  - [x] 2.3 Regenerate and compare
    - Save copies of the three demo files under `build/`, run `npm run demo:generate -w @sexton/api`, and confirm with `cmp` that the three demo files are byte-identical and the printed digest is c8fb6cab465d46ca92cf83dbc10022b6a662c8fad68ec8f64d827ef16f43344d. Record the sizes, the digest and the generated Stops (instant, version, state, reason) of both fixtures in design.md "Notes and open items" and compare them with the table of "Replay facts". If a row differs, fix the generator. If the Engine rule makes the table wrong, correct the table and say why in "Review notes".
    - _Requirements: 2.4, 2.5, 2.6, 2.9_
    - Notes: the three demo files are byte-identical (cmp), digest c8fb6cab465d46ca92cf83dbc10022b6a662c8fad68ec8f64d827ef16f43344d. Every generated Stop equals the table of "Replay facts". Sizes and Stops in design.md "Notes and open items".
  - [x] 2.4 Update the tests that pin the replay values
    - Apply Deliberate test changes 2, 3, 4, 5 (`packages/api/test/replay-facts.test.ts`), 6 (`packages/web/test/support/replay-fixture.ts`), 11 (`replay.test.tsx` import rename), the task 2 parts of 8 and 10 (the label "axios 1.14.0, Alive"), 16 and the task 2 parts of 17 and 18 (`packages/web/e2e/time.spec.ts`, labels Alive and four links; written, run by the orchestrator in 3.6).
    - _Requirements: 2.1, 2.2, 2.4, 2.5, 2.6, 2.7_
    - Notes: Deliberate test changes 2 to 6, 11, 16, the task 2 parts of 8 and 10 ("axios 1.14.0, Alive") and of 17 and 18 (titles, Alive labels, four links). api replay-facts 6 of 6, web replay and validate-scan-response 35 of 35.
  - [x] 2.5 Extend `packages/api/test/replay-facts.test.ts`: Property 4
    - **Property 4: The replays follow the registry facts**
    - **Validates: Requirements 2.3, 2.4, 2.5, 2.6, 2.10**
    - Instants drawn from each window with `fc.integer`, plus the Stop instants and the millisecond before each. An independent model of the facts (with `deprecated`). The fixture on disk passes the Validator.
    - Tag: `Feature: cemetery-time-fixes, Property 4: The replays follow the registry facts`.
    - _Requirements: 2.3, 2.4, 2.5, 2.6, 2.10_
    - Notes: Property 4 in replay-facts.test.ts, 100 runs per replay, with the Stop instants, the millisecond before each and the Scan date as fixed cases. The bad publishes and Scan dates are literals from requirements 2.1 and 2.5. The review's note 1 added a literal check of the registry facts (a new test, not a change to an old one).
  - [x] 2.6 Security review of task 2
    - Invoke the security-reviewer agent on the files of 2.1 to 2.5 and the two regenerated fixtures. Record the findings in "Review notes". Fix every defect in this task.
    - _Requirements: 11.5_
    - Review notes: READY, no defect. Acted on: note 1, no test pinned the literal facts of 2.1 and 2.2, so a test now does. Notes kept: the keyv 5.6.0 provenance source (call 12) is a comment, since Segments carry no source; a replay whose installed version had a boolean deprecated would need `factSources.deprecated`, which axios lacks, and no fact gives one today; Property 4 reuses the model of Property 13, which adds no no-regression input, with no effect while lastPublish is present; Property 4 does not check the report state, the EXPECTED and trace tests do.

- [x] 3. Opening Stop and the Play control (F3)
  - A replay opens at its first Stop. A Play control steps one Stop every 1,500 ms through a pure reducer and a timer hook, and announces each step in a polite live line.
  - _Requirements: 3.1, 3.2, 3.3, 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9, 4.10, 4.11_
  - [x] 3.1 Create `packages/web/src/time/play.ts`
    - `PLAY_STEP_MS`, `PlayState`, `PlayEvent`, `openingStop(count, replay)` and `playStep(state, event)` with the rules of design.md "F3". Pure.
    - _Requirements: 3.1, 3.2, 3.3, 4.3, 4.4, 4.5, 4.6, 4.10_
    - Notes: pure `openingStop` and `playStep` with the rules of design.md F3. Seek clamps a negative or non-integer index to 0.
  - [x] 3.2 Write `packages/web/test/play.test.ts`: Property 3
    - **Property 3: Play visits the Stops in order and ends at the last**
    - **Validates: Requirements 3.1, 3.2, 3.3, 4.3, 4.4, 4.5, 4.6, 4.10**
    - Generated Stop counts 0 to 40, replay flags and event sequences, checked against a plain loop model.
    - Tag: `Feature: cemetery-time-fixes, Property 3: Play visits the Stops in order and ends at the last`.
    - _Requirements: 3.1, 3.2, 3.3, 4.3, 4.4, 4.5, 4.6, 4.10_
    - Notes: Property 3 in play.test.ts, 100 runs, Stop counts 0 to 40, both replay flags, up to 60 events, checked against a plain loop model, then a play and ticks from the final state.
  - [x] 3.3 Create `packages/web/src/time/use-play.ts`
    - `useReducer(playStep)`, `load` on a new `loadId`, one `setTimeout(PLAY_STEP_MS)` while playing with cleanup, the announcement text of design.md call 24. Returns `{ index, playing, announce, play, pause, seek }`.
    - _Requirements: 4.4, 4.5, 4.7, 4.9_
    - Notes: one `setTimeout(PLAY_STEP_MS)` while playing, cleared by the effect cleanup on each step, pause, seek, new load and unmount. State keyed by load (design.md "Decisions made during implementation" 1 and 2).
  - [x] 3.4 Update `packages/web/src/App.tsx`, `packages/web/src/time/Scrubber.tsx` and `packages/web/src/styles.css`
    - App uses `usePlay` in place of `picked` (replay flag from `state.response.replay`), "Back to now" calls `seek(last)` and focuses the slider. Scrubber renders the Play button (class `scrub-play`, only for more than one Stop, before the slider) and the `aria-live="polite"` line with the class `visually-hidden`. CSS: `.scrub-play`, `.scrub-play:focus-visible` (3 px `--focus`), `.visually-hidden`, no transition and no animation.
    - _Requirements: 3.1, 3.2, 3.3, 4.1, 4.2, 4.5, 4.6, 4.7, 4.8, 4.11_
    - Notes: App uses `usePlay`, the slider and Back to now call `seek`. Scrubber renders Play (only for more than one Stop) between the date text and the slider, and the polite live line at the end of the section. CSS adds `.scrub-play`, its focus ring and `.visually-hidden`, with tokens only and no transition or animation.
  - [x] 3.5 Update the web tests for the opening Stop and Play
    - Apply Deliberate test changes 9, 13, 14, the task 3 parts of 8, 10 and 12 (`seen[7]` "Play", `seen[8]` "History date", ten presses). Add the hook examples to `play.test.ts` (fake timers: 1,500 ms per step, none before, stop at the last, pause, unmount and new load clear the timer, no step without a press) and the DOM examples to `scrubber.test.tsx` and `replay.test.tsx` listed in design.md "Testing Strategy", and the `styles.test.ts` additions.
    - _Requirements: 3.1, 3.2, 3.3, 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9, 4.11_
    - Notes: Deliberate test changes 9, 13, 14 and the task 3 parts of 8, 10 and 12 applied. New: nine hook examples in play.test.ts, eight Play examples in scrubber.test.tsx, one opening-Stop example in replay.test.tsx, one styles example. web 40 files, 388 tests.
  - [x] 3.6 Extend `packages/web/e2e/time.spec.ts` (written by impl, run by the orchestrator)
    - Apply the task 3 parts of Deliberate test changes 17 and 18 (slider "0" at load, "keyv 5.6.0, Alive"). Add the Play test: `page.clock.install()` before `goto("/?replay=axios")`, press Play, `runFor(1500)` gives "axios 1.14.1, Possessed", `runFor(1500)` gives Stop 2 and the button named "Play" again. The orchestrator runs `npm run test:e2e -w @sexton/web` and records the result in "Notes".
    - _Requirements: 3.1, 4.2, 4.4, 4.11_
    - Notes: task 3 parts of changes 17 and 18 (slider 0 and keyv 5.6.0 Alive at load) and the Play test with `page.clock`. `npm run test:e2e -w @sexton/web`: 18 passed, none skipped, repaint medians 1.90 ms and 1.60 ms after a scrubber move. The smoke test rewrote docs/cemetery.png, restored until task 6.
  - [x] 3.7 Security review of task 3
    - Invoke the security-reviewer agent on the files of 3.1 to 3.6. Record the findings in "Review notes". Fix every defect in this task.
    - _Requirements: 11.5_
    - Review notes: READY, no defect. Acted on: an event that changes nothing no longer clears the live line; the axe-while-playing example now holds the timer with fake timers so no tick lands during axe. Recorded as design decisions 1 and 2: the hook keys its state by load and takes the Stops. Notes kept: reduced motion is checked for timing only, and the play path has no animation code.

- [x] 4. The timelines size guard (F4)
  - Drops `timelines` from a hosted scan body over 5 MiB and names the reason in the contract, the Validator and the web app.
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 6.1, 6.2, 6.3, 6.4, 6.5_
  - [x] 4.1 Create `packages/api/src/timelines-guard.ts` and update `packages/api/src/scan.ts`
    - `TIMELINES_SIZE_LIMIT`, `responseBytes`, `guardTimelinesSize` and `applySizeGuard` as in design.md "F4". `scan()` returns `applySizeGuard(outcome.body, deps.log)`. `scanWithInputs` and the evidence path do not change.
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6_
    - Notes: `guardTimelinesSize` is pure and returns the input object when it has no timelines or fits. `applySizeGuard` writes `{ msg: "timelines-omitted", bytes }`. `scan()` applies it; `scanWithInputs` and the evidence path are unchanged.
  - [x] 4.2 Update `packages/api/src/contract.ts` and `packages/web/src/load/validate-scan-response.ts`
    - `timelinesOmitted?: "too-large"` on `ScanResponse`. `checkTimelinesOmitted`: exactly `"too-large"` and no `timelines`, else `UNKNOWN_VALUE` at `/timelinesOmitted`. No new error code.
    - _Requirements: 6.1, 6.2, 6.3_
    - Notes: `timelinesOmitted?: "too-large"` on ScanResponse. `checkTimelinesOmitted` gives UNKNOWN_VALUE at /timelinesOmitted for any other value or the pair with timelines, with the fixed message.
  - [x] 4.3 Update `packages/web/src/App.tsx`, `packages/web/src/time/Scrubber.tsx` and `styles.css`
    - Export `HISTORY_OMITTED_TEXT` ("History is not shown for this scan because it is too large."). App renders `<p className="history-omitted">` in place of the scrubber when `timelinesOmitted === "too-large"`. CSS: the band style of `.scrub`, no colour literal.
    - _Requirements: 6.4, 6.5_
    - Notes: `HISTORY_OMITTED_TEXT` in Scrubber.tsx. App renders `p.history-omitted` in the scrubber's place for a ready response with `timelinesOmitted` "too-large". CSS uses the band tokens of `.scrub`.
  - [x] 4.4 Write `packages/api/test/timelines-guard.test.ts`: Property 1, and extend `timeline-size.test.ts`
    - **Property 1: The size guard bounds the response and keeps every other field**
    - **Validates: Requirements 5.1, 5.2, 5.3, 5.4**
    - Generated bodies from `test/arbitraries.ts` with and without `timelines`, limits 1 to 200,000. Examples of design.md "Testing Strategy" (the exact limit, one byte over, UTF-8 counting, the warn line). In `timeline-size.test.ts` add the 300 by 64 example at the real limit (omitted) and the 80 character case (kept), with no Generated file.
    - Tag: `Feature: cemetery-time-fixes, Property 1: The size guard bounds the response and keeps every other field`.
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.7_
    - Notes: Property 1, 100 runs, bodies up to about 90 KB against limits 1 to 200,000, so both branches run. Examples: the limit constant, exactly at and one byte over, UTF-8 counting, the warn line and no line under the limit. timeline-size: the 300 by 64 case at 200 characters is omitted and still validates, the 80 character case is kept, all in memory.
  - [x] 4.5 Extend `packages/web/test/validate-scan-response.test.ts`: Property 2
    - **Property 2: The validator accepts the omitted reason only as "too-large" and never with timelines**
    - **Validates: Requirements 6.2, 6.3**
    - Tag: `Feature: cemetery-time-fixes, Property 2: The validator accepts the omitted reason only as "too-large" and never with timelines`.
    - _Requirements: 6.2, 6.3_
    - Notes: Property 2, 100 runs, strings with case and padding variants, numbers, booleans, null, arrays and objects, with and without timelines, against the oracle `v === "too-large"` and no timelines.
  - [x] 4.6 Extend `packages/web/test/app.test.tsx` and `packages/api/test/scan.test.ts`
    - App: the omitted line and no slider for `timelinesOmitted`, neither for a response with neither field. Scan: a hosted scan on the fixture transport carries `timelines` and no `timelinesOmitted`, and the evidence digest test of `generate-demo-scan.test.ts` still passes unedited.
    - _Requirements: 5.2, 5.6, 6.4, 6.5_
    - Notes: App: the omitted line sits directly after the header, no slider, no live region; neither shows for a response with neither field. Scan: a hosted scan on the fixture transport carries timelines and no timelinesOmitted. generate-demo-scan.test.ts passes unedited. api 33 files, 296 tests. web 40 files, 391 tests.
  - [x] 4.7 Security review of task 4
    - Invoke the security-reviewer agent on the files of 4.1 to 4.6. Record the findings in "Review notes". Fix every defect in this task.
    - _Requirements: 11.5_
    - Review notes: READY, no defect. Notes kept: no handler-level test drives a hosted scan over 5 MiB (the fixtures cannot reach it, the guard is unit tested and wired in one line); the 80 character case asserts no margin; the body is serialised twice on the hosted path, once by the guard and once by the handler.

- [x] 5. Compact header and the "Replay an attack" group (F5)
  - Puts the form and the Replay group on one row and the scrubber on one row at 960 px and wider, labels the group, and renames the buttons.
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 8.1, 8.2, 8.3_
  - [x] 5.1 Update `packages/web/src/replay/replay-ids.ts` and `packages/web/src/replay/ReplayButtons.tsx`
    - `REPLAY_BUTTON_TEXT` becomes `{ axios: "axios, Mar 2026", keyv: "keyv, Aug 2026" }`. The group gets `aria-labelledby="replay-label"` and a visible `span#replay-label.replay-label` "Replay an attack" before the buttons.
    - _Requirements: 8.1, 8.2_
    - Notes: `REPLAY_BUTTON_TEXT` is "axios, Mar 2026" and "keyv, Aug 2026". The group has `aria-labelledby="replay-label"` and a visible `span#replay-label.replay-label` "Replay an attack" before the buttons.
  - [x] 5.2 Update `packages/web/src/styles.css`
    - The `@media (min-width: 960px)` block and the `.replay-label` rule of design.md "F5". The 600 px block and every other rule stay.
    - _Requirements: 7.1, 7.2, 7.3, 7.5_
    - Notes: one `@media (min-width: 960px)` block at the end of styles.css, after the base rules, and `.replay-label`. Adds `.header-top { flex: 1 1 50% }` (design.md "Decisions made during implementation" 4) and a 0 row gap on `.scrub` (decision 5). The 600 px block and every other rule unchanged.
  - [x] 5.3 Update the web tests for the new names
    - Apply Deliberate test changes 7, the task 5 parts of 8, 12 and 18. Add to `replay.test.tsx`: the label "Replay an attack" is visible text inside the group and names it. Confirm `header.test.tsx` passes unedited.
    - _Requirements: 7.4, 8.1, 8.2, 8.3_
    - Notes: Deliberate test changes 7 and the task 5 parts of 8, 12 and 18. New example: the label is visible text, the first child of the group, and names it. header.test.tsx passes unedited. web 40 files, 392 tests.
  - [x] 5.4 Extend `packages/web/e2e/time.spec.ts` (written by impl, run by the orchestrator)
    - At 1440 by 900 on the demo at the Scan date with Reduced motion: the canvas top is at most 190 (log the header height, the scrubber height and the canvas top). At 360 by 800: `document.documentElement.scrollWidth` is 360 on the demo and on `?replay=axios`. The orchestrator runs `npm run test:e2e -w @sexton/web` and records the measured heights in design.md "Notes and open items".
    - _Requirements: 7.1, 7.2, 7.3, 7.5_
    - Notes: layout test at 1440 by 900 and two 360 px tests. First run: header 160 px, canvas top 201 px, and two cemetery-polish e2e tests failed because the field sat under the drawer. Fixed in the CSS (decision 4), not the tests. Second run: 21 passed, header 122.3 px, scrubber 41.3 px, canvas top 163.6 px, scrollWidth 360 on the demo and the axios replay. Recorded in design.md.
  - [x] 5.5 Security review of task 5
    - Invoke the security-reviewer agent on the files of 5.1 to 5.4. Record the findings in "Review notes". Fix every defect in this task.
    - _Requirements: 11.5_
    - Review notes: READY, no defect. Acted on: the 0 row gap of `.scrub` is recorded as decision 5. Notes kept: below 960 px the group label wraps with the buttons, covered by the 360 px tests.

- [x] 6. Screenshots (F6)
  - Retakes the cemetery screenshot and adds the axios replay screenshot.
  - _Requirements: 9.1, 9.2, 9.3_
  - [x] 6.1 Extend `packages/web/e2e/smoke.spec.ts`
    - Add the test "the axios replay at its Possessed stop, for the README" of design.md "F6": 1440 by 900, Reduced motion, foreign origins blocked, `/?replay=axios`, ArrowRight on the slider, wait for "axios 1.14.1, Possessed" and two animation frames, banner visible, drawer closed, write `docs/replay-axios.png`. Deliberate test change 19: the cemetery screenshot step stays as it is.
    - _Requirements: 9.1, 9.2_
    - Notes: new test "the axios replay at its Possessed stop, for the README" in smoke.spec.ts. Deliberate test change 19: the cemetery screenshot step is unchanged.
  - [x] 6.2 Orchestrator writes both screenshots
    - Run `npm run test:e2e -w @sexton/web`. Confirm both tests ran (not skipped) and that `docs/cemetery.png` and `docs/replay-axios.png` are 1440 by 900 with new modification times. Record in "Notes".
    - _Requirements: 9.1, 9.2_
    - Notes: `npm run test:e2e -w @sexton/web`: 22 passed, none skipped. Both files written at 02:22 and again on the final run, 1440 by 900, PNG chunks IHDR, IDAT and IEND only. A first run surfaced two things fixed in the source: the replay put the form on row 1 (design.md decision 4, header row break) and the canvas-bottom e2e failed 1 run in 3 on the fractional canvas top (decision 6, `Math.ceil` in use-free-height.ts). The layout e2e gained a replay row check.
  - [x] 6.3 Orchestrator reads both images itself
    - Open both files as images. Cemetery: drawer closed, the canvas starts at or above y 190, the "Replay an attack" label and the two buttons sit on the form row, Play and the slider sit on one row. Replay: the banner with four links, the axios open grave of Possessed with 1.14.1, the as-of line. Record what was seen under "Notes". If any item fails, fix the cause in the owning task and retake. Do not wait for the user.
    - _Requirements: 9.3_
    - Notes: read both images. docs/cemetery.png: drawer closed, canvas top about 164 (at or above 190), "Replay an attack" and both buttons on the form row, label, date, Play and slider on one row, 12 graves. docs/replay-axios.png: banner with the title, the not-a-live-scan line, the summary and four links (Trend Micro, CSA, npm docs, npm registry), the open Possessed grave "axios 1.14.1", the as-of line "as of 31 Mar 2026, 00:21 UTC" with Back to now, slider at Stop 1, drawer closed. First pass of the replay image showed the form on row 1 and the Replay group on row 2, fixed and retaken.
  - [x] 6.4 Security review of task 6
    - Invoke the security-reviewer agent on `docs/cemetery.png` and `docs/replay-axios.png` (metadata only) and `packages/web/e2e/smoke.spec.ts`. Record the findings in "Review notes". Fix every defect in this task.
    - _Requirements: 11.5_
    - Review notes: READY, no defect. Acted on: a unit test now pins `freeHeight` rounding up (test/free-height.test.ts). Notes kept: the paint wait relies on two frames after the Possessed label; the 1 px vertical overflow is recorded in decision 6; with a row gap of 0, a wrapped row 1 would get no gap, which cannot happen at 960 px and wider (row 1 needs about 708 px); the blue box in the pictures is the selected-grave ring.

- [x] 7. Steering web.md
  - Brings the cemetery rules in line with the built behaviour.
  - _Requirements: 10.3_
  - [x] 7.1 Update `.kiro/steering/web.md`
    - Replace the button texts in the replay rule with "axios, Mar 2026" and "keyv, Aug 2026" in the group "Replay an attack". Add: a replay opens at its first Stop and every other scan at its scan date; the Play control (shown for more than one Stop, one Stop every 1,500 ms, restarts at the last Stop, paused by the slider, Back to now and a new load, announced in a polite live line, never automatic); the omitted history line for `timelinesOmitted`; the canvas top at most 190 px at 1440 by 900 on the demo. Keep the front matter and every other rule.
    - _Requirements: 10.3_
    - Notes: the replay rule names "axios, Mar 2026" and "keyv, Aug 2026" in the group "Replay an attack". Four lines added: the opening Stop, the Play control, the omitted history line, and the canvas top at most 190 px with the two rows at 960 px and wider. Front matter and every other rule unchanged.
  - [x] 7.2 Security review of task 7
    - Invoke the security-reviewer agent on `.kiro/steering/web.md`. Record the findings in "Review notes". Fix every defect in this task.
    - _Requirements: 11.5_
    - Review notes: READY, no defect. Every new line was checked against the built code. Note kept: the one-row scrubber at 960 px comes from the CSS and the e2e run.

- [x] 8. README
  - Describes the new replay controls and shows the replay screenshot.
  - _Requirements: 10.1, 10.2_
  - [x] 8.1 Update `README.md` and `packages/web/test/readme.test.ts`
    - In "## Replay": name the "Replay an attack" group with the buttons "axios, Mar 2026" and "keyv, Aug 2026", say that a replay opens before the attack and that Play steps through it, keep the two links and the sentence "A replay is reconstructed from public reports. It is not a live scan.", and add the image line of design.md "F6" on its own line. Short sentences, no semicolon, no em dash. Apply Deliberate test change 15.
    - _Requirements: 10.1, 10.2_
    - Notes: the Replay section names the group and both buttons, says a replay opens one hour before the attack so the grave starts Alive, and that Play steps through it. The image line is on its own line with the alt text of call 36. Both links and the not-a-live-scan sentence kept. No semicolon, no em dash. Deliberate test change 15: one new test in readme.test.ts, 8 of 8 pass.
  - [x] 8.2 Security review of task 8
    - Invoke the security-reviewer agent on the files of 8.1. Record the findings in "Review notes". Fix every defect in this task.
    - _Requirements: 11.5_
    - Review notes: READY, no defect. Acted on: the test now checks "Press Play" instead of any "Play". The opening claim was checked against both fixtures.

- [x] 9. Root gates and the final fresh-clone run
  - Runs every gate once on the final tree, then proves the fresh clone again.
  - _Requirements: 1.1, 1.2, 1.8, 11.1, 11.2, 11.3, 11.4, 11.5_
  - [x] 9.1 Orchestrator runs typecheck
    - `npm run typecheck` at the root, zero errors.
    - _Requirements: 11.4_
    - Notes: `npm run typecheck` exit 0.
  - [x] 9.2 Orchestrator runs lint
    - `npm run lint` at the root, zero errors and zero warnings. Confirm no file under `build/` is reported.
    - _Requirements: 1.7, 11.4_
    - Notes: `npm run lint` exit 0, zero warnings, no file under build/ reported.
  - [x] 9.3 Orchestrator runs the test suites
    - `npm test -w @sexton/engine`, `-w @sexton/api`, `-w @sexton/web`, `-w @sexton/cli`, `-w @sexton/action`, `-w sexton-infra`, one at a time, then `npm test` at the root. Every existing test is green apart from the Deliberate test changes, which pass in their new form. No test is skipped and none timed out.
    - _Requirements: 11.3, 11.4_
    - Notes: one at a time, all exit 0: engine 78 files 1059 tests, api 33 files 296, web 41 files 395, cli 4 files 60, action 2 files 12, infra 6 files 51. Root `npm test` exit 0, 1873 tests (1829 before the spec). None skipped, none timed out.
  - [x] 9.4 Orchestrator runs the end-to-end tests
    - `npm run test:e2e -w @sexton/web`. Confirm the specs ran and were not skipped, the 300-grave medians are at most 16 ms, the canvas top and the 360 px checks pass, the Play test passes, and there is no CSP violation.
    - _Requirements: 7.1, 7.3, 11.3, 11.4_
    - Notes: `npm run test:e2e -w @sexton/web` 22 passed, none skipped. 300-grave medians 1.90 ms and 1.60 ms after a scrubber move. Canvas top 163.6 px, 360 px checks pass, Play test passes, no CSP violation (the smoke and time specs assert none). Both screenshots came out byte-identical to the committed ones.
  - [x] 9.5 Orchestrator checks the scope of the change
    - List the changed and untracked files. Confirm every path is under `packages/engine`, `packages/api`, `packages/web`, `.kiro/specs/cemetery-time-fixes`, or is `README.md`, `docs/cemetery.png`, `docs/replay-axios.png` or `.kiro/steering/web.md`. Nothing under `infra`, `packages/cli`, `packages/action` or `.github`, and no `package.json` or `package-lock.json`. Confirm `packages/web/package.json` and `packages/api/package.json` show no runtime dependency change. Run `npm run build -w @sexton/web` and confirm its bundle check passes.
    - _Requirements: 11.1, 11.2_
    - Notes: 43 paths changed since 6f00200, all under packages/api, packages/web, .kiro/specs/cemetery-time-fixes, or README.md, docs/cemetery.png, docs/replay-axios.png, .kiro/steering/web.md. Nothing under infra, packages/cli, packages/action, .github or packages/engine. No package.json or package-lock.json change. `npm run build -w @sexton/web` exit 0, check-bundle: 8 files clean.
  - [x] 9.6 Orchestrator runs the fresh-clone proof on the final tree
    - Commit, then repeat 1.6 and 1.5 in a new `build/fresh-clone`. Record the results in design.md "Notes and open items" ("Fresh-clone proof on the final tree"). Remove `build/fresh-clone`.
    - _Requirements: 1.1, 1.2, 1.4, 1.8_
    - Notes: commit bee8968. api alone exit 0 (33 files, 296 tests, no demo folder created), root `npm test` exit 0 (1873 tests), bare web Vitest with the demo folder deleted exit 0 (41 files, 395 tests, demo files written by the global setup). Counts in design.md "Notes and open items". Clone removed.
  - [x] 9.7 Security review of the whole change
    - Invoke the security-reviewer agent on the whole branch against this spec's requirements and the security steering. Record the findings in "Review notes". Fix every defect before the spec is closed.
    - _Requirements: 11.5_
    - Review notes: READY, no defect, over the whole branch (8 commits, 43 paths). Checked: no secret, no network in tests, Engine untouched, no new fetch, no shell, no innerHTML, demo generator path untouched, every changed line of a pre-existing test maps to Deliberate test changes 1 to 19, numRuns and the 16 ms budget kept, all paths allowed, no trailers and no attribution. Notes kept: the 1 px vertical overflow of decision 6; the guard measures a body without timelines for a byte count only its tests read; a body still over the limit without timelines is not capped, as 5.4 allows; Property 4's model shares the generator's rules, and the EXPECTED rows and the literal facts test pin the values.

## Notes

- Test sub-tasks are not optional in this plan.
- Each sub-task references the requirements it implements. Requirement numbers are those of requirements.md in this spec.
- Orchestrator sub-tasks (1.5, 1.6, 3.6 run, 5.4 run, 6.2, 6.3, 9.x) need a browser, git or the orchestrator, and are not run by the impl agent. None asks or waits for the user.
- Deliberate test changes are numbered in design.md. Changes 8, 10, 12, 17 and 18 are applied in parts across tasks 2, 3 and 5, as their brackets say. Anything not listed there must pass unmodified.
- The security review of each top-level task is its last sub-task. Reviews run after the task's tests pass.
- Top-level tasks run in order. Each finishes, including its review, before the next starts, so a review reads one task's diff.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2"] },
    { "id": 1, "tasks": ["1.3"] },
    { "id": 2, "tasks": ["1.4"] },
    { "id": 3, "tasks": ["1.6"] },
    { "id": 4, "tasks": ["1.5"] },
    { "id": 5, "tasks": ["1.7"] },
    { "id": 6, "tasks": ["2.1"] },
    { "id": 7, "tasks": ["2.2"] },
    { "id": 8, "tasks": ["2.3"] },
    { "id": 9, "tasks": ["2.4"] },
    { "id": 10, "tasks": ["2.5"] },
    { "id": 11, "tasks": ["2.6"] },
    { "id": 12, "tasks": ["3.1"] },
    { "id": 13, "tasks": ["3.2", "3.3"] },
    { "id": 14, "tasks": ["3.4"] },
    { "id": 15, "tasks": ["3.5", "3.6"] },
    { "id": 16, "tasks": ["3.7"] },
    { "id": 17, "tasks": ["4.1", "4.2"] },
    { "id": 18, "tasks": ["4.3", "4.4"] },
    { "id": 19, "tasks": ["4.5", "4.6"] },
    { "id": 20, "tasks": ["4.7"] },
    { "id": 21, "tasks": ["5.1", "5.2"] },
    { "id": 22, "tasks": ["5.3"] },
    { "id": 23, "tasks": ["5.4"] },
    { "id": 24, "tasks": ["5.5"] },
    { "id": 25, "tasks": ["6.1"] },
    { "id": 26, "tasks": ["6.2"] },
    { "id": 27, "tasks": ["6.3"] },
    { "id": 28, "tasks": ["6.4"] },
    { "id": 29, "tasks": ["7.1"] },
    { "id": 30, "tasks": ["7.2"] },
    { "id": 31, "tasks": ["8.1"] },
    { "id": 32, "tasks": ["8.2"] },
    { "id": 33, "tasks": ["9.1", "9.2"] },
    { "id": 34, "tasks": ["9.3"] },
    { "id": 35, "tasks": ["9.4"] },
    { "id": 36, "tasks": ["9.5"] },
    { "id": 37, "tasks": ["9.6"] },
    { "id": 38, "tasks": ["9.7"] }
  ]
}
```
