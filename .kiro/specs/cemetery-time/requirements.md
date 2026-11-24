# Requirements Document

## Introduction

The cemetery-time module shows time in the Sexton cemetery and fixes seven problems carried from the cemetery-polish review. It has four parts.

Part A fixes seven items found after cemetery-polish: grass that reads as rain, dead space under the scene, a header chip that touches the repository address, a tooltip that flashes after the drawer closes, a requirement text that the build contradicts, a lint ignore list that misses `build/`, and property tests that time out under full-suite load. Each item is confirmed in the code and in `docs/cemetery.png` in design.md section "Part A confirmation" before its requirement was written.

Part B adds a history scrubber. It answers one question: what would Sexton have said about the versions installed now, on an earlier date. It recomputes the state of every grave as of a chosen date from dated facts that the registry and OSV already give. It does not read the snapshot store.

Part C adds a pull request burial. After a pull request is opened for a package, the grave plays a short burial and then shows a marker that a pull request was opened. The animation never changes a state.

Part D adds an incident replay. Two incidents, the axios compromise of 31 March 2026 and the keyv compromise of 4 August 2026, are reconstructed from public reports and played through the scrubber. Every replay screen says so.

This spec traces to R-UI-1 to R-UI-7 of docs/requirements.md section 5.8. It keeps R-UI-2, R-UI-3, R-UI-6 and R-UI-7 intact, amends R-UI-1 (two new forms) and R-UI-4 (the drawer states the scan date), and adds change-log line 0.4. It changes no state rule, no policy rule and no field of the evidence pack.

Out of scope, each going to a later spec: the publisher-changed signal, the new-dependency signal, and any change under `infra`. Section "Infra needed (not designed)" in design.md records what the hosted site would need beyond the current infrastructure. It holds no design.

This spec does NOT add a runtime dependency, a web font, an image file, an audio file or an external request at run time. It changes no `package.json` and no `package-lock.json`. It changes only `packages/engine`, `packages/api`, `packages/web`, `eslint.config.js`, `README.md`, `docs/cemetery.png`, `docs/requirements.md`, `.kiro/steering` and a Correction section in `.kiro/specs/cemetery-polish/requirements.md`. Every deliberate change to an existing test is listed in design.md under "Deliberate test changes".

## Glossary

- **Web app**: the `@sexton/web` package.
- **Engine**: the `@sexton/engine` package.
- **API**: the `@sexton/api` package. Web imports only types from it.
- **Scan date**: `report.generatedAt` of a scan response. The date the scan was made.
- **Scenery**: the canvas decoration drawn before the graves. It carries no meaning and depends on the layout width only.
- **Tile**: a band of the ground, 224 CSS pixels high, that starts at the horizon (y = 80) and repeats downward. Tile `t` covers y from `80 + 224 * t` to `80 + 224 * (t + 1)`. Grave row `r` has its Cell in Tile `r` at Tile-relative y 16 to 240.
- **Row line**: the ground line under grave row `r`. It lies in Tile `r + 1` at Tile-relative y 0 to 16, so below the Plinth and the Shadow of row `r`.
- **Tuft**: three short blades that grow from one base point and lean. A blade is made of two `fillRect` rectangles, 1 CSS pixel wide, the upper one shifted by the lean.
- **Tuft cluster**: three Tufts placed within 24 CSS pixels of one centre.
- **Bottom line**: one extra row of Tuft clusters drawn 10 CSS pixels above the bottom of the painted ground.
- **Ground height**: the height of the painted canvas. It is the layout height, or the free height of the viewport under the header when that is larger.
- **Layout height**: `80 + 16 + rows * 224 + 16`, as in cemetery-theme.
- **Dated fact**: a fact about a package with an instant that the registry or OSV gives: a version publish time, an install script flag of a version, a provenance flag of a version, a maintainer list of a version, an advisory published time. The instant is the publish time of the version for the first four.
- **Undated fact**: a fact without an instant: the deprecated flag, advisories without a published time, and every fact that comes from the snapshot store.
- **Timeline facts**: the Engine-internal input of `buildTimeline`. It holds the installed version, the Timeline versions, `coveredFrom` and the dated advisory list. It is not part of the scan response.
- **Timeline version**: one entry of the Timeline facts: version, publish time or null, install script flag or null, provenance flag or null, maintainer list or null. A null flag means unknown, not false.
- **Version order**: the order of the Timeline versions: publish time ascending, an undated entry between its dated neighbours.
- **Segment**: one piece of a Timeline: `{ from, state, reason, ghost, version? }`. The Form is constant from `from` until the `from` of the next Segment. `state` is one of the five States or null for the Not-published form. `version` is optional, a string of at most 100 characters, the version that is shown for the package during the Segment. Only the replay generator sets it.
- **Resolved version**: the version that a fresh `npm install` of the package resolves to at an instant, given the versions that exist at that instant. A Replay follows the resolved version through its window, so its Segments carry it as `version`.
- **Replay window**: the span of a Replay from its first Segment `from` to its Scan date. The first `from` is one hour before the first publish instant that the sources give.
- **Timeline**: the compact record in a scan response of the Forms of one package over time. Type `PackageTimeline`: the installed version, `coveredFrom` and the Segments. It holds no raw facts.
- **Seen time**: the instant from which a Timeline version counts as known. It is the publish time of the version. For an entry with no publish time it is the publish time of the next dated entry in Version order, and when there is none it is the Scan date. An advisory is seen from its published time.
- **As-of date**: the instant the scrubber has chosen. It is never later than the Scan date.
- **Form**: what a grave shows at an As-of date: one State or the Not-published form, and whether it has a Ghost.
- **Not-published form**: the form of a grave whose installed version has a Seen time later than the As-of date. It is drawn as an unmarked mound.
- **State as of**: the pure Engine function `stateAsOf`. It returns the Form of one package at an As-of date from its Timeline facts, with the list of unavailable facts.
- **Stop**: one position of the scrubber. The Stops are the scrubber start, every Step mark and the Scan date, in time order.
- **Step mark**: an instant at which the Form of at least one package differs from its Form one millisecond earlier. It is the `from` of a Segment.
- **Scrubber start**: the earliest Segment `from` of any Timeline minus one hour. The hour lets a viewer see the Not-published form of a package whose installed version is its earliest fact.
- **Pull request marker**: a small pennant planted beside a grave that says Sexton logged a pull request for the package. It is not a Ghost and does not change the grave form.
- **Burial**: the animation of 1,200 ms in which a grave sinks into the ground, a mound closes over it, and the grave returns.
- **Replay**: a scan response reconstructed from public reports, with a `replay` block. Ids: `axios` and `keyv`.
- **Replay banner**: the text "Reconstructed from public reports. Not a live scan." with the source links of the Replay.
- **Reduced motion**: the state in which the `prefers-reduced-motion: reduce` media query matches.
- **Deliberate test change**: a change to an existing test that is listed in design.md under "Deliberate test changes" because the test pins a value this spec changes on purpose.

## Requirements

### Requirement 1: Grass as short tufts along the ground lines

**User Story:** As a viewer, I want grass that looks like grass, so that the ground does not read as rain.

**Traces to:** Part A item A1; R-UI-1

#### Acceptance Criteria

1. THE Web app SHALL include in the Scenery a Tuft list computed from the layout width and the Seed only, holding `3 * floor(width / 96)` Tufts in clusters of three, where each Tuft has a Tile-relative base y from 8 to 16, a height of 4 to 8 CSS pixels, a lean direction of -1 or 1, and a tone of `dark` or `light`.
2. FOR ANY layout width of at least 224, THE Web app SHALL place every blade rectangle inside x from 0 to `width - 1` and inside the Tile-relative y range 0 to 16 (invariant, so that no tuft lies outside the ground line band).
3. WHEN the painter draws a Scene plan, THE Web app SHALL draw the Tuft list once for each Row line, that is for Tile 1 to Tile `rows`, and once for the Bottom line, and SHALL draw each blade of a Tuft with two `fillRect` calls 1 CSS pixel wide in `grassDark` for tone `dark` and in `grassLight` for tone `light`.
4. THE Web app SHALL draw the Tufts after the fog band and before every Grave, and SHALL draw no Tuft above y = 80 (invariant, never in the sky).
5. FOR ANY layout width, THE Web app SHALL return deeply equal Tuft lists from two calls, and SHALL return the same list for any two lists of Packages, any two Ghost phases and any two Ground heights (invariant, the Scenery depends on the width only).
6. FOR 300 Packages at a viewport of 1280 by 800 in the end-to-end build, THE Web app SHALL repaint the full scene with a median of 30 timed repaints of at most 16 ms.
7. THE Web app SHALL draw at most 12,000 grass `fillRect` calls for 300 Packages at width 1280, and at most 13,000 for 300 Packages at width 224.

### Requirement 2: The ground reaches the bottom of the viewport

**User Story:** As a viewer on a large screen, I want the cemetery ground to fill the page, so that the scene does not end in a flat dark block.

**Traces to:** Part A item A2; R-UI-1

#### Acceptance Criteria

1. WHEN the Layout height is smaller than the free height of the viewport under the header, THE Web app SHALL paint the canvas at the free height, so that the Ground height equals the free height.
2. WHEN the Layout height is at least the free height of the viewport, THE Web app SHALL paint the canvas at the Layout height.
3. THE Web app SHALL draw the ground gradient, the fog band and the Bottom line over the whole Ground height, and SHALL draw no Grave and no grave button outside the Layout height.
4. THE Web app SHALL keep the layout formulas of cemetery-theme requirement 2 unchanged: columns, rows, Layout height and Cell positions.
5. IF the free height of the viewport cannot be read, THEN THE Web app SHALL paint the canvas at the Layout height.

### Requirement 3: A gap between the repository address and the demo label

**User Story:** As a reviewer, I want the repository address and the "demo fixture, recorded data" chip apart, so that I can read both.

**Traces to:** Part A item A3; R-UI-5

#### Acceptance Criteria

1. THE Web app SHALL separate the repository text and the demo label of the Header bar by a gap of at least 8 CSS pixels at every viewport width from 360 to 1920 (checked in a real browser by measuring the two bounding rectangles).
2. WHEN the repository text is longer than the line, THE Web app SHALL break it at any character and SHALL keep the gap between it and the demo label (checked at 360 CSS pixels).
3. THE Web app SHALL keep the texts and the element classes that cemetery-ui and cemetery-polish require for the repository text and the demo label.

### Requirement 4: No tooltip after the drawer closes

**User Story:** As a keyboard or mouse user, I want the tooltip to stay away after I close the drawer, so that it does not flash over a grave I did not point at.

**Traces to:** Part A item A4; R-UI-4, R-UI-7

#### Acceptance Criteria

1. WHEN the drawer opens, THE Web app SHALL reset the tooltip state to hidden.
2. WHILE the drawer is closed after having been open, THE Web app SHALL show no Evidence tooltip until the pointer moves to a new position over a grave button or a grave button receives focus from a key press (Tab, Shift+Tab or an arrow key).
3. WHEN the drawer closes and focus returns to the grave that opened it, THE Web app SHALL NOT show the Evidence tooltip for that grave until a pointer move or a new focus event happens (the programmatic return of focus is not a trigger).
4. THE Web app SHALL keep the Evidence tooltip behaviour of cemetery-polish requirement 7 otherwise unchanged, as corrected by requirement 5 of this spec.

### Requirement 5: The cemetery-polish tooltip requirement states the built behaviour

**User Story:** As a future reader of the specs, I want requirement 7.4 of cemetery-polish to say what the build does, so that the text and the code agree.

**Traces to:** Part A item A5

#### Acceptance Criteria

1. THE spec task SHALL add a section "Correction, 23 Nov 2026 (spec cemetery-time)" to `.kiro/specs/cemetery-polish/requirements.md`, in the form of the Correction section of `.kiro/specs/health-scoring/requirements.md`.
2. THE Correction section SHALL quote the old criterion 7.4 verbatim, SHALL leave the old text unchanged, and SHALL state the built behaviour: the tooltip has `pointer-events: none`, lies inside its own Cell, and stays shown while the pointer is over the grave button under it, so the pointer is over the tooltip area without the tooltip taking the pointer.
3. THE Correction section SHALL state that the grace period still applies when the pointer leaves the grave button and that Escape still hides the tooltip.

### Requirement 6: ESLint ignores the build folder

**User Story:** As a developer, I want scratch files under `build/` to stay out of lint, so that a throwaway script cannot fail the pre-commit lint.

**Traces to:** Part A item A6

#### Acceptance Criteria

1. THE `eslint.config.js` ignore list SHALL include `build/**`.
2. WHEN a file named `build/scratch-check.mjs` holds a lint error, THE lint command SHALL report no error for it (checked by a static test that reads the ignore list and by one lint run over a temporary file that the task deletes).
3. THE lint command SHALL keep reporting errors for every other path that it reported before this change.

### Requirement 7: Slow property tests are measured and made cheaper

**User Story:** As a developer, I want the full suite to pass under load, so that a timeout never hides a real failure.

**Traces to:** Part A item A7; tech.md (numRuns 100, 1000 for security invariants)

#### Acceptance Criteria

1. THE spec task SHALL measure, one package at a time with the Vitest JSON reporter, every property test that takes more than 5 seconds alone, and SHALL record the test, the package and the measured time in design.md.
2. FOR EACH test that took more than 5 seconds alone, THE spec task SHALL find the cause of the cost and SHALL reduce the cost of its generator or its body.
3. THE spec task SHALL keep every `numRuns` at or above the value its own spec gives and SHALL skip no test.
4. WHERE a timeout is raised, THE spec task SHALL record in design.md the measured times that justify the new value.
5. WHEN the package suites run one at a time on a loaded machine, THE package suites SHALL pass with no timeout.

### Requirement 8: The scan response carries a compact Timeline per package

**User Story:** As a security engineer, I want each package to carry the history of its state, so that the cemetery can show earlier states from the scan alone.

**Traces to:** Part B; R-SG-1 to R-SG-5, R-ST-2

#### Acceptance Criteria

1. THE Engine SHALL export a pure function `timelineFacts` that turns the full packument, the abbreviated packument, the installed version, the installed version provenance, the advisories signal and the published times of the advisories into Timeline facts.
2. THE Engine SHALL keep in the Timeline facts at most 50 Timeline versions in Version order with the installed version always among them, and SHALL set `coveredFrom` to the publish time of the oldest kept version other than the installed one when older versions were dropped.
3. THE Engine SHALL set the install script flag of a Timeline version to true or false only when the abbreviated packument holds that version, and to null otherwise.
4. THE Engine SHALL set the provenance flag of a Timeline version only for the installed version, from the provenance signal when it is available, and to null for every other version.
5. THE Engine SHALL set the maintainer list of a Timeline version only when the packument entry of that version holds `maintainers` or `_npmUser`, capped at 10 names, and to null otherwise.
6. THE Engine SHALL set the advisory list of the Timeline facts to null when the advisories signal is unavailable, when any advisory of the installed version has no published time, or when more than 20 advisories apply.
7. THE Engine SHALL export a pure function `buildTimeline(facts, health, scanDate)` that returns a `PackageTimeline` with the installed version, `coveredFrom`, and a list of at most 64 Segments in time order with strictly increasing `from`.
8. THE Engine SHALL give the last Segment of every `PackageTimeline` the state, the reason and the Ghost of the scan, SHALL merge two neighbouring Segments that have the same state, the same Ghost and the same `version` (both without one for a Segment that `buildTimeline` writes), and SHALL start a new Segment at the Scan date when the scan Form differs from the Form just before it.
9. IF more than 64 Segments result, THEN THE Engine SHALL drop the oldest ones and SHALL set `coveredFrom` to the `from` of the oldest kept Segment.
10. FOR ANY Timeline facts, THE Engine SHALL return a `PackageTimeline` whose Segments agree with `stateAsOf` at every instant from the first Segment to the Scan date (agreement, tested at generated instants that include the instant of every fact and the instant one millisecond before it). FOR A Timeline whose Segments carry a `version` (a Replay), agreement means that the state and reason of each Segment equal `evaluateState` on the facts of that Segment's own version and its earlier versions, at the `from` of the Segment and at the last millisecond before the `from` of the next Segment.
11. THE API SHALL add `timelines`, a record from package name to `PackageTimeline`, to the scan response, built from the documents that scoring has already fetched, so that the scan makes no upstream request for a packument that it did not make before.
12. IF the Timeline of one package cannot be built, THEN THE API SHALL omit the entry of that package and SHALL keep the scan.
13. THE web contract validator SHALL accept a response with no `timelines`, SHALL check every entry of `timelines` against the shape above, and SHALL reject an entry with more than 64 Segments, `from` values that do not increase, a key that is not a package of the report, an unparseable instant, a state outside the five States and null, a reason longer than 200 characters, or a `version` that is present and is not a string of at most 100 characters, each with a contract error. A Segment with no `version` is accepted.
14. THE evidence pack, the policy result and the report SHALL NOT change in content or digest because of `timelines`.
15. THE Segment type SHALL have an optional `version` string of at most 100 characters. THE Engine function `buildTimeline` and the hosted scan and the demo scan SHALL write no `version`. ONLY the replay generator SHALL set it.

### Requirement 9: State as of a date

**User Story:** As a maintainer, I want to know what Sexton would have said about my installed versions on an earlier date, so that I can see when a package turned.

**Traces to:** Part B; R-ST-2, R-ST-3, R-ST-4

#### Acceptance Criteria

1. THE Engine SHALL export a pure function `stateAsOf(facts, health, scanDate, asOf)` that returns the Form of one package and the list of facts it could not use.
2. THE Engine SHALL evaluate the rules of `evaluateState` for every As-of date before the Scan date, on inputs built from Dated facts only, so that the rule order and the state-age rule are those of `evaluateState`.
3. WHEN the As-of date is not before the Scan date, THE Engine SHALL return the state, the state reason and the Ghost of the scan, so that the Form at the Scan date equals the current state of every package.
4. THE Engine SHALL ignore every fact whose Seen time is later than the As-of date (invariant, a later fact is not seen).
5. THE Engine SHALL treat the deprecated flag, advisories without a published time, and every snapshot fact as unavailable before the Scan date, and SHALL list them as unavailable in the result.
6. THE Engine SHALL take the last publish as of the As-of date from the latest Seen time not later than the As-of date, and SHALL treat the last publish as unavailable when `coveredFrom` is set and the As-of date is before it.
7. THE Engine SHALL give a possession reason of a new install script when a Timeline version has an install script flag of true, a Seen time within 90 days up to the As-of date, and a predecessor in Version order with a flag of false.
8. THE Engine SHALL give a possession reason of a provenance regression when the installed version has a provenance flag of false, a Seen time not later than the As-of date, and an earlier Timeline version in Version order has a provenance flag of true.
9. THE Engine SHALL give a possession reason of a maintainer change when two consecutive Timeline versions have maintainer lists that differ as sets and the later one has a Seen time within 90 days up to the As-of date.
10. THE Engine SHALL give the same result for the same inputs (determinism).
11. FOR ANY Timeline facts and any two As-of dates before the Scan date, THE Engine SHALL NOT give a healthier state for the earlier last publish, holding the advisories and the possession inputs equal (monotonic in age, R-ST-4).

### Requirement 10: The Not-published form

**User Story:** As a viewer, I want to see that an installed version did not exist yet on the chosen date, so that I do not read an empty history as a healthy grave.

**Traces to:** Part B; R-UI-1

#### Acceptance Criteria

1. THE Engine SHALL return the Not-published form from `stateAsOf` if and only if the Seen time of the installed version is later than the As-of date, and SHALL write it as the state `null` in a Segment.
2. THE Web app SHALL draw the Not-published form as an unmarked mound with the package name on its Plinth, in the `border` token, and SHALL draw no Ghost and no Pull request marker on it.
3. THE Web app SHALL keep grave form a function of the State only for every grave that is not in the Not-published form, and SHALL keep the colour of a State unchanged.
4. THE Web app SHALL name the Not-published form in the legend, in the grave button name ("<name> <version>, not yet published on this date") and in the Evidence tooltip.
5. THE Web app SHALL keep the triage order and the grave positions of the Scan date while the scrubber moves, so that no grave changes place.

### Requirement 11: The scrubber control

**User Story:** As a keyboard user, I want a slider that I can drive with the arrow keys and that tells me the date, so that I can step through time without a mouse.

**Traces to:** Part B; R-UI-7

#### Acceptance Criteria

1. WHERE the scan response holds at least one Timeline, THE Web app SHALL render the scrubber below the Header bar as a native `input` of type `range` with the accessible name "History date", `min` 0, `max` one less than the number of Stops, `step` 1, and a value equal to the index of the current Stop.
2. THE Web app SHALL set `aria-valuetext` of the scrubber to the Scan time view text of the current Stop, for example `31 Mar 2026, 00:21 UTC`, reusing `scanTimeView`.
3. THE Web app SHALL make the scrubber reachable by Tab, operable with the arrow keys, Home and End, and visible when focused, with an outline of at least 2 pixels in the `focus` token.
4. THE Web app SHALL compute the Step marks as the `from` values of the Segments whose Form (state, Ghost and `version`) differs from the Form of the previous Segment, where the Form before the first Segment is the Not-published form unless `coveredFrom` is set (then it is the Form of the first Segment), SHALL draw them as tick marks along the scrubber in one `aria-hidden` SVG element, and SHALL put the Stops at the Scrubber start, at every Step mark and at the Scan date, in time order and without duplicates.
5. FOR ANY set of Timelines, THE Web app SHALL return Step marks such that every Step mark is an instant at which some package has a Form that differs from its Form one millisecond earlier (soundness).
6. FOR ANY set of Timelines and any instant from the Scrubber start to the Scan date, THE Web app SHALL give every package the same Form at that instant as at the latest Stop not later than that instant (completeness), so that the Step marks are exactly the dates where some Form changes.
7. THE Web app SHALL set the Scrubber start to the earliest `from` of any Timeline minus one hour, except that WHEN the Segment with that earliest `from` carries a `version` the Scrubber start SHALL be that `from` itself (a versioned first Segment already shows a package, so no hour is added, and a Replay window starts at its first `from`).
8. WHERE the scan response holds no Timeline, THE Web app SHALL render no scrubber.
9. THE Web app SHALL compute the Stops once per loaded scan response, and the computation SHALL take at most 200 ms for 300 packages with 64 Segments each (measured in a unit test).

### Requirement 12: The scrubber moves the cemetery

**User Story:** As a reviewer, I want the graves to change as I move the slider, so that I see the cemetery age.

**Traces to:** Part B; R-UI-6

#### Acceptance Criteria

1. WHEN the scrubber moves to a Stop, THE Web app SHALL recompute the Form of every grave as of that Stop and repaint the scene, with the shape, the colour and the Ghost of each grave following its Form.
2. WHILE the As-of date is before the Scan date, THE Web app SHALL show in the Header bar the text "as of <date>" with the Scan time view text, in a `time` element, and a button named "Back to now" that moves the scrubber to the Scan date.
3. WHEN the user activates "Back to now", THE Web app SHALL set the As-of date to the Scan date and SHALL leave focus on the scrubber.
4. WHILE the As-of date is before the Scan date, THE Web app SHALL show the line "Before the scan date Sexton uses only dated facts. Deprecation, undated advisories and snapshot history are unknown." in a `p` element below the scrubber.
5. WHILE Reduced motion applies, THE Web app SHALL change graves between Stops with no transition and no animation.
6. FOR 300 Packages at a viewport of 1280 by 800 in the end-to-end build, THE Web app SHALL repaint the full scene after a scrubber move with a median of 30 timed repaints of at most 16 ms.
7. THE Web app SHALL keep the drawer on the Scan date (its signals, policy and remediation) and SHALL say so with the line "The drawer shows the scan date." when the As-of date is before the Scan date, except for the version and the state line that requirement 12.9 gives.
8. WHEN a new response loads, THE Web app SHALL reset the As-of date to the Scan date of the new response.
9. WHEN the Segment at the As-of date carries a `version`, THE Web app SHALL show that version, in place of the installed version of the report, in the grave inscription, in the grave button name, in the Evidence tooltip and in the drawer title, and SHALL show in the drawer, under its title, one line "State on <date>: <State>. <reason>" with the Scan time view text of the As-of date, the state and the reason of that Segment. WHEN the Segment carries no `version`, THE Web app SHALL show the version of the report as before and no such line.

### Requirement 13: The evidence pack and the policy describe the scan date only

**User Story:** As a security engineer, I want the policy result and the evidence pack to stay what they were, so that a reviewer never mistakes a past state for a policy decision.

**Traces to:** Part B; R-EV-1, R-EV-3, R-PO-5

#### Acceptance Criteria

1. THE Web app SHALL leave the header policy line, the failing rule count and the evidence downloads unchanged while the scrubber moves.
2. THE API SHALL produce an evidence pack whose digest is the digest it produced before this spec for the same inputs (checked on the demo fixture and the golden evidence).
3. THE Web app SHALL NOT send the As-of date in any request.

### Requirement 14: The pull request marker comes from the scan response and from the session

**User Story:** As a maintainer, I want a grave to show that a pull request was opened for it, so that I do not open a second one.

**Traces to:** Part C; spec remediate requirements 5 and 7

#### Acceptance Criteria

1. WHEN the hosted scan handler answers GET /api/scan and the remediation log is connected, THE API SHALL read the log entries of the repository, using the lower-cased repository URL as the partition key, and SHALL add `pullRequests` to the response, one entry per package with the fields `package`, `kind`, `prUrl` and `timestamp` of its latest log entry.
2. IF the log read fails or no log is connected, THEN THE API SHALL omit `pullRequests` and SHALL keep the scan, with one warn log line that holds no repository and no entry.
3. THE web contract validator SHALL accept a response with no `pullRequests`, and SHALL reject an entry whose package is not in the report, whose `prUrl` does not start with `https://`, whose `timestamp` does not parse, or when the list holds more than 300 entries.
4. WHEN the "Open pull request" request ends with the status `opened` or `existing`, THE Web app SHALL add the package to a session list of marked packages for the loaded scan.
5. THE Web app SHALL show the Pull request marker on every grave whose package is in `pullRequests` or in the session list.
6. THE Web app SHALL NOT mark a package because of the plan in `remediations` (a plan is not an opened pull request).
7. THE Web app SHALL leave the state, the shape, the colour and the Ghost of a grave unchanged by the marker, and SHALL leave the order of the graves unchanged.
8. THE Web app SHALL clear the session list when a new response loads.

### Requirement 15: The Burial

**User Story:** As a maintainer, I want a short burial when I open a pull request, so that the action feels done.

**Traces to:** Part C; R-UI-6, R-UI-1

#### Acceptance Criteria

1. WHEN the "Open pull request" request ends with the status `opened` or `existing` and Reduced motion does not apply, THE Web app SHALL play the Burial on that grave: in the first 35 percent of 1,200 ms the stone sinks into the ground behind a ground line, in the next 30 percent a fresh mound closes over the place and the stone is hidden, and in the last 35 percent the stone returns in its State form with the Pull request marker.
2. THE Web app SHALL keep the State, the shape and the colour of the grave during the Burial equal to its State, so that the Burial never changes a State (invariant, a state changes only after a rescan).
3. WHILE the Burial plays, THE Web app SHALL repaint through the existing redraw scheduler and SHALL keep one painted frame per animation frame at most.
4. WHILE Reduced motion applies, THE Web app SHALL show the Pull request marker with no Burial and no animation.
5. THE Web app SHALL play the Burial at most once for one package and one loaded scan.
6. WHEN the Burial ends, THE Web app SHALL leave focus where it was.
7. THE Web app SHALL give the Burial phase to the painter as plain numbers in the Scene plan, so that the painter stays pure and the same plan paints the same calls.

### Requirement 16: The Pull request marker is named and in the legend

**User Story:** As a first-time viewer, I want the legend to explain every form, so that the scene stays readable.

**Traces to:** Part C and Part B; R-UI-1, R-UI-2, R-UI-5, R-UI-7

#### Acceptance Criteria

1. THE Web app SHALL draw the Pull request marker as a pennant on a pole at fixed Cell coordinates, in the new `marker` token, the same for every grave and State.
2. THE Web app SHALL add to the legend one chip for the Not-published form and one chip for the Pull request marker, each with its drawing and its name, and SHALL keep the six existing chips and the triage text.
3. THE Web app SHALL add " pull request opened" to the accessible name of a grave button that has the Pull request marker, after the advisory count suffix.
4. THE Web app SHALL give the `marker` token a contrast ratio of at least 3 to 1 against every Backdrop stop, and SHALL add it to the contrast tests.
5. THE Web app SHALL draw no Ghost for the marker and SHALL keep the rule that a Ghost means one or more advisories and nothing else.

### Requirement 17: Two Replay fixtures built from public reports

**User Story:** As a reviewer with three minutes, I want to watch a real compromise unfold in the cemetery, so that I understand why the signals matter.

**Traces to:** Part D; R-UI-4

#### Acceptance Criteria

1. THE spec task SHALL build the fixtures `packages/web/public/replay/axios.json` and `packages/web/public/replay/keyv.json`, each a scan response with a `replay` block, from the facts of design.md section "Replay facts" and from nothing else.
2. THE fixture generator SHALL leave out every field that no source gives, and SHALL mark a required signal that no source gives as unavailable with the reason "not in public reports".
3. THE axios fixture SHALL hold one package, `axios`, with installed version `1.14.0` (the Resolved version at its Scan date, 31 March 2026 03:29 UTC), whose Timeline facts hold 1.14.0 with provenance true and 1.14.1, published 31 March 2026 00:21 UTC, with provenance false, and whose Segments follow the Resolved version through the Replay window: `1.14.0` from 30 March 2026 23:21 UTC, `1.14.1` from 31 March 2026 00:21 UTC (Possessed by provenance regression), and `1.14.0` again from 31 March 2026 03:29 UTC, because npm removed 1.14.1 and a fresh install resolves 1.14.0 again from the removal time.
4. THE keyv fixture SHALL hold one package, `keyv`, with installed version `6.0.0` (the Resolved version at its Scan date, 4 August 2026 09:35 UTC), whose Timeline facts hold 5.6.0 and 6.0.0-rc.1 with install script false and 6.0.0, published 4 August 2026 09:35 UTC, with install script true and provenance true, and whose Segments are `5.6.0` from 4 August 2026 08:35 UTC and `6.0.0` from 4 August 2026 09:35 UTC (Possessed by a new install script, with no provenance regression). The Replay has no restore period: it ends at 09:35 UTC.
5. FOR EACH Replay fixture, THE web contract validator SHALL accept the fixture (property over both fixtures and over mutations of their optional fields).
6. THE Replay fixtures SHALL show only the signals that exist on the main branch and SHALL carry no publisher-changed signal and no new-dependency signal.
7. THE Replay fixtures SHALL use only `https://` source URLs, and every URL of the `replay.sources` list SHALL be one of the six URLs of design.md section "Replay facts".
8. THE fixture generator SHALL set `version` on every Segment of both fixtures to the Resolved version at the `from` of the Segment, and SHALL derive the state and the reason of each Segment from `evaluateState` on inputs built from the facts of that version and its earlier versions, treating the last publish of a version that has no publish time in the facts as unavailable.
9. FOR EACH Replay fixture, THE sequence of Segment `from` and `version` values SHALL equal the sequence of design.md section "Replay facts", and every `version` SHALL be one of the sourced versions of the Replay.

### Requirement 18: Opening a Replay

**User Story:** As a reviewer, I want to open a replay from the header or from a link, so that I can share it.

**Traces to:** Part D

#### Acceptance Criteria

1. THE Web app SHALL render in the Header bar a control group named "Replay" with one button for each Replay id, with the visible texts "axios 2026" and "keyv 2026".
2. WHEN the user activates a Replay button, THE Web app SHALL load `/replay/<id>.json` from the page origin through `checkScanUrl` and the scan loader, and SHALL set the scrubber to the Scan date of the Replay.
3. WHEN the page loads with the query `?replay=axios` or `?replay=keyv`, THE Web app SHALL load the matching fixture instead of the demo.
4. IF the query `replay` holds any other value, THEN THE Web app SHALL show the load error panel with the code `scan-url-rejected` and SHALL load no address.
5. THE Web app SHALL pass the fixture addresses through `checkScanUrl` unchanged: same-origin, no credentials, and no new allowed origin.
6. THE Web app SHALL keep the keyboard order of the header controls: the two evidence downloads, the Legend toggle, the Repository field input, the Scan button, then the Replay buttons.

### Requirement 19: The Replay banner

**User Story:** As a reviewer, I want every replay screen to say it is not live, so that nobody mistakes it for a scan of a real repository.

**Traces to:** Part D; R-UI-4

#### Acceptance Criteria

1. WHILE a Replay is loaded, THE Web app SHALL show the Replay banner in a `role="note"` element above the scene, in the header area, and inside the drawer when it is open.
2. THE Replay banner SHALL hold the exact text "Reconstructed from public reports. Not a live scan." and one link for each entry of `replay.sources`.
3. THE Web app SHALL render a source link as an `a` element with `target="_blank"`, `rel="noopener noreferrer"` and an `href` that starts with `https://`, and SHALL render a source whose address does not start with `https://` as its label with no `a` element.
4. FOR ANY Replay response, THE Web app SHALL render the banner on the scene screen and on the drawer screen (property over both fixtures and generated `replay` blocks).
5. WHILE a Replay is loaded, THE Web app SHALL NOT show the "demo fixture, recorded data" label, the evidence downloads or the "Open pull request" button.
6. THE Web app SHALL show the Replay title and the name of the incident in the banner.

### Requirement 20: The Replay through the scrubber

**User Story:** As a reviewer, I want to drag the slider and watch the grave turn, so that the signal timing is clear.

**Traces to:** Part D; Part B

#### Acceptance Criteria

1. WHILE the As-of date of the axios Replay is before 31 March 2026 00:21 UTC, THE Web app SHALL draw the axios grave in the Restless form with the version 1.14.0 and the reason "all state signals unavailable".
2. WHILE the As-of date of the axios Replay is not before 31 March 2026 00:21 UTC and before 31 March 2026 03:29 UTC, THE Web app SHALL draw the axios grave in the Possessed form with the version 1.14.1, and the Evidence tooltip SHALL name the provenance regression.
3. WHILE the As-of date of the axios Replay is not before 31 March 2026 03:29 UTC, THE Web app SHALL draw the axios grave in the Restless form with the version 1.14.0 (npm removed 1.14.1).
4. WHILE the As-of date of the keyv Replay is before 4 August 2026 09:35 UTC, THE Web app SHALL draw the keyv grave in the Restless form with the version 5.6.0 and the reason "all state signals unavailable".
5. WHILE the As-of date of the keyv Replay is not before 4 August 2026 09:35 UTC, THE Web app SHALL draw the keyv grave in the Possessed form with the version 6.0.0, and the Evidence tooltip SHALL name the new install script.
6. THE Web app SHALL place the Stops of the axios Replay at 30 March 2026 23:21 UTC, 31 March 2026 00:21 UTC and 31 March 2026 03:29 UTC, and the Stops of the keyv Replay at 4 August 2026 08:35 UTC and 4 August 2026 09:35 UTC, with a Step mark at every Stop after the first.

### Requirement 21: Requirements document, steering and README

**User Story:** As a future agent, I want the product documents to match the finished behaviour, so that I do not undo it.

**Traces to:** all parts; R-UI-1, R-UI-4

#### Acceptance Criteria

1. THE docs task SHALL amend R-UI-1 in `docs/requirements.md` to add the Not-published form and the Pull request marker, SHALL amend R-UI-4 to say that the drawer shows the scan date, and SHALL add the line "0.4, 23 Nov 2026." to the change log naming those amendments.
2. THE docs task SHALL change the version line of `docs/requirements.md` from 0.3 to 0.4 with the date 23 Nov 2026.
3. THE docs task SHALL update `.kiro/steering/web.md` with the tuft grass, the ground height, the scrubber and the as-of rule, the two new forms, the burial, the replay and its banner, and SHALL update `.kiro/steering/engine.md` and `.kiro/steering/product.md` for the Timeline, `stateAsOf` and the replay fixtures, each keeping every rule that this spec does not change.
4. THE docs task SHALL add to `README.md` a short section "Replay" with the two links and the sentence that a replay is reconstructed from public reports and is not a live scan, with no semicolon and no dash chain, and SHALL keep every other section.
5. THE README test SHALL pin the new section heading, and SHALL keep pinning the other headings.

### Requirement 22: A retaken screenshot

**User Story:** As a reviewer, I want the README picture to show the finished scene, so that I see the product before I run it.

**Traces to:** Part A; Part B; R-UI-5

#### Acceptance Criteria

1. WHEN every visual change of this spec has landed, THE screenshot task SHALL retake `docs/cemetery.png` from the demo scan at 1440 by 900 with the drawer closed, Reduced motion on and the scrubber at the Scan date.
2. THE screenshot task SHALL look at the image itself and SHALL confirm that the grass reads as tufts, that the ground reaches the bottom, and that the repository text and the demo label do not touch.
3. THE screenshot task SHALL wait for the first canvas paint before it takes the image.

### Requirement 23: Invariants kept

**User Story:** As the owner of the cemetery rules, I want every encoding rule to stay true after the time features.

**Traces to:** R-UI-1, R-UI-2, R-UI-3, R-UI-6, R-UI-7

#### Acceptance Criteria

1. THE Web app SHALL keep grave form a function of the State and the Not-published form only, and SHALL give a Ghost to a grave if and only if its advisories as of the As-of date are available and non-empty.
2. THE Web app SHALL add no continuous visual encoding: no height, size or opacity varies with a package value, and the Burial uses fixed phases.
3. THE Web app SHALL keep the triage order of cemetery-ui, computed on the Scan date.
4. THE Web app SHALL add no runtime dependency, no web font, no image file, no audio file and no external request at run time, and SHALL keep the production Content-Security-Policy unchanged.
5. THE Web app SHALL meet WCAG 2.1 AA for every new control and colour, and every new grave state SHALL stay reachable by keyboard.
6. THE Web app SHALL render every string that comes from a scan response or a Replay block as text, with links only for `https://` addresses.

### Requirement 24: Scope and review

**User Story:** As the owner of the other packages, I want this spec to touch only what it names.

**Traces to:** all parts

#### Acceptance Criteria

1. THE spec tasks SHALL change only `packages/engine`, `packages/api`, `packages/web`, `eslint.config.js`, `README.md`, `docs/cemetery.png`, `docs/requirements.md`, `.kiro/steering` and `.kiro/specs/cemetery-polish/requirements.md`.
2. THE spec tasks SHALL change nothing under `infra`, `packages/cli` or `packages/action`, and no `package.json` and no `package-lock.json`.
3. THE spec tasks SHALL change no existing test except those listed in design.md under "Deliberate test changes".
4. THE spec tasks SHALL regenerate every derived file from the recorded fixtures and SHALL make no network call.
5. THE spec tasks SHALL end each top-level task with a review by the security-reviewer agent of that task's changes, and SHALL record its findings in a "Review notes" line.
6. THE root gates task SHALL build the CLI and run it against `https://github.com/expressjs/express` twice, once before and once after this spec's changes, each time writing the scan JSON, and SHALL record in design.md the byte size of both outputs and of a gzip of each. The "before" run is made right after the spec commit and before task 1. THE spec SHALL NOT change `packages/cli`, so the recorded sizes are as measured and the output may not carry timelines.
