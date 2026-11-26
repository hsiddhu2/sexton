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
7. design.md speaks of "the prototype" in words only, as the spec does throughout; no path or private document is named.

Gates after the fixes: typecheck, lint (zero warnings) and test pass; 2268 tests across 6 workspaces. The changed e2e specs pass locally but for five cases in `time.spec.ts` and two in `smoke.spec.ts` that fail the same way before this task and wait for task 12.
