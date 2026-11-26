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
