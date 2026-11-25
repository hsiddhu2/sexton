# Requirements Document

## Introduction

The new-signals spec adds two Possession signals to the Sexton Engine (`packages/engine`): publisherChange and newDependency. Both compare the installed version of a direct dependency with its Earlier version, and both are read from the full packument that scoring already fetches. newDependency also reads the packuments of each newly added dependency, at most five per package.

Two new Possessed rules read the signals. A false Possessed costs trust, because Possessed is the top of the triage list. So each rule fires only on a narrow condition, and every other result is recorded as evidence without changing the state.

This spec implements the new lines R-SG-10 and R-SG-11 and the extended Possessed line of R-ST-2 in docs/requirements.md. It builds on history-signals (the signal envelope, Version order, the Possession signals), cemetery-time (the Timeline, `stateAsOf`, the replays), evidence-pack (the signal summaries) and cli-and-action (the scan table). It adds no policy rule type: `forbid_state` with Possessed already covers both rules.

The spec does not change the text of any existing state reason, the rule order among the existing rules, the snapshot store, the snapshotter, infra or the GitHub workflows.

## Glossary

- **Engine**, **Signal**, **Signal envelope**, **Available signal**, **Unavailable signal**, **Packument**, **Abbreviated packument**, **Published version**, **Version order**, **Possessed**, **Cache**, **Transport**, **Reference time**: as defined in history-signals.
- **Timeline**, **Segment**, **As-of date**, **Scan date**, **Replay**, **Stop**, **Resolved version**: as defined in cemetery-time.
- **Installed version**: the version of a direct dependency that scoring scores.
- **Earlier version**: among the Published versions of the full packument that are valid semver versions, have a publish time strictly earlier than the publish time of the Installed version, and are lower than the Installed version in semver precedence, the one with the greatest semver precedence. None when no version qualifies or when the Installed version is not a valid semver version or not a Published version.
- **Publisher**: the `name` string of the `_npmUser` object of one version entry in the full packument. Null when `_npmUser` is absent, not an object, or has no non-empty string `name`.
- **Publish method**: `trusted-publisher` when the version entry's `_npmUser` object has a `trustedPublisher` member that is an object, `token` when `_npmUser` is an object without it, `unknown` when `_npmUser` is absent or not an object.
- **Trusted publisher**: npm trusted publishing through OIDC from a CI provider. The registry records it in `_npmUser.trustedPublisher`.
- **Publish record**: a version, its Publisher, its Publish method and its publish time.
- **Dependencies map**: the `dependencies` member of a version entry in the full packument. Absent or not an object counts as empty. Only own members whose value is a string count.
- **New dependency name**: a name present in the Dependencies map of the Installed version and absent from the Dependencies map of the Earlier version.
- **Detail cap**: 5. At most 5 New dependency names per package are read in detail.
- **Parent publish time**: the publish time of the Installed version.
- **Resolved dependency version**: for a New dependency name and its range, the version with the greatest semver precedence among the Published versions of that dependency whose publish time is not later than the Parent publish time and that satisfy the range under semver. None when no version qualifies or when the range is not a valid semver range.
- **Install script flag**: the `hasInstallScript` member of the Resolved dependency version in the abbreviated packument of the dependency. The registry sets it when the version has a preinstall, install or postinstall script.
- **Fresh window**: 7 times 24 hours. A Resolved dependency version is Fresh when its publish time is not later than the Parent publish time and the Parent publish time minus its publish time is at most the Fresh window.
- **Publisher rule**: the Possessed rule that reads publisherChange.
- **New dependency rule**: the Possessed rule that reads newDependency.
- **Existing rules**: the three Possessed rules of history-signals: maintainer change, provenance regression and new install script.
- **Express scan**: `sexton scan https://github.com/expressjs/express` with the built CLI, 44 direct dependencies on 25 Nov 2026.

## Requirements

### Requirement 1: publisherChange signal

**User Story:** As a security engineer, I want to know whether the installed version was published by someone else, or in another way, than the version before it, so that a release made with a stolen token stands out.

#### Acceptance Criteria

1. FOR EACH direct dependency, THE Engine SHALL derive the publisherChange signal from the full packument that scoring already fetches and SHALL NOT issue a further request for it.
2. WHEN the full packument is read and the Installed version has an Earlier version, THE Engine SHALL return an available publisherChange signal whose value holds the Publish record of the Installed version and the Publish record of the Earlier version.
3. WHEN both Publishers are non-null and equal, THE Engine SHALL set the status to `same`.
4. WHEN both Publishers are non-null and differ, THE Engine SHALL set the status to `changed`.
5. WHEN either Publisher is null, THE Engine SHALL set the status to `unknown`.
6. WHEN the full packument is read and the Installed version has no Earlier version, THE Engine SHALL return an available publisherChange signal with status `no-earlier-version` and the Publish record of the Installed version when it is a Published version.
7. IF the full packument read fails, THEN THE Engine SHALL return an unavailable publisherChange signal that carries the failure reason and SHALL continue the scan.
8. FOR ANY JSON value given as the full packument and any version string, deriving the publisherChange value SHALL return without throwing, and deriving it twice SHALL give deep-equal values.
9. THE Engine SHALL set the publisherChange source to the packument URL of the package and its fetchedAt to the instant the full packument was read.

### Requirement 2: newDependency signal

**User Story:** As a security engineer, I want each dependency that the installed version added recorded with how new it is and whether it runs an install script, so that a dependency planted to run a payload is caught.

#### Acceptance Criteria

1. FOR EACH direct dependency, THE Engine SHALL take the Dependencies maps of the Installed version and of its Earlier version from the full packument that scoring already fetches.
2. WHEN the Installed version has an Earlier version, THE Engine SHALL list the New dependency names in ascending code-unit order and SHALL record their total count.
3. WHEN the number of New dependency names exceeds the Detail cap, THE Engine SHALL read in detail only the first 5 in that order and SHALL record that the cap was hit.
4. FOR EACH New dependency name read in detail, THE Engine SHALL record its name, its range, the Resolved dependency version, the publish time of the Resolved dependency version, and its Install script flag.
5. FOR EACH New dependency name read in detail with a valid package name, THE Engine SHALL read the full packument and the abbreviated packument of that dependency through the Cache, so that each is fetched at most once per cache TTL.
6. IF a New dependency name is not a valid package name, THEN THE Engine SHALL issue no request for it and SHALL record it with no Resolved dependency version and the reason "invalid package name".
7. IF either packument read for a New dependency name fails, THEN THE Engine SHALL record the entry with the fields it could not derive set to null and a reason, SHALL keep the newDependency signal available, and SHALL continue the scan.
8. IF the range of a New dependency name is not a valid semver range, THEN THE Engine SHALL record the entry with no Resolved dependency version and the reason "range is not a semver range".
9. WHEN the Installed version has no Earlier version, THE Engine SHALL return an available newDependency signal with status `no-earlier-version` and SHALL issue no dependency request.
10. IF the full packument read of the package fails, THEN THE Engine SHALL return an unavailable newDependency signal that carries the failure reason and SHALL issue no dependency request.
11. FOR ANY JSON values given as packuments, deriving the newDependency value SHALL return without throwing, SHALL hold at most 5 detailed entries, and SHALL record the cap if and only if the count of New dependency names exceeds 5.
12. WHEN the Dependencies maps of the Installed version and of the Earlier version have the same names, THE Engine SHALL record no New dependency names and SHALL issue no dependency request.
13. THE Engine SHALL set the newDependency source to the packument URL of the package and its fetchedAt to the instant the full packument was read.

### Requirement 3: Possessed rules

**User Story:** As a maintainer, I want Possessed to fire on a stolen-token release or a planted dependency and on nothing weaker, so that the top of the triage list stays trustworthy.

#### Acceptance Criteria

1. WHEN the publisherChange status is `changed` AND the Earlier version's Publish method is `trusted-publisher` AND the Installed version's Publish method is `token`, THE Engine SHALL assign Possessed with the reason `publisher changed in <installed version>: <earlier publisher> to <installed publisher>`, where a missing publisher name reads `unknown`.
2. WHEN a detailed newDependency entry has the Install script flag true, or has a Resolved dependency version that is Fresh, THE Engine SHALL assign Possessed with the reason `new dependency in <installed version>: <name>`, where name is the first such entry in ascending name order.
3. WHILE neither the Publisher rule nor the New dependency rule matches, THE publisherChange and newDependency signals SHALL NOT change the state or the state reason.
4. THE Engine SHALL evaluate the Possessed rules in this order, first match wins: the Existing rules in their existing order, then the New dependency rule, then the Publisher rule.
5. THE Engine SHALL keep the exact text of every existing state reason, and SHALL give the same state and reason as before this spec whenever an Existing rule matches.
6. FOR ANY state inputs, adding the publisherChange and newDependency inputs SHALL either leave the state and reason unchanged or give Possessed.
7. FOR ANY package whose Installed version and Earlier version have equal Publishers, equal Publish methods and Dependencies maps with the same names, THE Engine SHALL give the same state and reason as with both new signals unavailable.
8. WHEN publisherChange and newDependency are unavailable, THE Engine SHALL give the same state and reason as before this spec for any other inputs.
9. THE default policy SHALL stay unchanged, and no new policy rule type SHALL be added.

### Requirement 4: Timeline

**User Story:** As a reviewer, I want the scrubber to show the new rules at the moment the installed version was published, so that a replay shows when the attack became visible.

#### Acceptance Criteria

1. THE Timeline facts SHALL carry the publisherChange value and the newDependency value of the scan, or null when the signal is unavailable.
2. WHEN the As-of date is at or after the Seen time of the Installed version and before the Scan date, THE `stateAsOf` function SHALL give the state rules the same publisherChange and newDependency inputs as the scan.
3. WHEN the As-of date is before the Seen time of the Installed version, THE `stateAsOf` function SHALL return the Not-published form, as it does today.
4. FOR ANY facts and health entry, the state inputs built by `stateAsOf` at any As-of date at or after the Installed version's Seen time SHALL hold publisherChange and newDependency inputs deep-equal to those of the scan.
5. FOR ANY Timeline facts, `stateAsOf` at the Scan date SHALL give the scan form.

### Requirement 5: Replays

**User Story:** As a reviewer, I want the replays to carry the two new signals as evidence, so that the planted dependency is on record beside the rule that fired.

#### Acceptance Criteria

1. THE replay facts SHALL hold, for each sourced version, its Publisher and Publish method and its Dependencies map when a public source gives them, and null when none does.
2. THE replay facts SHALL hold, for each sourced New dependency, the Resolved dependency version, its publish time and its Install script flag when a public source gives them, and null when none does.
3. WHEN the axios replay is generated, THE Segment from 2026-03-31T00:21:58.168Z SHALL be Possessed with the reason `provenance regression: 1.14.1 has no provenance, 1.14.0 had it`, and the New dependency rule SHALL also match on the replay facts of 1.14.1, as evidence.
4. WHEN the keyv replay is generated, THE Segment from 2026-08-04T09:35:00.763Z SHALL be Possessed with the reason `install script added in 6.0.0`.
5. WHERE a replay's installed version at the Scan date has no Earlier version in the facts, THE replay SHALL record publisherChange and newDependency as unavailable with the reason "not in public reports".
6. WHERE the facts give no Dependencies map for the installed version or its Earlier version, THE replay SHALL record newDependency as unavailable with the reason "not in public reports".
7. WHERE the facts give no Publish method for the installed version or its Earlier version, THE replay SHALL record publisherChange as unavailable with the reason "not in public reports".

### Requirement 6: Evidence, PR body and CLI table

**User Story:** As a security engineer, I want the two signals shown wherever the other Possession signals are shown, so that the evidence is complete.

#### Acceptance Criteria

1. THE evidence pack SHALL include publisherChange and newDependency in each package's signals, with source and fetchedAt, and THE Markdown report SHALL give each a one-line summary.
2. THE PR body SHALL list publisherChange and newDependency with source and timestamp in the signal table.
3. THE CLI scan table SHALL add the columns "Publisher" and "New deps".
4. FOR ANY signal value, every string taken from a publisherChange or newDependency value SHALL pass through the existing escape for the evidence report and the PR body, and through Safe text for the CLI table.
5. THE missingSignals list SHALL name publisherChange and newDependency when they are unavailable.

### Requirement 7: Fixtures, demo and version

**User Story:** As a maintainer, I want the demo and the golden files to come from recorded data, so that no test depends on data typed by hand.

#### Acceptance Criteria

1. THE fixture recorder SHALL record, for each fixture package, the `_npmUser` and `dependencies` members of the Installed version and of its Earlier version, and the trimmed packuments of each New dependency name read in detail.
2. THE recorder SHALL write only the fields the Engine reads.
3. THE spec SHALL record the demo evidence digest before and after in design.md.
4. THE Engine version SHALL be bumped in `packages/engine/src/version.ts` and `packages/engine/package.json` together, with the dependents' pins, and the golden evidence files SHALL be regenerated.
5. THE scans in tests SHALL make no network request.

### Requirement 8: Measurement and documents

**User Story:** As the owner, I want the effect of the rules measured on a real repository before they ship, so that a false alarm is caught before release.

#### Acceptance Criteria

1. THE spec SHALL record in design.md the state of each package of the Express scan before and after this spec.
2. IF more than 2 packages of the Express scan turn Possessed through the Publisher rule or the New dependency rule, THEN the implementation SHALL stop and report the list to the owner.
3. THE docs/requirements.md file SHALL gain R-SG-10, R-SG-11, the extended Possessed line of R-ST-2 and a change-log line under the next free version number.
4. THE README signal list SHALL name the two signals.

### Requirement 9: Web lines

**User Story:** As a viewer, I want the two new reasons to get an epitaph and a speech bubble like the other reasons.

#### Acceptance Criteria

1. THE web lists SHALL name publisherChange and newDependency, so that the compile-time tie to the API contract holds.
5. WHEN main contains Cemetery undead phase 2, THE axios replay summary SHALL gain one sentence saying that plain-crypto-js 4.2.1 was published 22 minutes before axios 1.14.1.
2. WHEN main contains Cemetery undead phase 2, THE epitaph table and the speech-bubble table SHALL each gain one line for the reason starting `publisher changed in` and one for the reason starting `new dependency in`.
3. THE new lines SHALL be true of the reason and SHALL name no real person or project.
4. IF main does not contain Cemetery undead phase 2 when every other task is done, THEN the implementation SHALL stop and report.
