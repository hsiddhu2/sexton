# Implementation Plan: clean-site

## Overview

The site shell rebuilt to the prototype the owner approved on 26 November 2026, around the unchanged canvas Scene. Paths are relative to the repository root. No test touches the network.

Run-time notes:

- Build starts only after the owner types `go`. Nothing is pushed without the owner's `push`. The folder stays on spec/clean-site.
- Change only:
  - `packages/web`;
  - in `packages/api`: `src/contract.ts` (replay types and the `ApiErrorCode` type export), `scripts/lib/replay-facts.mjs`, the demo generator, and their tests with the reason-family drift test;
  - README.md, CREDITS.md and docs/JUDGES.md where requirement 18 names them;
  - `docs/cemetery.png`, `docs/replay-axios.png`, `docs/requirements.md`, `.kiro/steering/web.md` and this folder.
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

- [ ] 12. Checks, pictures, documents and the review
  - _Requirements: 16.1, 16.2, 16.8 to 16.11, 16.13, 16.14, 18.1 to 18.7_
  - [x] 12.1 Write `e2e/clean.spec.ts` for every prototype flow at 1440 by 900 and 390 by 844; update the other e2e specs; axe on every view; repaint at 300 graves
    - _Requirements: 16.1, 16.2, 16.8 to 16.11, 16.13, 16.14_
  - [x] 12.2 Retake the two README pictures; update README.md, CREDITS.md and docs/JUDGES.md; rewrite `.kiro/steering/web.md`; docs/requirements.md 1.1
    - _Requirements: 18.1 to 18.5, 18.7_
  - [ ] 12.3 Review the built site against the prototype in a fresh profile at both sizes; list every difference with its reason; write the report, kept outside the repository, with the frame time at 300 graves and what was removed
    - _Requirements: 18.6_
