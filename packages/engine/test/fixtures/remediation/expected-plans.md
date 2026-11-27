# Expected remediation plans, checked by hand

Recorded on 21 Nov 2026 with `node scripts/record-fixtures.mjs --remediation`. Installed versions come from `test/fixtures/packages.json`. Each package is planned as kind `bump` with declared range `^{installed}` and origin `dependencies`. A candidate passes only when it is not deprecated, has advisory data, and every advisory is Low (HP decision 8). Candidates are releases above the installed version, in-range first, then out-of-range, ascending, at most 20 (HP decisions 1 to 3).

## request 2.88.2: no safe version, 0 candidates

`packages/request/packument.json` has 126 versions. Every one carries "request has been deprecated, see https://github.com/request/request/issues/3142". 2.88.2 is the newest release, so no version is above it. No candidate, no OSV request, status `no-safe-version`. The first expectation was "the lowest safe major"; the recorded data has no version that could be one, so the plan follows the data.

## uuid 9.0.1: bump to 11.1.1, Major upgrade

No release above 9.0.1 satisfies `^9.0.1`, so all 18 releases are out of range. In order: 10.0.0 is deprecated ("uuid@10 and below is no longer supported"). 11.0.0, 11.0.1, 11.0.2, 11.0.3, 11.0.4, 11.0.5 and 11.1.0 carry GHSA-w5hq-g745-h8pq, whose `database_specific.severity` is MODERATE, so they fail. 11.1.1 is not deprecated and has no advisory: it is chosen, the 9th candidate. It is outside `^9.0.1`, so `majorUpgrade` is true. The first expectation was "the first non-deprecated version"; that is 11.0.0, which fails on the Moderate advisory, so the first version that is neither deprecated nor above Low is 11.1.1.

## lodash 4.17.21: bump to 4.18.1, in range

Releases above 4.17.21: 4.17.23, 4.18.0, 4.18.1, all inside `^4.17.21`. 4.17.23 carries GHSA-f23m-r3pf-42rh (MODERATE) and GHSA-r5fr-rjxr-66jc (HIGH): fails. 4.18.0 is deprecated and carries GHSA-f23m-r3pf-42rh: fails. 4.18.1 is not deprecated and has no advisory: chosen, `majorUpgrade` false. Matches the first expectation: the first version with no advisory above Low.

## event-stream 3.3.6: bump to 4.0.0, Major upgrade

3.3.6 itself is absent from the recorded packument (it was unpublished after the flatmap-stream incident). Releases above it: 4.0.0 and 4.0.1, both outside `^3.3.6`. Neither is deprecated and OSV returns no advisory for either, so 4.0.0 is chosen with `majorUpgrade` true. The first expectation was "no safe version found"; the recorded data has a clean 4.0.0, so the plan follows the data.

## node-sass 7.0.3: no safe version, 2 candidates

Releases above 7.0.3: 8.0.0 and 9.0.0, both out of range and both deprecated. Both fail, status `no-safe-version` with 2 evaluated candidates.

## left-pad 1.3.0 and colors 1.4.0: no safe version, 0 candidates

1.3.0 is the newest left-pad release and 1.4.0 is the newest colors release in the recorded packuments (the sabotaged colors releases are no longer published). No candidate in either case.
