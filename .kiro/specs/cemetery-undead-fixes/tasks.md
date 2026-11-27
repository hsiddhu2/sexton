# Implementation Plan

Run-time notes:

- Build starts only after the owner types `go`. Nothing is pushed without the owner's `push`.
- Change only `packages/web`, `docs/cemetery.png`, `docs/replay-axios.png`, this folder and, for task 6 only, `.github/workflows/ci.yml`. Do not reformat `packages/web/src/epitaph/epitaph.ts` or `packages/web/src/speech/bubble-table.ts`.
- Tests change only where design.md lists a Deliberate test change. `numRuns` is 100 for every new property.
- Check `git branch --show-current` before every commit. Commits carry no trailer. Notes name no tool.

- [x] 1. Write the bug condition exploration tests and run them on the unfixed code
  - _Requirements: 1.1, 1.2, 1.3, 1.4_
  - [x] 1.1 Halo: Property 1's far-point check, and the e2e that reads the Halo layer at the replay grave's empty cell corners
    - Expected on the unfixed code: both fail (the selected cell is cut whole). Record the result in Notes.
    - _Requirements: 1.1, 2.1, 2.2_
  - [x] 1.2 Flaky check: paint the sprite frame and the direct frame either side of a Pose boundary (`nowMs` and `nowMs + 84`) at 390 by 844
    - Expected: at one instant they differ by under 0.1%, and across the boundary by at least ten times that (instants in a Dancer's dance window for the most motion). Record both shares in Notes. If the two shares are close, the Pose is not the cause: record what was tried, look further (the Ghost drift, the Halo layer key, the sprite cache) and record what is found before task 4.
    - _Requirements: 1.2, 2.4_
  - [x] 1.3 Tooltip: Property 3 on the unfixed placement, and the demo example (event-stream at 1440 by 900)
    - Expected on the unfixed code: fails; event-stream's tooltip covers uuid's name.
    - _Requirements: 1.3, 2.5_
  - [x] 1.4 Bubble: Property 4 on the unfixed placement
    - Expected on the unfixed code: fails with a Bubble over another grave's art.
    - _Requirements: 1.4, 2.7_

- [x] 2. Write the preservation checks and run them on the unfixed code
  - Contrast, colour-vision and glow contrast tests; the four speed cases at or below 16 ms; Tab order, Serious mode, Reduced motion and sound tests; the tooltip with no scene width; the Bubble rules of cemetery-undead-2. All pass before the fix.
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.8, 3.9_

- [x] 3. Fix the Halo boxes
  - _Requirements: 2.1, 2.2, 2.3, 2.9_
  - [x] 3.1 Add FORM_PARTS and `formParts` to `scene/art-box.ts`, measured by the bounds probe, with the tests of design.md Property 2
    - _Requirements: 2.1_
  - [x] 3.2 Cut Part boxes, Name labels, the Ring band, the Outline band and playing Art boxes in `haloMask`; drop the whole-cell cuts
    - _Requirements: 2.1, 2.3, 3.7_
  - [x] 3.3 Paint each cut solid plus a blurred, grown, rounded copy; keep the strips as the fallback without `filter`; model the soft edge in `haloAlphaAt`
    - Deliberate test change 1.
    - _Requirements: 2.2, 2.3_
  - [x] 3.4 Verify the exploration tests of 1.1 pass and the glow contrast check passes unedited
    - _Requirements: 2.1, 2.2, 2.3, 3.1_
  - [x] 3.5 Add `redrawHalo(n)` to the e2e hook and an e2e that times 30 Halo layer repaints with 300 graves, median at or below 16 ms
    - _Requirements: 2.9_

- [x] 4. Fix the flaky check
  - _Requirements: 2.4_
  - [x] 4.1 Give `paintVariant` an optional `nowMs`; pause the page clock, wait for the fonts and paint both frames at one `nowMs` (Deliberate test change 3)
    - _Requirements: 2.4_
  - [x] 4.2 Run the comparison ten times in the full e2e order; every run under the limit
    - _Requirements: 2.4_

- [x] 5. Fix the tooltip and the Bubble
  - _Requirements: 2.5, 2.6, 2.7, 3.8, 3.9_
  - [x] 5.1 Add `tooltipPlace` and measure the tooltip's height in `GraveTooltip`; `tooltipRect` unchanged
    - _Requirements: 2.5, 2.6, 3.9_
  - [x] 5.2 Return null from `placeBubble` when no allowed place, rect and tail, is clear of other graves' art; reserve every tooltip place of the Lantern grave in `bubblesFor` (Deliberate test change 2). Check that the smoke test still finds two Bubbles at 1440 by 900; if not, Deliberate test change 4
    - _Requirements: 2.7, 3.8_
  - [x] 5.3 Verify the exploration tests of 1.3 and 1.4 pass
    - _Requirements: 2.5, 2.7_

- [x] 6. Fix the CI region
  - _Requirements: 2.8, 3.10_
  - [x] 6.1 Set `AWS_REGION` and `AWS_DEFAULT_REGION` to us-east-1 on the infra job of `.github/workflows/ci.yml`; nothing else under `.github` changes
    - _Requirements: 2.8, 3.10_
  - [x] 6.2 Run `cdk synth` locally with another region in the environment, under the same settings, and confirm it passes
    - _Requirements: 2.8_

- [x] 7. Pictures, gates, critic and review
  - _Requirements: 2.1, 2.2, 2.5, 2.9, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7_
  - [x] 7.1 Retake `docs/cemetery.png` and `docs/replay-axios.png` through the smoke test
    - _Requirements: 2.2, 2.5, 3.7_
  - [x] 7.2 Root typecheck, lint with zero warnings, `npm test`, `npm run test:e2e -w @sexton/web`; record counts, the four speed medians and the Halo layer repaint median
    - _Requirements: 2.9, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_
  - [x] 7.3 Visual critic against the approved design pictures at 1440 by 900 and 390 by 844, with a frame 600 ms into the Burst, until READY at both sizes; record each round
    - _Requirements: 2.2_
  - [x] 7.4 Independent review of the branch; fix every defect; record the notes
    - _Requirements: 2.1 to 2.8, 3.1 to 3.10_
  - [x] 7.5 Summarise the work and stop
    - _Requirements: 2.1 to 2.8_

## Notes

- Bugs confirmed on 25 Nov 2026 before this spec: in `docs/cemetery.png` and `docs/replay-axios.png` of main 86bc37d (bugs 1 and 3), the e2e output of the failed full run and the test's code, where both paints run at `Date.now()` on a running page clock (bug 2), the demo plan at 1440 by 900 (bugs 3 and 4), and the log of PR #3 run 45662848588, job 139379910124 (bug 5).
- Spec review, 25 Nov 2026, round 1: NOT READY with 7 defects, all fixed. The cause of bug 2 was wrong (the fonts cannot change inside one task; the page clock keeps running, so a Pose can change between the two paints); a Bubble could sit where the new tooltip places open; the Bubble's tail was not checked against other art; the Halo test's call count could not be met as written; the soft-edge model claimed an exact equality a Gaussian cannot give, and the blur ignored the layer's half scale; one blur per cut would be slow at 300 graves; top-level tasks lacked requirement lines.
- Spec review, round 2: READY. Acted on its note: the exploration of bug 2 compares the two-instant share with the one-instant share, since one Pose step need not pass 0.5% alone.
- Exploration on the unfixed code, 25 Nov 2026 (task 1): the Halo's alpha at the replay cell's empty top corners was 0 (the whole selected cell was cut); the sprite comparison at 390 by 844 differed on 0.016% of pixels at one instant and 0.690% across a Pose boundary; Property 3 (tooltip) and Property 4 (Bubble) failed, event-stream's tooltip covering uuid's name.
- Preservation (task 2): the full suite passed on the unfixed code (1,991 tests, 36 e2e); after the fix every one of those still passes, with only Deliberate test changes 1 to 3. Change 4 was not needed: the smoke test still finds two Bubbles at 1440 by 900.
- CI region (task 6): `cdk synth` fails with AWS_REGION, AWS_DEFAULT_REGION and CDK_DEFAULT_REGION at us-west-2 (exit 1) and with an AWS config file naming us-west-2 (exit 1); with the job's new settings it passes in both cases (exit 0).
- Flaky check (task 4.2): ten full e2e runs, the sprite comparison at 0.009% and 0.016% in every run.
- Critic round 1 (build round-2): NOT READY at both sizes. Bugs 2 and 3 fixed; the Halo still stopped in boxes round the selected graves (the ring band grown by 26 px). Round 2 (round-3): the still frames READY; the Burst and burial frames still showed a slab (the whole Art box cut). Round 3 (round-4): READY at both sizes. Minor, left: during a burial a soft dark column stays above the sinking stone (the cut keeps the stone's height while the Halo layer is not repainted per frame).
- Review notes: NOT READY with 3 defects, all fixed. (1) A tooltip over its own grave hid when the pointer went back from the tooltip to the uncovered strip of the grave: the pointer listener now hands the tooltip back to the grave there, with an e2e. (2) A Bubble assertion had been added inside an existing Burst test: moved into its own test. (3) The Bubbles' reserve beside a hovered grave was one cell tall, though a tooltip can hang 216 px into the row below (older code): the reserve is as tall as the tallest tooltip, in the code and in Property 4. Acted on two notes: the cut sprite is drawn at its true, rounded-up size, the cut margin is 8 px (two layer pixels) and HALO_GROW 16 to keep the soft edge past it; the Halo's browser check no longer depends on sprites being on. Left as notes: a tooltip opened above its grave that covers another grave's button hands the pointer to that grave.
