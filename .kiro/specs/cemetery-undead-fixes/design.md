# cemetery-undead-fixes Bugfix Design

## Overview

Five defects found by the owner after cemetery-undead-2 merged (main 86bc37d, 25 Nov 2026). Four are in `packages/web`, one in CI. None changes what a grave means, a colour, a contrast test or the API.

1. **Halo boxes.** The Halo is cut along rectangles, and two of them are whole cells. The fix cuts only where a checked token can sit (each grave's drawn parts, its name, the ring's line, the focus outline), and softens every cut with a blurred, rounded edge.
2. **Flaky check.** The sprite comparison's two paints are some milliseconds apart on a running clock, so a Character Pose can change between them. The fix paints both at one fixed instant with the page clock paused, waits for the fonts as a second guard, and keeps the limit.
3. **Tooltip over a neighbour's name.** Placement checks only the Scene's edges. The fix tries right, left, above and over the cell, and takes the first place that covers no other grave's name.
4. **Bubble over a neighbour.** When no place is clear of other graves' art, the Bubble still shows. The fix shows no Bubble then.
5. **CI region.** The infra job takes its region from the runner. The fix sets us-east-1 on that job (decided on 25 Nov 2026).

## Glossary

- **Halo, Art box, Form box, Name label, Lantern glow, Bubble, Bubble slot, Burst, Vigil, Load moment**: as in the cemetery-undead-2 glossary.
- **Part boxes**: the few rectangles, in cell units, that together hold everything one Form draws at rest (its stone, pit, lid, Character at every Pose and Costume), measured by the bounds probe. They replace the single core Form box as the Halo's cut for that Form. Every Part box lies inside the Form's core box.
- **Ring band**: the strip along the selected grave's cell edge that holds the selection ring's line, from 1 px outside the cell to 6 px inside it.
- **Outline band**: the strip inside the Lantern grave's cell that holds the grave button's focus outline (outline-offset −9 px, 3 px wide), from 4 px to 11 px inside the cell.
- **Guarded region**: a Part box, Ghost box or pennant box of any grave, any Name label, the Ring band, the Outline band, or the Art box of a grave whose burial, Vigil or Burst plays. Exactly the places where a token that a contrast check guards can sit on the Halo.
- **Soft edge**: the fade of the Halo at a guarded region: the region is cut whole, and a copy grown by HALO_GROW is cut through a Gaussian blur of HALO_BLUR px, so the edge has no straight line or corner.
- **Fixed-instant pair**: two paints of the sprite comparison at one `nowMs` passed to the hook, with the page clock paused by `page.clock.pauseAt` and `document.fonts.ready` resolved.

## Bug Details

### Bug Condition

```
FUNCTION isHaloBoxBug(plan, point)
  RETURN haloSourceReaches(plan, point)
         AND NOT insideAnyGuardedRegion(plan, point)
         AND haloAlphaAt(plan, point) = 0
  // today: true at every point of the selected or Lantern cell outside its marks, and of a Form box outside its marks
END FUNCTION

FUNCTION isFlakyCompare(run)
  RETURN floor(run.paintWithSprites.nowMs / 83.33) <> floor(run.paintWithoutSprites.nowMs / 83.33)   // a Pose boundary between the paints

FUNCTION isTooltipBug(plan, grave, sceneWidth, tipHeight)
  places := [right, left, above, over] of grave's cell, inside the Scene
  RETURN chosen(grave) covers some other grave's Name label
         AND EXISTS p IN places: p covers no other grave's Name label

FUNCTION isBubbleBug(plan, grave)
  RETURN Bubble shown for grave AND its rectangle meets a Part, Ghost or pennant box of another grave

FUNCTION isRegionBug(job)
  RETURN job = infra AND runner AWS region <> us-east-1
```

### Examples

- `docs/cemetery.png` (main 86bc37d): a dark rectangle frames left-padder's cell (the selected cell, cut whole) and lodash's cross (its Form box spans the full width of the cross arms and the Ghost). `docs/replay-axios.png`: the axios cell, selected, is a dark rectangle inside the pink.
- Sprite comparison at 390 by 844, one full e2e run on 25 Nov: 0.57% of pixels differ by more than 48 on a channel; every other run 0.007% to 0.012%.
- Demo at 1440 by 900, hovering event-stream: right covers uuid's name; left covers left-padder's; above covers lodash's; over its own cell covers none. Today the right place is used.
- Demo at 1440 by 900: the Restless express Bubble "One more minor bump and I am coming out." beside express sat over moment's Ghost when the place above express met semver's name.
- PR #3, run 45662848588, job 139379910124, 17:21 UTC: "Error: Sexton deploys only to us-east-1. Got region: us-west-2." at `assertRegion (infra/lib/config.ts:66:11)`, step "cdk synth". The re-run, job 139387117565, passed.

## Expected Behavior

### Preservation Requirements

- Every state colour, Form, Character and token is unchanged. `test/colour-vision.test.ts`, the contrast tests in `test/shapes-palette.test.ts` and `test/styles.test.ts`, and the glow contrast check run unedited.
- The Halo stays zero in every guarded region, so nothing a contrast check guards ever sits on it. The Lantern grave has no Halo of its own, and a hovered or focused Possessed grave shows the Lantern glow alone.
- The 16 ms budget holds in every speed case: idle, after a scrubber move, all in the front row and during a Burst. The Halo layer is still painted only when its key changes.
- The Tab order, the roving grave stop and every accessible name are unchanged. Serious mode, Reduced motion and Sound off by default behave as before.
- The tooltip stays 240 px wide, top at its cell's top plus 4 for the right, left and over places, dismissed by Escape and hidden while the drawer is open. With no scene width it sits over its cell as today.
- Bubbles keep every rule of cemetery-undead-2: at most two, the seeded schedule, clear of every name, tail inside the speaker's cell, hidden in Serious mode and while the drawer is open, still under Reduced motion.
- No other CI job and no other file under `.github` changes.

## Hypothesized Root Cause

1. **Halo boxes.** `haloMask` cuts the whole cell of the selected and the Lantern grave (to keep the ring and the focus outline off the Halo) and one core box per Form. The core box of the cross spans both arms and the full height; the open grave's spans the lid and the zombie's raised arms. The fade is four linear strips and four corner gradients per cut, so every cut keeps straight sides. Large straight-sided cuts on a dark ground read as boxes.
2. **Flaky check.** Both paints of the test run in one `evaluate`, each at `Date.now()`. `page.clock.install` fakes the clock but keeps it running in real time, and reading the canvas between the paints takes milliseconds, so the paints are a few milliseconds apart. With Reduced motion off, every Character changes Pose each 83 ms; a boundary between the paints changes every zombie, skeleton and hand in the frame, about half a per cent of the canvas at 390 px, which matches 0.57%. The fonts cannot change inside one task, so they are not the cause, though the fix waits for them as well.
3. **Tooltip.** `tooltipRect` knows no Name labels and no tooltip height.
4. **Bubble.** `placeBubble` falls back to the first allowed place when no place is clear of art (decision 26 of cemetery-undead-2).
5. **CI region.** `infra/bin/sexton.ts` takes `CDK_DEFAULT_REGION`, which the CDK command sets from the runner's AWS settings; the job sets none, so a runner with a configured region other than us-east-1 trips the guard.

## Correctness Properties

### Property 1: The Halo is zero in every guarded region, and only there is it cut whole

*For all* plans of up to 60 packages with any States, any selected grave, any Lantern grave and any playing burial, Vigil or Burst: `haloAlphaAt(haloMask(plan), …)` is 0 at every sampled point of every guarded region; and at every sampled point whose distance to every guarded region is more than HALO_GROW + 4 × HALO_BLUR, the Halo equals the uncut sum of its sources. In particular no point of the selected or Lantern cell outside its guarded regions and their soft edge is cut.

**Validates: Requirements 2.1, 2.2, 2.3, 3.7.** Test: `test/halo.test.ts` (Deliberate test change 1). The bursting grave has no source while its Burst plays (decision 10).

### Property 2: Part boxes hold every mark of a Form

*For all* Forms, Poses, scales (0.64, 0.8, 1 and the replay scale) and dance windows: every mark the bounds probe records for the Form at rest, without shadow, Ghost and pennant, lies in one of its Part boxes; and every Part box lies inside the Form's core box.

**Validates: Requirement 2.1.** Test: `test/art-box.test.ts` (new tests; Property 2 of cemetery-undead-2 runs unedited).

### Property 3: A tooltip covers no other name when it can avoid it

*For all* plans of up to 60 packages, any scene width, any grave and any tooltip height from 80 to 260 px: the chosen place covers no other grave's Name label whenever one of right, left, above or over does; it is the first such place in that order; and when none does, it is the place `tooltipRect` gives today.

**Validates: Requirements 2.5, 2.6, 3.9.** Test: `test/tooltip-place.test.ts` (new).

### Property 4: A shown Bubble keeps off every other grave's art and the tooltip's places

*For all* plans of up to 60 packages at widths 390 to 1920, any Lantern grave and any instant: every Bubble that `bubblesFor` shows, with its tail, meets no Part box, Ghost box or pennant box of another grave, no Name label, and none of the Lantern grave's tooltip places (beside, above and over its cell).

**Validates: Requirements 2.7, 3.8.** Test: `test/bubbles.test.tsx` (Deliberate test change 2).

## Fix Implementation

### Changes Required

**1. Halo (`scene/art-box.ts`, `scene/halo.ts`, `scene/draw.ts`)**
- `FORM_PARTS: Record<ShapeId, readonly Rect[]>` in `art-box.ts`, measured by the probe: for example the cross as its upright and its arms, the open grave as its lid, its pit and mound, and the zombie's body and raised arms. `formParts(grave)` returns them scaled, with the Ghost box and pennant box when present. `formRects` and `FORM_BOX` stay for Property 2 of cemetery-undead-2 and for the Bubbles.
- `haloMask` cuts `formParts` of every grave, every `labelRect`, the Ring band of the selected grave, the Outline band of the Lantern grave, and the Art box of a playing grave. The whole-cell cuts go.
- Only regions within reach of a Halo source (inside the box of its sources) are cut. The layer paints every solid cut as one path and one `fill` with `destination-out`, then every grown copy (grown by HALO_GROW, corners rounded by HALO_GROW) as one path and one `fill` under `filter = "blur(σ px)"`, so a repaint has one blur whatever the number of graves. The layer is painted at HALO_LAYER_SCALE 0.5 and a canvas filter ignores the transform, so σ = HALO_BLUR × HALO_LAYER_SCALE layer pixels, for HALO_BLUR CSS pixels on screen. HALO_BLUR 8 and HALO_GROW 6 to start; the critic loop may tune both.
- The blur path is used when the layer context has a string `filter` property (`typeof t.filter === "string"`). Otherwise the four strips and corners of today remain as the fallback. The jsdom canvas stub has no such property, so the unit tests run the fallback.
- `haloAlphaAt` models the soft edge with the Gaussian's error function. The cut is solid inside each region, so the zero there holds whatever the blur does outside it. Beyond HALO_GROW + 4 × HALO_BLUR from every region the model's Halo is at least 99% of the uncut sum (a Gaussian never reaches exactly zero).
- A new hook method `redrawHalo(n)` paints the Halo layer n times with its cache cleared, timed, for requirement 2.9.

**2. Flaky check (`e2e/undead2.spec.ts`, `scene/timing-hook.ts`)**
- `paintVariant` takes an optional `nowMs`. The test calls `page.clock.pauseAt`, awaits `document.fonts.ready`, and paints both frames at one `nowMs`. The 0.5% limit stays.
- An exploration test first proves the cause: the two frames painted at instants either side of a Pose boundary (`nowMs` and `nowMs + 84`, chosen in a Dancer's dance window for the most motion) differ by at least ten times the share at one instant, which is under 0.1%. One Pose step need not reach 0.5% on its own; the flake reached 0.57% once.

**3. Tooltip (`overlay/tooltip-model.ts`, `overlay/GraveTooltip.tsx`)**
- `tooltipPlace(cell, sceneWidth, height, labels)` tries right, left, above (centred over the cell, bottom 8 px above it) and over, each inside the Scene, and returns the first that covers no label; otherwise `tooltipRect(cell, sceneWidth)` as today. `tooltipRect` is unchanged.
- `GraveTooltip` measures its height after layout and passes the other graves' `labelRect`s.

**4. Bubble (`speech/bubble-place.ts`)**
- `placeBubble` returns null when no allowed place, with its `rect` and its `tailRect`, is clear of every other grave's `formParts`. The grave is then not eligible in that slot, so the schedule picks among the graves that can speak.
- The reserved tooltip area in `bubblesFor` grows to every place the tooltip may now take: the band beside the Lantern grave's cell as today, plus the area above its cell (TOOLTIP_MAX_H 260 px plus the gap) and the cell itself.

**5. CI (`.github/workflows/ci.yml`)**
- The infra job gains `env: AWS_REGION: us-east-1` and `AWS_DEFAULT_REGION: us-east-1`, from which the CDK command sets `CDK_DEFAULT_REGION`. No other job, step or file under `.github` changes.

### Deliberate test changes

Every existing test not listed here must pass unmodified.

`test/halo.test.ts` (cemetery-undead-2)
1. "Property 3: The Halo paints nothing under a grave or a name". Old regions: every Form box, every Name label, the whole selected and Lantern cells, and the Art box of a playing grave. New regions: every grave's Part, Ghost and pennant boxes, every Name label, the Ring band, the Outline band and the Art box of a playing grave (Property 1 above); plus the new check that points far from every region keep at least 99% of the uncut Halo. The test "uses HALO_ALPHA_BYTE only for the Halo" counts the fallback path's fills (the jsdom stub has no `filter`): its formula, sources plus nine per cut, is unchanged, and only the set of cuts changes.

`test/bubbles.test.tsx` (cemetery-undead-2)
2. "never takes a place over another grave's art when a place clear of it exists". Old: the Bubble may cover other art when every allowed place does. New: no shown Bubble covers other art (Property 4); with no clear place, `placeBubble` gives null.

`e2e/undead2.spec.ts` (cemetery-undead-2)
3. "the sprites draw the same scene as the direct drawing" pauses the page clock, waits for the fonts and paints both frames at one `nowMs`. The limit and the assertion are unchanged.

`e2e/smoke.spec.ts` (cemetery-undead-2)
4. Only if the stricter Bubble rule makes two Bubbles at once rare on the demo at 1440 by 900: the step before docs/cemetery.png waits up to 60 s, not 30 s, for two Bubbles. Checked in task 5; not made unless needed.

`e2e/polish.spec.ts` (cemetery-polish), found when main aff9623 (new signals, PR #4) was merged into this branch
4. "the pull request table of lodash is visible in the drawer". Old: 10 rows. New: 12 rows, one per signal, as spec new-signals counts twelve signals. The test already failed on main aff9623 (CI does not run e2e); this branch does not change the table. (The conditional change 4 above, the smoke wait for two Bubbles, was not needed, so the number is reused.)

If the build finds another test that pins a value this fix changes on purpose, it is added here with the same Old and New form before the test is edited.

### Pictures

`docs/cemetery.png` and `docs/replay-axios.png` are retaken by the smoke test after the fix. The README text does not change.

## Testing Strategy

### Validation Approach

Exploration first: each bug gets a test that fails on the unfixed code, run before the fix and recorded. Then preservation tests on the unfixed code, which must pass before and after. Then the fix, the same tests passing, every gate, the visual critic against its checklist, and an independent review.

### Exploratory Bug Condition Checking

- Halo: Property 1's far-point check fails today at the selected cell's empty corners (they are cut whole).
- Halo pixels: an e2e reads the painted Halo layer through the timing hook at the replay grave's cell and requires a non-zero Halo at the cell's empty top corners (outside every guarded region and its soft edge). It fails today, when the whole selected cell is cut, and passes after the fix. The look itself ("no rectangle edge") is judged by the visual critic.
- Flaky check: the two-instant run above.
- Tooltip: Property 3 fails today on the demo at 1440 by 900 for event-stream.
- Bubble: Property 4 fails today (express over moment).
- CI: the failed run's log, recorded above; no local test.

### Fix Checking

The exploration tests pass on the fixed code.

### Preservation Checking

- The full root `npm test` and `npm run test:e2e -w @sexton/web` pass, with only the three Deliberate test changes.
- The four speed cases stay at or below 16 ms.
- The Tab-order, Serious mode, Reduced motion and sound tests run unedited.
- The CI run on the PR is green on every job.

### Unit Tests

`test/halo.test.ts`, `test/art-box.test.ts`, `test/tooltip-place.test.ts`, `test/bubbles.test.tsx`.

### Property-Based Tests

Properties 1 to 4, fast-check, numRuns 100, tagged `Feature: cemetery-undead-fixes, Property N: <title>`.

### Integration Tests

`e2e/undead2.spec.ts`: the Halo is not cut at the replay grave's empty cell corners; a Halo layer repaint with 300 graves at or below 16 ms; a frame 600 ms into the Burst for the critic (its Art box is cut whole while it plays); the tooltip of every demo grave at 1440 by 900 covers no other name where the model says it can avoid it; the font-settled sprite comparison; the existing Bubble, label and speed checks.

## Decisions made during implementation

1. **Part boxes come from the marks' outlines, not their bounding boxes.** A stone fill's bounding box is the whole stone's box, and the cross's would include the empty corners between its arms. The probe now records each mark's outline (`BoundsContext.marks[].poly`), and the Part boxes are the 8-unit grid blocks any outline touches, merged into runs (rounded 8, tilted 14, cross 8, cracked 12, open 28, unmarked 5). Every Part box lies inside ART_BOX; the design's "inside the core Form box" does not hold for every grid block (rounding to 8 units), so the test checks ART_BOX and that the cross and the open grave's parts cover under 80% of their core box.
2. **The soft edge's numbers.** HALO_GROW 16 and HALO_BLUR 6 CSS px, with a solid cut margin of 8 px (two layer pixels, after the review). The grown copy reaches past the solid cut by more than one and a half blurs, so the solid cut's own edge falls where the Halo is already almost gone and shows no step. A first try (grow 6, blur 8, layer at a half pixel) left visible steps; a second (grow 26, blur 10) left a wide dark slab round the ring (critic round 1).
3. **The far check is at four blurs.** At three, the tails of several nearby cuts together removed just over 1% (98.9% of the uncut Halo at one sample).
4. **The Halo layer is painted at a quarter of a CSS pixel, its sources at an eighth.** Each source is a sprite per radius and colour, drawn on a sources canvas that is kept while the sources stay the same (a hover or a selection changes only the cuts). Each grave's parts are a solid cut sprite and a soft, blurred cut sprite per Form, size, Ghost and pennant. The name labels and the bands are one solid path and one blurred path. The canvases are reused between repaints. Each grave's solid cut and soft edge are one sprite. Measured with 300 front-row graves (150 Possessed): a fresh layer after a hover or selection 11.4 to 11.9 ms (the strips of cemetery-undead-2 took 229 ms there); when the sources change too (a scrubber move that changes which graves are Possessed) about 20 ms in that scene, and 2.7 ms with the smoke test's 300 graves.
5. **No Bubble while the Burst caption shows.** With nothing hovered, the replay grave's Bubble sat on the caption "The wind stops. A grave opens.". The caption speaks for the grave; Bubbles are hidden at the Burst Stop while it shows (a new example in `test/burst-rise.test.tsx`).
6. **The halo layer clears its reused canvas only in the browser path.** A clear on every repaint counted as a scene paint in the jsdom canvas stub and broke two existing scene tests (caught by the gates, fixed before review).
7. **The tooltip's "over" place covers its own grave.** For event-stream at 1440 by 900 every other place covers a neighbour's name, so by 2.5 the tooltip sits over event-stream's own cell (critic note, round 1).
8. **The e2e hook gains `nowMs` on `paintVariant`, `haloAlpha` and `redrawHalo`;** `Scene`'s paint takes an optional instant.
10. **A Burst holds its own grave's Halo; a burial cuts only what moves.** Cutting a playing grave's whole Art box left a dark slab in the Burst and burial frames (critic round 2). During a Burst the bursting grave has no Halo source (its Possessed shards fly across the Art box; a Burst plays only on a one-grave replay, so nothing else lights it); its Art box stays among the cuts. During a burial or a Vigil, `buryingRegions` cuts each Part box extended down to the plinth top (where the sinking stone is clipped), the mound (MOUND_BOX), the Priest (PRIEST_BOX) and the pennant. A test checks every point of every burial mark lies in those regions, and Property 3's regions and source list follow (Deliberate test change 1).
11. **The tooltip stays while the pointer is over it, wherever it opens.** It keeps `pointer-events: none`, so clicks reach what is under it; a document `pointermove` listener, while a tooltip shows, raises the reducer's `tip-enter` and `tip-leave` when the pointer enters or leaves its area. Without it, a tooltip opened above its grave hid when the pointer moved onto it, and the existing e2e "the tooltip shows on hover, survives a move onto it" failed (it had passed before only because the tooltip's centre lay over a neighbour's grave button). The e2e passes unedited.
9. **Bug 2's measured cause.** At 390 by 844 the two frames painted at one instant differ on 0.016% of pixels; painted either side of a Pose boundary, on 0.690%, over the 0.5% limit and matching the failure of 0.57%.

