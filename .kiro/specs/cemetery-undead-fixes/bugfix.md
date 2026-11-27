# Bugfix Requirements Document

## Introduction

Phase 2 of "Night of the Living Deps" (spec cemetery-undead-2) merged to main at 86bc37d on 25 Nov 2026. The owner's review of the merged build and of its README pictures found four defects in the web app and one in CI. Each was confirmed in the code and in `docs/cemetery.png` and `docs/replay-axios.png` on 25 Nov 2026 before this document was written.

1. **Halo boxes.** The Halo, the strong part of the Possessed glow, is cut away wherever a checked token can sit (`scene/halo.ts`). The cuts are rectangles: every grave's whole Form box, its name label, and the whole cell of the selected and the Lantern grave, each with a 32 px linear fade. On a dark ground the pink stops along straight lines, so the cuts read as dark rectangles: round left-padder's cell and lodash's cross in `docs/cemetery.png`, and round the axios grave's cell in `docs/replay-axios.png`, the video's main shot.
2. **Flaky check.** The e2e "the sprites draw the same scene as the direct drawing at 390 by 844" measured 0.57% against its 0.5% limit in one full run on 25 Nov, and 0.007% to 0.012% in every other run. The test paints one frame with sprites and one without, in one `evaluate`. Each paint draws at `Date.now()`, and the installed page clock keeps running in real time, so the two paints are some milliseconds apart. The Characters change Pose every 83 ms (12 a second, Reduced motion off), so when a Pose boundary falls between the two paints the zombie, skeletons and hands differ, about half a per cent of the canvas at 390 px. The fonts cannot change between the two paints, because both run in one task.
3. **Tooltip over a neighbour's name.** `tooltipRect` (`overlay/tooltip-model.ts`) puts the tooltip right of its cell, else left, else over the cell, and checks only the Scene's edges. In `docs/cemetery.png` event-stream's tooltip covers uuid's name label. At 1440 by 900 its places right, left and above the cell each cover a neighbour's name (uuid, left-padder, lodash), but the place over its own cell covers none (checked with the demo plan on 25 Nov).
4. **Bubble over a neighbour.** `placeBubble` (`speech/bubble-place.ts`) prefers a place clear of other graves' art but, when none is clear, uses the first place that only keeps off name labels. A Bubble beside express covered moment's ghost (visual critic, 25 Nov).
5. **CI region.** On PR #3 the infra job failed once: `cdk synth` stopped at the us-east-1 guard of `infra/lib/config.ts` with "Sexton deploys only to us-east-1. Got region: us-west-2." (run 45662848588, job 139379910124, 25 Nov 2026 17:21 UTC). `infra/bin/sexton.ts` reads `CDK_DEFAULT_REGION`, which the CDK command fills from the runner's AWS settings, and the infra job does not set a region. A re-run passed. The owner approved setting the region on that job.

Paths: `packages/web`, `docs/cemetery.png`, `docs/replay-axios.png`, the README only if a picture's text changes, this folder, and `.github/workflows/ci.yml` for bug 5 only. Nothing else under `.github` changes. `packages/web/src/epitaph/epitaph.ts` and `packages/web/src/speech/bubble-table.ts` are not reformatted (another lane edits them next). No state rule, colour token, contrast test, API field or evidence field changes.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN a Possessed grave's Halo meets a cut THEN the system stops the pink along the straight edges of a rectangle, so a dark rectangle shows round the Form box of every grave the Halo reaches and round the whole cell of the selected and the Lantern grave

1.2 WHEN the sprite comparison e2e paints its two frames and a Character Pose boundary falls between them THEN the system compares frames with different Poses and the share of differing pixels can pass 0.5% though sprites and direct drawing agree

1.3 WHEN a grave's tooltip opens right of its cell and the right place covers another grave's name label, while another place inside the Scene (left of, above or over the cell) covers none THEN the system still uses the right place and covers that name

1.4 WHEN every place a Bubble may take keeps off the name labels but overlaps another grave's Character, Ghost, stone or pennant THEN the system shows the Bubble over that art, so it can be read as the other grave's

1.5 WHEN the CI infra job runs `cdk synth` on a runner whose AWS settings name another region THEN the system fails the job at the us-east-1 guard with no change to the code

### Expected Behavior (Correct)

2.1 WHEN the Halo is drawn THEN the system SHALL cut it only where a checked token can sit: each grave's drawn parts (stone, Character, Costume, Ghost, pennant), each name label, the selection ring's line and the Lantern grave's focus outline, and the Art box of a grave whose burial, Vigil or Burst plays; and SHALL NOT cut the empty rest of a cell

2.2 WHEN the Halo meets a cut THEN the system SHALL fade it through a blurred, rounded copy of the cut, so no hard edge or square corner shows; the Halo SHALL be uncut at every point farther than its soft edge from every region of 2.1; and the visual critic, comparing the pictures with the approved design pictures, SHALL find no rectangle edge in the Halo

2.3 WHEN the Halo is drawn THEN its alpha SHALL be exactly 0 at every point of every region of 2.1, and the existing glow contrast check SHALL pass unedited

2.4 WHEN the sprite comparison e2e paints its two frames THEN the system SHALL paint both at one fixed instant, with the page clock paused and the web fonts loaded, so the two frames differ only where sprites and direct drawing differ; the 0.5% limit SHALL stay

2.5 WHEN a tooltip opens and at least one of its places (right of the cell, left of it, above it, over it) inside the Scene covers no other grave's name label THEN the system SHALL use the first such place in that order

2.6 WHEN no place of a tooltip keeps every other grave's name label clear THEN the system SHALL use the place it uses today

2.7 WHEN no place a Bubble may take is clear of every other grave's drawn parts as well as every name label THEN the system SHALL NOT show that Bubble in that slot

2.8 WHEN the CI infra job runs THEN the system SHALL set the region us-east-1 for that job, so `cdk synth` and the infra tests do not depend on the runner's AWS settings

2.9 WHEN the Halo layer is painted again (a hover, a selection or a scrubber move changes its cuts) with 300 graves THEN the system SHALL keep the median of 30 layer repaints at or below 16 ms

### Unchanged Behavior (Regression Prevention)

3.1 WHEN any grave is drawn THEN the system SHALL CONTINUE TO use the same state colours, Forms, Characters and tokens, and every contrast test, the colour-vision test and the glow contrast check SHALL CONTINUE TO pass unedited

3.2 WHEN 300 graves repaint, idle, after a scrubber move, all in the front row and during a Burst THEN the system SHALL CONTINUE TO keep the median of 30 repaints at or below 16 ms

3.3 WHEN a viewer moves by keyboard THEN the system SHALL CONTINUE TO keep the Tab order, the roving grave stop and every accessible name

3.4 WHEN Serious mode is on THEN the system SHALL CONTINUE TO hide every Bubble and Punchline and play only the bell

3.5 WHEN Reduced motion applies THEN the system SHALL CONTINUE TO hold every Character still, skip the Load moment, show the Burst's final pose and keep the Vigil

3.6 WHEN the page loads THEN the system SHALL CONTINUE TO keep Sound off by default and make no AudioContext before Sound is on and a gesture has happened

3.7 WHEN a Possessed grave is not hovered or focused THEN the system SHALL CONTINUE TO draw its Halo, and a hovered or focused Possessed grave SHALL CONTINUE TO show the Lantern glow alone

3.8 WHEN a Bubble is shown THEN the system SHALL CONTINUE TO keep it and its tail clear of every name label, with the tail ending inside the speaker's cell, at most two at a time on the seeded schedule, and SHALL CONTINUE TO keep it out of every place where the hovered or focused grave's tooltip may open, which now includes the places above and over that grave's cell

3.9 WHEN the scene width is not given or no place of a tooltip is inside the Scene THEN the system SHALL CONTINUE TO place the tooltip as today, and the tooltip SHALL CONTINUE TO be dismissed by Escape and hidden while the drawer is open

3.10 WHEN any other CI job runs THEN the system SHALL CONTINUE TO run it unchanged, and nothing else under `.github` SHALL change
