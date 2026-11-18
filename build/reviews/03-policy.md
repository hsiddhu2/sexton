# Review: 03 policy

Branch spec/policy, merged to main at 0d7bf9f. Reviewed against .kiro/specs/policy and docs/requirements.md R-PO-1 to R-PO-6, N-7, N-8.

## Verdict

Ready. All 52 tasks complete. Typecheck and lint clean, 402 tests in 32 files, seventeen correctness properties with no counterexamples. Sexton's own policy scan passes on main.

## Defects found and fixed before merge

1. matchPackagePatterns were regular expressions compiled from policy files, which arrive from untrusted public repositories on the hosted demo. A short pattern such as (a+)+$ backtracks catastrophically. Fixed at design review: patterns are globs compiled to a token list and matched by a linear state-set walk. No regular expression is built from a pattern anywhere in src/policy.
2. parsePolicy ignored the schema validator's boolean and accepted a policy whenever no error was mapped, which fails open if a future ajv error is dropped by the mapper. Fixed with a fail-closed guard, requirement 2.26.
3. The published JSON Schema was looser than parsePolicy on the pattern character set and the "*" wildcard rule. Fixed so other tools reading the schema agree with Sexton.
4. Requirements 2.6 and 2.8 both claimed a duplicate YAML key. Fixed: DUPLICATE_KEY wins.

## What the self-scan found

The first live scan of Sexton's own repository rated eslint 9.17.0 Dead (deprecated on npm) and vitest 2.1.8 Haunted (GHSA-9crc-q9x8-hgqq Critical, GHSA-5xrq-8626-4rwp Critical, GHSA-82fw-gwwq-j7x9 Moderate). eslint 9.39.5, the maintenance tag, is also deprecated because ESLint ended 9.x support. Fixed in commit 614ce5f: eslint 10.15.0, @eslint/js 10.0.1, typescript-eslint 8.72.2, vitest 4.1.12. Second scan: seven packages Alive, three rules pass. This is the demo's before and after.

## Dependencies added

yaml 2.9.1 (ISC) and ajv 8.20.0 (MIT), exact. ajv brings fast-deep-equal (MIT), fast-uri (BSD-3-Clause), json-schema-traverse (MIT), require-from-string (MIT). None has an install script. The install needed npm 11 because npm 10.9.9 crashed, the lockfile stays at version 3.

## Notes, not blockers

- The Haunted state is not forbidden by sexton.policy.yml, so a High advisory on a dev dependency passes the self-scan. Consider adding Haunted to forbid_state once a policy exception mechanism exists, or accept it for dev dependencies.
- fsevents 2.3.3 arrives through vitest with an install script that npm 11 did not run. It is an optional macOS watcher. Add it to the install-script allow list only if the scan ever flags it as direct, which it is not.
- The reviewer noted the dependency bumps sit outside the policy spec. They are in their own commit with the scan evidence in the body.
- The invalid-fixture test checks the first error code only, not its path.

## Cleanup list for before the repo goes public

- impl.md shell rules: confirm the destructive list and catch-all are ask, not allow, in the committed file.
- self-scan.out is gitignored, confirm it never appears in a commit.
- Spec 02 Glossary "Provenance regression" wording.
- Move mapWithConcurrency out of score.ts into a util file.
- The recorder script duplicates client URL builders.
