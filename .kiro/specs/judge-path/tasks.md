# Implementation Plan: judge-path

## Overview

The Fix-first line and a first-visit Guide, the README section "Try it in two minutes", and three cemetery notes from 25 Nov 2026 (ring casing, cold Halo repaint, burial cut by phase). Paths are relative to the repository root. No test touches the network.

Run-time notes:

- Build starts only after the owner types `go`. Nothing is pushed without the owner's `push`. The folder stays on spec/judge-path (LANES.md rule 4).
- Change only `packages/web`, the README section "Try it in two minutes", `docs/cemetery.png`, `docs/replay-axios.png`, `.kiro/steering/web.md` and this folder. No dependency, no `package.json` change.
- Tests change only where design.md lists a Deliberate test change. `numRuns` is 100 for every new property, tagged `Feature: judge-path, Property N: <title>`.
- Check `git branch --show-current` before every commit. Commits carry no trailer. Notes name no tool.

## Tasks

- [ ] 1. The Fix-first line
  - _Requirements: 2.1 to 2.7, 7.1, 7.2, 7.8_
  - [ ] 1.1 Add `header/fix-first.ts` and render the line in the header summary
    - _Requirements: 2.1, 2.4, 2.5, 2.6, 2.7_
  - [ ] 1.2 Add the select request from App to Cemetery: select the grave and focus its button
    - _Requirements: 2.2, 2.3_
  - [ ] 1.3 Write `test/fix-first.test.tsx` (Property 3) and apply Deliberate test changes 1 and 2
    - _Requirements: 2.1 to 2.7, 7.2_
  - [ ] 1.4 Check the canvas top at 1440 by 900 stays at most 190 px
    - _Requirements: 7.8_

- [ ] 2. The Guide
  - _Requirements: 1.1 to 1.20, 7.2, 7.6, 7.7_
  - [ ] 2.1 Add `guide/guide-pref.ts` and `guide/guide-steps.ts` (`GUIDE_STEPS`, `placeGuide`)
    - _Requirements: 1.4, 1.7, 1.8, 1.14, 1.15, 1.16_
  - [ ] 2.2 Add `guide/Guide.tsx`, the Guide button after Legend, the first-visit open on the Demo, the drawer rule and the focus rules
    - Test setup sets the Guide's test flag to not allowed, and the Playwright storage state holds "closed", for the existing tests.
    - _Requirements: 1.1, 1.2, 1.3, 1.5, 1.6, 1.9 to 1.13, 1.17 to 1.20_
  - [ ] 2.3 Write `test/guide.test.tsx` (Properties 1 and 2) and the axe check with the Guide open
    - _Requirements: 1.1 to 1.20, 7.6, 7.7_

- [ ] 3. The README section
  - _Requirements: 3.1, 3.2, 3.3_
  - [ ] 3.1 Add "## Try it in two minutes" before "## The problem", and a test for it in `test/readme.test.ts` (Deliberate test change 4)
    - _Requirements: 3.1, 3.2, 3.3_

- [ ] 4. Ring casing and the Halo
  - _Requirements: 4.1 to 4.7_
  - [ ] 4.1 Draw the ring with its casing; add the focus outline's casing; stop cutting the ring and outline bands
    - Deliberate test change 3. If the inside-the-ring samples of 4.7 stay low, narrow the Part cuts' soft edge for the replay size (design B4).
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.7_
  - [ ] 4.2 Add the ring and focus against ink contrast test; run every existing contrast test unedited
    - _Requirements: 4.5, 4.6, 7.3_

- [ ] 5. The cold Halo repaint and the burial cut by phase
  - _Requirements: 5.1, 5.2, 5.3, 6.1 to 6.4_
  - [ ] 5.1 Add `redrawHaloCold` to the e2e hook and the cold case to the speed tests; measure; apply design B5's steps in order until the median is at or below 16 ms
    - _Requirements: 5.1, 5.2, 5.3_
  - [ ] 5.2 Make `buryingRegions` take the burial phase and key the Halo layer by it; Property 5 (Deliberate test change 5); the burial speed case
    - _Requirements: 6.1, 6.2, 6.3, 6.4_

- [ ] 6. Pictures, steering, critic, gates and review
  - _Requirements: 4.7, 7.1 to 7.8, 8.1 to 8.5_
  - [ ] 6.1 `e2e/judge.spec.ts`; retake both README pictures through the smoke test
    - _Requirements: 1.12, 1.13, 1.14, 1.16, 2.3, 4.7, 5.1, 6.3, 7.6, 7.7, 8.1_
  - [ ] 6.2 web.md per requirement 8.2
    - _Requirements: 8.2_
  - [ ] 6.3 Visual critic at 1440 by 900 and 390 by 844, with the Guide open at each step and closed, until READY; record each round
    - _Requirements: 4.7, 8.3_
  - [ ] 6.4 Root typecheck, lint, tests and e2e; record the counts and every speed median
    - _Requirements: 7.3, 7.4, 7.5, 8.4_
  - [ ] 6.5 Independent review of the branch; fix every defect; record the notes
    - _Requirements: 8.5_
  - [ ] 6.6 Write private/reports/K6a-judge-path.md, update private/PROGRESS.md and private/TRACKER.md, print the report and stop
    - _Requirements: 8.4, 8.5_

## Notes

- Test sub-tasks are not optional. Top-level tasks run in order; each finishes before the next.
- Spec review, 25 Nov 2026, round 1: NOT READY with 7 defects, all fixed: the README headings test was missing from the changes; a scene test that counts the ring's strokes was missing (the casing is now filled, so neither it nor the draw test changes); the focus outline's casing could not be built as written (now a `::after` with inset shadows); the smudges inside the ring come from the zombie's Part cuts too (an inside-the-ring check and a fallback); the Guide's fallback place could cover names (it now docks at the viewport's bottom and each step scrolls its Anchor into view); Escape and the focus return were too wide (Escape on the Guide only, focus returned only from inside); several criteria were not in the house EARS form.
- Spec review, round 2: NOT READY with 3 defects and 2 stale references, all fixed: requirement 4.7 now samples after the Burst ends and only outside every guarded box; the soft-edge fallback is HALO_GROW 14 and HALO_BLUR 4 for every cut (global constants, so model and painter agree); the Guide's dock tries a bottom then a top band clear of every name, with the one forced case recorded (1.16) and checked never to happen on the Demo; B6 and Error Handling references corrected; B5's third step (it needed the scroll position in the layer key) is dropped.
- Spec review, round 3: READY. Acted on its two notes: Error Handling cites the dock of 1.15 and 1.16; with the soft-edge fallback the critic compares the Demo pictures too.
