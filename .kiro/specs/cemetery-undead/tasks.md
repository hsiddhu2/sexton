# Implementation Plan: cemetery-undead

## Overview

Phase 1 of "Night of the Living Deps":
- U1 a night palette that stays readable with colour vision deficiency;
- U2 self-hosted fonts;
- U3 Characters that act out each State, and an original Ghost;
- U4 depth Tiers and a night backdrop;
- U5 Epitaphs;
- U6 Serious mode;
- U7 a header and a Footer bar like the mockup.

Then the README, web.md, the screenshots, the gates and the fresh-clone run. Paths are relative to the repository root. No test touches the network.

Run-time notes:

- Build starts only after the owner types `go` and has decided the R-UI-1 amendment (design.md "Open question for the owner").
- Change only `packages/web`, the root `package-lock.json` (devDependencies of `@sexton/web` only), `README.md`, `CREDITS.md`, `docs/cemetery.png`, `docs/replay-axios.png`, `.kiro/steering/web.md`, `.kiro/specs/cemetery-undead`, and `docs/requirements.md` if the owner approves the amendment.
- Tests change only where design.md lists a Deliberate test change (1 to 26). Any other existing test that fails is a regression: fix the source, not the test.
- `numRuns` is 100 for every new property. Every new property test carries `Feature: cemetery-undead, Property N: <title>`.
- Every visual sub-task ends with the screenshot loop of design.md "Visual critic protocol". Each round's findings are recorded as "Critic round N".
- Each top-level task ends with an independent code review on its changed files. Every defect is fixed in the task, and the findings are recorded under "Review notes".
- Run vitest one package at a time. A first run under load can time out: run the failing file alone before reading it as a regression.

## Tasks

- [x] 1. The R-UI-1 decision and the baseline
  - Applies the owner's decision on R-UI-1 and records the baseline measurements.
  - _Requirements: 13.1, 13.2, 14.1_
  - [x] 1.1 Apply the owner's decision on R-UI-1
    - If approved, edit R-UI-1 in docs/requirements.md to the design.md text, add the change log line "0.5, 24 Nov 2026", and bump the header to Version 0.5. If declined, keep the Alive outline for Restless and record the call in design.md.
    - _Requirements: 13.1, 13.2_
    - Notes: the owner approved the amendment as written on 24 Nov 2026. R-UI-1 in docs/requirements.md now holds the design.md text. Change log line "0.5, 24 Nov 2026" added, header bumped to Version 0.5, 24 Nov 2026.
  - [x] 1.2 Record the baseline
    - Capture the current demo and axios replay at 1440 by 900 and 390 by 844 under build/undead/round-0. Record the Canvas top, the repaint medians and the e2e count in "Notes".
    - _Requirements: 14.1_
    - Notes: baseline in build/undead/round-0 (demo and axios replay at 1440 by 900 and 390 by 844, page clock fixed at 2026-11-24T12:00Z). Canvas top: demo 163.6 at 1440, 540.5 at 390; axios replay 414.6 at 1440. scrollWidth 1440 and 390. No request left the origin. Repaint medians from the last e2e run: 2.00 ms and 1.60 ms, e2e 22 passed.

- [x] 2. Palette and colour vision (U1)
  - Swaps every token to the night palette and adds the colour vision check.
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7_
  - [x] 2.1 Update `packages/web/src/scene/palette.ts` and `styles.css`
    - The tokens of design.md "Palette", the costume tokens, the silhouette and lantern tokens, and the new alpha byte constants. CSS custom properties for the new interface tokens, with no colour literal.
    - _Requirements: 1.1, 1.2, 1.3_
    - Notes: night tokens, costume tokens, silhouette, lantern, moonEdge and the four new alpha bytes in palette.ts. After critic round 1 the sky, ground and gold moved: skyHorizon #5a2d6e, groundTop #2e2440, fog #6f5296, moon #f2a030 with moonEdge #d9781e, focus, ring and accentBg #e8a30c, wordmark #f2b02e (after round 2), border #ab9cc6 and muted #cdc4db (both raised to keep 3:1 and 4.5:1 on the new stops), starFar #c2b5df. The five state colours are the handoff values. styles.css holds no colour literal.
  - [x] 2.2 Write `packages/web/test/colour-vision.test.ts`
    - Linearise, apply the fixed Machado 2009 severity 1.0 matrices, convert to CIELAB, then CIEDE2000. Every State pair is at least 8 apart for protanopia, deuteranopia and tritanopia. Includes a worked example of a CIEDE2000 pair from Sharma, Wu and Dalal 2005 Table 1.
    - _Requirements: 1.7_
    - Notes: test/colour-vision.test.ts implements CIEDE2000 and matches three reference pairs of Sharma, Wu and Dalal 2005 Table 1 (2.0425, 1.0000, 31.903). Every State pair is at least 8 apart under the three Machado matrices.
  - [x] 2.3 Run the existing contrast tests unedited, and add the Glow stops check
    - **Property 6: Contrast and colour vision over the whole palette**
    - **Validates: Requirements 1.4, 1.5, 1.6, 1.7**
    - Tag: `Feature: cemetery-undead, Property 6: Contrast and colour vision over the whole palette`.
    - `shapes-palette.test.ts` contrast Properties pass on the new tokens unedited (`backdropStops` keeps its ten stops). Add `glowStops` to `palette.ts` and a new test that runs the same 3:1 checks over it (Property 6). Record the minimum ratios in "Notes".
    - _Requirements: 1.4, 1.5, 1.6_
    - Notes: every existing contrast test passes unedited on the new tokens. glowStops added; the new test runs the 3:1 checks over its ten stops. Final minimum for a state colour: Possessed 3.05:1 against fog over the horizon. Every token checked passes 3:1 on all ten glow stops. Colour vision minimum ΔE00: protanopia 8.4 (Alive and Dead).
  - [x] 2.4 Screenshot loop for the palette
    - _Requirements: 14.1, 14.2, 14.3_
    - Notes: Critic round 1 (round-2-1): not ready, sky purple too grey and thin, ground hazy grey, moon flat, gold too pale, links white, slider track grey. Sky, ground, gold and moon tokens changed. The moon gradient moves to task 5, the gold links and the slider track to task 7. Critic round 2 (round-3-1, with fonts): gold and type right. Open: a softer, taller sky glow with no hard horizon line, and a darker ground top (task 5); wordmark colour and glow (fixed).
  - [x] 2.5 Independent code review of task 2
    - _Requirements: 15.5_
    - Review notes: READY, no defect. CIEDE2000 and the three reference pairs (Sharma 2005 Table 1 pairs 1, 4 and 19) checked, and the Machado matrices are the severity 1.0 values. Acted on: design.md now records the final palette (decision 1), and the new tokens (silhouette, lantern, moonEdge, costume) have a format and contrast test. Task 1 (docs/requirements.md) was reviewed with it: READY, R-UI-1 byte-identical to the approved text. Note kept: web.md still says upright stone for Alive and Restless until task 8.3.

- [x] 3. Fonts (U2)
  - Self-hosts the four families and switches the interface and canvas type.
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 11.1_
  - [x] 3.1 Add the font files and licences
    - The WOFF2 Latin subsets of design.md "Type" under `packages/web/public/fonts`, each family's `OFL.txt` beside it, and the font section of `CREDITS.md`.
    - _Requirements: 2.1, 11.1_
    - Notes: four WOFF2 Latin subsets from Google Fonts, fetched once at development time: Pirata One, IM Fell English SC, IM Fell English italic, and Instrument Sans as one variable file for weights 400 to 600 (design.md said three files; one variable file is smaller and covers the same weights). OFL-<family>.txt beside them. CREDITS.md comes in task 8.
  - [x] 3.2 Add `@font-face` rules and the type scale to `styles.css`, and set the canvas name font
    - The wordmark is in Pirata One, the interface in Instrument Sans, and the canvas names in IM Fell English SC with the fallback. `Cemetery.tsx` waits on `document.fonts.load` and then repaints once.
    - _Requirements: 2.2, 2.4_
    - Notes: four @font-face rules with font-display swap. The body is in Instrument Sans, headings and tooltip names in IM Fell English SC, the wordmark in Pirata One with an amber glow. Canvas names are 18px IM Fell English SC (raised from 15 after critic round 2). useFontsReady repaints once after document.fonts.load. The decorative wordmark mark stays in the DOM, aria-hidden, and is hidden by CSS, because an existing header test pins it.
  - [x] 3.3 Write `packages/web/test/fonts.test.ts` and apply Deliberate test change 25
    - The files and licences exist. `url(` appears only in `@font-face` with a `/fonts/` target. No `fonts.googleapis` or `fonts.gstatic` appears in src, public or index.html. The CSP keeps `font-src 'self'`.
    - _Requirements: 2.1, 2.3_
    - Notes: test/fonts.test.ts checks the WOFF2 signature and licence of each file, four @font-face rules pointing only at /fonts/, no font host of another origin in src, public or index.html, and font-src 'self' in the CSP. Deliberate test change 25 applied in styles.test.ts and shapes-palette.test.ts. web 43 files pass.
  - [x] 3.4 Screenshot loop for type
    - _Requirements: 14.1, 14.2, 14.3_
    - Notes: Critic round 2 (round-3-1): the faces are right, and Instrument Sans is right throughout. The canvas names were thin at 1440, so they went from 15px to 18px. The wordmark colour moved to amber with a glow.
  - [x] 3.5 Independent code review of task 3
    - _Requirements: 15.5_
    - Review notes: READY, no defect. The WOFF2 signatures and lengths, the OFL texts, no external font host, and url() only to /fonts/ all checked. useFontsReady cannot loop. Acted on: design.md records the variable Instrument Sans file and the hidden wordmark mark (decisions 2 and 3). Note kept: Pirata One's licence reserves the name "Pirata" and Google's file is a subset, so CREDITS.md (task 8) will say so.

- [x] 4. Characters (U3)
  - Bakes the CC0 Characters, or falls back to vector, and draws the new Forms, Costumes and Ghost.
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 11.1, 11.2, 11.3, 11.4_
  - [x] 4.1 Check the model licences
    - Read the Zombie Apocalypse Kit and Cube World Kit licence pages. Record in design.md the exact licence text and the models used for the zombie, the skeleton and the hand. Use no model whose page does not say CC0.
    - _Requirements: 3.9, 11.2_
    - Notes: the Zombie Apocalypse Kit page states "License CC0" (60 models, animated, glTF), but it downloads only through a Google Drive folder. The poly.pizza page of the Cube World Kit is behind a browser challenge. No model was used. design.md decision 4.
  - [x] 4.2 Write `packages/web/scripts/bake-sprites.mjs` and bake the Atlases (budget: one working day)
    - three.js and any loader as devDependencies of `@sexton/web` only. Use a Playwright Chromium page, a fixed three-quarter orthographic camera, 12 Poses a second and 96-pixel cells. Write `public/sprites/<character>-<clip>.png` and `.json`, with CC0-1.0 and the pack in each JSON. Models are read from the repository-root `build/models`, gitignored by the root `build/*` rule. Add the npm script `sprites:bake` only. If all four Atlases are not ready within the day, stop the bake and record the Vector fallback call in design.md.
    - _Requirements: 3.9, 11.2, 11.3_
    - Notes: not baked. The models cannot be fetched by a script, so requirement 3.9's Vector fallback is used. No bake script, no devDependency, and no package.json or lockfile change (design.md decision 4).
  - [x] 4.3 Write `scene/characters/` (the sprite source, the vector source and `costume.ts`) and the new shapes
    - The `CharacterSource` interface, the Atlas loader with `ready`, the Vector fallback Poses, the costume paths, the `rounded` and `tilted` outlines, the lid flung aside and the new Ghost path. `SHAPE_BY_STATE` as in design.md.
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.8_
    - Notes: scene/characters/vector.ts draws the zombie (dance), the skeleton (lounge and dance) and the hand (twitch) at 12 Poses a Clip (8 for twitch), plus the devil, onesie and party Costumes, from costume tokens. New rounded (Alive) and tilted (Restless) outlines, a rounded cracked Dead stone, and the original Ghost path with oval eyes and blush. STATE_BY_SHAPE maps a drawn shape back to its State, so a grave at an earlier date shows that date's Character.
  - [x] 4.4 Write `packages/web/test/characters.test.ts`: Property 2, and apply Deliberate test changes 1, 2, 11, 14 (ghost) and 15
    - **Property 2: Form, Character and Costume depend on the State only, and a Ghost on advisories only**
    - **Validates: Requirements 3.6, 3.7**
    - Also: each Atlas JSON says CC0-1.0 and names the pack, or the vector source is selected. No `kiro` string appears in the scene source or the public assets.
    - _Requirements: 3.6, 3.7, 3.9, 11.2_
    - Notes: Property 2 in characters.test.ts, 100 runs, plus the State to Form, Character and Costume table, no sprite or model file in public, and no kiro name in the scene source or public assets. Deliberate test changes 1, 2, 11, 14 (ghost) and 15 applied. Change 15 needed no edit: the scene test's ghost assertions still hold.
  - [x] 4.5 Screenshot loop for the Characters
    - _Requirements: 14.1, 14.2, 14.3_
    - Notes: Critic round 3 (round-5-3, with task 5): not ready, eight points. Acted on: smaller name tags; bigger, overlapping ghosts; a larger zombie with a tail; the skeleton lounging across a rounded cracked stone; a splayed hand on a mound; bigger bats; more fog; a feathered horizon; a bigger moon with craters. Not acted on, against the spec's rules: per-grave variation, overlapping rows, a dimmer back row, a scaled-up lone replay grave (design.md decision 8). Header and footer points go to task 7.
  - [x] 4.6 Independent code review of task 4
    - _Requirements: 15.5_
    - Review notes: READY. Notes acted on through the task 5 review below.

- [x] 5. Motion, Tiers and the night backdrop (U4)
  - Animates the Characters at 12 a second, lays the graves out in Tiers, and draws the cached backdrop with bats and the Lantern glow.
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 10.2_
  - [x] 5.1 Write `scene/motion.ts` and the clock in `Cemetery.tsx`
    - `poseAt`, `dancers`, `inDanceWindow`, FNV-1a seed. One `setTimeout(FRAME_MS)` while animated Characters are on screen, Reduced motion is off and the page is visible.
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6_
    - Notes: scene/motion.ts (FNV-1a seed, poseAt, dancers, inDanceWindow). The clock lives in Scene.tsx, not Cemetery: one setTimeout(FRAME_MS) while Reduced motion is off and the page is visible. It only invalidates the canvas, so React does not re-render each frame.
  - [x] 5.2 Write `packages/web/test/motion.test.ts`: Property 3
    - **Property 3: Motion is a pure function of time, seed and Reduced motion**
    - **Validates: Requirements 4.1, 4.2, 4.3, 4.4**
    - Fake-timer examples: one step per 83 ms, no timer under Reduced motion, no timer while hidden, and a restart on visibility.
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.6_
    - Notes: Property 3 in motion.test.tsx, 100 runs for each of pose, dancers and dance window. Clock examples with fake timers: one extra timer while moving, none under Reduced motion, at least three repaints in three steps, no timer while hidden, a restart on visibilitychange.
  - [x] 5.3 Write `scene/tiers.ts` and update `planScene`, the grave buttons and the tooltip anchor
    - The Tier rows of design.md "Tiers", `SKY_HEIGHT` 160, scaled per-grave geometry, and the scaled ring and button rectangles.
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7_
    - Notes: scene/tiers.ts. planScene places each grave in the Tier of its scan-date State, back Tier first, each row centred, SKY_HEIGHT 160, TIER_GAP 12. ScenePlan gains rowLines, paintOrder, dancers, reducedMotion and lantern. The 11 grave keys are unchanged: the scale is rect.w / 192.
  - [x] 5.4 Write `packages/web/test/tiers.test.ts`: Property 1, and apply Deliberate test changes 3 to 6 and 14 (marker)
    - **Property 1: Tiers keep triage order and never overlap**
    - **Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7**
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7_
    - Notes: Property 1 in tiers.test.ts, 100 runs, with Forms; the demo mix gives 6, 4 and 2; column thresholds per Tier (415/416, 339/340, 277/278). Deliberate test changes 3 to 6 and 14 (marker) applied in layout.test.ts, ghost-drift.test.ts and marker.test.tsx, against an independent Tier model in the test.
  - [x] 5.5 Write `scene/backdrop.ts` and update `draw.ts`
    - The cached layer (sky, stars, the right-hand moon, church, tree, fence, fog, ground, grass, vignette, grain), the bats, the Lantern glow, and the graves drawn back to front with Characters and Costumes. The burial moves the Character with its stone.
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 10.2_
    - Notes: draw.ts draws the sky (with the glow feathered into the ground), stars, the cratered harvest moon, the church, tree, fence and bats, fog, ground, grass, vignette and grain, then the graves back to front. Each grave is drawn in its cell frame at its Tier scale, with one glow (lantern or Possessed). The Character rides with the stone in a burial. No backdrop cache (design.md decision 5).
  - [x] 5.6 Apply Deliberate test changes 7 to 10, 12 and 13, and confirm the scenery seed tests pass unedited
    - _Requirements: 6.2, 6.3_
    - Notes: Deliberate test changes 7 to 10, 12 and 13 applied in draw.test.ts. scenery-seed.test.ts passes unedited after rewording two comments that held the words Math.random.
  - [x] 5.7 Run the e2e budget
    - `npm run test:e2e -w @sexton/web`. Both 300-grave medians are at or below 16 ms. Record them.
    - _Requirements: 6.6_
    - Notes: npm run test:e2e: 22 passed. 300-grave medians 2.60 ms and 2.30 ms (16 ms budget). Two cemetery-polish tests failed on the first run because pressing a front grave scrolled the URL box away; fixed by the sticky header (design.md decision 9).
  - [x] 5.8 Screenshot loop for the scene
    - _Requirements: 14.1, 14.2, 14.3_
    - Notes: Critic round 3 findings as in 4.5. round-5-4 has the changes. The next critic round runs after task 7, with the header and footer in place.
  - [x] 5.9 Independent code review of task 5
    - _Requirements: 15.5_
    - Review notes: Task 4 READY. Task 5 NOT READY with one defect: the clock test's final assertion could never fail. Fixed: it now asserts at least three repaints after three steps. Notes acted on: column thresholds for the middle and back Tiers; the cemetery-undead tag on Property 8; the change label in a draw test comment; design.md decisions 5, 6, 9 and 10 record the missing cache, centred rows, the sticky header and the test notes. Notes kept: a full-canvas gradient and pattern each frame (the measured medians stay small); the clock runs while only bats move.

- [ ] 6. Epitaphs and Serious mode (U5, U6)
  - Adds "Here lies" and the Punchlines to the tooltip and the drawer, and the Serious mode toggle.
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 8.1, 8.2, 8.3, 8.4_
  - [ ] 6.1 Write `src/epitaph/epitaph.ts` and `src/epitaph/serious.ts`
    - The Reason families, the table of design.md exactly as the owner approved it, `hereLies`, and the guarded storage read and write.
    - _Requirements: 7.3, 7.4, 7.6, 8.3, 8.4_
  - [ ] 6.2 Update `GraveTooltip.tsx`, `tooltip-model.ts`, `Drawer.tsx` and `App.tsx`
    - "Here lies <name> <version>", then the reason, then the Punchline unless Serious mode is on. The Not-published line has no Punchline. Text only. The Serious mode toggle has `aria-pressed` and is persisted.
    - _Requirements: 7.1, 7.2, 7.5, 7.7, 8.1, 8.2_
  - [ ] 6.3 Write `test/epitaph.test.ts` (Property 4) and `test/serious.test.ts` (Property 5), and apply Deliberate test changes 23 and 24
    - **Property 4: Punchlines come only from the table and are true of the reason**
    - **Validates: Requirements 7.3, 7.4, 7.6**
    - **Property 5: Serious mode storage is total**
    - **Validates: Requirements 8.3, 8.4**
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 8.1, 8.2, 8.3, 8.4_
  - [ ] 6.4 Screenshot loop for the tooltip and drawer
    - _Requirements: 14.1, 14.2, 14.3_
  - [ ] 6.5 Independent code review of task 6
    - _Requirements: 15.5_

- [ ] 7. Header, Footer bar and Legend (U7)
  - Moves the time controls and the Replay group into the Footer bar, adds the Sound and Serious mode buttons, and redraws the Legend.
  - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8, 10.1, 10.3, 10.4_
  - [ ] 7.1 Update `Header.tsx`, `App.tsx`, `time/Scrubber.tsx`, `replay/ReplayButtons.tsx`, `hooks/use-free-height.ts` and `styles.css`
    - The header row order of design.md, the disabled "Sound off" button with its description, `footer.night-footer` after `main` with Play, label, date and slider, and then the Replay group. The omitted line goes in the footer. The free height leaves room for the footer.
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.8_
  - [ ] 7.2 Update `header/Legend.tsx`
    - The new Form words and chips, still 8 chips, with no colour literal.
    - _Requirements: 10.3_
  - [ ] 7.3 Apply Deliberate test changes 16 to 22 and 26, and add the e2e checks
    - At 1440 by 900 the Canvas top is at most 190 and the footer's bottom is the viewport bottom. There is no horizontal scroll at 390 and 360 on the demo and the axios replay, and no font request leaves the origin. The axe checks pass on the demo, with the drawer open, with the legend open and while playing.
    - _Requirements: 9.5, 9.6, 9.7, 10.1, 10.4_
  - [ ] 7.4 Screenshot loop for the whole page
    - _Requirements: 14.1, 14.2, 14.3_
  - [ ] 7.5 Independent code review of task 7
    - _Requirements: 15.5_

- [ ] 8. Screenshots, README, credits and steering
  - Retakes the README pictures and writes the documentation.
  - _Requirements: 11.1, 12.1, 12.2, 12.3, 14.2_
  - [ ] 8.1 Retake `docs/cemetery.png` and `docs/replay-axios.png`
    - Run the e2e smoke test. Open both images and record what they show. The final Visual critic round is READY at 1440 by 900 and 390 by 844.
    - _Requirements: 12.1, 14.2_
  - [ ] 8.2 Write `CREDITS.md` and the README line
    - Each model pack with its link and CC0, and each font with its link and OFL 1.1. The README line under the screenshot is set by requirement 12.2 for the source that was used.
    - _Requirements: 11.1, 12.2_
  - [ ] 8.3 Update `.kiro/steering/web.md`
    - The new Forms, the Tiers, the palette, the fonts, the motion rules, the Epitaphs and Serious mode, the header and Footer bar, and the canvas top rule. Keep every other rule and the front matter.
    - _Requirements: 12.3_
  - [ ] 8.4 Independent code review of task 8
    - _Requirements: 15.5_

- [ ] 9. Gates and the fresh-clone run
  - Runs every gate on the final tree.
  - _Requirements: 15.1, 15.2, 15.3, 15.4, 15.5, 11.4_
  - [ ] 9.1 Typecheck, lint, and each package's tests, then the root `npm test`
    - _Requirements: 15.3, 15.4_
  - [ ] 9.2 `npm run test:e2e -w @sexton/web`
    - Record the specs run, the medians, the Canvas top and the no-CSP-violation result.
    - _Requirements: 15.4_
  - [ ] 9.3 Check the scope and the bundle
    - List the changed paths against the allowed list. `packages/web/package.json` shows devDependency additions only. `npm run build -w @sexton/web` passes its bundle check, and `dist` holds no model file and no bake code.
    - _Requirements: 15.1, 15.2, 11.4_
  - [ ] 9.4 Fresh-clone run on the final tree
    - As in cemetery-time-fixes task 9.6. Record the results in design.md.
    - _Requirements: 15.4_
  - [ ] 9.5 Independent code review of the whole branch
    - _Requirements: 15.5_

## Notes

- Spec review, 24 Nov 2026, three rounds by independent reviewers:
  - Round 1: NOT READY with 5 defects, all fixed.
    1. The state colours were changed from the handoff without a failing check. They are now the handoff values.
    2. The glows under graves had no contrast check. `glowStops` was added.
    3. Property 4 claimed punchlines never contain the name, which fails for short names. It now proves name-independence by signature.
    4. The maintainer-change punchline was false for a removal. It now reads "The keys changed hands. Nobody heard the door."
    5. Web tests would have imported the Engine, and the 240 px tooltip broke the "inside its own Cell" rule without saying so. The tests now use fixed strings, and the rule change is named.
  - Round 2: NOT READY with 2 defects, both fixed.
    1. Stacked glows fell to 2.59:1. A grave now has one glow at a time.
    2. One rejected-alpha figure was wrong.
    The dropped idle and rise Clips are recorded as call 17.
  - Round 3: READY. Every number was recomputed and matches.
- Test sub-tasks are not optional in this plan.
- Top-level tasks run in order. Each finishes, including its review, before the next starts.
- Phase 2 (sound, speech bubbles, the replay burst and the burial priest) is a separate spec.
