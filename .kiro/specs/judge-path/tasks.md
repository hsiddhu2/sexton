# Implementation Plan: judge-path

## Overview

The Fix-first line and a first-visit Guide, the README section "Try it in two minutes", and three cemetery notes from 25 Nov 2026 (ring casing, cold Halo repaint, burial cut by phase). Paths are relative to the repository root. No test touches the network.

Run-time notes:

- Build starts only after the owner types `go`. Nothing is pushed without the owner's `push`. The folder stays on spec/judge-path (LANES.md rule 4).
- Change only `packages/web`, the README section "Try it in two minutes", `docs/cemetery.png`, `docs/replay-axios.png`, `.kiro/steering/web.md` and this folder. No dependency, no `package.json` change.
- Tests change only where design.md lists a Deliberate test change. `numRuns` is 100 for every new property, tagged `Feature: judge-path, Property N: <title>`.
- Check `git branch --show-current` before every commit. Commits carry no trailer. Notes name no tool.

## Tasks

- [x] 1. The Fix-first line
  - _Requirements: 2.1 to 2.7, 7.1, 7.2, 7.8_
  - [x] 1.1 Add `header/fix-first.ts` and render the line in the header summary
    - _Requirements: 2.1, 2.4, 2.5, 2.6, 2.7_
  - [x] 1.2 Add the select request from App to Cemetery: select the grave and focus its button
    - _Requirements: 2.2, 2.3_
  - [x] 1.3 Write `test/fix-first.test.tsx` (Property 3) and apply Deliberate test changes 1 and 2
    - _Requirements: 2.1 to 2.7, 7.2_
  - [x] 1.4 Check the canvas top at 1440 by 900 stays at most 190 px
    - _Requirements: 7.8_

- [x] 2. The Guide
  - _Requirements: 1.1 to 1.20, 7.2, 7.6, 7.7_
  - [x] 2.1 Add `guide/guide-pref.ts` and `guide/guide-steps.ts` (`GUIDE_STEPS`, `placeGuide`)
    - _Requirements: 1.4, 1.7, 1.8, 1.14, 1.15, 1.16_
  - [x] 2.2 Add `guide/Guide.tsx`, the Guide button after Legend, the first-visit open on the Demo, the drawer rule and the focus rules
    - Test setup sets the Guide's test flag to not allowed, and the Playwright storage state holds "closed", for the existing tests.
    - _Requirements: 1.1, 1.2, 1.3, 1.5, 1.6, 1.9 to 1.13, 1.17 to 1.20_
  - [x] 2.3 Write `test/guide.test.tsx` (Properties 1 and 2) and the axe check with the Guide open
    - _Requirements: 1.1 to 1.20, 7.6, 7.7_

- [x] 3. The README section
  - _Requirements: 3.1, 3.2, 3.3_
  - [x] 3.1 Add "## Try it in two minutes" before "## The problem", and a test for it in `test/readme.test.ts` (Deliberate test change 4)
    - _Requirements: 3.1, 3.2, 3.3_

- [x] 4. Ring casing and the Halo
  - _Requirements: 4.1 to 4.7_
  - [x] 4.1 Draw the ring with its casing; add the focus outline's casing; stop cutting the ring and outline bands
    - Deliberate test change 3. If the inside-the-ring samples of 4.7 stay low, narrow the Part cuts' soft edge for the replay size (design B4).
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.7_
  - [x] 4.2 Add the ring and focus against ink contrast test; run every existing contrast test unedited
    - _Requirements: 4.5, 4.6, 7.3_

- [x] 5. The cold Halo repaint and the burial cut by phase
  - _Requirements: 5.1, 5.2, 5.3, 6.1 to 6.4_
  - [x] 5.1 Add `redrawHaloCold` to the e2e hook and the cold case to the speed tests; measure; apply design B5's steps in order until the median is at or below 16 ms
    - _Requirements: 5.1, 5.2, 5.3_
  - [x] 5.2 Make `buryingRegions` take the burial phase and key the Halo layer by it; Property 5 (Deliberate test change 5); the burial speed case
    - _Requirements: 6.1, 6.2, 6.3, 6.4_

- [x] 6. Pictures, steering, critic, gates and review
  - _Requirements: 4.7, 7.1 to 7.8, 8.1 to 8.5_
  - [x] 6.1 `e2e/judge.spec.ts`; retake both README pictures through the smoke test
    - _Requirements: 1.12, 1.13, 1.14, 1.16, 2.3, 4.7, 5.1, 6.3, 7.6, 7.7, 8.1_
  - [x] 6.2 web.md per requirement 8.2
    - _Requirements: 8.2_
  - [x] 6.3 Visual critic at 1440 by 900 and 390 by 844, with the Guide open at each step and closed, until READY; record each round
    - _Requirements: 4.7, 8.3_
  - [x] 6.4 Root typecheck, lint, tests and e2e; record the counts and every speed median
    - _Requirements: 7.3, 7.4, 7.5, 8.4_
  - [x] 6.5 Independent review of the branch; fix every defect; record the notes
    - _Requirements: 8.5_
  - [x] 6.6 Summarise the work and stop
    - _Requirements: 8.4, 8.5_

## Notes

- Test sub-tasks are not optional. Top-level tasks run in order; each finishes before the next.
- Spec review, 25 Nov 2026, round 1: NOT READY with 7 defects, all fixed: the README headings test was missing from the changes; a scene test that counts the ring's strokes was missing (the casing is now filled, so neither it nor the draw test changes); the focus outline's casing could not be built as written (now a `::after` with inset shadows); the smudges inside the ring come from the zombie's Part cuts too (an inside-the-ring check and a fallback); the Guide's fallback place could cover names (it now docks at the viewport's bottom and each step scrolls its Anchor into view); Escape and the focus return were too wide (Escape on the Guide only, focus returned only from inside); several criteria were not in the house EARS form.
- Spec review, round 2: NOT READY with 3 defects and 2 stale references, all fixed: requirement 4.7 now samples after the Burst ends and only outside every guarded box; the soft-edge fallback is HALO_GROW 14 and HALO_BLUR 4 for every cut (global constants, so model and painter agree); the Guide's dock tries a bottom then a top band clear of every name, with the one forced case recorded (1.16) and checked never to happen on the Demo; B6 and Error Handling references corrected; B5's third step (it needed the scroll position in the layer key) is dropped.
- Spec review, round 3: READY. Acted on its two notes: Error Handling cites the dock of 1.15 and 1.16; with the soft-edge fallback the critic compares the Demo pictures too.
- Owner at go, 25 Nov 2026: the 5.3 fallback is accepted; the two README pictures are taken with the Guide closed (the Playwright storage state holds "closed").
- Cold Halo repaint (task 5.1): 19.80 ms on the unchanged code; 13.80 ms after B5 step 1; 11.40 to 11.90 ms after decision 6. The fallback of 5.3 was not needed.
- Critic round 1: NOT READY at both sizes. The ring strip was gone, but a wide dark cloud round the replay zombie and behind graves near a Halo; at 390 the Guide card docked far from its grave; at 1440 step 4 it sat loose; stray hover tooltips in the captures. Round 2, after 4-unit Part boxes, a narrower soft edge, a compact narrow card with a notch, and the pointer moved onto the card: NOT READY, a dark box round the Priest and a step 4 notch that seemed to point at node-sass. Round 3, after the Priest's own outline cut, no notch on a dock and an outline on the Replay button during step 4: READY at both sizes. Left as a note: at 1440 step 4 a speech Bubble sits close under the docked card.
- Review notes: NOT READY with 2 defects, both fixed. (1) Once the Guide had been opened by its button, closing a drawer put focus on the Guide's heading instead of the grave: the Guide's focus request is now reset when the drawer opens and when the Guide closes, with a test. (2) The cold repaint case had been added inside an existing speed test: it is now its own test. Round 2: READY. Notes left: the Guide's per-frame placement loop runs while the Guide is open; the grave Anchor also carries the target class, which styles only the Replay button.
- Gates: typecheck, lint with zero warnings, 2,090 root tests and 50 e2e tests pass. Speed medians on 300 graves: idle 1.70 ms, after a scrubber move 1.20 ms, front row 1.80 ms, during a Burst 1.70 ms, warm Halo layer 9.30 ms, cold Halo layer 11.55 ms, during a burial 9.35 ms.
- Flaky e2e (owner, 25 Nov 2026): "a rising grave in the Load moment is drawn directly" failed once in CI with 19,448 differing bytes. Cause confirmed: the page clock ran between the two paints; a probe gave 0 differing bytes at one instant and 19,423 across a Pose boundary. Both frames are now painted at one paused instant, and so are the two of the Ghost label check (Deliberate test changes 6 and 7). Ten full runs then found three more that read the page before it settled (changes 8, 10, 11); each now waits for the same assertion. Ten full runs after all fixes: 50 of 50 passed in every run.
- Speed budgets: 16 ms locally, 50 ms when CI is set (Deliberate test change 9, decision 12, which replaced decision 10's 22.4 ms); each case prints its median and budget; no speed case removed.
- Left as a note: once in four root runs, "Part boxes hold every mark of a Form" (cemetery-undead-fixes) ran past the 20 s test limit under the full suite's load. It takes 4.5 s alone, the same with main's Part boxes, and passed in every other run.
- PR #8, first CI run: the e2e job failed in both runs on two checks that measured the page before its web fonts loaded (Deliberate test changes 11 and 12). After the fix, ten full local runs: 50 of 50 passed in every run.
- PR #8, second CI run: the same two checks failed again with the header at 174.9 px, so the font wait was not the CI cause. Reproduced in Linux Chromium (the Playwright 1.65.1 image): the policy line wrapped in a 226 px summary column. Fixed by an 18 rem Repository URL form (decision 11); Linux header 155 px, front row bottom 837 px above the Footer bar at 841. Gates pass; three full local e2e runs 50 of 50. README pictures retaken.
