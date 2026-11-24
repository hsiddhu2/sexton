# Implementation Plan: cemetery-time

## Overview

Adds time to the Sexton cemetery and clears seven items from the cemetery-polish review. Part A: short grass tufts along the ground lines, ground that reaches the bottom of the viewport, a gap in the header, no tooltip flash after the drawer closes, a Correction to cemetery-polish requirement 7.4, `build/**` in the lint ignores, and cheaper slow property tests. Part B: the Engine builds a compact Timeline of Segments for each package from dated facts, the API puts it in the scan response, the web contract validator checks it, and the Web app shows a history scrubber, the Not-published form and the "as of" header. Part C: a pull request marker (from the remediation log in the scan response and from the session) and a burial animation. Part D: two incident replays, axios and keyv, as fixtures built from public reports and played through the scrubber. Then the docs and steering, the retaken screenshot and the root gates. Pure modules come first in each part, then the components that use them, then the CSS, then the tests of the end-to-end flow. Paths are relative to the repository root unless stated. No test touches the network.

Run-time notes for the agents:

- The impl agent edits files and runs only the test and typecheck commands. The orchestrator runs the Playwright tests (2.7, 5.8, 7.5, 9.1, 10.4), looks at the screenshot (9.2) and runs the root gates (10.x). No task installs a dependency: this spec adds none and changes no pin and no `package.json`.
- Every test sub-task names its test file and the property numbers from design.md. `numRuns` is 100 by default and 1000 for Property 21. Every property test carries the tag `Feature: cemetery-time, Property N: <title>`.
- Tests change only where design.md lists a Deliberate test change (numbered 1 to 14 there). Any other existing test that fails is a regression: fix the source, not the test.
- Change only `packages/engine`, `packages/api`, `packages/web`, `eslint.config.js`, `README.md`, `docs/cemetery.png`, `docs/requirements.md`, `.kiro/steering` and `.kiro/specs/cemetery-polish/requirements.md`. Do not change anything under `infra`, `packages/cli` or `packages/action`, and do not change any `package.json` or `package-lock.json`.
- Regenerate derived files with `npm run demo:generate -w @sexton/api` (offline, from the recorded fixtures). Never run `fixtures:record` and never use the network.
- Each top-level task ends with a security review. Invoke the security-reviewer agent with the list of files that the task changed, ask it to review those files against this spec's requirements and the security steering, record its findings in a "Review notes" line under that sub-task, and fix every finding of kind "defect" inside the same task before it is marked done.
- Run vitest one package at a time. Under load a first run can time out. Run the failing file alone before reading it as a regression.
- No task asks the user a question. Every call that needed a decision is recorded in design.md "Calls made without a user decision".

## Tasks

- [x] 1. Grass tufts and the ground height (A1, A2)
  - Replaces the scattered vertical blades with seeded tufts along the Row lines and the Bottom line, and lets the ground reach the bottom of the viewport. The Scenery stays width-only.
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 2.1, 2.2, 2.3, 2.4, 2.5_
  - [x] 1.1 Update `packages/web/src/scene/scenery-seed.ts` and `packages/web/src/scene/layout.ts`
    - Replace `unitTufts` with `unitClusters(count)` (stream seed XOR 0x2, 16 randoms per cluster). In `sceneryFor(width)` build `3 * floor(width / 96)` Tufts with `x`, `base` 8 to 16, `h` 4 to 8, `dir`, `tone` and the six precomputed `rects` of design.md "Part A, A1". Keep the one-entry cache and the width-only rule.
    - Add `minHeight?` to `SceneInput`, and `rows` and `groundHeight` to `ScenePlan`: `groundHeight = height` for no packages, else `max(height, floor(minHeight))`, with an unreadable `minHeight` counted as 0. `height`, `columns` and every Cell position keep their formulas.
    - _Requirements: 1.1, 1.2, 1.5, 2.1, 2.2, 2.4, 2.5_
  - [x] 1.2 Update `packages/web/src/scene/draw.ts`, `packages/web/src/scene/Scene.tsx`, `packages/web/src/Cemetery.tsx` and add `packages/web/src/hooks/use-free-height.ts`
    - Replace `drawGrass` with `drawTufts`: for tone `dark` then `light`, for each Row line `t = 1 .. rows` with top `80 + 224 * t`, and for the Bottom line (only when `groundHeight - height >= 10`, top `groundHeight - 26`), call `fillRect(rx, top + ry, 1, rh)` for each rectangle. Keep the order after the fog band and before every Grave. Draw the sky, ground gradient and fog over `groundHeight`.
    - `Scene.tsx` sizes the canvas and `backingStore` from `groundHeight`. `use-free-height.ts` returns `max(0, innerHeight - containerTop)` and 0 when unreadable, and updates on `resize`. `Cemetery` passes it as `minHeight`.
    - _Requirements: 1.3, 1.4, 1.7, 2.1, 2.2, 2.3, 2.5_
  - [x] 1.3 Update `packages/web/test/scenery-seed.test.ts` and add Property 1
    - Apply Deliberate test changes 1 and 2. Add the width-only assertions over ground heights.
    - **Property 1: Tuft scenery is deterministic, bounded and depends on the width only**
    - **Validates: Requirements 1.1, 1.2, 1.5**
    - Tag: `Feature: cemetery-time, Property 1: Tuft scenery is deterministic, bounded and depends on the width only`.
    - _Requirements: 1.1, 1.2, 1.5_
  - [x] 1.4 Update `packages/web/test/draw.test.ts` and `packages/web/test/layout.test.ts`: Properties 2 and 3
    - Apply Deliberate test changes 3 and 4 (and leave 5 unedited). Add the 224 width case with the 13,000 bound.
    - **Property 2: Painter call discipline for tufts and the ground**
    - **Property 3: Ground height**
    - **Validates: Requirements 1.3, 1.4, 1.7, 2.1, 2.2, 2.3, 2.4, 2.5**
    - Tags: `Feature: cemetery-time, Property 2: Painter call discipline for tufts and the ground` and `Feature: cemetery-time, Property 3: Ground height`.
    - _Requirements: 1.3, 1.4, 1.7, 2.1, 2.2, 2.3, 2.4, 2.5_
  - [x] 1.5 Security review of task 1
    - Invoke the security-reviewer agent on the files of 1.1 to 1.4. Record the findings in "Review notes". Fix every defect in this task.
    - _Requirements: 24.5_
    - Review notes: security-reviewer, 23 Nov 2026: ready to merge, no defects. Notes only: the ground height is not re-measured when the header height changes without a resize (matches the spec); the fog band keeps its fixed y and height near the horizon; `GRASS_TILE_HEIGHT` is exported but now unused; requirement 1.6 (16 ms median) is measured by the Playwright smoke run (orchestrator, 5.8).
    - Notes: tuft rectangles are precomputed per width and flattened per tone once per Scenery list; Deliberate test changes 1, 2, 3 and 4 applied, 5 left unedited. The Property 3 `it` in layout.test.ts and the Property 2 and 1 `describe` blocks are new.

- [x] 2. Header gap, tooltip reset, lint ignore, Correction and slow tests (A3 to A7)
  - Clears the five remaining Part A items. A4 changes the tooltip reducer, A6 is one ignore entry, A7 is measured and fixed test by test.
  - _Requirements: 3.1, 3.2, 3.3, 4.1, 4.2, 4.3, 4.4, 5.1, 5.2, 5.3, 6.1, 6.2, 6.3, 7.1, 7.2, 7.3, 7.4, 7.5_
  - [x] 2.1 Update `packages/web/src/styles.css` for the header gap
    - `.header-repo` becomes `display: flex; flex-wrap: wrap; align-items: center; gap: 4px 8px`. No markup change.
    - _Requirements: 3.1, 3.2, 3.3_
  - [x] 2.2 Update `packages/web/src/overlay/tooltip-model.ts`, `use-grave-tooltip.ts`, `GraveButtons.tsx` and `packages/web/src/Cemetery.tsx`
    - Add the events `reset` and `pointer-move(index, x, y)` and the field `quiet` (with `TIP_START.quiet` false) as in design.md "A4". The hook dispatches `reset` when `suppressed` becomes true, records the last pointer position on every pointer event, and `GraveButtons` marks a focus as key-driven after a `keydown` on a grave button. `Cemetery` passes a `quietFocus` ref that it sets before the programmatic `.focus()` on close, and `GraveButtons` clears it and skips the tooltip for that one focus.
    - _Requirements: 4.1, 4.2, 4.3, 4.4_
  - [x] 2.3 Update `packages/web/test/tooltip.test.tsx`: Property 4 and the DOM example
    - **Property 4: The tooltip machine with reset and quiet**
    - **Validates: Requirements 4.1, 4.2, 4.4**
    - Add a DOM example: hover a grave, click it, close the drawer with Escape, no tooltip; move the pointer to a new position, tooltip shows; close again and press ArrowRight, tooltip shows. The existing cemetery-polish Property 12 test stays unedited.
    - Tag: `Feature: cemetery-time, Property 4: The tooltip machine with reset and quiet`.
    - _Requirements: 4.1, 4.2, 4.3, 4.4_
  - [x] 2.4 Update `eslint.config.js` and add `packages/web/test/lint-config.test.ts`
    - Add `"build/**"` to the ignores. The test reads `../../eslint.config.js` as text and checks the entry. The sub-task also lints one temporary file `build/ct-lint-probe.mjs` that holds a deliberate error with `npx eslint build/ct-lint-probe.mjs` (no report), then deletes it.
    - _Requirements: 6.1, 6.2, 6.3_
  - [x] 2.5 Add the Correction section to `.kiro/specs/cemetery-polish/requirements.md`
    - Add "## Correction, 23 Nov 2026 (spec cemetery-time)" in the form of `.kiro/specs/health-scoring/requirements.md` "Correction, 21 Nov 2026". Quote old criterion 7.4 verbatim (line 154), leave every old line unchanged, state the built behaviour (design.md "A5") and state that the grace period and Escape still apply. Add a static test `packages/web/test/correction.test.ts` that reads the file and checks the heading, the verbatim quote and the text "pointer-events: none".
    - _Requirements: 5.1, 5.2, 5.3_
  - [x] 2.6 Measure and fix the slow property tests (A7)
    - One package at a time, run `npx vitest run --reporter=json --outputFile=../../build/ct-a7-<package>.json` in `packages/engine`, `packages/api`, `packages/web`, `packages/cli`, `packages/action`, then `infra` (read only). List every test over 5000 ms. For each, find the cost and cut it: `cache-store` Property 3 (expand a seed to incompressible bytes with `mulberry32` instead of `fc.uint8Array`), `verify-pack` Property 32 (profile it; fresh pack every run, generation is the cost, so a measured 60 s timeout), `pr-body` Property 7 (hoist the context and the regular expressions). Keep every `numRuns` and skip nothing.
    - Record in design.md "Notes and open items": test, package, time before, time after, cause. Raise a timeout only with the measured times written there. Confirm each package suite passes alone with no timeout.
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_
  - [x] 2.7 Add `packages/web/e2e/time.spec.ts` with the header gap check
    - At 360, 768, 1280 and 1920 CSS pixels, the right edge of `.repo-text` is at least 8 pixels from the left edge of `.demo-label`, or `.demo-label` is on a later line. At 1440 by 900 the canvas bottom is at or below the viewport bottom (requirement 2.1). Later tasks extend this file.
    - Notes: 2.7 run by orchestrator via impl, passed, 23 Nov 2026. Header gap passed at 360, 768, 1280 and 1920 px; canvas reaches the bottom at 1440 by 900.
    - _Requirements: 2.1, 3.1, 3.2_
  - [x] 2.8 Security review of task 2
    - Invoke the security-reviewer agent on the files of 2.1 to 2.7. Record the findings in "Review notes". Fix every defect in this task.
    - _Requirements: 24.5_
    - Review notes: security-reviewer, 23 Nov 2026: ready to merge, no defects. Notes only: (1) verify-pack Property 32 re-reviewed after the A7 rework, 23 Nov 2026 (changed test file only; impl.md local edit out of scope): ready to merge, no defects. Every one of the 1000 runs draws a fresh pack from the original `arbPack`, `numRuns` 1000 and the assertion are unchanged, nothing skipped, and the 60 s timeout on that test alone is backed by the measured times in design.md (6536, 6942, 6537 ms alone; 10036 ms in suite). Its one note was the stale pool wording in this line, now removed; (2) while quiet, pointer-enter only records the position, so the tooltip shows on the next move to a new position; (3) e2e/time.spec.ts skips when Chromium is missing, run it where Chromium exists; (4) `keyDriven` stays true after a key press until a pointerdown or a grave focus (edge case, matches the design); (5) file-source Property 23 and draw Property 2 are watch items (over 5 s only under load).
    - Notes: no Deliberate test change was needed in task 2 (existing Property 12 of cemetery-polish passes unedited: the reducer's new fields default to `quiet: false, pos: null`). A7 changes to existing tests (verify-pack Property 32, pr-body Property 7, cache-store Property 3) are "changed under requirement 7 (A7), not a Deliberate test change". `build/**` probe: `npx eslint build/ct-lint-probe.mjs` gave only the "File ignored" warning, no error, and the probe file was deleted. e2e/time.spec.ts is written and typechecked, not run. Measurements are in design.md "A7 measurements, 23 Nov 2026".

- [x] 3. Engine: Timeline facts, state as of and Segments (B, Engine)
  - Adds the pure Engine modules. `stateAsOf` reuses `evaluateState`. `buildTimeline` evaluates it at every instant where a Form can change and writes Segments.
  - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8, 8.9, 8.10, 8.15, 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8, 9.9, 9.10, 9.11, 10.1_
  - [x] 3.1 Create `packages/engine/src/timeline/types.ts`
    - Export `TimelineVersion`, `TimelineAdvisory`, `TimelineFacts`, `Form`, `StateAsOf`, `TimelineSegment` (with the optional `version`, at most 100 characters, never set by the Engine), `PackageTimeline` and the four cap constants of design.md. No I/O.
    - _Requirements: 8.2, 8.7, 8.15, 9.1_
  - [x] 3.2 Create `packages/engine/src/timeline/facts.ts`
    - `timelineFacts(input)`: versions from the packument `time` map (not `versions`), drop `created` and `modified` and unparseable times, order with `compareVersionOrder`, keep the 49 most recent plus the installed version, set `coveredFrom`, set flags and maintainer lists and the advisory list by the rules of requirements 8.3 to 8.6. Pure.
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6_
  - [x] 3.3 Create `packages/engine/src/timeline/as-of.ts`
    - `stateAsOf(facts, health, scanDate, asOf)` as in design.md: the scan Form at or after the Scan date, the Not-published form when the installed Seen time is later, else `StateInputs` from dated facts and `evaluateState(inputs, asOf)`. Export `seenTimes` and `currentForm`.
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8, 9.9, 9.10, 10.1_
  - [x] 3.4 Create `packages/engine/src/timeline/build.ts`
    - `buildTimeline(facts, health, scanDate)`: candidate instants (Seen times, `+90 d + 1 ms`, `+24 months + 1 ms`, the UTC midnights within 3 days of the stale threshold, advisory times, `coveredFrom`), evaluation, merge of equal neighbours, the scan Segment, the 64 Segment cap with `coveredFrom`. The merge compares state, Ghost and `version` (never set here). `buildTimeline` writes no `version`.
    - _Requirements: 8.7, 8.8, 8.9, 8.10, 8.15_
  - [x] 3.5 Update `packages/engine/src/clients/osv.ts`, `packages/engine/src/score.ts` and `packages/engine/src/index.ts`
    - Add `fetchAdvisoryPublished(ctx, id)` (reads `published` of the cached `osv-vuln` document, ISO or null). Add the optional `timelineSink` to `ScoringDependencies`, called once per package from `scoreOne` with the two documents and the provenance signal. Export the new functions and types. Existing behaviour and exports are unchanged.
    - _Requirements: 8.1, 8.11_
  - [x] 3.6 Write `packages/engine/test/timeline/facts.test.ts`: Property 5
    - **Property 5: Timeline facts respect their caps**
    - **Validates: Requirements 8.1, 8.2, 8.3, 8.4, 8.5, 8.6**
    - Add examples on the recorded fixtures: react keeps 49 versions plus the installed one and sets `coveredFrom`, left-pad keeps all 15 and `coveredFrom` is null, node-sass has the install script flag true for 7.0.3 and null for the others.
    - Tag: `Feature: cemetery-time, Property 5: Timeline facts respect their caps`.
    - _Requirements: 8.2, 8.3, 8.4, 8.5, 8.6_
  - [x] 3.7 Write `packages/engine/test/timeline/as-of.test.ts`: Properties 6, 7, 8 and 9
    - **Property 6: State as of agrees with evaluateState on the same dated facts**
    - **Property 7: A later fact is never seen**
    - **Property 8: As of the scan date is the current state**
    - **Property 9: State as of is deterministic**
    - **Validates: Requirements 8.8, 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8, 9.9, 9.10**
    - Add one example for each possession reason, one for 29 February (a leap-year threshold), and one where `coveredFrom` makes the last publish unavailable.
    - Tags: `Feature: cemetery-time, Property N: <title>` for each.
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8, 9.9, 9.10_
  - [x] 3.8 Extend `packages/engine/test/timeline/as-of.test.ts`: Properties 10 and 11
    - **Property 10: State as of is monotonic in age**
    - **Property 11: Not-published exactly before the installed version is seen**
    - **Validates: Requirements 9.11, 10.1**
    - Tags: `Feature: cemetery-time, Property 10: State as of is monotonic in age` and `Feature: cemetery-time, Property 11: Not-published exactly before the installed version is seen`.
    - _Requirements: 9.11, 10.1_
  - [x] 3.9 Write `packages/engine/test/timeline/build.test.ts`: Property 13 and the engine half of Property 12
    - **Property 13: Segments agree with state as of at every instant**
    - **Property 12: Built timelines respect the size cap and the contract** (the Segment cap, increasing `from`, merged neighbours, reasons at most 200 characters, `coveredFrom`; the validator half is in task 4)
    - **Validates: Requirements 8.7, 8.8, 8.9, 8.10**
    - Add the example of 70 distinct possession windows that forces the 64 Segment cap. Add an example that no Segment of any `buildTimeline` output has a `version` key. The versioned half of Property 13 (per-version facts) is tested in 7.2.
    - Tags: `Feature: cemetery-time, Property 13: Segments agree with state as of at every instant` and `Feature: cemetery-time, Property 12: Built timelines respect the size cap and the contract`.
    - _Requirements: 8.7, 8.8, 8.9, 8.10, 8.15_
  - [x] 3.10 Security review of task 3
    - Invoke the security-reviewer agent on the files of 3.1 to 3.9. Record the findings in "Review notes". Fix every defect in this task.
    - _Requirements: 24.5_
    - Review notes: security-reviewer, 23 Nov 2026: ready with notes, no defects. Actions: (1) async sink: documented as synchronous and read-only in `score.ts` (a sink failure is caught); (2) mutation of shared documents: documented read-only; (3) maintainer list over 10 names or with no names: now `null`, tested in `sink.test.ts`; (4) reason clip now by code point, tested; (5) added `sink.test.ts`: sink called once per package with no extra request and an equal report, a throwing sink leaves the report unchanged, `fetchAdvisoryPublished` (valid, missing, unparseable, 404 give ISO or null), `__proto__`, `constructor` and `toString` keys in `time`; (6) `installed` length: the validator cap of 100 characters is task 4.3 (not in this task).
    - Notes: new tests are `test/timeline/{facts,as-of,build,sink}.test.ts` plus the helper `support.ts`. Property durations alone: P5 48 ms, P6 22, P7 13, P8 10, P9 9, P10 2, P11 8, P12 24, P13 42. `TimelineSegment.version?` is in the type; `buildTimeline` never writes it and its merge compares it. No existing test changed. Divergences are in design.md "Notes and open items".

- [x] 4. API and contract: timelines in the scan response (B, API)
  - Puts the Timelines in the response, extends the contract types and the web validator, and builds the demo timelines from the recorded fixtures.
  - _Requirements: 8.11, 8.12, 8.13, 8.14, 8.15, 13.2, 14.3_
  - [x] 4.1 Update `packages/api/src/contract.ts`
    - Re-export `PackageTimeline`, `TimelineSegment` (with its optional `version`) and `Form`. Add `PullRequestMark` and `ReplayInfo`. `ScanResponse` gains the optional `timelines`, `pullRequests` and `replay`. The existing fields and types are unchanged.
    - _Requirements: 8.11, 14.3_
  - [x] 4.2 Create `packages/api/src/timelines.ts` and update `packages/api/src/scan.ts`
    - `buildTimelines(ctx, report, inputs, scanDate)` with concurrency 8, advisory dates through `fetchAdvisoryPublished`, a try block per package, and `Object.fromEntries` for the result. `scanWithInputs` gets `options: { timelines: boolean }` and collects the `timelineSink` inputs. `scan()` passes true and adds `timelines`. The evidence path passes false. No packument request is added.
    - _Requirements: 8.11, 8.12, 8.14_
  - [x] 4.3 Update `packages/web/src/load/validate-scan-response.ts`
    - Add the code `TOO_MANY_ITEMS`. Check `timelines`, `pullRequests` and `replay` as in design.md "Validator", including the optional Segment `version` (absent, or a string of at most 100 characters). Absent fields are accepted. `CONTRACT_ERROR_TEXT` gains one text.
    - _Requirements: 8.13, 8.15, 14.3_
  - [x] 4.4 Update `packages/api/scripts/generate-demo-scan.mjs`
    - Pass a `timelineSink` to `scorePackages`, build the demo timelines with an advisory date map of nulls, and add `timelines` to the demo scan. Output stays deterministic and offline. Run `npm run demo:generate -w @sexton/api` and confirm `evidence.json` and `evidence.md` of the demo are byte-identical to the previous files (requirement 13.2).
    - _Requirements: 8.11, 8.14, 13.2_
  - [x] 4.5 Write `packages/api/test/timelines.test.ts`, `packages/api/test/timeline-size.test.ts` and extend `packages/api/test/generate-demo-scan.test.ts`
    - Examples on the fixture transport: no extra packument request (count requests with and without the sink), a throwing builder omits one entry and keeps the scan, the evidence path builds no timeline. Size: the largest allowed response (300 packages, 64 Segments each, 200 character reasons) serialises under 4 MB. Demo generator: the demo carries a timeline for each package, the validator accepts it, the evidence digest equals the digest recorded before the change.
    - _Requirements: 8.11, 8.12, 8.14, 13.2_
  - [x] 4.6 Extend `packages/web/test/validate-scan-response.test.ts`: Property 14 and the validator half of Property 12
    - **Property 14: The validator rejects bad timelines, pull requests and replay blocks** (including a Segment `version` of 101 characters or of another type, and acceptance with and without a `version`)
    - **Property 12: Built timelines respect the size cap and the contract** (a built timeline passes the validator after a JSON round trip)
    - **Validates: Requirements 8.13, 8.15, 14.3**
    - Tags: `Feature: cemetery-time, Property 14: The validator rejects bad timelines, pull requests and replay blocks` and `Feature: cemetery-time, Property 12: Built timelines respect the size cap and the contract`.
    - _Requirements: 8.13, 8.15, 14.3_
  - [x] 4.7 Security review of task 4
    - Invoke the security-reviewer agent on the files of 4.1 to 4.6. Record the findings in "Review notes". Fix every defect in this task.
    - _Requirements: 24.5_
    - Review notes: security-reviewer, 23 Nov 2026: ready with notes, no defects. Actions: (1) size test title said 4 MB while asserting 6 MB: renamed, and a second test asserts under 4 MB at 80 character reasons; (2) no total-size guard: recorded in design.md (the worst block is about 5.6 MB, not the 4 MB estimated; unreachable from the Engine's short reasons; guard left open); (3) two marks for one package: validator now reports DUPLICATE, tested; (4) unknown extra keys on a Segment are accepted (matches 8.13), left as is; (5) api test imports the web validator, as `generate-demo-scan.test.ts` already did, test-only; (6) `pullRequests` is filled by task 6.2; (7) demo advisory dates are null by design (8.14).
    - Notes: demo `scan.json` 66,491 bytes before, 75,283 after. Segments per demo package: react 1, lodash 5, express 3, request 4, node-sass 4, left-pad 4, event-stream 4, colors 5, moment 5, uuid 3, semver 2, left-padder 3. Demo evidence digest unchanged, c8fb6cab465d46ca92cf83dbc10022b6a662c8fad68ec8f64d827ef16f43344d, `evidence.json` and `evidence.md` byte-identical. No existing test changed. New: `api/test/timelines.test.ts`, `api/test/timeline-size.test.ts`, extensions in `generate-demo-scan.test.ts` and `web/test/validate-scan-response.test.ts` (Properties 12 validator half and 14).
    - Notes: follow-up fix, 23 Nov 2026. Defect: the api vitest typecheck (`tsconfig.test.json`, rootDir ".") pulled `web/src/load/validate-scan-response.ts` and `lists.ts` in through the imports in `api/test/timelines.test.ts` and `api/test/timeline-size.test.ts`, so tsc reported 2 unhandled Source Errors (web files not under rootDir) and the run could exit 1. main already excluded `test/generate-demo-scan.test.ts` from `tsconfig.test.json` for the same import and passed. Fix mirrors that: the two new files join the `exclude` list. No assertion moved or changed; the validator checks still run in the api suite. `src` stays in the typecheck program. Api suite run 3 times alone: exit 0, 0, 0, 30 files, 273 tests, no Source Errors (`build/ct-api-fix-{1,2,3}.json`). Web suite: exit 0, 38 files, 353 tests (`build/ct-web-fix.json`). `tsc -b` api and web 0, eslint 0.
    - Review notes: security-reviewer, 23 Nov 2026, follow-up fix (changed file `packages/api/tsconfig.test.json` only; impl.md local edit out of scope; tests not run): ready with notes, no defects. Notes: (1) the three excluded test files get no tsc type-check; no api test file is type-checked by `tsc -b` today either, since `tsconfig.json` covers only `src`. A later option is a web-aware test tsconfig with rootDir `../..` that includes these three files. (2) JSON has no comments, so the reason for the exclusions is recorded here.

- [x] 5. Web: the scrubber, the Not-published form and the as-of header (B, Web)
  - Adds the lookup modules, the unmarked mound shape, the plan Forms, the scrubber, the header "as of" line and the legend chip. The triage order and the grave positions stay those of the scan date.
  - _Requirements: 9.3, 10.1, 10.2, 10.3, 10.4, 10.5, 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 11.7, 11.8, 11.9, 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 12.7, 12.8, 12.9, 13.1, 13.3, 23.1, 23.3, 23.5_
  - [x] 5.1 Create `packages/web/src/time/form-at.ts` and `packages/web/src/time/stops.ts`
    - `formAt(timeline, instantMs, scanForm)` by binary search with the rules of design.md "Part B, Web"; the returned Form carries the Segment `version` when there is one. `stopsFor(response)` returns the sorted, deduplicated Stops (Scrubber start, Step marks, Scan date). A Step mark is a change of state, Ghost or `version`. The Scrubber start is the earliest `from` minus one hour, or that `from` itself when its Segment carries a `version`. Pure.
    - _Requirements: 10.1, 11.4, 11.5, 11.6, 11.7, 11.9_
  - [x] 5.2 Update `packages/web/src/scene/shapes.ts`, `layout.ts` and `draw.ts`
    - Add the shape `unmarked` with its SPECKS and SOLID_BOXES entries. `GravePlan` gains `pending`, `marker` and `burial` (defaults false, false, null). `planScene` accepts `forms`, `marks` and `burial`. When a Form carries a `version`, the `inscription` of that grave uses it in place of the report version. A pending grave has the shape `unmarked`, the `border` colour and no Ghost. Positions and order do not change.
    - _Requirements: 10.2, 10.3, 10.5, 23.1, 23.3_
  - [x] 5.3 Create `packages/web/src/time/Scrubber.tsx` and update `App.tsx`, `Cemetery.tsx` and `header/Header.tsx`
    - The slider, the tick SVG, the two caption lines, the drawer note, the header "as of" text in a `time` element, the "Back to now" button, the reset of the stop index per `loadId`, the as-of Forms passed to `planScene`. `Drawer` gets `shownVersion` and `asOfLine` (design.md "Versioned Segments"): the drawer title uses the Segment version when there is one, and one line "State on <date>: <State>. <reason>" sits under the title for a versioned Segment. Policy line and evidence links do not change. The scrubber is not rendered without timelines.
    - _Requirements: 11.1, 11.2, 11.3, 11.8, 12.1, 12.2, 12.3, 12.4, 12.7, 12.8, 12.9, 13.1, 13.3_
  - [x] 5.4 Update `packages/web/src/overlay/grave-label.ts`, `overlay/tooltip-model.ts`, `header/Legend.tsx` and `styles.css`
    - The Not-published button name and tooltip text, the as-of reason in the tooltip, the Segment version in the grave button name and the tooltip when there is one, the Not-published legend chip, the scrubber styles with a `:focus-visible` outline of 3 pixels in `--focus`, no transition and no animation on any scrubber or grave rule.
    - _Requirements: 10.4, 11.3, 12.5, 12.9, 23.5_
  - [x] 5.5 Write `packages/web/test/time-stops.test.ts`: Property 15
    - **Property 15: Step marks are exactly the dates where some Form changes**
    - **Validates: Requirements 11.2, 11.4, 11.5, 11.6, 11.7**
    - Add the 200 ms example for 300 packages with 64 Segments each. Add examples: a versioned first Segment makes the Scrubber start equal to its `from`, an unversioned one keeps the hour, and a change of `version` alone is a Step mark.
    - Tag: `Feature: cemetery-time, Property 15: Step marks are exactly the dates where some Form changes`.
    - _Requirements: 11.2, 11.4, 11.5, 11.6, 11.7, 11.9_
  - [x] 5.6 Update `packages/web/test/draw.test.ts`, `layout.test.ts`, `shapes-palette.test.ts`, `header.test.tsx` and `a11y.test.tsx`: Property 16 and the Deliberate changes
    - Apply Deliberate test changes 6, 7, 9 (to 7 chips) and 11 (the `History date` stop). Add the unmarked shape to the speck examples.
    - **Property 16: A plan with Forms keeps the cemetery rules**
    - **Validates: Requirements 10.2, 10.3, 10.5, 23.1, 23.3**
    - Tag: `Feature: cemetery-time, Property 16: A plan with Forms keeps the cemetery rules`.
    - _Requirements: 10.2, 10.3, 10.5, 23.1, 23.3_
  - [x] 5.7 Write `packages/web/test/scrubber.test.tsx`
    - DOM examples on the demo scan: the attributes of requirement 11.1, `aria-valuetext` for the first and last Stop, arrow keys and Home and End move the Stop, "as of" and "Back to now" with focus on the scrubber, the two caption lines and the drawer note appear only before the scan date, a new response resets the Stop, no scrubber without timelines, the policy line and the downloads do not change, no request carries the date, axe passes with the scrubber at a middle Stop. A hand-built versioned timeline: the inscription, the grave button name, the tooltip and the drawer title show the Segment version at the chosen Stop and the report version for an unversioned Segment, and the drawer shows the "State on <date>" line only for a versioned Segment.
    - _Requirements: 10.4, 11.1, 11.2, 11.3, 11.8, 12.1, 12.2, 12.3, 12.4, 12.7, 12.8, 12.9, 13.1, 13.3, 23.5_
  - [x] 5.8 Extend `packages/web/e2e/time.spec.ts` and `packages/web/e2e/smoke.spec.ts`
    - Time spec: the scrubber works by keyboard in a real browser and the graves repaint. Smoke: apply Deliberate test change 14, add a timed pass of 30 repaints of 300 graves after a scrubber move with a median of at most 16 ms, and one pass for the tufts at 1280 by 800.
    - Notes: 5.8 run by orchestrator via impl, passed, 23 Nov 2026. Medians: 2.35 ms (tufts pass), 1.70 ms (after a scrubber move), both within 16 ms.
    - _Requirements: 1.6, 12.5, 12.6, 11.3_
  - [x] 5.9 Security review of task 5
    - Invoke the security-reviewer agent on the files of 5.1 to 5.8. Record the findings in "Review notes". Fix every defect in this task.
    - _Requirements: 24.5_
    - Review notes: security-reviewer, 23 Nov 2026: ready with notes, no defects. Notes only: (1) e2e Home check assumes every grave is Not-published at the Scrubber start (true for the demo: every first Segment is state null); run where Chromium exists; (2) ticks are spaced by index across the full width while the native thumb is inset, cosmetic; (3) a grave named "with advisories" before the scan date has no count (12.9 asks for none); (4) `TooltipContent.state` keeps `pkg.state` for a Not-published Form, `stateText` carries the text; (5) `marker` and `burial` are in the plan now (5.2 asks for it), drawn in task 6.
    - Notes: 5.8 written, not run (run by orchestrator). The first timed pass of the smoke test at 1280 by 800 is the tufts pass (300 graves now carry Timelines); the second pass follows Home then ArrowRight on the slider and logs "median redraw of 300 graves after a scrubber move over 30 paints". Deliberate changes applied: 6, 7, 9 (7 chips, title extended with "and the Not-published form"), 11 (seven Tab presses, `seen[5]` is "History date"; the axios and keyv presses come in task 7), 12 (selector `.scrub input:focus-visible`). Two further test edits were forced by the new fields and chip and are not in the design list: `ghost-drift.test.ts` `withoutGhost` copies `pending`, `marker`, `burial` (type only), and `header.test.tsx` "keeps the legend closed at load and lists the contents when opened" counts 7 legend svgs, not 6.

- [x] 6. The pull request marker and the burial (C)
  - Adds the `marker` token, the `pullRequests` field read from the remediation log, the session marks, the pennant, and the burial animation. The animation never changes a state.
  - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5, 14.6, 14.7, 14.8, 15.1, 15.2, 15.3, 15.4, 15.5, 15.6, 15.7, 16.1, 16.2, 16.3, 16.4, 16.5_
  - [x] 6.1 Update `packages/web/src/scene/palette.ts`, `header/Legend.tsx` and `styles.css`
    - Add the token `marker` (`#efe6c4`) and `--marker` to `cssVariables`. Add the legend chip for the Pull request marker with an inline pennant SVG filled by the CSS class. Add `marker` to the contrast tests' lists in 6.5.
    - _Requirements: 16.2, 16.4_
  - [x] 6.2 Update `packages/api/src/scan.ts` and add `packages/api/src/pull-requests.ts`
    - `pullRequestMarks(entries, packageNames)` is pure: the latest entry by timestamp for each package in the report, at most 300. `scan()` reads `remediationLog.list(repoUrl.toLowerCase())`, adds `pullRequests`, and on a failed read omits it and logs one warn line `remediation-log-unavailable` with `errorName` only. The evidence path is unchanged.
    - _Requirements: 14.1, 14.2_
  - [x] 6.3 Update `packages/web/src/Cemetery.tsx`, `scene/layout.ts`, `scene/draw.ts` and `overlay/grave-label.ts`
    - A session set of marked packages, filled when `onRemediate` answers `opened` or `existing`, cleared per response. `planScene` sets `marker` from `pullRequests` and the session set. The painter draws the pennant with four `fillRect` calls in `marker` at the Cell offsets of design.md "Part C". The grave button name gains " pull request opened". A plan in `remediations` marks nothing.
    - _Requirements: 14.4, 14.5, 14.6, 14.7, 14.8, 16.1, 16.3, 16.5_
  - [x] 6.4 Create `packages/web/src/time/burial.ts` and `use-burial.ts` and update `scene/draw.ts` and `Cemetery.tsx`
    - `burialFrame(phase)` as in design.md. The painter clips the stone at the Plinth top, translates it by `sink * 130`, draws the mound in `grassLight` with `arc` and a scale, and hides the Ghost while the burial plays. The driver uses `requestAnimationFrame`, starts when the drawer closes (or at once if closed), plays once per package and scan, and does nothing under Reduced motion (the marker shows at once).
    - _Requirements: 15.1, 15.2, 15.3, 15.4, 15.5, 15.6, 15.7_
  - [x] 6.5 Write the tests of Part C: Properties 17, 18, 19 and 23
    - `packages/api/test/pull-requests.test.ts`: **Property 17: Pull request marks from the log**, and a failing reader omits the field.
    - `packages/web/test/marker.test.tsx`: **Property 18: The marker adds nothing but the marker**, and DOM examples for the session mark, the response mark and the cleared session.
    - `packages/web/test/burial.test.ts`: **Property 19: The burial never changes a state**, the hook examples (once per package, deferred while the drawer is open, none under Reduced motion, focus unchanged).
    - `packages/web/test/shapes-palette.test.ts`: **Property 23: The marker colour keeps the contrast**. Apply Deliberate test changes 8 and 9 (chips from 7 to 8).
    - **Validates: Requirements 14.1, 14.2, 14.5, 14.6, 14.7, 15.1, 15.2, 15.3, 15.4, 15.5, 15.6, 15.7, 16.1, 16.3, 16.4, 16.5**
    - Tags: `Feature: cemetery-time, Property N: <title>` for each.
    - _Requirements: 14.1, 14.2, 14.4, 14.5, 14.6, 14.7, 14.8, 15.1, 15.2, 15.3, 15.4, 15.5, 15.6, 15.7, 16.1, 16.2, 16.3, 16.4, 16.5_
  - [x] 6.6 Security review of task 6
    - Invoke the security-reviewer agent on the files of 6.1 to 6.5. Record the findings in "Review notes". Fix every defect in this task.
    - _Requirements: 24.5_
    - Review notes: security-reviewer, 23 Nov 2026: ready to merge, no defects. Notes only: (1) a grave already in the log that gets an `existing` answer plays its burial once, with the pennant held until phase 0.65 (matches 15.1, 15.5); (2) the log read in `scan()` runs after the plans and timelines, not in parallel, and has no timeout of its own (left as is, one partition Query); (3) the grass and ground changes in draw.ts belong to task 1; (4) the legend chip text is "Pennant: a pull request was opened".
  - Notes: 6.1 to 6.6 done, 23 Nov 2026. `marker` is `#efe6c4` (same hex as the wordmark). New files: `api/src/pull-requests.ts`, `web/src/time/burial.ts`, `web/src/time/use-burial.ts`, `api/test/pull-requests.test.ts`, `web/test/marker.test.tsx`, `web/test/burial.test.ts`. Deliberate test changes 8 and 9 applied (token lists gain `marker`; chips 7 to 8, title extended with "and the Pull request marker"). One edit outside the list: `header.test.tsx` "keeps the legend closed at load and lists the contents when opened" counts 8 legend svgs, not 7 (the same counted thing grew, as in task 5). The evidence path is unchanged and the demo digest stays c8fb6cab465d46ca92cf83dbc10022b6a662c8fad68ec8f64d827ef16f43344d. Divergences are in design.md "Task 6 divergences".

- [x] 7. The incident replays (D)
  - Builds the two fixtures from the sourced facts, loads them by header control and by URL, and shows the banner on every replay screen.
  - _Requirements: 17.1, 17.2, 17.3, 17.4, 17.5, 17.6, 17.7, 17.8, 17.9, 18.1, 18.2, 18.3, 18.4, 18.5, 18.6, 19.1, 19.2, 19.3, 19.4, 19.5, 19.6, 20.1, 20.2, 20.3, 20.4, 20.5, 20.6_
  - [x] 7.1 Create `packages/api/scripts/lib/replay-facts.mjs` and update `packages/api/scripts/generate-demo-scan.mjs`
    - The facts file holds the six source URLs and the facts of design.md "Replay facts" and nothing else. The generator builds each replay response: signals through `buildHealth` (sourced signals available, others unavailable with the reason "not in public reports", source the first report URL, `fetchedAt` the replay `generatedAt`), the default policy through `evaluatePolicy`, the Timeline Segments per Resolved version (not through `buildTimeline`): for each Stop of the facts it builds the `StateInputs` of that version from the facts of that version and its earlier versions, with last publish unavailable for a version with no publish time, calls `evaluateState` at the Stop `from`, and writes `{ from, state, reason, ghost: false, version }` as in design.md "Replay Segments follow the Resolved version" (axios 1.14.0, 1.14.1, 1.14.0 from 2026-03-30T23:21:00.000Z, 2026-03-31T00:21:00.000Z, 2026-03-31T03:29:00.000Z; keyv 5.6.0, 6.0.0 from 2026-08-04T08:35:00.000Z, 2026-08-04T09:35:00.000Z), and the `replay` block. The report is built for the Resolved version at the Scan date. It writes `packages/web/public/replay/axios.json` and `keyv.json` byte-identically on two runs. Run `npm run demo:generate -w @sexton/api`. Record the Stops of both fixtures in design.md "Notes and open items" and compare each Segment state and reason with the expected tables of "Replay facts" (marked "expected, confirmed by task 7"). If a row differs, fix the generator, and if the Engine rule makes the table wrong, correct the table and record the reason in "Review notes".
    - _Requirements: 17.1, 17.2, 17.3, 17.4, 17.6, 17.7, 17.8, 17.9_
  - [x] 7.2 Write `packages/api/test/replay-facts.test.ts`
    - Examples: every field of each fixture traces to the facts file (a table of expected values), only the six URLs appear, only the signals on main appear (no publisher-changed, no new-dependency), the fixtures pass the web validator, two generator runs are byte-identical, each Segment of each fixture has the `version`, state and reason of the expected tables (axios: Restless "all state signals unavailable" with 1.14.0, Possessed "provenance regression: 1.14.1 has no provenance, 1.14.0 had it" with 1.14.1, Restless with 1.14.0; keyv: Restless with 5.6.0, Possessed "install script added in 6.0.0" with 6.0.0), the last Segment equals the state of the report, and no version outside the sourced versions appears. Add the versioned half of Property 13: an independent model builds `StateInputs` per version from the replay facts and generated per-version facts, and the Segment state and reason equal `evaluateState` at `from`, at an instant inside the Segment and at the last millisecond before the next `from`.
    - **Property 13: Segments agree with state as of at every instant** (versioned half)
    - **Validates: Requirements 8.10, 17.8, 17.9**
    - Tag: `Feature: cemetery-time, Property 13: Segments agree with state as of at every instant`.
    - _Requirements: 8.10, 17.1, 17.2, 17.3, 17.4, 17.5, 17.6, 17.7, 17.8, 17.9_
  - [x] 7.3 Create `packages/web/src/replay/replay-ids.ts`, `ReplayBanner.tsx`, `ReplayButtons.tsx` and update `load/use-scan-loader.ts`, `App.tsx`, `header/Header.tsx`, `header/header-model.ts`, `drawer/Drawer.tsx` and `styles.css`
    - `parseReplayParam`, `replayAddress`, the `replay` load source, the buttons "axios 2026" and "keyv 2026" (rendered only when `onReplay` is passed, after the Scan button), the banner in the scene screen and in the drawer, no demo label and no evidence links for a replay, and the demo-only note in place of the pull request button. Every source link follows the `https://` link rule. The drawer of a replay shows the Segment version of the chosen instant in its title and the "State on <date>" line (the props of 5.3).
    - _Requirements: 12.9, 18.1, 18.2, 18.3, 18.4, 18.5, 18.6, 19.1, 19.2, 19.3, 19.5, 19.6_
  - [x] 7.4 Write `packages/web/test/replay.test.tsx` and extend `packages/web/test/validate-scan-response.test.ts`: Properties 20, 21 and 22
    - **Property 20: The replay fixtures pass the validator, also under mutation, and follow the sourced versions**
    - **Property 21: The banner is on every replay screen and links only to https** (1000 runs)
    - **Property 22: The replay query is a closed set**
    - **Validates: Requirements 17.5, 17.8, 17.9, 18.3, 18.4, 18.5, 19.1, 19.2, 19.3, 19.4, 20.1, 20.2, 20.3, 20.4, 20.5, 20.6, 23.6**
    - Add DOM examples: the buttons load the fixtures, `?replay=axios` loads axios, a bad value shows the error panel and makes no request, no demo label, no downloads and no pull request button on a replay, the Stops of both fixtures are exactly those of requirement 20.6, the grave inscription, the grave button name and the tooltip show 1.14.0, 1.14.1 and 1.14.0 at the three axios Stops and 5.6.0 and 6.0.0 at the two keyv Stops, the drawer title shows the same version with the line "State on <date>: <State>. <reason>", the Evidence tooltip names the provenance regression (axios 1.14.1) and the new install script (keyv 6.0.0), and the first Stop of each replay shows no Not-published mound. Update the a11y keyboard test for the two Replay buttons (Deliberate test change 11).
    - Tags: `Feature: cemetery-time, Property N: <title>` for each.
    - _Requirements: 17.5, 18.1, 18.2, 18.3, 18.4, 18.5, 18.6, 19.1, 19.2, 19.3, 19.4, 19.5, 19.6, 20.1, 20.2, 20.3, 20.4, 20.5, 20.6, 23.6_
  - [x] 7.5 Extend `packages/web/e2e/time.spec.ts` for the replays (written, run by orchestrator)
    - In a real browser: `?replay=axios` and `?replay=keyv` load under the CSP with no external request, the banner is visible with its links, the scrubber start shows the Restless grave of the first version (axios 1.14.0, keyv 5.6.0) and no Not-published mound, the axios middle Stop shows the open grave of Possessed with 1.14.1, the axios end shows 1.14.0 again, the keyv end shows the open grave of Possessed with 6.0.0, and a second replay can be opened from the header.
    - Notes: 7.5 run by orchestrator via impl, passed, 23 Nov 2026. axios and keyv replays pass.
    - _Requirements: 18.2, 18.3, 19.1, 20.1, 20.2, 20.3, 20.4, 20.5, 20.6_
  - [x] 7.6 Security review of task 7
    - Invoke the security-reviewer agent on the files of 7.1 to 7.5. Record the findings in "Review notes". Fix every defect in this task.
    - _Requirements: 24.5_
    - Review notes: 23 Nov 2026, security-reviewer, read-only, no tests run. Verdict: ready with notes, no defect. It confirmed that the `replay` param is a closed set (exactly one value, exactly `axios` or `keyv`, anything else `scan-url-rejected` with no request, `replay` wins over `scan`), that fixture addresses pass `checkScanUrl` on the page origin, that the banner has the exact text and links only to `https://` addresses with no white space or control character (`target="_blank" rel="noopener noreferrer"`, everything else text, no innerHTML), that every fixture field traces to `replay-facts.mjs` with only the six URLs and "not in public reports" for unsourced signals, that states and reasons come from `evaluateState`/`buildHealth`, and that a replay has no demo label, no evidence links and no Open pull request button. Notes and actions: (1) `replay-facts.test.ts` imports the web validator. Kept: `generate-demo-scan.test.ts` does the same on main, and the file is in the `tsconfig.test.json` exclude list the same way. (2) The `timelines.test.ts` and `timeline-size.test.ts` excludes come from task 4, not task 7. (3) The `no-regression` `snapshotCaptureTime` is derived, not sourced. Fixed: a comment in `replayStateInputs` says so, and design.md "Task 7 divergences" records it. It changes no state. (4) An orphaned doc comment in `Header.tsx` props. Fixed: moved back above `asOf`. (5) `isSafeSourceUrl("https://")` is true. Kept: it matches the link rule of design.md and Property 21, and all six fixture URLs are full addresses. (6) The a11y test checks `seen[5..7]` and then the grave as active element after the ninth press, as Deliberate change 11 says. No action. Gates were re-run after the fixes.
  - Notes: 7.1 to 7.6 done, 23 Nov 2026. Every generated Stop equals the expected tables of design.md "Replay facts" (recorded in "Notes and open items"), so no table changed. Deliberate test changes 11 and 12 applied (a11y Tab stops: nine presses with `axios 2026`, `keyv 2026`, `History date`; `.replay-button:focus-visible` added to the focus selectors). One edit outside the list: `scrubber.test.tsx` "is reachable by Tab" presses Tab 6 times, not 4 (the two Replay buttons sit before the slider). The demo evidence digest stays c8fb6cab465d46ca92cf83dbc10022b6a662c8fad68ec8f64d827ef16f43344d. Property 21 (1000 runs) takes 3342 ms alone after the change to one parse per run (3754 ms before). In the loaded full web run it took 8543 ms before that change and 10379 ms after it (`build/ct-web-t7.json`). It is a watch item for task 10. Final runs: api 279 of 279 passed, web 367 of 367 passed, both exit 0. Divergences are in design.md "Task 7 divergences".

- [x] 8. Requirements document, steering and README
  - Brings the product documents in line with the finished behaviour.
  - _Requirements: 21.1, 21.2, 21.3, 21.4, 21.5_
  - [x] 8.1 Update `docs/requirements.md`
    - Amend R-UI-1 and R-UI-4 as in design.md "Docs and steering". Change the version line to "Version 0.4, 23 Nov 2026." and append the change-log line "0.4, 23 Nov 2026. R-UI-1: Not-published form and pull request marker. R-UI-4: drawer shows the scan date. Time features: history scrubber, burial, replay." Change nothing else.
    - _Requirements: 21.1, 21.2_
  - [x] 8.2 Update `.kiro/steering/web.md`
    - Add the tuft grass and ground height, the scrubber and the as-of lookup (no state rule in web), the two new forms and their legend chips, the burial, the replay and its banner. Keep every existing rule and the front matter.
    - _Requirements: 21.3_
  - [x] 8.3 Update `.kiro/steering/engine.md` and `.kiro/steering/product.md`
    - engine.md: the Timeline, `stateAsOf`, the rule that the Engine computes Segments and the web only looks them up. product.md: the three time features and the two replays, and that publisher-changed and new-dependency signals come later. Keep every existing rule.
    - _Requirements: 21.3_
  - [x] 8.4 Update `README.md` and `packages/web/test/readme.test.ts`
    - Add "## Replay" after "## Sexton and Dependabot" and before Roadmap: two links (`?replay=axios`, `?replay=keyv`) and the sentence that a replay is reconstructed from public reports and is not a live scan. Short sentences, no semicolon, no dash chain. Apply Deliberate test change 13 and add a test that pins the section text.
    - _Requirements: 21.4, 21.5_
  - [x] 8.5 Security review of task 8
    - Invoke the security-reviewer agent on the files of 8.1 to 8.4. Record the findings in "Review notes". Fix every defect in this task.
    - _Requirements: 24.5_
    - Review notes: security-reviewer, 23 Nov 2026 (files of 8.1 to 8.4; impl.md local edit out of scope; tests not run): ready with notes, no defects. Actions: (1) `.kiro/steering/engine.md` last rule was truncated and held stray text from a failed shell write: rewritten to "The web app only looks the Segments up (time/form-at.ts) and holds no state rule. The optional Segment version is set by the replay generator, never by buildTimeline." and checked by reading the file back; (2) grass rule "row lines and one line near the bottom": confirmed in `scene/draw.ts` (Row lines `1 .. plan.rows`, Bottom line when `groundHeight - height >= BOTTOM_LINE_MIN_GAP`); (3) the readme adjacency assertion now expects `## Replay` after the Dependabot heading and `## Roadmap` after that: it follows from the placement that Deliberate test change 13 names, recorded in design.md "Task 8 divergences". Own check after the review: the tooltip does not carry the marker text, so web.md now says the grave button name ends in "pull request opened" (`overlay/grave-label.ts` `MARKER_LABEL_SUFFIX`).
    - Notes: 8.1 to 8.4 done, 23 Nov 2026. docs/requirements.md: only the version line, R-UI-1, R-UI-4 and the 0.4 change-log line changed. Steering: front matter and every old rule kept, 11 rules added to web.md, 3 to engine.md, 3 to product.md. No old rule contradicts the code: "Stars and grass depend on the scene width only" still holds. README: "## Replay" sits between "## Sexton and Dependabot" and "## Roadmap", screenshot line unchanged (retaken in task 9). Gates: `npx tsc -b packages/web` 0, `npx eslint --max-warnings=0 packages/web/test/readme.test.ts` 0. Web suite run alone after the last edit: exit 0, 39 files, 368 of 368 passed (`build/ct-web-t8.json`, `build/ct-web-t8.txt`). An earlier run had 2 timeouts (draw Property 2 tufts test, replay Property 21) because three web suites ran at once by mistake (load average 37). Both are known watch items, both pass in the run alone.

- [x] 9. The screenshot
  - Retakes `docs/cemetery.png` after every visual change has landed.
  - _Requirements: 22.1, 22.2, 22.3_
  - [x] 9.1 Orchestrator retakes the screenshot
    - Run `npm run test:e2e -w @sexton/web` so that the smoke spec writes `docs/cemetery.png` at 1440 by 900 with the drawer closed, Reduced motion on and the scrubber at the Scan date, after the first canvas paint.
    - Notes: 17 e2e tests passed, none skipped, exit 0 (23 Nov 2026, build/ct-e2e-t9.txt). Medians 2.35 ms and 1.70 ms. docs/cemetery.png is 1440x900, mtime 2026-11-24T03:18:19Z (rewritten by this run).
    - _Requirements: 22.1, 22.3_
  - [x] 9.2 Orchestrator reads the image itself
    - Open `docs/cemetery.png` as an image and confirm: the grass reads as short tufts along the row lines, the ground reaches the bottom edge, the repository text and the demo label do not touch, the scrubber is visible. Record what was seen under "Notes". If any of the four is not true, fix the cause in the owning task and retake.
    - Notes: the orchestrator checked docs/cemetery.png itself on 23 Nov 2026 and did not wait for the user: 1440 by 900, 106,321 bytes, drawer closed, left-padder (first grave) shows its blue ring. Grass is short tufts along each row line and one line at the bottom, none in the sky or between the graves. The ground reaches the bottom of the viewport (no dead band). The repository URL and the "demo fixture, recorded data" chip have a gap. The header shows the "axios 2026" and "keyv 2026" buttons, and the History date scrubber sits under the header at the scan date with its tick marks. Ghosts only over graves with advisories. Result: pass. Observed, not a defect: the tufts are faint (dark grass tokens); the tick marks are spaced by stop index, not by time.
    - _Requirements: 22.2_
  - [x] 9.3 Security review of task 9
    - Invoke the security-reviewer agent on `docs/cemetery.png` (metadata only) and `packages/web/e2e/*.spec.ts`. Record the findings in "Review notes". Fix every defect in this task.
    - _Requirements: 24.5_
    - Review notes: security-reviewer, 23 Nov 2026 (docs/cemetery.png metadata and packages/web/e2e/*.spec.ts; impl.md local edit out of scope; tests not run): ready to merge, no defects. docs/cemetery.png is a PNG of 1440x900, 8-bit RGB, 106321 bytes, with only IHDR, IDAT and IEND chunks (no text or EXIF metadata, no trailing data); the only write to it is the screenshot in smoke.spec.ts. All four e2e specs install an origin-only route guard that aborts foreign origins before page.goto (polish, time and smoke/remediate, the last two inline); the replay test also asserts no foreign request. No secrets, no process.env, no shell, eval or HTML use. The https links in time.spec.ts and PR_URL in remediate.spec.ts are asserted or mocked, never fetched. Notes (no action): the one dynamic selector in remediate.spec.ts:38 comes from the committed demo fixture and follows an expect(proposed).toBeDefined(); the guard helper is duplicated in polish.spec.ts and time.spec.ts (style only). Actions: none needed.

- [x] 10. Root gates
  - Runs every gate once, one package at a time where load matters.
  - _Requirements: 7.5, 13.2, 23.4, 23.5, 24.1, 24.2, 24.3, 24.4, 24.6_
  - [x] 10.1 Orchestrator runs typecheck
    - `npm run typecheck` at the root, zero errors.
    - _Requirements: 24.1_
  - [x] 10.2 Orchestrator runs lint
    - `npm run lint` at the root, zero errors and zero warnings. Confirm no file under `build/` is reported.
    - _Requirements: 6.1, 24.1_
  - [x] 10.3 Orchestrator runs the test suites
    - `npm test -w @sexton/engine`, `-w @sexton/api`, `-w @sexton/web`, `-w @sexton/cli`, `-w @sexton/action`, `-w sexton-infra`, one at a time, then `npm test` at the root. Every existing test is green apart from the Deliberate test changes, which pass in their new form. Confirm `test/a11y.test.tsx` and `test/imports.test.ts` pass, and that no test timed out (requirement 7.5).
    - _Requirements: 7.5, 13.2, 23.4, 23.5, 24.3_
  - [x] 10.4 Orchestrator runs the end-to-end tests
    - `npm run test:e2e -w @sexton/web`. Confirm the specs ran and were not skipped, the 300-grave medians (initial, after a scrubber move) are at most 16 ms (apply the performance fallback of design.md once if not, and stop and report if it is still above), the header gap and the ground height checks pass, the replays load under the CSP, and there is no CSP violation.
    - _Requirements: 1.6, 2.1, 3.1, 12.6, 23.4_
  - [x] 10.5 Orchestrator checks the scope of the change
    - Run `git diff --name-only` and list untracked files. Confirm every changed path is under `packages/engine`, `packages/api`, `packages/web`, or is `eslint.config.js`, `README.md`, `docs/cemetery.png`, `docs/requirements.md`, under `.kiro/steering`, or `.kiro/specs/cemetery-polish/requirements.md` or `.kiro/specs/cemetery-time`; nothing under `infra`, `packages/cli` or `packages/action`; no `package.json` and no `package-lock.json`. Run `npm run build -w @sexton/web` and confirm its `postbuild` bundle check passes.
    - _Requirements: 23.4, 24.1, 24.2_
  - [x] 10.6 Orchestrator runs the CLI "after" run and records the sizes (needs network)
    - The "before" run was made by the orchestrator right after the spec commit and before task 1. It ran the built CLI against `https://github.com/expressjs/express` and wrote `build/ct-express-before/scan.json`. Now build the CLI (`npm run build -w @sexton/cli`) and run it once more the same way against `https://github.com/expressjs/express`, in the working directory `build/ct-express-after`, so that the output is `build/ct-express-after/scan.json`. Do not change `packages/cli`.
    - Record in design.md "Notes and open items", in the table of that item: the byte size of `build/ct-express-before/scan.json`, the byte size of `build/ct-express-after/scan.json`, and the byte size of a gzip of each (`gzip -c <file> | wc -c`). Record the numbers as measured, whatever they show. State whether the after output carries a `timelines` key (the CLI is not changed, so it may not).
    - _Requirements: 24.6_
  - [x] 10.7 Security review of the whole change
    - Invoke the security-reviewer agent on the whole branch against this spec's requirements and the security steering. Record the findings in "Review notes". Fix every defect before the spec is closed.
    - _Requirements: 24.5_
    - Review notes: security-reviewer, 23 Nov 2026 (whole branch plus working tree; impl.md out of scope; tests not run): ready to merge, no defects. Notes (no action): (1) the worst-case timelines block is about 5.6 MB (`timeline-size.test.ts`), near the 6 MB Lambda limit, with no runtime size guard in `scan.ts`; real reasons are far shorter than the 200-character cap. (2) `validateScanResponse` does not check that `replay.sources[].url` is https or cap its length; the UI makes a link only for https. (3) `scan.ts` reads the remediation log with `repoUrl.toLowerCase()`, the same key as `evidence.ts`. (4) `eslint.config.js` ignores `build/**` (requirement 6). Actions: none needed. Gates: typecheck, lint, every test package, root test, e2e and the web build all exit 0 (see "Task 10 gates" in design.md).

## Notes

- Test sub-tasks are not optional in this plan.
- Each task references the requirements it implements. Requirement numbers are those of requirements.md in this spec.
- Orchestrator-run sub-tasks (2.7, 5.8, 7.5, 9.x, 10.x; 10.6 needs network) need a browser or the orchestrator and are not run by the impl agent. None asks the user or waits for the user.
- Deliberate test changes are numbered in design.md. Anything not listed there must pass unmodified.
- Property 21 (a link guard) runs 1000 times. Every other property runs 100 times.
- The security review of each top-level task is its last sub-task. Reviews run after the task's tests pass.
- Top-level tasks run in order. Each top-level task finishes, including its review, before the next one starts, so a review reads one task's diff.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "1.3"] },
    { "id": 2, "tasks": ["1.4"] },
    { "id": 3, "tasks": ["1.5"] },
    { "id": 4, "tasks": ["2.1", "2.4", "2.5", "2.6"] },
    { "id": 5, "tasks": ["2.2"] },
    { "id": 6, "tasks": ["2.3", "2.7"] },
    { "id": 7, "tasks": ["2.8"] },
    { "id": 8, "tasks": ["3.1"] },
    { "id": 9, "tasks": ["3.2", "3.3"] },
    { "id": 10, "tasks": ["3.4", "3.6", "3.7"] },
    { "id": 11, "tasks": ["3.5", "3.8", "3.9"] },
    { "id": 12, "tasks": ["3.10"] },
    { "id": 13, "tasks": ["4.1"] },
    { "id": 14, "tasks": ["4.2", "4.3", "4.4"] },
    { "id": 15, "tasks": ["4.5", "4.6"] },
    { "id": 16, "tasks": ["4.7"] },
    { "id": 17, "tasks": ["5.1", "5.2"] },
    { "id": 18, "tasks": ["5.3", "5.5", "5.6"] },
    { "id": 19, "tasks": ["5.4"] },
    { "id": 20, "tasks": ["5.7", "5.8"] },
    { "id": 21, "tasks": ["5.9"] },
    { "id": 22, "tasks": ["6.1", "6.2"] },
    { "id": 23, "tasks": ["6.3"] },
    { "id": 24, "tasks": ["6.4"] },
    { "id": 25, "tasks": ["6.5"] },
    { "id": 26, "tasks": ["6.6"] },
    { "id": 27, "tasks": ["7.1"] },
    { "id": 28, "tasks": ["7.2", "7.3"] },
    { "id": 29, "tasks": ["7.4", "7.5"] },
    { "id": 30, "tasks": ["7.6"] },
    { "id": 31, "tasks": ["8.1", "8.2", "8.3", "8.4"] },
    { "id": 32, "tasks": ["8.5"] },
    { "id": 33, "tasks": ["9.1"] },
    { "id": 34, "tasks": ["9.2"] },
    { "id": 35, "tasks": ["9.3"] },
    { "id": 36, "tasks": ["10.1", "10.2"] },
    { "id": 37, "tasks": ["10.3"] },
    { "id": 38, "tasks": ["10.4"] },
    { "id": 39, "tasks": ["10.5"] },
    { "id": 40, "tasks": ["10.6"] },
    { "id": 41, "tasks": ["10.7"] }
  ]
}
```
