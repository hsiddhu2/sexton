# Review notes: clean-site

## Task 1

Foundations (1.1 to 1.8): the carried address files, the screen state, the repository input, the reason families and Inspector signals, the Fix order, the Home models, the Glossary, the failed-scan cards and code reader, the chrome tokens and the two new fonts. Pure modules and their tests only; nothing is wired into the App yet.

Independent review before the commit. Verdict: ready. No defect found: no correctness bug, no test asserting the opposite of its requirement, no I/O in the pure modules, no injection, no secret, no file outside the lane.

Notes:

1. The host-string check in `imports.test.ts` removed every `github.com` from `header/repo-input.ts` and `load/scan-failure.ts`, so a later `api.github.com` there would have slipped through. Fixed before the commit: only a bare `github.com` (not after a dot or a letter, not before one) is now allowed in those two files.
2. A publisher name with a space would match no Reason family; the Inspector then shows the capitalised reason (3.10) and the Fix order says "see the evidence". npm user names hold no spaces, so this stays as it is.
3. Property 1 checks "an ignored event leaves the state unchanged" by example (the blocked-events case), not over the generated runs. The rule holds in the code. Left as it is.
4. `markTerms` matches with Unicode case folding, so a word such as "advisorieſ" matches the pattern but not the lookup; it is left unmarked and the text is unchanged. Harmless.
5. "Last publish" takes the ok tone unless its date is unknown, and the List's "Nothing to do" follows the scan-date State. Both are recorded decisions in design.md.
6. The 300-character input cap counts leading and trailing spaces. Harmless: the longest valid canonical URL is 159 characters.

Gates after the fix: typecheck, lint (zero warnings) and test pass; 2259 tests across 6 workspaces.

## Task 2

Remove the noise (2.1 to 2.3): the grave tooltip, speech Bubbles, the guide card, the Fix-first line, Serious mode, Punchlines, sound (engine, voices, toggle, the burial bell and every other call), the Burst caption and the four old fonts, with their code, styles, stored values and tests. Interface text and canvas name labels are in Inter, the wordmark and headlines in Cormorant Garamond, code in the system monospace stack.

Independent review before the commit. Verdict: ready. No defect found: no leftover reference to removed code in src, test, e2e or the configs, no test asserting the opposite of its requirement, the Priest's drawing unchanged, the CSP's `font-src 'self'` matching the two font files, every changed file in the lane.

Notes:

1. The deleted Guide axe case in `judge.spec.ts` also held the only real-browser axe run of the page. Fixed before the commit: kept as its own case on the demo.
2. The Lantern glow logic moved into GraveButtons had no direct test. Fixed before the commit: `lantern.test.tsx` covers hover, key-driven focus, a pointer focus, hover over focus and the open drawer.
3. 5.5 is not met yet for the drawer title's version and the signal keys; 5.6 may not be met for the drawer's "Here lies" colour. Both wait for the Drawer and Panel rebuild and are recorded in design.md.
4. With the pointer resting on a grave while the drawer opens and closes, nothing is lit until the pointer leaves and comes back. This matches the old tooltip reset.
5. 4.3 and 4.4 are checked only in e2e (no AudioContext, no audio element) and by the absence of the code. A jsdom spy test could follow in task 12.
6. README.md, CREDITS.md, docs/requirements.md R-UI-8 and the README test still name the old Guide steps, sound or fonts; the infra cache-header tests use an old font path as a sample string. Task 12, or outside the lane, as recorded.


## Task 3

The shell (3.1 to 3.5): the one-row header with the wordmark link, the scan tag, the Scan field with its examples and the scanning card, and the header buttons; Home with the headline, notices, chips with canvas dimming and tab order, the Graveyard / List switch, the help line and date badge in the sky band; the Panel with the Inspector, the hover ring, the Fix order and the keys; the Footer bar and the site footer; the Welcome bar. The screen state is held by an in-memory hook and owns what is open; the Guide page, Tour and List are first versions until their tasks.

Independent review before the commit. Verdict: not ready, for two defects, both fixed before the commit:

1. Escape on a Replay (or on a Guide page opened from one) changed the screen state to Home but left the replay loaded. Fixed: the loader now follows the Source the screen state names whatever event changed it; a test takes a Replay home on Escape and checks the Sample scan loads.
2. During the Load moment, a grave that had finished rising was drawn at full alpha under a filter. Fixed: that branch is dimmed too; a test draws the Load moment with every grave dimmed.

Notes:

1. On a Replay the Cemetery still keeps its own Drawer, so a Drawer can sit on the Replay owner and the hero, Footer bar and Panel are not inert then. Recorded in design.md; task 6 removes it (8.19).
2. The Drawer handles its own Escape, so a Pop-over over the Drawer would close after it, and a Drawer closed by the reducer gets no focus return. Tasks 5 and 8.
3. The help line and the date badge could overlap in a narrow Scene. Fixed: the help line hides while the badge shows.
4. HomeView places the overlays by the model's constant offsets; CSS holds the widths. Left as it is; the model and CSS share the values 460, 240 and 28.
5. A test title and a code comment did not match. Fixed.
6. Focus on a grave makes it the Selected grave, as on main. Recorded in design.md.
7. The contrast pair check no longer holds the chrome lines and tinted borders to 3:1, the Scan field's edge among them; the field is also marked by its icon, placeholder and gold Scan button. Recorded in design.md.
8. The first Tour card takes no focus and has no blocker; task 7.3.
9. The Inspector heading holds the Selected mark; the Fixture-name check skips the Drawer; the 300-grave repaint with half dimmed waits for the e2e work of task 12.

Gates after the fixes: typecheck, lint (zero warnings) and test pass; 2226 tests across 6 workspaces.

## Task 4

The List view (4.1 and 4.2): "Find a package", the Package and State sort buttons with aria-sort, the chip filter, the empty row, a row opening its Drawer by a press or by Enter on its package button, and a 300-package fixture with the browser check that each Find key shows its rows within 100 ms.

Independent review before the commit. Verdict: ready. No defect found: no I/O outside the seams, no network in tests (the browser check aborts every other origin and serves the fixture itself), every changed file in the lane.

Notes:

1. The timing stopped at the last change of the table body, before the paint. Fixed before the commit: the sample now ends at the frame after the change, and the check waits two frames between keys. Locally the keys took at most 15.5 ms.
2. Keys that leave the rows as they were ("e" and "f" in "left-pad-1") count as 0 ms, so fewer than ten keys are real samples. Recorded in design.md.
3. The browser check compares counts after each key; which names a Find keeps is covered by the unit test.
4. Hover or focus on a List row does not change the Inspector; opening a row makes it the Selected grave. 6.13 is met through Selected.
5. There is no descending order: a press on the sorted column keeps it. Enough for 6.4 and 6.5.
6. The 300-package unit case has no Find text or filter; Property 5 covers filtered lists.
7. A row has a hover style but no focus style of its own; the package button shows the focus ring.

Gates after the fix: typecheck, lint (zero warnings) and test pass; 2233 tests across 6 workspaces. The browser check `e2e/list.spec.ts` passes locally.

## Task 5

The Drawer (5.1 to 5.3): the sheet from the right with the breadcrumb, name, version, State badge and scan date, the tabs Evidence, The fix and History with their keys, one close button, focus in and back, and the scrim; the Evidence tab with Terms in its labels and sentence, https source links and main's missing signals and policy rules; the Term Pop-over over the Drawer closing first on Escape; the History tab; the fix tab from `fix-view.ts` with the diff, Open pull request on a Live scan with actions, one copy button, the notes and the closed disclosure of the pull request text.

Independent review before the commit. Verdict: ready. No defect found: no new I/O outside `clipboard.ts`, which takes an injected clipboard; a source becomes a link only for an https address that parses, with rel="noopener noreferrer"; the PR link and body keep their guards; every changed file in the lane.

Notes:

1. web.md still said the drawer is full width below 512 px. Fixed before the commit: below 700 px.
2. A Proposed plan wins over the State, so a Restless or Alive package with one shows the plan and its copy button. A recorded decision; the wording of 7.9 and 7.10 may want a note.
3. A Proposed plan with an empty body showed "Copy this as an issue" for any State. Fixed before the commit: only for Possessed, Dead and Haunted, else no copy button (7.6).
4. Every close now returns focus to the grave, so a Tour opened over a Drawer leaves focus on a grave behind the Tour card. The Tour takes focus with task 7.3.
5. A Replay's Drawer counts as a "live" scan, so a plan there would show the 7.15 note without the link. Replays carry no plans today; task 6 removes the Replay's own Drawer.
6. An unavailable signal with no reason reads "not recorded" in both the Evidence cell and the issue text, through the model's fallback.
7. History rows are keyed by their start; two Segments with the same start are not made by the engine.
8. Seven e2e cases in `time.spec.ts` and `polish.spec.ts` fail the same way on the commit before this task; they wait for task 12.1. `remediate.spec.ts`, `polish.spec.ts`'s drawer cases, `judge.spec.ts` and `list.spec.ts` pass.

Gates after the fixes: typecheck, lint (zero warnings) and test pass; 2253 tests across 6 workspaces.

## Task 6

The Replay as a story (6.1 to 6.3): `steps` and `why` in `ReplayInfo`, in `replay-facts.mjs` with a source key after every sentence, and in the generator, with both replay files regenerated; the validator's checks of the Step texts and of their count against `stopsFor`; and `replay/ReplayView.tsx`, which takes the screen as the one View owner with the breadcrumb, headline and sub-line, the stage with the date badge and the Burst, the Step panel with Back and "Next step", the Why card, and the Footer bar with "Play all", the Step cards and "Exit replay". The old banner, the scrubber's Play and Stop cards, and the Replay's own Drawer went with their tests.

Independent review before the commit, with the instruction to check Step sentences against their cited sources. Verdict: ready. No defect found: every changed file is in the lane, no new I/O, source links only for https addresses, and no text rendered as HTML. Thirteen sentences were checked against the Trend Micro report (through its redirect), the CSA advisory, the Snyk report and the cacheable issue, and each was supported.

Notes:

1. Snyk credits the keyv second stage's targets to the incident reports it cites and did not decrypt the payload itself. Fixed before the commit: the sentence now begins "Reports say".
2. "A fresh install gets 1.14.0 again." comes from the registry time map and CSA's downgrade advice, not a direct sentence. Kept and recorded with its sources in design.md.
3. Trend Micro says npm removed every compromised version (0.30.4 too); the Step names only 1.14.1, the one this replay shows. Kept.
4. A loaded file of the Replay with no story would have shown the waiting card for ever. Fixed before the commit: it shows an alert; a test renders the view with such a response, and another checks that the validator refuses it first.
5. Over-cap Step and why texts are reported as WRONG_TYPE, as the other capped strings are.
6. The source-comment test finds each sentence on one line of the facts file; a sentence wrapped over two lines would fail the test rather than pass.
7. design.md names no outside path or document.

Gates after the fixes: typecheck, lint (zero warnings) and test pass; 2268 tests across 6 workspaces. The changed e2e specs pass locally but for five cases in `time.spec.ts` and two in `smoke.spec.ts` that fail the same way before this task and wait for task 12.

## Task 7

The Guide page, the Legend and the Tour (7.1 to 7.3): the Claim registry `copy/claims.ts` with its README check and the rendered-text phrase scan (Property 9); the three README sentences of 18.7; the Guide page from `guide/guide-content.ts` with its graves drawn by the scene painter; the Legend as a Pop-over with its eight entries; the Tour with its blocker, dimming, spotlight, focus and `tour/place-card.ts` (Property 8, second half). The fix-tab notes, the Evidence note, the scanning card's sources line, the first example's note and a failure card's next step now come from the registry.

Independent review before the commit. Verdict: not ready, for two defects:

1. Three sentences say the graves are ordered worst first, and README.md does not say so: the Guide's step 2 "The worst stand in front.", the Tour's step 1 "The worst ones stand in the front row." and the Legend's fix order line. Fixed in part: the Guide sentence, which no criterion fixes, is cut. The other two are fixed word for word by 13.3 and 13.1 and true of main, but README holds no sentence about the order and only the three 18.7 sentences were approved. Left open for the owner, recorded in design.md (Task 7, item 9) with a proposed README sentence for task 12.2.
2. In a real browser a press on the Tour's blocker moved focus to the body, so Shift+Tab reached the page behind the dimming. Fixed: the blocker cancels the press at mousedown, and the Tab trap listens on the document; a test checks both.

Notes:

1. The Tour card's height was a fixed 190 px. Fixed: the card's measured height is used, each step scrolls its target into view, and the property runs with card heights from 150 to 300 px.
2. The rendered-text check did not render the outcome of Open pull request. Fixed: the outcome lines and the pull request link text are listed as what-happened lines and checked.
3. The Tour's step 2 and the Guide's problem paragraph rest on README texts that touch them only loosely; they describe the page and the world, not a capability.
4. "Sexton only proposes a version it can show is safe." (7.8) says a little more than README's "passes its checks"; the wording is fixed by 7.8.
5. The capability phrase list follows C7, so verbs such as "proposes" and "shows" are not scanned.
6. The host-string exception for `copy/claims.ts` allows the bare word deps.dev in that file and checks it has no fetch.
7. Import order in `Drawer.tsx` and a RegExp built on each render in `GuidePage.tsx`. Fixed.

Gates after the fixes: typecheck, lint (zero warnings) and test pass; 2289 tests across 6 workspaces.

## Task 9

Failed scans (9.1): `home/FailureCard.tsx` over the Scene for every failed load, in place of main's error panel. A Live scan's card comes from `liveFailureCard`, which reads only the load error's status and checked API code, with "Try the demo repo" and "Back to the sample"; the Sample scan, a scan file and a refused replay file show "This scan could not be loaded." with "Try again" and "Back to the sample". No error code, message, contract path or body text is shown or logged.

Independent review before the commit. Verdict: ready. No defect found: the card is the first match of 12.2's order, only the checked code of a body is read, every request still passes checkScanUrl, and the one capability sentence on a card is in the Claim registry.

Notes:

1. Several rows of 12.2 were checked only by the pure property, and no page test had an order conflict. Fixed before the commit: page cases for 429 before a body code, 504 before a body code, 502 with code fetch-failed and 413 manifest-too-large.
2. The 429 case's body code is the WAF's, which is not an API code and is dropped; the case is named for that now.
3. Home picks the Live card from the screen state's repository Source, not the loader's hosted flag; the two agree today, since a repository Source is only made with an API base.
4. The generic card's next step says "Try again, or try the demo repo." while its buttons are the two of 12.1; as the spec fixes them.
5. Tests compare the alert's whole text, including the decorative "!" mark; brittle to markup but exact.

Gates after the fixes: typecheck, lint (zero warnings) and test pass; 2305 tests across 6 workspaces.

## Task 10

The Music slot (10.1): `music/track.ts` with `TRACK = null` and its credit line and beat, `music/use-music.ts`, the Pose clock in `scene/motion.ts` (one step per half beat with a beat, 12 a second without, still under Reduced motion), the beat carried through the plan and the Scene's repaint timer, the Music button rendered only with a track, the credit in the site footer, and `media-src 'self'` in the CSP only with a track. No audio file ships; the candidate track is not touched.

Independent review before the commit. Verdict: ready. No defect found: with the slot empty there is no button, audio element, AudioContext or media-src; plans without music are unchanged, so the repaint path is as before; nothing in `scene/characters` changed and no dependency was added.

Notes:

1. product.md said the site makes no sound, which stops being true once a track is set. Fixed before the commit: it says no generated sound, and that the one sound is the slot's track after the visitor turns Music on.
2. `useMusic` built a new beat object on each render while on, so the Scene was planned again on every page render. Fixed before the commit: the beat is memoised; a test checks it keeps its identity across renders.
3. `vite-csp.test.ts` keeps its two older 1000-run properties (spec cemetery-theme); this change does not touch them.
4. A track source that is not https shows no link, by the same rule as other links; the owner's track must give an https source.
5. With `TRACK` a constant, the App wiring of the button and the beat is checked through a Header harness and the hook, and fully once a track is set; the README credit test becomes a real check then too.

Gates after the fixes: typecheck, lint (zero warnings) and test pass; 2317 tests across 6 workspaces.

## Task 8

The way back (8.1, 8.2): `load/use-view.ts` holds the screen state with the View address in step, `load/history-step.ts` says whether each change pushes, replaces, goes back over the Drawer's entry or leaves the address alone, Back and Forward restore the View of their entry, and Escape's last step is the Home action. The wordmark, the breadcrumbs, Exit replay and "Back to the cemetery" go through it. An unknown replay shows "That replay does not exist." with "Back to the cemetery". A fresh repo= link fills the Scan field and shows "Scan this repository" with no request; a reload of the tab that started the scan starts it again; a Live scan shown in the page is held, so Back and Forward show it with no request.

Independent review before the commit. Verdict: not ready, for one defect, fixed before the commit:

1. Back and Forward lost the date or grave of an entry whose Source differed from the scan still loaded: after Back from a Replay to `?at=<a demo date>`, Home checked that date against the Replay's response for one render, dropped it with a replace, and the address became "/". Fixed: Home checks a grave or date only once the loaded response belongs to the shown Source. A new case sets a date, opens a Replay, goes Back and checks the date and slider, then a Drawer, the Guide page and Back.

Notes:

1. If the popstate of the page's own Back step came later than the 500 ms fallback, the entry beneath would show as it was. Not seen in a browser; left as it is.
2. A visitor's own Back pressed while the page's Back step runs is taken as that step. Left as it is.
3. A reload that resumes a Live scan (10.12) first starts the Sample scan's request, which is aborted; under StrictMode in development the resume runs twice, the first request aborted. Harmless.
4. A press of "Scan this repository" on an address whose repo= is not canonical (repo=a/b) pushes the canonical address as a new entry, so Back returns to the prompt. No request is sent without the press.
5. A fresh `?repo=X&grave=g` keeps its grave and date until the scan runs; nothing is checked against the Sample scan under the prompt (changed with the fix above).
6. Escape does nothing on the unknown replay card: it has no View owner, and 10.3 names only a Replay or the Guide page. The wordmark and the card's button lead home.
7. A doc comment in `load/scan-failure.ts` sat above the wrong constant. Fixed.
8. `history.length` grows across the cases of a file; `way-back.test.tsx` starts each case with a fresh entry, so its length checks are relative.
9. The Home action from Home with a date is a replace, as recorded in design.md.
10. Every fetch still passes checkScanUrl; a held response is shown with no fetch.

Gates after the fixes: typecheck, lint (zero warnings) and test pass; 2357 tests across 6 workspaces. Playwright, before the fix (no change to the paths it covers since): 34 passed, 8 failed, the same eight that failed before this task (the four demo-label cases and the canvas top in `time.spec.ts`, the 360 px full-bleed case in `polish.spec.ts`, and the evidence link names and the README replay picture in `smoke.spec.ts`).

## Task 11

Layouts and phone (11.1): the breakpoints at 1300, 1100 and 700 px checked in the browser, with the phone header's buttons tightened so the wordmark and the four buttons share the first row at 390 px; `frontFirst` in `planScene` for the Narrow layout (front Tier on top, two front graves to a row); and one fit scale for all three Tiers, so the demo's graves fit the Scene at 1440 by 900 with the header, Welcome bar, headline, chips, Footer bar and Panel in view, no grave overlapping and the Characters unchanged.

Independent review before the commit. Verdict: ready. No defect found: a plan that is said to fit is never taller than the fit height, rows stay inside the width and never overlap, the frontFirst scale leaves two front columns, bad inputs through `planScene` give scale 1, a Replay's grave keeps its own cell, nothing in `scene/characters` changed and every file is in the lane.

Notes:

1. `fitScale` called directly with a NaN width returned NaN (`planScene` clamps the width first, so the page never did). Fixed before the commit: a width that is not finite gives 1, with a test.
2. A test title claimed "the largest scale that fits" while checking only a scale under 1 that fits. Fixed before the commit: the title and comment now say what is checked.
3. In the Narrow layout the fit height is not used. The phone scrolls, and the scale comes from two front graves to a row.
4. The scale follows the count of graves per Tier, so a package changing Tier could resize every grave between frames. Tiers follow the scan-date State, which a burial does not change; a new scan re-plans anyway.
5. The replaced e2e cases keep their intent or follow the steering change from full-bleed to a card; none asserts the opposite of a requirement. The 390 by 844 case leaves the order of the middle and back Tiers to the unit test.
6. The no-overlap loop of `fit-layout.test.ts` compares the first 61 graves with all others, as the older Tier property does; the pitch argument covers the rest.
7. `smoke.spec.ts` "the axios replay at its Possessed stop, for the README" still fails (the README picture's canvas top); task 12.2 retakes that picture.

Gates after the fixes: typecheck, lint (zero warnings) and test pass; 2362 tests across 6 workspaces. Playwright, from packages/web on its own port: 41 passed, 1 failed (the README replay picture above). Repaint medians at 300 graves: 0.60 to 6.70 ms against the 16 ms budget.

## Task 12

Checks, pictures and documents (12.1 and 12.2): `e2e/clean.spec.ts` runs every flow of spec clean-site at 1440 by 900 and 390 by 844, each case in a fresh browser context with the API answered in the page, and samples one View owner and one Pop-over at most, nothing over a grave's Art box but the allowed elements, no request off the page origin and the API base, and no AudioContext or audio element. Axe runs on every view. 300 graves repaint inside the budget. The two README pictures are retaken. README.md, CREDITS.md, docs/JUDGES.md, docs/requirements.md (version 1.1) and the steering files describe the site as built. The check found one defect in the site, fixed: at 390 px the Legend ran 32 px past the left edge of the viewport.

Independent review before the commit. Verdict: not ready, for one defect, fixed before the commit:

1. web.md said the browser check samples the graves for covering elements "during every flow", while the check ran in only some of them. Fixed: the check now also runs with the example list open, with a Term open from the Inspector, with the Welcome bar and after the way back, and web.md and design.md name where it runs. A failure card replaces the graves, so nothing is sampled under it.

Notes:

1. The spec's header comment made the same "every flow" claim. Fixed with the change above. The axe case now ends with the same probe check as the others.
2. The way-back case's "no reload" check passed whenever the address was "/", after several page loads had reset its mark. Fixed: the mark is set after each address the case opens and checked before the next, with no fallback.
3. The 16.8 check counts one roving tab stop and does not press Tab to it; the arrows reach the rest. Left as it is; the unit Tab walk covers the press.
4. product.md said "a one-row header" with no qualifier. Fixed: one row from 700 px up.
5. JUDGES.md said the chips "show one state at a time"; in the graveyard a chip dims the rest. Fixed to say so.
6. The web.md rewrite had dropped four rules that still hold: readable without the legend, one glow per grave with the Glow stops, the colour-vision test file, and the replay's window end in the site footer. Restored.
7. The sticky header was always allowed over a grave in the cover check. Fixed: only while the page is scrolled.

Gates after the fixes: typecheck, lint (zero warnings) and test pass; 2362 tests across 6 workspaces. Playwright, from packages/web on its own port: 66 passed. Repaint medians at 300 graves at 1440 by 900: 1.20 ms at rest, 0.90 ms with a filter, 0.90 ms with the hover ring.

Open for the owner: README.md still has no sentence on the order of the graves, so two site sentences rest on README's "Each grave is one dependency. Its shape and colour show its state." alone: the Tour's first step, "Its shape tells you its health. The worst ones stand in the front row.", and the Legend's line, "Fix order: Possessed first, then Dead, Haunted, Restless. Then by advisory severity and reach." (design.md, Task 7, item 9).

## Task 13

A little mischief (13.1 to 13.4): `copy/mischief.ts` with the twelve Epitaph lines, the eleven Dry lines and the Scanning line of design C16; the Epitaph line under the name in the Inspector at the scan date; the Dry line at the top of every failure card and the unknown-replay card, hidden from assistive technology; the Scanning line under the scanning card's note; `drawGhost` lifted from drawGrave with the Scene's calls unchanged; `scene/GhostPicture.tsx`, the still Guide ghost in the Welcome bar and beside the Tour's step title; web.md and structure.md; the e2e checks; docs/cemetery.png retaken.

Independent review before the commit. Verdict: ready. No defect found: every line matches C16 character for character under the right key; the Guide ghost draws once with no timer or loop and sits in the page flow; no plain sentence, next step or button changed; drawGhost makes the same calls with the same sprite key and resolution; no existing draw case was edited and nothing in `scene/characters` changed; every changed test is listed with its reason; every path is in the lane.

Notes:

1. drawGhost reads the sprite resolution from the canvas transform. It equals the old product today; a caller that adds a non-uniform scale before drawGrave would cache the ghost at another resolution. Left as it is.
2. The Guide ghost reads the device pixel ratio when it renders; moved to a screen with another ratio without a re-render, it stays at the old resolution. Cosmetic.
3. `test/mischief.test.tsx` reads C16's tables from design.md, so a reformatted table fails the test even with the code right. Intended: 19.10 asks the shown lines to be C16's.
4. The 10-word check splits on single spaces; enough for the lines as written.
5. No unit test reads the alert's accessible name directly; the `aria-hidden` check on the Dry line covers it, and the Tour dialog is still named by its title alone.
6. The Legend case's settle check in `e2e/clean.spec.ts` compared its first sample with itself; it now needs two equal samples. It failed once in six repeat runs on the previous build too.

Gates: typecheck, lint (zero warnings) and test pass; 2372 tests across 6 workspaces. Playwright, from packages/web on its own port: 66 passed. Repaint medians at 300 graves at 1440 by 900: 1.30 ms at rest, 1.00 ms with a filter, 0.90 ms with the hover ring.

## Review against the spec

The built site was walked against spec clean-site at 1440 by 900 and 390 by 844, in a fresh profile. These were fixed: an earlier date made the Scene full size and pushed the Footer bar below the fold. The Drawer showed raw engine values. Evidence labels and List badges broke inside words. A fast move from a grave to a Term opened the old package's Term. The scan tag named a repository before its scan was in, and kept it after a failure. The page emptied while a scan loaded or failed. "Scanning is off in this build." covered the Welcome bar and the disabled Scan button looked pressable. The History dots were one grey. Four differences are kept, each with its reason, in design.md ("Review against this spec").

Independent review before the commit. First verdict: not ready, one defect. The tag shown during a load or a failure came from the last finished load of any kind, so after a Replay, a failed Live scan showed "Replay" over the Sample scan's page. Fixed: the tag is kept with the Home scan it belongs to, and a Replay always reads "Replay". A new unit test covers Replay, then a failed scan, and fails on the first version.

Notes:

1. The last shown scan is recorded in a ref during render. The write is idempotent, so a render React drops does no harm. Left as it is.
2. A non-Live load (the Sample scan again, a scan file) shows the loading card over the dimmed old Scene for the time of that load. It is recorded in design.md with the cards that 3.15 allows over a grave.
3. The reserve takes the notes' height off the Footer bar. That holds while the scrubber is the tallest item in the bar's row, which it is at every size the checks use.
4. The Evidence words are short, like the Inspector's: more than three maintainers read "and N more", and advisories read as a count with the worst severity. The full values stay in Evidence JSON and in the copied issue text. Recorded in design.md.
5. design.md had named "call 17" with no anchor. Reworded to name the list it is in.
6. tasks.md had no task for this work. Added task 14 with its requirements.
7. The review checked the lane, secrets, network in tests and the CSS weights, and found nothing.

Gates: typecheck, lint (zero warnings) and test pass. 2381 tests across 6 workspaces. Playwright, from packages/web on its own port: 68 passed. Repaint medians at 300 graves at 1440 by 900: 1.40 ms at rest, 0.90 ms with the Dead filter, 0.90 ms with the hover ring.

## Owner decisions and cold look

Task 15: the README sentence on the order of the graves with the Claim registry resting on it, two Epitaph lines, and one height per layout for the Inspector, the Fix order card and the Step panel so that pointing at or selecting a grave, a List row or a Replay Step moves no box.

Independent review before the commits. Verdict: ready. No defect found: every changed file is in the lane, no new dependency, no network in the tests, the README sentence matches the Claim word for word and the order it states matches the triage order (State, then severity, then reach), and the Epitaph lines match C16.

Notes:

1. Requirement 3.26 joined two behaviours in one criterion, the second with no subject. Split: 3.26 keeps the boxes still, 3.27 (IF ... THEN) ends a long line in an ellipsis with its whole text kept.
2. A cut box's `title` is a native tooltip. It sits on Panel text, never over a grave, and shows only on text that is cut; recorded in design.md.
3. A one-line box of fixed width would not resize when the fonts arrive, so its title could be stale. `Clamped` now checks again once the fonts have loaded.
4. The cards cut what passes their height. Every line that follows the grave or the Step is clamped, so the buttons are never cut; the heights were checked with every line overfilled.
5. `.signals b` keeps `overflow-wrap: anywhere` beside `white-space: nowrap`; harmless, and it applies in the Narrow layout where the value wraps.
6. The Legend's Restless meaning says "no release in two years". It is a Claim, outside the two Epitaph lines the owner changed; left as it is.
7. The Replay e2e case waits 100 ms after each Step before reading the boxes; the boxes were the same across repeat runs.
8. The task 15 requirement list was checked: 3.5 (the Panel does not move), 17.5 (Claims from the registry) and 19.10 (the C16 texts) apply.

Gates: typecheck, lint (zero warnings) and test pass, 2386 tests across 6 workspaces. Playwright, from packages/web on its own port: 72 passed, the four new cases among them, each failing on the build before the change. Repaint medians at 300 graves at 1440 by 900: 2.55 ms at rest, 1.60 ms with the Dead filter, 1.60 ms with the hover ring.

## Naming the site's look

The spec, the steering and the web package now name the site's look in plain words everywhere, and the review steps say that their results go in design.md. Only words changed: comments, prose, one describe title in `test/home.test.tsx` and one test title in `e2e/clean.spec.ts`, with the same assertions. The JavaScript uses such as `Object.prototype` and `HTMLElement.prototype` and the lint ignore entry for the private folder stay.

Independent review before the commit. Verdict: ready. No defect found: no code or assertion changed, no doubled phrase, and no added line names a private path or document.

Notes:

1. Five lines of this file used the old word for the same design, one of them pointing at a design.md section by its old name. Reworded with the rest.
2. design.md's review protocol said "Before the report"; it now says "After the last task", which matches task 12.3.

Gates: typecheck, lint (zero warnings) and test pass, 2386 tests across 6 workspaces. Playwright, from packages/web on its own port: 72 passed. Repaint medians at 300 graves at 1440 by 900: 2.40 ms at rest, 1.70 ms with the Dead filter, 1.65 ms with the hover ring.

## Ghost Party in the music slot

Task 16: the owner confirmed Ghost Party by The Piano Says (CC BY 3.0). The MP3 ships under public/music, `TRACK` holds it at 110 BPM with its four credit lines, the Music button shows and starts off, and the build CSP gains `media-src 'self'`. The site footer, README.md and CREDITS.md carry the credit word for word. With the fourth button the phone header had wrapped to three rows at 390 px; the buttons are now 8 px in and "What is Sexton?" drops its decorative glyph under 700 px, so the header is one row plus the Scan field again.

Independent review before the commit. Verdict: ready. No defect found: the four credit lines match byte for byte in all three places, only https addresses become links, the beat reaches the Characters only while Music is on and motion is allowed, the probes for no AudioContext and no audio element still hold in every flow that does not press Music, and the new case stubs play and pause so no sound plays.

Notes:

1. design.md and web.md said the credit sat below the fold at 1440 by 900; the first two lines show at the foot of the viewport. Reworded.
2. `creditParts` would take a trailing "." or ")" into a link if a future credit had one right after an address. The four lines have none; left as it is.
3. The MP3 is served with `Cache-Control: no-cache` from the default behaviour, so a browser revalidates it (a 304, not a new download) on a later visit. Acceptable; no infra change.
4. The reason-family property found a blank maintainer name giving an empty Inspector value; fixed in `pick-signals.ts` with one assertion, recorded in design.md.
5. Under heavy machine load the three Part box property tests ran past their 20 s timeout in two gate runs; they pass alone and in a full run at normal load. Nothing in this change touches them.

Infra, read only: the CloudFront header CSP is `default-src 'self'` with no media-src, so same-origin media is allowed; an unhashed path such as /music/ghost-party.mp3 takes the default behaviour with `Cache-Control: no-cache` (Property 1 of the cache-header tests). The web deployment is a CDK BucketDeployment of the whole dist folder with no size cap or file-type list, and no deploy script lists types or sizes. No infra change is needed.

Gates: typecheck, lint (zero warnings) and test pass, 2388 tests across 6 workspaces. Playwright, from packages/web on its own port: 73 passed. Repaint medians at 300 graves at 1440 by 900: 2.35 ms at rest, 1.60 ms with the Dead filter, 1.65 ms with the hover ring. The production build holds dist/music/ghost-party.mp3 at 4,884,945 bytes.
