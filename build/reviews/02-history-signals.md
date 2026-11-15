# Review: 02 history-signals

Branch spec/history-signals, merged to main at a762c2e. Reviewed against .kiro/specs/history-signals and docs/requirements.md R-SG-4, R-SG-5, R-SG-6, R-SN-1 to R-SN-3, R-ST-2.

## Verdict

Ready. All 47 tasks complete. Typecheck and lint clean, 252 tests in 18 files, twelve correctness properties with no counterexamples. Spec 01 behaviour unchanged, proven by property 12 against a frozen copy of the previous state function.

## Defects found and fixed before merge

1. Recorded packuments dropped the maintainers field, so every maintainers signal was an empty list. The recorder now keeps maintainers as name only. Found at the 8.4 hand review.
2. With no SnapshotStore injected, maintainerChange and provenanceRegression were unavailable with reason "no snapshot store" and appeared in missingSignals on every CLI scan. Fixed to evaluate as empty history, available and History-insufficient. Requirement 10.13 added.
3. Requirement 3 defined transitive reach as direct dependents only. Fixed at requirements review to follow any path, per R-SG-6.
4. Requirements 7 and 8 looked only at the installed version. Fixed to any earlier version with provenance and any version published in the last 90 days, per R-SG-5 and R-ST-2.
5. The impl agent had a catch-all deny that blocked every allowed command. Kiro evaluates deny over allow regardless of order. Replaced with ask.

## Fixture scan results

All ten reference packages keep their spec 01 states. No package is Possessed. Transitive reach: lodash 4, uuid 2, request 1, others 0, graphsMissing 1 because event-stream 3.3.6 is unpublished and deps.dev returns 404. Every attestation lookup returned 404, which is correct for these versions. The seed fixture produces Possessed from maintainer change, provenance regression and new install script together.

## Notes, not blockers

- Provenance present is covered only by synthetic tests. Add one package that publishes with provenance to the fixtures in spec 07.
- snapshotter.ts imports mapWithConcurrency from score.ts. Move it to a util file when score.ts is next touched.
- The recorder script repeats the client URL builders because a .mjs script cannot import TypeScript. Keep them in sync by hand or build the recorder from dist later.
- Glossary "Provenance regression" still says strictly earlier publish time while the code uses the version order tie rule. Wording only.
- The two-phase scoring means transitiveReach is unavailable for a direct scoreOne call without a reach phase. Only tests call scoreOne directly.
- The engine tests passed in a Linux VM while failing on macOS until the darwin rollup binary was installed. CI in spec 09 runs both platforms.

## Process notes

Requirements took three review passes, two more than needed. From spec 03, one pass for contradictions with docs/requirements.md, wording goes to design. The security reviewer now blocks on code defects only and runs once per top-level task.
