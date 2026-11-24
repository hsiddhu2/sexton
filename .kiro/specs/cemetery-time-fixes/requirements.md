# Requirements Document

## Introduction

The cemetery-time-fixes module fixes six problems found after the cemetery-time spec merged and after the first CI run on GitHub (repository hsiddhu2/sexton, private, run 45327171626). Each problem was confirmed in the code before its requirement was written. design.md section "Confirmation" gives the file and line of each.

- **F1.** CI fails on a fresh clone. An api test reads `packages/web/public/demo/scan.json`, a gitignored file that only the web package's pretest creates, and the root `npm test` runs api before web.
- **F2.** The two replays read Restless "all state signals unavailable" before and after the attack, because axios 1.14.0 and keyv 5.6.0 had no publish time in the facts. The npm registry gives the publish times.
- **F3.** A replay opens at its last Stop. It should open at its first Stop, and a viewer should be able to play the history forward.
- **F4.** The hosted scan adds the Timelines with no size check. The worst case is about 5.6 MB, near the Lambda response limit.
- **F5.** The header and the scrubber push the graves down. At 1440 by 900 the sky starts near y 250.
- **F6.** The README screenshot shows the old header, and the README has no picture of a replay.

This spec traces to R-UI-1, R-UI-4, R-UI-5, R-UI-6 and R-UI-7 of docs/requirements.md section 5.8, to N-3, N-4 and N-8 of section 6, and to the cemetery-time spec. It changes no state rule, no policy rule and no field of the evidence pack. It does not change docs/requirements.md.

This spec does NOT add a runtime dependency, a web font, an image, an audio file or an external request at run time. It changes only `packages/engine`, `packages/api`, `packages/web`, `README.md`, `docs/cemetery.png`, `docs/replay-axios.png`, `.kiro/steering/web.md` and the folder `.kiro/specs/cemetery-time-fixes`. It changes nothing under `infra`, `packages/cli`, `packages/action` or `.github`, and no `package.json` or `package-lock.json`. Every deliberate change to an existing test is listed in design.md under "Deliberate test changes". All dates this spec writes are 24 Nov 2026 (UTC) unless they are incident or registry facts.

## Glossary

- **Web app**: the `@sexton/web` package.
- **API**: the `@sexton/api` package.
- **Engine**: the `@sexton/engine` package.
- **Replay generator**: `packages/api/scripts/generate-demo-scan.mjs` with its facts file `packages/api/scripts/lib/replay-facts.mjs`. It writes the Demo files and the Replay fixtures, offline, when `npm run demo:generate -w @sexton/api` runs.
- **Validator**: `validateScanResponse` in `packages/web/src/load/validate-scan-response.ts`.
- **Fresh clone**: a new `git clone` of the repository with `npm ci` run in it and nothing else. It holds only committed files.
- **Generated file**: a file that a script writes and git ignores. The Demo files `packages/web/public/demo/scan.json`, `evidence.json` and `evidence.md` are Generated files (`.gitignore` lines 33 to 35). So are `dist`, `dist-types`, `dist-e2e`, `build/*` and `cdk.out`.
- **Committed fixture**: a file that a script writes and git keeps. The Replay fixtures `packages/web/public/replay/axios.json` and `keyv.json` are Committed fixtures.
- **Root test order**: the order in which the root `npm test` runs the workspaces: action, api, cli, engine, web, infra.
- **Test suites**: the Vitest suites of the six workspaces.
- **Replay**: a scan response with a `replay` block, loaded from a Replay fixture. Ids `axios` and `keyv`.
- **Bad publish**: the publish of the compromised version of a Replay: axios 1.14.1 at 2026-03-31T00:21:58.168Z, keyv 6.0.0 at 2026-08-04T09:35:00.763Z (npm registry).
- **Replay window**: the span of a Replay from its first Stop to its Scan date. The first Stop is one hour before the Bad publish.
- **Stop**: one position of the scrubber, as defined by cemetery-time (Scrubber start, Step marks, Scan date).
- **Opening Stop**: the Stop that the scrubber shows when a response loads.
- **Play control**: a native button beside the scrubber, named "Play" while stopped and "Pause" while playing.
- **Play step**: one move of the scrubber to the next Stop while playing, 1,500 ms after the previous one.
- **Size limit**: 5,242,880 bytes (5 MiB), measured as the UTF-8 byte length of `JSON.stringify` of the whole scan response body.
- **Size guard**: the API step that omits `timelines` from a hosted scan response whose body would exceed the Size limit.
- **Omitted reason**: the optional response field `timelinesOmitted`. Its only value is `"too-large"`.
- **Header bar**: the `header.site-header` element of the Web app.
- **Canvas top**: the y of the top edge of the scene canvas in CSS pixels, from the top of the viewport.
- **Replay group**: the group of Replay buttons in the Header bar.
- **Spec task**: a task of tasks.md in this spec.
- **Orchestrator**: the agent that runs the browser tests, the fresh-clone proof and the root gates, and looks at the screenshots.
- **Deliberate test change**: a change to an existing test that design.md lists because the test pins a value this spec changes on purpose.

## Requirements

### Requirement 1: The test suites pass on a fresh clone in any order

**User Story:** As a maintainer, I want CI to pass on a fresh clone, so that a green local run means a green CI run.

**Traces to:** F1; N-8; tech.md "No network calls in tests"

#### Acceptance Criteria

1. WHEN `npm ci` and then `npm test` run at the root of a Fresh clone, THE Test suites SHALL all pass and the command SHALL exit with code 0, in the Root test order.
2. WHEN `npm ci` and then `npm test -w @sexton/api` run in a Fresh clone before any other workspace has run, THE API test suite SHALL pass with exit code 0.
3. THE API test suite SHALL read no Generated file of another workspace. The timeline size test SHALL build its template package and policy in memory from the Committed fixtures of `packages/engine/test/fixtures`.
4. WHEN a Web app test needs the Demo scan and `packages/web/public/demo/scan.json` does not exist, THE Web app test setup SHALL create the Demo files with the Replay generator before the first test file runs, so that `npx vitest run` in `packages/web` of a Fresh clone passes.
5. THE Replay fixtures on disk SHALL equal the output of the Replay generator byte for byte (an existing test keeps checking this).
6. THE API test suite SHALL include a static check that reads every test file under `packages/*/test`, `packages/web/e2e` and `infra/test` and SHALL fail when a file reads a Generated file path, except the paths that design.md lists as covered by the reading workspace's own setup.
7. THE root typecheck, the root lint and every package Vitest configuration SHALL include no file under `build/`, so that a clone in `build/fresh-clone` is never checked or tested from the outer tree.
8. THE Spec task that proves this requirement SHALL record in design.md the exit code and the per-package test counts of `npm test -w @sexton/api` and of the root `npm test` in a Fresh clone, once after task 1 and once on the final tree.

### Requirement 2: The replays use the registry publish times

**User Story:** As a reviewer, I want the replay graves to show a clean state before the attack, so that the attack reads as a change.

**Traces to:** F2; cemetery-time requirement 17; R-SG-1; R-ST-2

#### Acceptance Criteria

1. THE Replay generator facts SHALL hold these publish times, with `https://registry.npmjs.org/axios` or `https://registry.npmjs.org/keyv` as their source: axios 1.14.0 2026-03-27T19:01:40.915Z, axios 1.14.1 2026-03-31T00:21:58.168Z, keyv 5.6.0 2026-01-21T00:39:26.982Z, keyv 6.0.0-rc.1 2026-08-03T19:21:08.158Z, keyv 6.0.0 2026-08-04T09:35:00.763Z.
2. THE Replay generator facts SHALL hold `deprecated: false` and `provenance: false` for keyv 5.6.0 with the keyv registry URL as source, and SHALL hold no deprecated fact and no new provenance fact for any axios version.
3. THE Replay generator SHALL set the first Stop of each Replay one hour before its Bad publish: axios 2026-03-30T23:21:58.168Z, keyv 2026-08-04T08:35:00.763Z.
4. THE Replay generator SHALL write the axios Stops 1.14.0 from 2026-03-30T23:21:58.168Z, 1.14.1 from 2026-03-31T00:21:58.168Z and 1.14.0 from 2026-03-31T03:29:00.000Z, and the keyv Stops 5.6.0 from 2026-08-04T08:35:00.763Z and 6.0.0 from 2026-08-04T09:35:00.763Z.
5. THE Replay generator SHALL set the axios Scan date to 2026-03-31T03:29:00.000Z and the keyv Scan date to 2026-08-04T09:35:00.763Z.
6. THE Replay generator SHALL take the state and reason of each Stop from `evaluateState` on the facts of that Stop's version and its earlier versions, which gives axios Alive "no rule matched", Possessed "provenance regression: 1.14.1 has no provenance, 1.14.0 had it", Alive "no rule matched", and keyv Alive "no rule matched", Possessed "install script added in 6.0.0".
7. THE Replay generator SHALL list exactly four sources per Replay: axios the Trend Micro, CSA, npm trusted publishers and axios registry URLs, keyv the Snyk, OSV, cacheable issue and keyv registry URLs. THE eight URLs SHALL all start with `https://`.
8. THE Replay generator SHALL keep the banner text, the titles, the summaries and the six earlier source URLs unchanged.
9. WHEN `npm run demo:generate -w @sexton/api` runs, THE Replay generator SHALL write the two Replay fixtures, and the three Demo files SHALL stay byte-identical with the demo evidence digest c8fb6cab465d46ca92cf83dbc10022b6a662c8fad68ec8f64d827ef16f43344d.
10. FOR ALL instants of each Replay window, THE Replay fixture SHALL pass the Validator, and the Segment that holds the instant SHALL carry the Resolved version of the facts and the state and reason that `evaluateState` gives on the facts of that version at that instant.

### Requirement 3: A replay opens at its first Stop

**User Story:** As a reviewer with three minutes, I want a replay to start before the attack, so that I see the change happen.

**Traces to:** F3; cemetery-time requirements 12.8 and 20

#### Acceptance Criteria

1. WHEN a Replay loads, THE Web app SHALL set the Opening Stop to the first Stop.
2. WHEN a response without a `replay` block loads, THE Web app SHALL set the Opening Stop to the Scan date, as before.
3. WHEN a second response loads, THE Web app SHALL set the Opening Stop of the new response by criteria 3.1 and 3.2, whatever Stop the previous response showed.

### Requirement 4: The Play control

**User Story:** As a viewer, I want to play the history forward one step at a time, so that I can watch the cemetery change without dragging the slider.

**Traces to:** F3; R-UI-7; web.md "prefers-reduced-motion respected"

#### Acceptance Criteria

1. WHERE the scrubber has more than one Stop, THE Web app SHALL render the Play control as a native `button` of type `button` with the class `scrub-play`, placed after the History date text and before the slider in the DOM.
2. WHILE not playing, THE Play control SHALL have the text and accessible name "Play". WHILE playing, THE Play control SHALL have the text and accessible name "Pause".
3. WHEN the user activates "Play" at a Stop before the last, THE Web app SHALL start playing from that Stop. WHEN the user activates "Play" at the last Stop, THE Web app SHALL move to the first Stop and start playing from it.
4. WHILE playing, THE Web app SHALL make one Play step 1,500 ms after the previous step or after the start, and SHALL stop playing when it reaches the last Stop.
5. WHEN the user activates "Pause", moves the slider, activates "Back to now", or a new response loads, THE Web app SHALL stop playing and SHALL keep the Stop that the action gives.
6. THE Web app SHALL start playing only on a user action on the Play control.
7. WHEN playing starts, at each Play step, when playing stops at the last Stop and when the user pauses, THE Web app SHALL write one line naming the Stop date in a `p` element with `aria-live="polite"` inside the scrubber section, and SHALL add no element with the role `status` while a response is shown.
8. WHILE Reduced motion applies, THE Web app SHALL make the Play steps at the same times with no transition and no animation.
9. WHEN the scrubber unmounts or a new response loads, THE Web app SHALL cancel the pending Play step timer.
10. FOR ALL Stop counts of at least 2, all start Stops and all sequences of ticks, THE Play stepping SHALL visit the Stops from the start Stop to the last Stop in order, each exactly once, and SHALL end at the last Stop with playing stopped.
11. THE Play control SHALL be reachable by Tab, operable with Enter and Space, and visible when focused with an outline of at least 2 pixels in the `focus` token.

### Requirement 5: The hosted scan guards the response size

**User Story:** As an operator, I want a scan response that stays under the Lambda limit, so that a large repository never fails the whole scan.

**Traces to:** F4; N-4; R-SG-9 (degrade one part, never the scan)

#### Acceptance Criteria

1. WHEN the hosted scan builds a response body with `timelines` whose UTF-8 JSON byte length exceeds the Size limit, THE API SHALL remove `timelines` and SHALL set the Omitted reason to `"too-large"`.
2. WHEN the body with `timelines` is at most the Size limit, THE API SHALL return the body unchanged with `timelines` and with no Omitted reason.
3. FOR ALL scan response bodies, THE Size guard SHALL return a body that is deeply equal to its input except for `timelines` and the Omitted reason.
4. FOR ALL scan response bodies whose size without `timelines` and with the Omitted reason is at most the Size limit, THE Size guard SHALL return a body of at most the Size limit.
5. WHEN the Size guard omits `timelines`, THE API SHALL write one warn log line `timelines-omitted` with the byte length and no package name.
6. THE API SHALL apply the Size guard on the hosted scan path only, and the evidence path, the demo files and the evidence digest SHALL not change.
7. WHEN the scan holds 300 packages with 64 Segments each and reasons of 200 characters, THE Size guard SHALL omit `timelines` (checked by an example built in memory, with no Generated file).

### Requirement 6: The contract and the web app name an omitted history

**User Story:** As a viewer of a very large scan, I want to know why there is no history, so that I do not think the feature is broken.

**Traces to:** F4; R-UI-5

#### Acceptance Criteria

1. THE API contract SHALL add the optional field `timelinesOmitted` of type `"too-large"` to `ScanResponse`.
2. THE Validator SHALL accept a response with no `timelinesOmitted` and a response whose `timelinesOmitted` is `"too-large"` and that has no `timelines`.
3. IF `timelinesOmitted` holds any other value, or a response holds both `timelinesOmitted` and `timelines`, THEN THE Validator SHALL reject the response with the contract error `UNKNOWN_VALUE` at the path `/timelinesOmitted`, and the error SHALL not echo the value.
4. WHEN a response with `timelinesOmitted` `"too-large"` loads, THE Web app SHALL show, in place of the scrubber and directly under the Header bar, one `p` element with the text "History is not shown for this scan because it is too large.".
5. WHEN a response with neither `timelines` nor `timelinesOmitted` loads, THE Web app SHALL show neither the scrubber nor that line.

### Requirement 7: A compact header

**User Story:** As a reviewer, I want the graves near the top of the page, so that I see the cemetery first.

**Traces to:** F5; R-UI-5, R-UI-7

#### Acceptance Criteria

1. WHEN the demo scan is shown at the Scan date at a viewport of 1440 by 900, THE Web app SHALL place the Canvas top at y 190 or less with the scrubber shown (checked in a real browser).
2. WHILE the viewport is at least 960 CSS pixels wide, THE Web app SHALL show the Repository URL form and the Replay group on one line, and the History date label, the date text, the Play control and the slider on one line.
3. WHILE the viewport is 360 CSS pixels wide, THE Web app SHALL cause no horizontal scroll with the demo scan and with the axios Replay shown (checked in a real browser by `scrollWidth`).
4. THE Web app SHALL keep the Tab order of the DOM: "Back to now" when it is shown, the evidence links, Legend, Repository URL, Scan, the two Replay buttons, the banner links of a Replay, the Play control, the slider, then the roving grave.
5. THE Web app SHALL keep the header gap rule of cemetery-time requirement 3 and the 360 px rules of web.md.

### Requirement 8: The replay group names the attacks

**User Story:** As a reviewer, I want the replay buttons to say what they are, so that I know they replay an attack.

**Traces to:** F5; R-UI-5

#### Acceptance Criteria

1. THE Replay group SHALL show the visible label "Replay an attack" and SHALL take its accessible name from that label.
2. THE Replay buttons SHALL have the texts and accessible names "axios, Mar 2026" and "keyv, Aug 2026".
3. THE Web app SHALL keep every other accessible name that an existing test pins, except the names listed in design.md "Deliberate test changes".

### Requirement 9: Two screenshots

**User Story:** As a reviewer reading the README, I want a picture of the cemetery and of a replay, so that I see both before I open the site.

**Traces to:** F6; N-9

#### Acceptance Criteria

1. THE end-to-end smoke test SHALL write `docs/cemetery.png` at 1440 by 900 with the drawer closed, Reduced motion on and the scrubber at the Scan date, after the first canvas paint.
2. THE end-to-end smoke test SHALL write `docs/replay-axios.png` at 1440 by 900 with the axios Replay at its Possessed Stop (1.14.1), the banner visible, the drawer closed and Reduced motion on, after the canvas has painted that Stop.
3. THE Orchestrator SHALL open both images and SHALL record in tasks.md what it saw.

### Requirement 10: README and steering

**User Story:** As a future contributor, I want the README and web.md to describe the built behaviour, so that I do not follow stale rules.

**Traces to:** F3, F5, F6; N-9

#### Acceptance Criteria

1. THE README Replay section SHALL name the buttons "axios, Mar 2026" and "keyv, Aug 2026" in the "Replay an attack" group, SHALL mention the Play control, and SHALL show `docs/replay-axios.png` on its own line with a non-empty alt text.
2. THE README Replay section SHALL hold no semicolon and no em dash.
3. THE `.kiro/steering/web.md` file SHALL state the new button texts and group label, the Opening Stop rule, the Play control, the omitted history line and the header height target, and SHALL keep every other rule and the front matter.

### Requirement 11: Invariants and scope

**User Story:** As a maintainer, I want the fixes to change nothing else, so that the review stays small.

**Traces to:** decisions of cemetery-time; tech.md rules

#### Acceptance Criteria

1. THE spec tasks SHALL change only the paths listed in the Introduction.
2. THE spec tasks SHALL add no runtime dependency, no web font, no image or audio file in the app and no external request at run time.
3. THE spec tasks SHALL keep the 16 ms budget, skip no test, lower no `numRuns` and weaken no check, and SHALL change an existing test only as design.md "Deliberate test changes" lists.
4. WHEN the gates run on the final tree, THE root `npm run typecheck`, `npm run lint`, `npm test` and `npm run test:e2e -w @sexton/web` SHALL exit with code 0.
5. THE last sub-task of each top-level task SHALL run the security-reviewer agent on that task's changed files and SHALL fix every defect it reports in the same task.
