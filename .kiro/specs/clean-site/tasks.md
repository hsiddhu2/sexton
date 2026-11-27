# Implementation Plan: clean-site

## Overview

The site shell rebuilt to the design the owner approved on 26 November 2026, around the unchanged canvas Scene. Paths are relative to the repository root. No test touches the network.

Run-time notes:

- Build starts only after the owner types `go`. Nothing is pushed without the owner's `push`. The folder stays on spec/clean-site.
- Change only:
  - `packages/web`;
  - in `packages/api`: `src/contract.ts` (replay types and the `ApiErrorCode` type export), `scripts/lib/replay-facts.mjs`, the demo generator, and their tests with the reason-family drift test;
  - README.md, CREDITS.md and docs/JUDGES.md where requirement 18 names them;
  - `docs/cemetery.png`, `docs/replay-axios.png`, `docs/requirements.md`, `.kiro/steering/web.md`, `.kiro/steering/product.md`, `.kiro/steering/structure.md` and this folder.
- No new package dependency. Font files are copied in with their OFL files.
- Tests of a removed feature go in the same commit as the removal. Every changed test is listed in design.md with its reason. `numRuns` is 100 for every new property (1000 for Property 3 and the code reader of Property 7), tagged `Feature: clean-site, Property N: <title>`.
- Gates before every commit: `npm run typecheck`, `npm run lint` and `npm test` at the root, zero warnings, then an independent review. Check `git branch --show-current` before every commit. Commits carry no trailer. Notes name no tool.

## Tasks

- [x] 1. Foundations: tokens, fonts, carried address code and pure models
  - _Requirements: 1.11, 1.12, 2.1 to 2.3, 2.13 to 2.15, 3.9, 3.10, 3.11, 3.18, 3.19, 3.22, 5.4, 5.6 to 5.10, 6.2 to 6.5, 6.7, 6.11, 10.2, 10.3, 10.5, 10.6, 10.9, 10.14, 11.1, 11.6 to 11.8, 12.2 to 12.4, 17.1 to 17.4_
  - [x] 1.1 Check out `load/view-address.ts`, `load/page-history.ts`, `load/scanned-pref.ts` and `test/view-address.test.ts` from spec/calm-first-visit; add `page`, `list` and the canonical form; extend the round-trip test (Property 2)
    - _Requirements: 10.5, 10.6, 10.9_
  - [x] 1.2 Add `load/screen-state.ts` (`reduce`, `homeOf`) with Property 1
    - _Requirements: 17.1, 17.2, 17.3, 17.4, 10.2, 10.3, 10.14_
  - [x] 1.3 Add `header/repo-input.ts` with Property 3
    - _Requirements: 1.11, 1.12_
  - [x] 1.4 Add `panel/reason-family.ts` with `test/fixtures/engine-reasons.json`, the web check and the api drift test; add `panel/pick-signals.ts`
    - _Requirements: 3.9, 3.10, 3.11_
  - [x] 1.5 Add `panel/fix-order.ts` (Property 4), `home/headline.ts`, `home/notices.ts` and `home/list-rows.ts` (Property 5)
    - _Requirements: 2.1, 2.2, 2.3, 2.13, 2.14, 2.15, 3.18, 3.19, 3.22, 6.2 to 6.5, 6.7, 6.11_
  - [x] 1.6 Add `glossary/glossary.ts` and `glossary/TermText.tsx` with Property 6
    - _Requirements: 11.1, 11.6, 11.7, 11.8_
  - [x] 1.7 Export the `ApiErrorCode` type from `contract.ts`; mirror the list in `load/lists.ts` with its drift test; add `load/scan-failure.ts` and the bounded code reader (Property 7)
    - _Requirements: 12.2, 12.3, 12.4_
  - [x] 1.8 Add the chrome tokens to `scene/palette.ts` with contrast and accent-to-Restless tests; copy the Inter and Cormorant Garamond woff2 files and their OFL files into `public/fonts`
    - _Requirements: 5.4, 5.6, 5.7, 5.8, 5.9, 5.10_

- [x] 2. Remove the noise
  - _Requirements: 4.1 to 4.6, 5.1 to 5.3, 5.5_
  - [x] 2.1 Remove the grave tooltip, speech bubbles, the guide card, the Fix-first line, Serious mode and Punchlines, with their code, styles and tests
    - _Requirements: 4.1, 4.4, 4.6_
  - [x] 2.2 Remove the sound engine, voices, the Sound toggle and every sound call (the burial bell included), with their tests; drop the Burst caption and keep the animation
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6_
  - [x] 2.3 Remove Pirata One, IM Fell English, IM Fell English SC and Instrument Sans with their OFL files; set the interface and the canvas labels in Inter, the wordmark and headlines in Cormorant Garamond, and code text in the system monospace stack
    - _Requirements: 5.1, 5.2, 5.3, 5.5_

- [x] 3. The shell: header, Home, Panel and footers
  - _Requirements: 1.1 to 1.10, 1.13 to 1.17, 2.4 to 2.15, 3.1 to 3.8, 3.12 to 3.17, 3.20, 3.21, 3.23, 3.24, 3.25, 9.5 to 9.9, 9.11, 11.2, 16.3 to 16.7, 16.12, 16.15, 16.16_
  - [x] 3.1 Rebuild the header: wordmark link, scan tag, Scan field with examples, the scanning card, the four buttons
    - _Requirements: 1.1 to 1.10, 1.13 to 1.17_
  - [x] 3.2 Build Home: headline, notices, chips with canvas dimming and tab order, the Graveyard / List switch, the help line and date badge in the reserved sky band (Property 8, first half)
    - _Requirements: 2.4 to 2.15_
  - [x] 3.3 Build the Panel: Inspector with hover, focus and Selected; the hover ring; Fix order rows with the current-row mark; the keys
    - _Requirements: 3.1 to 3.8, 3.12 to 3.17, 3.20, 3.21, 3.23, 3.24, 3.25, 11.2_
  - [x] 3.4 Build the Footer bar (scrubber, Back to now, too-large line, attack picker) and the site footer (scan time, policy line, evidence links, credit slot)
    - _Requirements: 16.3, 16.4, 16.5, 16.6, 16.7, 16.12, 16.15, 16.16_
  - [x] 3.5 Add the Welcome bar with `guide/welcome-pref.ts`
    - _Requirements: 9.5 to 9.9, 9.11_

- [x] 4. The List view
  - _Requirements: 6.1 to 6.15_
  - [x] 4.1 Build `home/ListView.tsx` with Find, the sort buttons and aria-sort, the chip filter, the empty row and row open by press and Enter
    - _Requirements: 6.1 to 6.10, 6.13, 6.14, 6.15_
  - [x] 4.2 Add the 300-package fixture and the e2e key-press timing check
    - _Requirements: 6.11, 6.12_

- [x] 5. The Drawer
  - _Requirements: 7.1 to 7.27, 11.2 to 11.5_
  - [x] 5.1 Rebuild the Drawer frame: breadcrumb, header, tabs, close, focus in and back, scrim
    - _Requirements: 7.1, 7.19, 7.21, 7.22, 7.23, 7.25_
  - [x] 5.2 Evidence tab with Terms in running text; the Term Pop-over; History tab from `drawer/history-rows.ts`
    - _Requirements: 7.2, 7.17, 7.18, 7.24, 11.2, 11.3, 11.4, 11.5_
  - [x] 5.3 The fix tab from `drawer/fix-view.ts`: diff, Open pull request, one copy button, the notes, the disclosure; `drawer/clipboard.ts` and `drawer/issue-text.ts`
    - _Requirements: 7.3 to 7.16, 7.20, 7.26, 7.27_

- [x] 6. The Replay as a story
  - _Requirements: 8.1 to 8.22, 11.2_
  - [x] 6.1 Add `steps` and `why` to `ReplayInfo`, to `replay-facts.mjs` with the source key beside every sentence, and to the generator; regenerate both replay files; check each sentence against its source
    - _Requirements: 8.12, 8.13, 8.14_
  - [x] 6.2 Validate the Step texts and their count against `stopsFor` in `validate-scan-response.ts`
    - _Requirements: 8.13, 8.15_
  - [x] 6.3 Build `replay/ReplayView.tsx`: breadcrumb, headline and sub-line, stage with the date badge and Burst, Step panel, Back and Next step, Why card, Footer bar with Play all, Step cards and Exit replay
    - _Requirements: 8.1 to 8.12, 8.16 to 8.22, 11.2_

- [x] 7. The Guide page, the Legend and the Tour
  - _Requirements: 9.1 to 9.4, 9.10, 9.11, 11.2, 13.1 to 13.12, 17.5_
  - [x] 7.1 Add the Claim registry `copy/claims.ts` and its README check and phrase scan (Property 9); build `guide/guide-content.ts` and `guide/GuidePage.tsx`
    - _Requirements: 9.1 to 9.4, 9.10, 11.2, 17.5_
  - [x] 7.2 Make the Legend a Pop-over with its eight entries
    - _Requirements: 13.1, 13.2, 13.11, 13.12_
  - [x] 7.3 Build the Tour with `tour/place-card.ts` (Property 8, second half)
    - _Requirements: 13.3 to 13.10_

- [x] 8. The way back
  - _Requirements: 10.1 to 10.18, 17.1 to 17.4_
  - [x] 8.1 Add `load/use-view.ts`: `ScreenState`, push and replace, popstate, the Drawer's Back step, the Escape order
    - _Requirements: 10.3, 10.4, 10.7, 10.8, 10.14 to 10.17, 17.1, 17.2, 17.3, 17.4_
  - [x] 8.2 Wire every view, breadcrumb and the wordmark to it; the unknown-replay card; the `?repo=` prompt; port the still-valid cases of calm-first-visit's `way-back.test.tsx`
    - _Requirements: 10.1, 10.2, 10.5, 10.6, 10.9 to 10.13, 10.18_

- [x] 9. Failed scans
  - _Requirements: 12.1 to 12.7_
  - [x] 9.1 Show the failure card with its two buttons from `load-scan`'s status and code
    - _Requirements: 12.1 to 12.7_

- [x] 10. The Music slot
  - _Requirements: 14.1 to 14.8_
  - [x] 10.1 Add `music/track.ts` with `TRACK = null`, `music/use-music.ts`, the beat in `scene/motion.ts` with its tests, the button rendered only with a track, the credit slot and the conditional `media-src 'self'` with its vite-csp test
    - _Requirements: 14.1 to 14.8_

- [x] 11. Layouts and phone
  - _Requirements: 1.2, 1.3, 1.4, 3.1, 3.2, 15.1 to 15.5_
  - [x] 11.1 The breakpoints at 1300, 1100 and 700 px; `frontFirst` in `planScene` with layout tests
    - _Requirements: 1.2, 1.3, 1.4, 3.1, 3.2, 15.1 to 15.5_

- [x] 12. Checks, pictures, documents and the review
  - _Requirements: 16.1, 16.2, 16.8 to 16.11, 16.13, 16.14, 18.1 to 18.7_
  - [x] 12.1 Write `e2e/clean.spec.ts` for every flow of the approved design at 1440 by 900 and 390 by 844; update the other e2e specs; axe on every view; repaint at 300 graves
    - _Requirements: 16.1, 16.2, 16.8 to 16.11, 16.13, 16.14_
  - [x] 12.2 Retake the two README pictures; update README.md, CREDITS.md and docs/JUDGES.md; rewrite `.kiro/steering/web.md`; docs/requirements.md 1.1
    - _Requirements: 18.1 to 18.5, 18.7_
  - [x] 12.3 After task 13, review the built site against the approved design in a fresh profile at both sizes; list every difference with its reason in design.md, with the frame time at 300 graves and what was removed
    - _Requirements: 18.6_

- [x] 13. A little mischief
  - _Requirements: 19.1 to 19.10, 4.1, 12.1, 18.1, 18.4_
  - [x] 13.1 Add `copy/mischief.ts` with the texts of design C16 and its test; show the Epitaph line in the Inspector
    - _Requirements: 19.1, 19.2, 19.10, 4.1_
  - [x] 13.2 Add the Dry line to every failure card and the unknown-replay card, and the Scanning line to the scanning card
    - _Requirements: 19.3, 19.4, 19.8, 19.10, 12.1_
  - [x] 13.3 Move `paintGhost` to an exported `drawGhost` in `scene/draw.ts` with the Scene's output unchanged; add `scene/GhostPicture.tsx` and the Guide ghost in the Tour card and the Welcome bar
    - _Requirements: 19.5, 19.6, 19.7, 19.9_
  - [x] 13.4 Update web.md (Inspector, failure cards, scanning card, the ghost exception) and structure.md (`copy/mischief.ts`); update `e2e/clean.spec.ts` and run the whole e2e suite; retake docs/cemetery.png
    - _Requirements: 18.1, 18.4, 19.9_

- [x] 14. Fixes from the review against the approved design
  - _Requirements: 1.5, 1.6, 1.13, 1.14, 3.15, 6.1, 7.2, 7.17, 11.4, 12.1, 15.2, 15.5, 16.3_
  - [x] 14.1 Keep the fit scale and the Scene the same at every date, with the Footer bar in view at 1440 by 900; e2e check
    - _Requirements: 15.2, 16.3_
  - [x] 14.2 Show Evidence values in plain words with each source and fetch time, labels and the List in whole words, and the History dots in State colours
    - _Requirements: 6.1, 7.2, 7.17, 15.5_
  - [x] 14.3 Change the Inspector within the pointer event that leaves a grave, so a Term press opens the Term it shows
    - _Requirements: 11.4_
  - [x] 14.4 Keep the scan tag and the page of the scan shown before under the scanning and failure cards; put "Scanning is off in this build." inside the field and dim a disabled Scan button
    - _Requirements: 1.5, 1.6, 1.13, 1.14, 3.15, 12.1_

- [x] 15. Owner decisions and the cold look, 26 Nov
  - _Requirements: 3.5, 3.26, 3.27, 13.1, 13.3, 17.5, 18.8, 19.1, 19.10_
  - [x] 15.1 Add the README sentence on the order of the graves; rest the Tour's first step and the Legend's fix order line on it in the Claim registry; change the stale and stale-advisory Epitaph lines in `copy/mischief.ts` and C16
    - _Requirements: 13.1, 13.3, 17.5, 18.8, 19.1, 19.10_
  - [x] 15.2 Give the Inspector, the Fix order card and the Step panel one height at each layout with clamped lines and `panel/Clamped.tsx`; keep the Scene card from stretching; e2e check that no box moves on hover, select, List rows and Replay Steps at 1440 by 900 and 390 by 844
    - _Requirements: 3.5, 3.26, 3.27_

- [x] 16. Ghost Party in the music slot
  - _Requirements: 14.1 to 14.8, 1.15, 16.12_
  - [x] 16.1 Ship `public/music/ghost-party.mp3` and set `TRACK` (Ghost Party, The Piano Says, CC BY 3.0, 110 BPM) with its four credit lines; show them in the site footer, README.md and CREDITS.md; keep the phone header on one row at 390 px
    - _Requirements: 14.1, 14.2, 14.6, 1.15, 16.12_
  - [x] 16.2 Update the music, CSP and footer tests and the e2e header case; add the e2e case that Music makes one looping audio element from the origin and the next press pauses it
    - _Requirements: 14.3, 14.4, 14.5, 14.7, 14.8_

- [x] 17. Home fits 1440 by 900
  - _Requirements: 3.26, 3.28, 9.9, 14.6, 16.12_
  - [x] 17.1 Show one credit line in the site footer line and the four credit lines on the Guide page under "Music"; keep them in README.md and CREDITS.md
    - _Requirements: 14.6, 16.12_
  - [x] 17.2 Fit Home to 1440 by 900 with the Welcome bar open and closed by trimming spacing, never text; let the Scene take the Welcome bar's room when it closes; e2e check of the scroll height in a fresh profile
    - _Requirements: 3.26, 3.28, 9.9_

- [x] 18. Short laptop screens
  - _Requirements: 3.26, 3.29_
  - [x] 18.1 Lower the fit floor to 0.4 in the Wide and Middle layouts, keep 0.6 in the Narrow layout, lower the shortest Scene to 380 px and keep the names' minimum on-screen size
    - _Requirements: 3.29_
  - [x] 18.2 Give Home's Panel the grid row's height under the header and let it scroll inside itself only when its cards are taller; e2e checks at 1366 by 768 and 1280 by 800, and the no-layout-shift cases at 1366 by 768
    - _Requirements: 3.26, 3.29_
- [x] 19. The headline's rules, the Replay Panel and the README limit
  - _Requirements: 2.1, 2.2, 2.16, 2.17, 3.26, 3.29, 12.2_
  - [x] 19.1 The headline never reads the all-clear while a grave is Possessed, Dead or Haunted or the policy fails; its words in `copy/headline.ts`; unit, property and e2e checks
    - _Requirements: 2.1, 2.2, 2.16, 2.17_
  - [x] 19.2 Give a Replay's Panel Home's inner scroll, a Replay's Scene the full-size grave as its minimum and short screens one line of Step cards, so both Replays fit at 1440 by 900, 1366 by 768 and 1280 by 800 at every Step; e2e checks
    - _Requirements: 3.26, 3.29_
  - [x] 19.3 One README limit line: a firewall block or a not-found address on the hosted site shows the general failure card
    - _Requirements: 12.2_
