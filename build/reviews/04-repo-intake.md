# Review: 04 repo-intake

Branch spec/repo-intake, merged to main at b904e7b. Reviewed against .kiro/specs/repo-intake and docs/requirements.md R-IN-1 to R-IN-4, N-2.

## Verdict

Ready. All tasks complete. Typecheck and lint clean, 664 tests in 42 files, twenty-one correctness properties with no counterexamples. Recorded fixtures for expressjs/express (no lockfile, 28 dependencies and 16 devDependencies), chalk/chalk (no lockfile, 9 devDependencies) and lodash/lodash (lockfile v1, 27 devDependencies) verified against live GitHub on 19 Nov.

## Defects found and fixed before merge

1. Property 18 in github-raw.test.ts used a local regex that accepted an owner of "..", so it could not catch a regression in the URL validator. Fixed to use the real validators.
2. The intakeRepo form of property 18 rejected the accepted trailing-slash URL form. Fixed to decide validity with parseRepoUrl.
3. No lint rule enforced the untrusted-input requirement against eval. Added no-eval, no-new-func and no-implied-eval. Nothing flagged.
4. Requirement 1.5 did not say that the GitHub reserved path orgs is rejected. Added.

## Decisions recorded

- Patterns and names: npm legacy uppercase names are accepted. __proto__ fails validation by its leading underscore. constructor and prototype are ordinary names read by own-property access only.
- Unlocked resolution picks the greatest version satisfying the range from the cached packument, prereleases excluded unless the range has one. Unresolvable specifiers give the sentinel version "unresolved" and ten unavailable signals.
- A failed lockfile fetch other than 404 is fetch-failed, never silently unlocked.
- Manifests are capped at 5 MB and read through a new text(limitBytes) method on TransportResponse. Error messages never echo input.

## Notes, not blockers

- isValidOwner accepts orgs, only parseRepoUrl rejects it. A caller building a reference by hand gets a raw GitHub 404 instead of invalid-url.
- vitest testTimeout raised to 20 s because five property tests exceeded 5 s under machine load.
- The recorder now stores trimmed packuments for every express and chalk dependency, 53 files, so unlocked resolution runs offline in tests.
- yaml prints a warning about keys with collection values during the hostile-policy tests. Harmless, from the policy spec's hostile fixtures.
