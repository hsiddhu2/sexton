# Implementation Plan: cemetery-undead-2

## Overview

Phase 2 of "Night of the Living Deps":
- Part A, the carry-overs of the owner's review of Phase 1: readable name labels, the replay header labels, the Halo, the pit edge colour, wider rows, the sources line, the fresh-clone run and the footer hook;
- Part B: sound, speech bubbles, the replay Burst, the burial Priest, the Rise clip and the Load moment.

Then the README, web.md, the screenshots, the gates and the fresh-clone run. Paths are relative to the repository root. No test touches the network.

Run-time notes:

- Build starts only after the owner types `go` and has decided R-UI-8, the Bubble table and the Sound list (design.md "Open question for the owner").
- Change only `packages/web`, `README.md`, `CREDITS.md`, `docs/cemetery.png`, `docs/replay-axios.png`, `.kiro/steering/web.md`, `docs/requirements.md` and `.kiro/specs/cemetery-undead-2`. No `package.json` or `package-lock.json` change.
- Tests change only where design.md lists a Deliberate test change. Any other existing test that fails is a regression: fix the source, not the test.
- `numRuns` is 100 for every new property. Every new property test carries `Feature: cemetery-undead-2, Property N: <title>`.
- Every visual sub-task ends with the screenshot loop of design.md "Visual critic protocol". Each round's findings are recorded as "Critic round N".
- Each top-level task ends with an independent code review on its changed files. Every defect is fixed in the task, and the findings are recorded under "Review notes".
- Run Vitest one package at a time. A first run under load can time out: run the failing file alone before reading it as a regression.
- Check `git branch --show-current` before every commit.
- Commits carry no trailer. Notes say what was done and found, in plain words, and name no tool. No file outside private/ states who or what produced the work.

## Tasks

- [x] 1. The owner's decisions and the baseline
  - Applies R-UI-8 and records the baseline.
  - _Requirements: 13.1, 13.2, 13.3, 15.1_
  - [x] 1.1 Apply the owner's decision on R-UI-8
    - If approved, add R-UI-8 to docs/requirements.md section 5.8. If declined, mark Part B1 and B2 not built and record the call in design.md. Either way, bump the header to Version 0.7, 25 Nov 2026 (it reads 0.5 today, one behind its own 0.6 line), and add the change log line "0.7, 25 Nov 2026" naming every requirement change of this spec.
    - Record the approved Bubble table and Sound list, with any wording the owner changed, in design.md.
    - _Requirements: 13.1, 13.2, 13.3_
  - [x] 1.2 Record the baseline
    - Capture the demo and the axios replay at 1440 by 900 and 390 by 844 under build/undead-2/round-0. Record the Canvas top, the repaint medians and the e2e count in "Notes".
    - _Requirements: 15.1_

- [x] 2. Readable labels, wider rows and the pit edge (A1, A4, A5)
  - _Requirements: 1.1, 1.2, 1.4, 4.1, 4.2, 5.1, 5.2_
  - [x] 2.1 Add `packages/web/src/scene/art-box.ts` and bring every mark inside ART_BOX
    - ART_BOX, LABEL_BOX, FORM_BOX, `artRect`, `labelRect`. Ghost draw shift (−4, −2), lid moved 5 shape units right, and any other mark the probe finds outside the box. Record each move in design.md "Decisions made during implementation".
    - _Requirements: 1.1, 1.2_
  - [x] 2.2 Write `packages/web/test/art-box.test.ts`
    - **Property 1: No grave covers another grave's name**
    - **Validates: Requirements 1.1, 1.2**
    - **Property 2: Every mark of a grave lies in its Art box**
    - **Validates: Requirements 1.2, 9.6, 10.1**
    - The bounds-recording context follows translate, scale, rotate, save and restore, reads the points of every SVG path string, rect, arc and ellipse, and grows stroked bounds by half the line width times the miter factor. It runs at scales 0.64, 0.8, 1 and the replay scale. The Burst and Priest phases join it in tasks 6 and 7.
    - _Requirements: 1.1, 1.2_
  - [x] 2.3 Pitch caps and the pit edge
    - PITCH_CAP middle 1.334 and back 1.667 (Deliberate test change 5). The pit edge strokes in `costume.flower`, with a new test that its CIEDE2000 against the ring is at least 20.
    - _Requirements: 4.1, 4.2, 5.1, 5.2_
  - [x] 2.4 e2e: the Ghosts' drawn pixels clear every name label
    - At 1440 by 900 and 390 by 844 on the demo, read the canvas pixels inside each label rectangle with Ghosts drawn and with Ghosts off (a test-only plan flag under `__SEXTON_E2E__`), and require them equal.
    - _Requirements: 1.4_
  - [x] 2.5 Screenshot loop
    - _Requirements: 15.1, 15.2, 15.3_
  - [x] 2.6 Independent code review of task 2
    - _Requirements: 16.5_

- [x] 3. The Halo (A3)
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_
  - [x] 3.1 Add `packages/web/src/scene/halo.ts` and draw it
    - `haloMask(plan)`, the cached offscreen layer of design.md A3, HALO_ALPHA_BYTE, HALO_RADIUS and HALO_FEATHER. Drawn after the glow pass and before the graves, and not for the grave that holds the Lantern glow (Deliberate test change 6).
    - _Requirements: 3.1, 3.2, 3.5_
  - [x] 3.2 Write `packages/web/test/halo.test.ts`
    - **Property 3: The Halo paints nothing under a grave or a name**
    - **Validates: Requirements 3.2, 3.3, 3.4**
    - The existing glow contrast test runs unedited.
    - _Requirements: 3.3, 3.4_
  - [x] 3.3 Measure the repaint medians with the Halo, and run the screenshot loop
    - _Requirements: 12.4, 15.1, 15.2, 15.3_
  - [x] 3.4 Independent code review of task 3
    - _Requirements: 16.5_

- [x] 4. The replay header, the sources line and the footer hook (A2, A6, A8)
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 6.1, 6.2, 6.3, 16.6_
  - [x] 4.1 Label the replay header times
    - `Header` takes `replay`. "Window ends" and "Showing" on a replay; "as of" elsewhere. Tests on both replays at every Stop, and the demo unchanged.
    - _Requirements: 2.1, 2.2, 2.3, 2.4_
  - [x] 4.2 Sources on one line
    - `ReplayBanner` renders "Sources:" and the comma-separated links. A test pins the text and the links in the card and the drawer.
    - _Requirements: 6.1, 6.2, 6.3_
  - [x] 4.3 The footer height hook watches every footer node
    - A test with two footer nodes, one replaced, and a size change on the second.
    - _Requirements: 16.6_
  - [x] 4.4 Screenshot loop
    - _Requirements: 15.1, 15.2, 15.3_
  - [x] 4.5 Independent code review of task 4
    - _Requirements: 16.5_

- [x] 5. Sound (B1)
  - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8, 8.9, 8.10, 8.11, 12.2, 12.3_
  - [x] 5.1 Add `sound/sound-pref.ts`, `sound/voices.ts` and `sound/engine.ts`
    - The Voice specs of the approved Sound list, MASTER_CAP, the limiter, the seeded noise buffer, the lazy factory and the dead state.
    - _Requirements: 8.5, 8.6, 8.7, 8.11_
  - [x] 5.2 Add `sound/use-sound.ts` and the toggle
    - `aria-pressed`, "Sound off" and "Sound on", the gesture gate, visibility, Serious mode. Remove SOUND_NOTE_TEXT and the hidden note (Deliberate test changes 1 to 4). Wire the triggers of design.md B1 that exist now (the ghost call on the Lantern glow); the sting, thud and bell are wired in tasks 6 and 7.
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.8, 8.9, 8.10, 12.2_
  - [x] 5.3 Write `packages/web/test/sound.test.tsx`
    - **Property 7: No sound before it is asked for, and never past the cap**
    - **Validates: Requirements 8.2, 8.3, 8.7, 8.8**
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8, 8.9, 8.10, 8.11_
  - [x] 5.4 e2e: no AudioContext before Sound is on
    - An init script wraps `window.AudioContext` and counts constructions. Load, scroll, hover and focus graves: 0. Press Sound: aria-pressed true and 1. Reload with "on" stored: 0 until a key press, then 1. The axe check with Sound on runs in Vitest, as the existing axe checks do (axe-core is already a devDependency; no new dependency).
    - _Requirements: 8.2, 8.4, 12.3_
  - [x] 5.5 Independent code review of task 5
    - _Requirements: 16.5_

- [x] 6. The Rise clip, the Load moment and the replay Burst (B5, B3)
  - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8, 11.1, 11.2, 11.3, 11.4, 11.5_
  - [x] 6.1 Add `scene/rise.ts` and the Load moment
    - `riseAt`, `loadDelay`, the once-per-page-load flag and its test reset, and the clipped draw. No sound.
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5_
  - [x] 6.2 Add `scene/burst.ts` and the Burst
    - `burstFrame`, the seeded particles, the Burst Stop from the Segments, the start on each arrival, the caption, the sting and the thud, the final pose under Reduced motion.
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.8_
  - [x] 6.3 Write `packages/web/test/burst-rise.test.tsx`, and add the Burst phases to Property 2
    - **Property 8: The Burst and the rise are pure, bounded and end in the still pose**
    - **Validates: Requirements 9.1, 11.1, 11.2**
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 11.1, 11.2, 11.3, 11.4, 11.5_
  - [x] 6.4 e2e: the Burst budget and the Reduced motion final pose
    - The timing hook paints the 300-grave plan with a Burst on its first grave at 30 phases. Its median is at most 16 ms. Under Reduced motion the axios replay at its Burst Stop shows the caption and the final pose.
    - _Requirements: 9.5, 9.7_
  - [x] 6.5 Screenshot loop, with the Burst mid-animation and at its final pose
    - _Requirements: 15.1, 15.2, 15.3_
  - [x] 6.6 Independent code review of task 6
    - _Requirements: 16.5_

- [x] 7. The burial Priest (B4)
  - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5_
  - [x] 7.1 Add `scene/characters/priest.ts`, the Priest in the burial and the Vigil
    - The walk and the read, the bell at phase 0.4, the Vigil under Reduced motion with the queue rule.
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5_
  - [x] 7.2 Write `packages/web/test/priest.test.tsx`, and add the Priest phases to Property 2
    - The existing burial tests run unedited.
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5_
  - [x] 7.3 Screenshot loop with a burial captured mid-walk and mid-read
    - _Requirements: 15.1, 15.2, 15.3_
  - [x] 7.4 Independent code review of task 7
    - _Requirements: 16.5_

- [x] 8. Speech bubbles (B2)
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8, 1.3_
  - [x] 8.1 Add `speech/bubble-table.ts`, `speech/bubble-schedule.ts`, `speech/bubble-place.ts` and `speech/Bubbles.tsx`
    - The approved table, the slot schedule, the placement, the aria-hidden layer, Serious mode, the drawer rule, the Reduced motion rule, the timer that stops when hidden.
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8, 1.3_
  - [x] 8.2 Write `packages/web/test/bubbles.test.tsx`
    - **Property 4: Bubble lines come only from the table**
    - **Validates: Requirements 7.1, 7.2**
    - **Property 5: At most two Bubbles, chosen by the clock alone**
    - **Validates: Requirement 7.3**
    - **Property 6: A placed Bubble is inside the Scene and clear of every name**
    - **Validates: Requirement 7.4**
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8_
  - [x] 8.3 e2e: Bubbles clear every name, and Serious mode hides them
    - At 1440 by 900 and 390 by 844, over several slots of the page clock, each shown Bubble's box intersects no label rectangle. Serious mode on: no Bubble.
    - _Requirements: 1.3, 7.4, 7.5_
  - [x] 8.4 Screenshot loop
    - _Requirements: 15.1, 15.2, 15.3_
  - [x] 8.5 Independent code review of task 8
    - _Requirements: 16.5_

- [x] 9. README, credits, steering, screenshots, gates and the fresh-clone run
  - _Requirements: 12.1, 12.2, 12.3, 12.4, 14.1, 14.2, 14.3, 14.4, 16.1, 16.2, 16.3, 16.4, 16.5_
  - [x] 9.1 README line, CREDITS.md and web.md
    - One README line: "Sound is off by default." CREDITS.md: every sound is generated in code. web.md per requirement 14.3.
    - _Requirements: 14.2, 14.3, 14.4_
  - [x] 9.2 Retake the README screenshots
    - docs/cemetery.png with two Bubbles; docs/replay-axios.png at the Burst's final pose with the caption (Deliberate test change 7).
    - _Requirements: 14.1_
  - [x] 9.3 Gates
    - Root typecheck, lint with zero warnings, test, and `npm run test:e2e -w @sexton/web`. Record the counts and the repaint medians (idle, after a scrubber move, during a Burst) in "Notes".
    - _Requirements: 12.4, 16.3, 16.4_
  - [x] 9.4 Check the scope and the bundle
    - The changed paths against the allowed list. No package.json change. `npm run build -w @sexton/web` passes its bundle check, and `dist` holds no audio file.
    - _Requirements: 16.1, 16.2_
  - [x] 9.5 Fresh-clone run on the final tree (A7)
    - As in cemetery-undead task 9.4. Record the results in design.md.
    - _Requirements: 16.4_
  - [x] 9.6 Independent code review of the whole branch
    - _Requirements: 16.5_
  - [x] 9.7 Report and stop
    - Write private/reports/K2e-cemetery-undead-2.md in the K2d report format, update private/PROGRESS.md and private/TRACKER.md, print the report and stop. Nothing is pushed. On the owner's `push`, follow the handoff's merge steps.
    - _Requirements: 16.1_

## Notes

- Spec review, 25 Nov 2026, four rounds by one independent reviewer:
  - Round 1: NOT READY with 9 defects, all fixed.
    1. The middle pitch cap 1.33 gave 204 px, not 205. It is now 1.334, and back 1.667.
    2. "Properties 1 and 7 hold unedited" contradicted change 5. The requirement now names the files that stay unedited.
    3. New GravePlan fields would break the pinned key list. They moved to ScenePlan.
    4. The lid still reached past 40 cell units with its stroke, and the Ghost span ignored drift. The lid moves 5 units, the probe grows strokes and runs at four scales, and the span is corrected.
    5. The Halo stacked with the Lantern glow. The Halo is now part of the Possessed glow and is dropped on the Lantern grave, and web.md's one-glow rule is rewritten.
    6. A Load-moment thud broke "Reduced motion changes no Voice". It is removed.
    7. One Bubble reason was false (a Moderate advisory already shows a Ghost). Reworded.
    8. Eight criteria were not in EARS form. Rewritten.
    9. A test file name was wrong, and change 6 named an assertion that does not exist. Corrected.
  - Round 2: NOT READY with 2 defects, both fixed: a stale cap value in change 5, and the selection ring and focus outline of a neighbour could sit on the Halo. The selected and Lantern cells are now cut.
  - Round 3: NOT READY with 1 defect, fixed: the Vigil's standing Priest was not cut.
  - Round 4: READY.
- Baseline (task 1.2), build/undead-2/round-0: Canvas top at 1440 by 900 is 119.7 px on the demo and 72.6 px on the axios replay; at 390 by 844 it is 323.5 px on the demo. Repaint medians at 300 graves 2.90 ms idle and 2.70 ms after a scrubber move, e2e 26 passed (the K2d fix 1 numbers; packages/web is unchanged since).
- Critic round 1 (tasks 2.5 and 3.3 together, build round-2): NOT READY at both sizes. Labels, pit edge and rows pass. The Halo read as a dim box with hard edges. The Halo centre moved above the zombie's head and its radius grew.
- Critic round 2 (round-3): NOT READY at both sizes. The Halo reads pink, but the cuts around whole Forms left dark boxes round lodash and event-stream, and pink stripes in the 390 gutters. The replay header labels and the Sources line pass. The Form box was split into a core box, a Ghost box and a pennant box.
- Critic round 3 (round-4): READY at both sizes. Minor, left as they are: a faint soft box round lodash; one pink beam in a 390 gutter; the 390 demo capture does not show the Possessed grave, so the 390 Halo was judged on the axios replay.
- Task 4.4 screenshot loop: the header labels and the Sources line were in the round 2 and 3 captures and passed.
- Review notes, tasks 2 to 4: READY, no defects. Acted on: each Halo cut is painted 2 px wider than the mask, so the half-scale layer's smoothing leaves no trace inside a cut. Left as notes: the footer hook finds the footer nodes again on a width or response change, not on every measure (there is one static footer today); the e2e's whole-canvas difference can also come from the Halo, which only weakens its sanity check; the Halo layer cache is module-level.
- Review notes, task 5: NOT READY with 1 defect, fixed. A suspend's delayed context suspend was not cancelled by a resume, so turning Sound off and on, or hiding and showing the page, within about 60 ms left the toggle on and the page silent. The engine now keeps the timer and cancels it on resume and dispose; a test runs suspend, resume and the timers and expects no suspend. Acted on: the e2e waits for the AudioContext count with a poll; the thud's noise burst is kept apart from the sources started together. Left as notes: Property 7 does not advance timers (the new example covers the race); a ghost call can play when Sound turns on while the Lantern already sits on a grave with a Ghost.
- Critic round 4 (task 6.5, build round-5): NOT READY at both sizes. The caption, the final pose and the Halo's return pass; the particles were tiny and read as stains. The Burst now throws 8 dirt clods and 10 triangular shards up and out to the edge of the Art box.
- Critic round 5 (round-6): the Burst READY at both sizes. The Priest NOT READY: a thin dark column with no clerical sign. (Its other finding, the stone not back at phase 0.8, came from a wrong description in the request: the stone rises back over phases 0.65 to 1.)
- Critic round 6 (round-7): the Priest NOT READY: a blank face, a collar lost in it, a body like a post.
- Critic round 7 (task 7.3, round-8): the Priest READY at 1440. Acted on its two minor notes: a warmer face (the marker cream, not the skeletons' bone) and a wider collar notch. The Priest exists only during a burial, so it was captured at 1440 only, painted at fixed phases through the e2e hook.
- Repaint medians at 300 graves after tasks 6 and 7: 2.85 to 3.00 ms idle, 2.40 to 2.80 ms after a scrubber move, 3.30 ms during a Burst (budget 16 ms).
- Note for the owner, not in this spec: a 300-grave scan whose graves are all in the front row (all Possessed or Dead) repaints in 180 to 330 ms in headless Chromium, most of it the Possessed glow pass and the full-height fills that Phase 1 added. The smoke test's 300 graves are in the middle row and repaint in about 3 ms.
- Review notes, tasks 6 and 7 (one review for both): READY, no defects. Acted on: the Burst's end timer has its own effect keyed on its start, so a second effect run cannot cancel it; an import order in draw.ts; the timing hook fails rather than timing a frame with no Burst. Left as notes: the Load moment flag is claimed in a state initialiser; a Vigil queued before Reduced motion is turned off still plays as a Vigil; the Load moment test does not mount a second scan.
- Critic round 8 (task 8.4, build round-9, the final pass over every capture): 390 READY; 1440 NOT READY on the two README pictures. A Bubble sat under the replay's tooltip: the hovered or focused grave now gets no Bubble, and no Bubble sits where its tooltip opens. The Halo is absent from both README pictures because each hovers a grave to show its tooltip, so by the one-glow rule that grave shows the Lantern glow alone: reported to the owner, not changed.
- Critic round 9 (round-10, the README pictures): READY at 1440. Minor, left for the owner: the Bubbles stand a little away from their speakers (they take the first place clear of every name, right of the speaker's Art box).
- Review notes, task 8 (with the README, CREDITS.md, web.md and Deliberate test change 7): NOT READY with 1 defect, fixed. Shown again after Serious mode or the drawer, the layer used the clock from before the pause and could show a stale slot's pair. A layout effect now reads the clock afresh before the paint, with a test. Left as notes: the fade itself is not exercised in jsdom; a fade can replay if Reduced motion is turned off during a show; the smoke test's 30 s wait equals the default test timeout (a show window comes within 6 s).
- Review notes, task 9.6 (the whole branch): READY, no defects. Acted on: the Burst starts in a layout effect, so no frame of the final pose shows before it; the decisions are in order; the reading of "the first scan after a page load" is recorded (decision 23). Left as notes: the page-level calls of the sting, thud, bell and ghost call are tested through their pure rules, not through the page; a key press that arms a remembered Sound on while a grave with a Ghost has focus plays one ghost call; no test pins the Bubbles off the Burst caption (the geometry keeps them apart today).
- Test sub-tasks are not optional in this plan.
- Top-level tasks run in order. Each finishes, including its review, before the next starts.
- Task 5 lands before tasks 6 and 7, so their sounds have an engine to call.
