# state-age-rule Bugfix Design
## Overview
`evaluateState` in `packages/engine/src/state.ts` treats age as a verdict. A last publish more than 24 months old gives Dead, and one 12 to 24 months old gives Restless. On a live scan of https://github.com/expressjs/express on 21 Nov 2026, 16 of 44 direct dependencies were Dead, most with only the reason "last publish more than 24 months ago" (depd 2.0.0, escape-html, vary, fresh, parseurl, once). They are small finished packages. They fail the default policy, and 15 got "no safe version" because nothing newer exists.
The fix makes age a weak signal and an advisory the strong one. Dead needs deprecation, or age together with at least one advisory of any severity. Age alone gives Restless. The 12 to 24 months rule is removed. The change is a rewrite of the Dead and Restless branches of one pure function, a constant rename, and a recompute of every file derived from states.
New rule, first match wins:
1. Possessed: unchanged.
2. Dead: the installed version is deprecated, or the last publish was more than 24 months ago and the installed version has at least one advisory of any severity, Unknown included. Reason for the second branch: "no release in 24 months and an open advisory".
3. Haunted: unchanged, an advisory of severity High or Critical.
4. Restless: the last publish was more than 24 months ago, reason "no release in 24 months"; or an advisory of severity Moderate or Low, reason unchanged.
5. Alive: none of the above.
When the advisories signal is unavailable, rule 2's second branch cannot fire, and age alone gives Restless. The all-signals-unavailable rule is unchanged and still gives Restless.
## Glossary
- **Bug_Condition (C)**: Input to `evaluateState` where no Possessed rule matches, `deprecated` is not true, the last publish is known, not in the future and more than 24 months before the reference time, and `advisories` is undefined or empty
- **Property (P)**: For those inputs the state is Restless with the reason "no release in 24 months", never Dead
- **Preservation**: Every rule that is not about age alone gives the same state and reason as before (Possessed, deprecated, High or Critical when not stale, Moderate or Low reason, all-unavailable, determinism, monotonic in age)
- **Stale**: The last publish is known, not later than the reference time, and strictly more than `STALE_AFTER_MONTHS` calendar months (UTC) before the reference time. This is the old Dead age test, `publishMs < monthsBefore(now, 24)`, unchanged
- **Open advisory**: At least one entry in the `advisories` array of an available signal, of any severity including Unknown
- **STALE_AFTER_MONTHS**: New name of `DEAD_AFTER_MONTHS`, value 24
- **Changed by design**: Inputs whose result changes because the 12 to 24 months rule is removed or the Dead reason text changes. They are not bug-condition inputs and are listed under Preservation
- **Oracle**: `packages/engine/test/support/health-scoring-oracle.ts`, a test-support copy of the state function without the Possessed rules, used by history-signals Property 12
## Bug Details
### Bug Condition
The bug manifests when a package is stale, is not deprecated, and has no advisory data to back the age. The branch `if (ageKnown && publishMs < deadBefore)` returns Dead with no look at the advisories.
**Formal Specification:**
```
FUNCTION isBugCondition(X)
  INPUT: X of type (StateInputs, now: Date)
  OUTPUT: boolean
  RETURN NOT possessedRuleMatches(X.inputs)
         AND X.inputs.deprecated IS NOT true
         AND ageKnown(X.inputs.lastPublish, X.now)
         AND X.inputs.lastPublish < monthsBefore(X.now, 24)
         AND (X.inputs.advisories IS undefined OR length(X.inputs.advisories) = 0)
END FUNCTION
```
`ageKnown` holds when `lastPublish` is a finite Date not later than `now`. `possessedRuleMatches` is the existing test of the three Possession inputs.
### Examples
- depd 2.0.0 (last publish 2018), not deprecated, advisories available and empty, at 2026-11-12. Expected: Restless, "no release in 24 months". Actual: Dead, "last publish more than 24 months ago".
- colors 1.4.0 in the recorded fixtures (last publish 2022-01-09, OSV returns no vulnerabilities). Expected: Restless, "no release in 24 months". Actual: Dead.
- The same depd-like input with `advisories` undefined (OSV down). Expected: Restless, "no release in 24 months". Actual: Dead.
- event-stream 3.3.6 in the recorded fixtures (last publish 2018-09-29, one Critical advisory). Not a bug. Expected: Dead, "no release in 24 months and an open advisory". Actual state is also Dead, only the reason text changes. Dead is ahead of Haunted.
- Edge, not a bug: last publish exactly 24 months before the reference time is not stale. Expected: Alive when nothing else matches. Actual: Restless, because the old 12 to 24 months rule matched. One millisecond older is stale.
- Edge, not a bug: last publish 18 months ago, no advisory. Expected: Alive. Actual: Restless. This is the removed 12 to 24 months rule.
## Expected Behavior
### Preservation Requirements
**Unchanged Behaviors:**
- Possessed rules and their reason texts, evaluated first
- Deprecated gives Dead with "installed version is deprecated"
- High or Critical on a package that is not stale gives Haunted with "advisory of severity High or Critical"
- Moderate or Low on a package that is not stale gives Restless with "advisory of severity Moderate or Low". Unknown alone gives Alive
- All three original signals unavailable, no Possessed rule, gives Restless with "all state signals unavailable"
- Determinism, and monotonic in age
- The default policy forbids Possessed and Dead. `sexton.policy.yml` keeps `max_age_months` 24
**Scope:**
Inputs outside the bug condition keep their state. Two groups change on purpose and are tested as examples, not as preservation:
- Last publish 12 to 24 months before the reference time (including exactly 24), not deprecated, no Possessed rule, no Moderate, Low, High or Critical advisory: Restless becomes Alive. This is the removed rule (requirement 2.4).
- Stale with at least one advisory: the state stays Dead, the reason becomes "no release in 24 months and an open advisory" (requirement 2.3). Stale with a High or Critical advisory also stays Dead, not Haunted, because Dead is ahead of Haunted.
### Monotonic in age: worked check
Health order from least healthy to most healthy: Possessed 0, Dead 1, Haunted 2, Restless 3, Alive 4. Hold deprecated, advisories and the possession inputs fixed and compare an older last publish (stale) with a younger one (not stale). Deprecated and Possessed do not depend on age, so both sides are equal. For a package that is neither:
- Stale with an advisory is Dead (1). Young with High is Haunted (2), young with Moderate or Low is Restless (3), young with Unknown only is Alive (4). Dead (1) is not healthier than any of them.
- Stale with advisories available and empty is Restless (3). Young with none is Alive (4). Restless is not healthier than Alive.
- Stale with advisories unavailable is Restless (3). Young with advisories unavailable is Alive (4). Same.
The cases cover the three values of the advisories input (non-empty, empty, unavailable), and the young side takes the rank of its own rules, which is 2, 3 or 4 in every case with the same advisories. The stale side is 1 or 3. Where the stale side is 3 there is no advisory, so the young side is Alive (4). Where it is 1, nothing is less healthy except Possessed, which both sides share. So `rank(older) <= rank(newer)` holds. The existing property tests assert this over 1000 runs. A last publish later than the reference time is not stale and is treated like a young one, so the argument holds for it too. Requirement R-ST-4 therefore needs no change.
## Hypothesized Root Cause
1. **Age used as a verdict**: `evaluateState` returns Dead from the age test alone, with no second condition. This is the confirmed cause. The branch is `if (ageKnown && publishMs < deadBefore)`.
2. **A second age band**: The branch `if (ageKnown && publishMs <= restlessBefore)` adds Restless for 12 to 24 months, which flags normal release gaps of finished packages.
3. **Order of rules**: Dead is ahead of Haunted, so any rule that puts age in Dead overrides an advisory ranking. The new Dead branch keeps that order on purpose, because a stale package with an advisory has no one to fix it.
4. **Requirement text, not just code**: R-ST-2 and requirement 11.3 and 11.5 of the health-scoring spec state the old rule. The code followed them. The text changes with the code.
## Correctness Properties
Property 1: Bug Condition - Age alone never gives Dead
_For any_ `StateInputs` and reference time where the bug condition holds (isBugCondition returns true), the fixed `evaluateState` SHALL return the state Restless with the reason "no release in 24 months", and SHALL NOT return Dead. This includes `advisories` undefined and `advisories` empty.
**Validates: Requirements 2.1, 2.2**
Property 2: Fix Checking - Stale with any advisory gives Dead
_For any_ `StateInputs` and reference time where no Possessed rule matches, `deprecated` is not true, the last publish is stale, and `advisories` holds at least one advisory of any severity (Unknown included), the fixed `evaluateState` SHALL return the state Dead with the reason "no release in 24 months and an open advisory".
**Validates: Requirements 2.3**
Property 3: Preservation - Possessed rules unchanged
_For any_ `StateInputs` and reference time where a Possessed rule matches, the fixed `evaluateState` SHALL return the state Possessed with the reason of the first matching Possessed rule, in the order maintainer change, provenance regression, install script, whatever the other signals are.
**Validates: Requirements 3.1**
Property 4: Preservation - Deprecated gives Dead
_For any_ `StateInputs` and reference time where no Possessed rule matches and `deprecated` is true, the fixed `evaluateState` SHALL return Dead with the reason "installed version is deprecated", whatever the last publish and advisories are.
**Validates: Requirements 3.2**
Property 5: Preservation - High or Critical on a package that is not stale gives Haunted
_For any_ `StateInputs` and reference time where no Possessed rule matches, `deprecated` is not true, the package is not stale, and `advisories` holds a High or Critical advisory, the fixed `evaluateState` SHALL return Haunted with the reason "advisory of severity High or Critical".
**Validates: Requirements 3.3**
Property 6: Preservation - Moderate or Low reason unchanged, Unknown alone gives Alive
_For any_ `StateInputs` and reference time where no Possessed rule matches, `deprecated` is not true, the package is not stale, and `advisories` holds a Moderate or Low advisory and no High or Critical one, the fixed `evaluateState` SHALL return Restless with the reason "advisory of severity Moderate or Low". When the advisories hold only Unknown severities the result SHALL be Alive with "no rule matched".
**Validates: Requirements 3.4**
Property 7: Preservation - All signals unavailable gives Restless
_For any_ reference time and any Possessed inputs that match no rule, where `lastPublish`, `deprecated` and `advisories` are all undefined, the fixed `evaluateState` SHALL return Restless with the reason "all state signals unavailable".
**Validates: Requirements 3.5**
Property 8: Preservation - Determinism
_For any_ `StateInputs` and reference time, evaluating twice on equal inputs and equal reference time SHALL return equal results.
**Validates: Requirements 3.6**
Property 9: Preservation - Monotonic in age
_For any_ `StateInputs`, reference time and two last-publish dates, the state for the older date SHALL have a health rank no greater than the state for the newer date, with every other input equal. The property holds for the three-signal inputs and for the ten-signal inputs.
**Validates: Requirements 3.7**
Property 10: Fix Checking - Age outside the stale test is not used
_For any_ `StateInputs` and reference time where no Possessed rule matches, `deprecated` is not true, and the package is not stale, the fixed `evaluateState` SHALL return the same result for every last-publish value that is not stale, including 12 to 24 months ago, exactly 24 months ago, null, undefined with another signal available, and a future date.
**Validates: Requirements 2.4**
## Fix Implementation
### Changes Required
**File**: `packages/engine/src/state.ts`
**Function**: `evaluateState`
**Specific Changes**:
1. **Rename the constant**: `export const STALE_AFTER_MONTHS = 24;` replaces `DEAD_AFTER_MONTHS`. Delete `RESTLESS_AFTER_MONTHS`.
2. **Replace the age branches**: compute `const staleBefore = monthsBefore(now, STALE_AFTER_MONTHS).getTime()`, `const stale = ageKnown && publishMs < staleBefore`, and `const hasAdvisory = hasAdvisories && advisories.length > 0`. Delete `restlessBefore`.
3. **New order after the all-unavailable shortcut**:
   - Dead if `deprecated === true`, reason "installed version is deprecated".
   - Dead if `stale && hasAdvisory`, reason `` `no release in ${STALE_AFTER_MONTHS} months and an open advisory` ``.
   - Haunted if a High or Critical advisory, reason unchanged.
   - Restless if `stale`, reason `` `no release in ${STALE_AFTER_MONTHS} months` ``.
   - Restless if a Moderate or Low advisory, reason unchanged.
   - Alive, "no rule matched".
4. **Comments**: the header says rules run Possessed, Dead, Haunted, Restless, Alive. The Dead comment cites requirement 11.3 as corrected by this spec.
**File**: `packages/engine/src/index.ts`
1. Line 19 exports `STALE_AFTER_MONTHS` in place of `DEAD_AFTER_MONTHS, RESTLESS_AFTER_MONTHS`. No other export name changes.
**File**: `packages/engine/test/support/health-scoring-oracle.ts`
1. Rename its own constant to `STALE_AFTER_MONTHS` and delete `RESTLESS_AFTER_MONTHS`.
2. Rewrite the Dead, Haunted, Restless and Alive branches as a hand-written statement of the new rule, not a pasted copy of `state.ts`. Reasons are literal strings. The header comment changes from "FROZEN ... must never change" to say that the oracle follows the state rules without the Possessed rules, and that it was rewritten for this spec because the rule it mirrors changed.
### Importers of the removed constants
Found with `grep -rnE "DEAD_AFTER_MONTHS|RESTLESS_AFTER_MONTHS"` over the repository, excluding `node_modules`, `.git`, `dist` and `cdk.out`:
- `packages/engine/src/state.ts`: defines both, uses both.
- `packages/engine/src/index.ts` line 19: re-exports both from `./state.js`. It is the only importer of `state.ts` constants.
- `packages/engine/test/support/health-scoring-oracle.ts`: declares its own `DEAD_AFTER_MONTHS` and `RESTLESS_AFTER_MONTHS` (lines 8 and 9) and uses them on lines 50, 51, 60 and 70. It imports neither from `src`.
- `private/handoffs/K1-state-age-rule-kiro.md` and `private/handoffs/13-state-age-rule.md`: prose only, ignored by git, not edited.
No file in `packages/api`, `packages/cli`, `packages/web`, `packages/action`, `infra` or `scripts` uses either name. `test/index.test.ts` does not list them. The typecheck gate confirms no importer was missed.
### Policy
The default policy stays `forbid_state` for Possessed and Dead. `sexton.policy.yml` keeps `max_age_months` 24. That rule still flags stale packages, so this repository's own scan can still fail on a package that is Restless by age. That is a policy choice a repository makes on purpose, not a state. No policy code changes.
### Fixtures and derived files
Fixtures follow recorded data. Nothing is re-recorded and no test uses the network.
- `packages/engine/test/fixtures/expected-states.json`: recompute from the recorded fixtures through the fixture scan. Expected changes: colors Dead to Restless, reason "no release in 24 months"; event-stream stays Dead, reason "no release in 24 months and an open advisory". The other nine entries keep state and reason. Check each by hand against the recorded packuments and OSV files, since the file is the hand-checked baseline.
- `npm run demo:generate -w @sexton/api`: rewrites `packages/web/public/demo/scan.json`, `evidence.json` and `evidence.md`. colors loses its remove plan. The remediation list is one plan per Haunted, Dead or Possessed package, so it shrinks by one.
- Golden evidence: `SEXTON_WRITE_GOLDEN=1 npx vitest run test/evidence/golden.test.ts` from `packages/engine` rewrites `test/fixtures/evidence/expected-pack.json` and `expected-report.md`. The integrity digest changes. Check the diff by hand and update the notes in `test/fixtures/evidence/README.md` (six Dead packages become five, the table order, the digest prefix).
- Policy fixtures: `test/fixtures/policy/expected-default.json` and `expected-valid-full.json` have no write switch. Edit them by hand. colors drops out of the failing Dead list and event-stream changes reason, and the `max_age_months` failures in `expected-valid-full.json` stay.
- `packages/web/dist-e2e/demo/*` is build output and is not edited by hand.
A package that leaves Dead or Haunted loses its remediation plan. That is intended.
### Text to update
- README state table (lines 27 to 32).
- `docs/requirements.md`: R-ST-2, the version header to 0.3 with date 21 Nov 2026, and the change log line "0.3, 21 Nov 2026. R-ST-2: age alone gives Restless, Dead needs deprecation or age with an open advisory." R-ST-4 is unchanged.
- `.kiro/specs/health-scoring/requirements.md`: a Correction section at the end, titled "Correction, 21 Nov 2026 (spec state-age-rule)". It quotes the old text of criteria 11.3 and 11.5, gives the new text, and says criteria 11.2, 11.10 and requirement 13 still hold. The old criteria are not edited, so the original text stays.
- `.kiro/steering/product.md`, the States section.
- `build/infra/10-deploy.md`, smoke check 12. The command prints the plan count, whether any plan is a remove, and whether every plan is for a package whose state is Haunted, Dead or Possessed. The pass condition becomes: a number 0 or above, then `false`, then `true`, meaning every plan is for a Haunted, Dead or Possessed package. The fixed count goes, because the count moves with the registry.
`docs/architecture.md` and the web legend do not state the old rule and are not edited.
### Prior art
- Socket's Unmaintained alert is Low severity and fires when a package has not been updated for more than 5 years: https://docs.socket.dev/docs/maintenance
- Socket does not use time since the last update as the trigger for a generic abandoned alert. Update frequency varies widely, and a package may have no new features to add because it has reached a mature state: https://socket.dev/blog/how-to-safeguard-against-the-dangers-of-abandoned-npm-packages
Both statements are paraphrased. Sexton keeps a 24 month line, shorter than Socket's, and lets it raise only Restless unless an advisory backs it.
### Exploration test approach
New file `packages/engine/test/state-age-rule.test.ts`. It imports `evaluateState` from `../src/state.js` and fast-check. The property is scoped to the bug condition: a fast-check arbitrary draws a last publish more than 24 months before a fixed reference time `2026-11-12T00:00:00Z`, with `deprecated` false or undefined and `advisories` either `[]` or undefined, and no possession inputs. It asserts the state is not Dead and equals `{ state: "Restless", stateReason: "no release in 24 months" }`. One concrete example, depd-like, is kept as its own case: `lastPublish` 2018-10-01, `deprecated` false, `advisories` `[]`. On the unfixed code it fails with `Dead` and "last publish more than 24 months ago". Record that counterexample in the task notes. This file stays after the fix as the regression test for Properties 1 and 2.
## Testing Strategy
### Validation Approach
First show the bug on unfixed code with the exploration test. Then apply the fix, add the preservation properties, and rerun the exploration test. Then recompute the derived files and check each diff by hand. No network access in any test.
### Exploratory Bug Condition Checking
**Goal**: Show Dead from age alone on unfixed code and confirm the root cause.
**Test Plan**: Write `test/state-age-rule.test.ts` and run `npm test -w @sexton/engine -- state-age-rule` on the unfixed `state.ts`.
**Test Cases**:
1. **depd-like, advisories empty**: 2018 last publish, not deprecated, `advisories` `[]` (will fail on unfixed code)
2. **depd-like, advisories unavailable**: same with `advisories` undefined (will fail on unfixed code)
3. **Scoped property**: any last publish more than 24 months old under the bug condition (will fail on unfixed code)
4. **Stale with an advisory**: Dead on both unfixed and fixed code, so it passes before the fix on the state and fails on the reason text (reason assertion only fails on unfixed code)
**Expected Counterexamples**:
- `{ state: "Dead", stateReason: "last publish more than 24 months ago" }` for the depd-like input
- If the depd-like input already gives Restless, the root cause is refuted and the input shape is rechecked before going on
### Fix Checking
**Goal**: For every input where the bug condition holds, the fixed function gives Restless with the new reason, and stale with an advisory gives Dead with the new reason.
**Pseudocode:**
```
FOR ALL X WHERE isBugCondition(X) DO
  r := evaluateState_fixed(X.inputs, X.now)
  ASSERT r.state = "Restless" AND r.stateReason = "no release in 24 months"
END FOR
FOR ALL X WHERE NOT possessedRuleMatches(X.inputs) AND X.inputs.deprecated IS NOT true
          AND stale(X) AND length(X.inputs.advisories) >= 1 DO
  r := evaluateState_fixed(X.inputs, X.now)
  ASSERT r.state = "Dead" AND r.stateReason = "no release in 24 months and an open advisory"
END FOR
```
### Preservation Checking
**Goal**: For every input outside the bug condition and outside the two changed-by-design groups, the state and reason are the same as before.
**Pseudocode:**
```
FOR ALL X WHERE NOT isBugCondition(X) AND NOT changedByDesign(X) DO
  ASSERT evaluateState_original(X) = evaluateState_fixed(X)
END FOR
```
**Testing Approach**: Properties 3 to 9 state each unchanged rule as an explicit predicate and expected result, so they do not depend on the old function. Each one draws inputs only from its own domain, and every such domain excludes the bug condition and the changed-by-design groups, so each passes on the old rule too. Because the requested task order puts the fix before these tests, the old-rule check is done by reading the old branches described under Bug Details and Hypothesized Root Cause, not by running the unfixed code. Where an existing property already covers an item (determinism, one state, monotonic in age, Property 12 equivalence against the oracle), it is kept and must pass on the new rule.
`numRuns` follows the existing tests. `test/state.test.ts` uses 1000 for its three property tests, and `test/state-possessed.test.ts` uses 1000 for Possessed Property 2, its corner case and Property 12, and 100 for Possessed Properties 1 and 3. The new properties go in `test/state-age-rule.test.ts`, each with `numRuns` 1000, because the state function guards a policy gate. The existing 100-run monotonic property over ten signals stays at 100 unless it is touched, in which case it goes to 1000.
**Test Cases**:
1. **Possessed first**: any Possessed trigger with stale, deprecated and advisories in any combination gives Possessed (Property 3)
2. **Deprecated**: deprecated true with any age and advisories gives Dead with the old reason (Property 4)
3. **Haunted**: High or Critical, not stale, gives Haunted (Property 5)
4. **Moderate or Low, Unknown**: reason unchanged, Unknown alone gives Alive (Property 6)
5. **All unavailable**: Restless "all state signals unavailable" (Property 7)
6. **Determinism and monotonic**: existing properties pass (Properties 8 and 9)
### Unit Tests
- `test/state-age-rule.test.ts`: the depd-like example, the stale boundary (exactly 24 months is Alive, one millisecond older is Restless, and Dead with an advisory), stale with Unknown-only advisory gives Dead, stale with High gives Dead and not Haunted, stale with advisories unavailable gives Restless
- `test/state.test.ts`, edited only where it asserts the old rule: see the list below
- Recompute checks: `test/fixture-scan.test.ts`, `test/evidence/golden.test.ts`, `test/policy/fixtures.test.ts` pass against the new files
**Existing tests expected to change** (each only where it pins the old age rule or a count that follows from it):
- `packages/engine/test/state.test.ts`: "publish older than 24 months gives Dead" (Restless now), "publish between 12 and 24 months gives Restless" (Alive now), "exactly 12 months ago gives Restless, one millisecond newer gives Alive" (both Alive), "exactly 24 months ago gives Restless, one millisecond older gives Dead" (Alive and Restless now), and the `stateFromSignals` mapping case with last publish 2024-01-01 and no advisories (Restless now)
- `packages/engine/test/score.test.ts`: the "old" package, last publish 2020, no advisories (Restless now)
- `packages/engine/test/fixtures/expected-states.json`, read by `fixture-scan.test.ts` and `packages/api/test/generate-demo-scan.test.ts`
- `packages/engine/test/fixtures/evidence/expected-pack.json` and `expected-report.md`, read by `golden.test.ts`
- `packages/engine/test/fixtures/policy/expected-default.json` and `expected-valid-full.json`, read by `policy/fixtures.test.ts`
- `packages/cli/test/commands.test.ts`: the expectation that colors gets a remove plan (no plan now). The row-one regex on line 18 still matches event-stream and is left alone
- `packages/web/test/triage.test.ts`: the demo scan order, where colors moves from the Dead group to the Restless group, after express and moment and ahead of Alive
- `packages/engine/test/support/health-scoring-oracle.ts`: rewritten, so `state-possessed.test.ts` Property 12 now compares against the new rule
No test in `test/policy/` asserts the 12 to 24 months Restless rule. `test/policy/rules/max-age-months.test.ts` tests the `max_age_months` policy rule, which is separate from states.
### Property-Based Tests
- Properties 1 and 2 over arbitraries built on `dateArb` and `advisoriesArb` from `test/arbitraries.ts`, `numRuns` 1000
- Properties 3 to 10 as above, `numRuns` 1000
- The monotonic worked check above is covered by Property 9 on both the three-signal and ten-signal inputs
### Integration Tests
- `npm run demo:generate -w @sexton/api` followed by the api, web and cli tests that read the demo files
- Root `npm run typecheck`, `npm run lint` and `npm test` pass
- A run of the built CLI against https://github.com/expressjs/express, run by the orchestrator because it needs the network. The state counts and every Dead package with its reason go to `build/kiro-reports/13-state-age-rule.md`. `build/*` is git-ignored, so the report is not committed
- No deploy. The change goes live with the next deploy
