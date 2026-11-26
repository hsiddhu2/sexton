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

