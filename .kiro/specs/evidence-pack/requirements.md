# Requirements Document

## Introduction

The evidence-pack module implements R-EV-1, R-EV-2 and R-EV-3 of docs/requirements.md. It adds to the Sexton Engine (`packages/engine/src/evidence`) a builder that turns a scan into one Evidence pack: scan metadata, a CycloneDX 1.5 JSON SBOM of the direct dependencies, every package with its ten signal envelopes, the policy result and the remediation plans and log, sealed with a SHA-256 digest over the RFC 8785 canonical form of the body. It adds a verifier, a Markdown renderer that takes the pack and nothing else, a manifest-aware intake entry point, `GET /api/evidence` on the existing scan Lambda, demo evidence files and two download links in the web header.

The split stays as before: the Engine builds and renders and never reads a file or the network for this; the API and the demo generator gather the inputs. The digest is a checksum, not a signature: it shows an edit only to a reviewer who got the digest from somewhere else.

This spec does NOT add the `sexton evidence` CLI command (09), the remediation log table, remediation planning on the hosted scan path or a head-commit lookup (10b), or signing. It adds no runtime dependency.

## Glossary

- **Engine**, **Signal**, **HealthReport**, **PackageHealth**, **PolicyResult**, **IntakePackage**, **RepoRef**, **Canonical URL**, **ScanMetadata**, **RemediationEntry**, **RemediationLogEntry**, **isValidLogEntry**, **escapeField**, **cleanLine**, **UNRESOLVED_VERSION**, **ENGINE_VERSION**, **REPO_URL**: as defined in the earlier specs.
- **Evidence pack**: `{ evidenceVersion: 1, body, integrity }`.
- **Evidence body**: `{ scan, sbom, packages, policy, remediation }` as listed in design.md, Data Models.
- **Integrity**: `{ algorithm: "SHA-256", canonicalization: "RFC 8785", digest }`, `digest` 64 lower-case hex characters.
- **JSON value**: `null`, a boolean, a finite number, a string, an array of JSON values, or a plain object whose own enumerable string keys map to JSON values.
- **Clean copy**: the deep copy of a value made before hashing: lone surrogates in strings and keys replaced by U+FFFD, object keys whose value is `undefined` dropped. A value that is not a JSON value after this, a cycle, or two keys that become equal makes the copy fail.
- **Canonical text**: the RFC 8785 serialisation of a JSON value: object keys sorted by UTF-16 code units, no white space, strings and numbers as ECMAScript `JSON.stringify` writes them.
- **Digest**: the lower-case hex SHA-256 of the UTF-8 bytes of the Canonical text of the Evidence body.
- **Pack file**: the Evidence pack written with two-space indentation and a final newline. The Digest is never over the Pack file.
- **Manifest digests**: `{ packageJson, packageLock }`, each the SHA-256 hex of the UTF-8 bytes of the manifest text intake read, or `null`.
- **Policy digest**: the SHA-256 hex of the policy file text when the policy source is `file`, `null` for the default policy.
- **Commit**: 40 lower-case hex characters, or `null`. **Commit note**: the fixed text "commit not recorded, the scan read the default branch head", present exactly when the Commit is `null`.
- **SBOM**: a CycloneDX 1.5 JSON document with the fields of design.md, SBOM, and no others.
- **purl**: `pkg:npm/[<namespace>/]<name>[@<version>]`. The namespace is the npm scope with its `@`, so it is written `%40<scope>`. Each component is percent-encoded per Purl encoding.
- **Purl encoding**: each UTF-8 byte outside `A-Z a-z 0-9 . - _ ~ :` becomes `%XX` with upper-case hex.
- **Root bom-ref**: the Canonical URL of the scanned repository.
- **Evidence request**: `GET /api/evidence?repo=<url>&format=json|md`.
- **Untrusted string**: any string in an Evidence pack other than the fixed texts the Engine writes itself.

## Requirements

### Requirement 1: Canonical form and digest

**User Story:** As a security reviewer, I want one exact byte sequence behind the digest, so that I can recompute it with standard tools.

#### Acceptance Criteria

1. THE Engine SHALL expose `canonicalJson(value)`, which returns the Canonical text of a JSON value and `null` for any value that is not a JSON value, holds a lone surrogate or holds a non-finite number, and SHALL NOT throw.
2. FOR ANY JSON value with no lone surrogate and no negative zero, parsing its Canonical text SHALL give a value deeply equal to it, and canonicalising that parsed value SHALL give the same text (round trip, idempotence). Negative zero is written as `0`, as RFC 8785 requires.
3. FOR ANY JSON value, reordering the keys of any object in it SHALL NOT change its Canonical text (invariant).
4. THE Engine SHALL expose `cleanJsonCopy(value)`, which returns the Clean copy or a failure, SHALL NOT throw, and SHALL NOT mutate its input.
5. THE Engine SHALL expose `sha256Hex(bytes)` and `sha256HexOfText(text)` built on `globalThis.crypto.subtle` only, and FOR ANY string `sha256HexOfText` SHALL equal the `node:crypto` SHA-256 hex of its UTF-8 bytes (equivalence).
6. THE Engine SHALL contain no `node:` import in `packages/engine/src`. (review constraint, also a source scan test)

### Requirement 2: SBOM

**User Story:** As a security reviewer, I want a standard SBOM of the direct dependencies, so that my tools can read it.

#### Acceptance Criteria

1. THE Engine SHALL expose `buildSbom(input)`, which returns a CycloneDX 1.5 document with `bomFormat` "CycloneDX", `specVersion` "1.5", `version` 1, a `serialNumber`, `metadata`, `components`, `dependencies` and `compositions`, and no licence and no component hash.
2. THE SBOM SHALL have one component per distinct package name of the report, sorted by name in UTF-16 code-unit order, each of type `library`, with a scoped name split into `group` "@scope" and `name`, `version` omitted WHEN the installed version is `UNRESOLVED_VERSION`, `purl`, `bom-ref` equal to the purl, `scope` "excluded" for a `devDependencies` origin, and properties `sexton:state`, `sexton:resolution` WHEN a matching IntakePackage exists, and `cdx:npm:package:development` "true" for a `devDependencies` origin.
3. THE SBOM SHALL have one `dependencies` entry whose `ref` is the Root bom-ref and whose `dependsOn` is every component bom-ref sorted, and one `compositions` entry with `aggregate` "incomplete" and the Root bom-ref in `assemblies` and `dependencies`.
4. THE SBOM `metadata` SHALL hold `timestamp` equal to the report `generatedAt`, one tool component named `sexton` with `ENGINE_VERSION` and a `vcs` reference to `REPO_URL`, the repository component with `bom-ref` the Root bom-ref, `version` the Commit WHEN known, and a `vcs` reference to the Canonical URL, and the property `sexton:sbom:scope` = `direct-dependencies`.
5. THE `serialNumber` SHALL be `urn:uuid:` and a UUID made from the first 16 bytes of the SHA-256 of the Canonical text of the SBOM without `serialNumber`, version nibble 8, variant bits 10; FOR ANY two equal inputs the serial numbers SHALL be equal, and every serial number SHALL match the schema pattern (determinism, invariant).
6. FOR ANY package set, including scoped names, unresolved versions and zero packages, THE SBOM SHALL validate against the vendored CycloneDX 1.5 JSON schema (invariant).
7. FOR ANY package set with distinct names, the bom-refs SHALL be unique, `dependsOn` SHALL equal the set of component bom-refs, and the component count SHALL equal the package count (invariant).
8. THE Engine SHALL expose `npmPurl(name, version)` with Purl encoding, a scope as the namespace, and no version part WHEN the version is `UNRESOLVED_VERSION` or null; FOR ANY valid package name and version, decoding the purl SHALL give back the name and the version (round trip).

### Requirement 3: Building the pack

**User Story:** As a security reviewer, I want every fact the scan used in one file, so that I can hand it to an auditor.

#### Acceptance Criteria

1. THE Engine SHALL expose `buildEvidencePack(input)`, which resolves to `{ ok: true, pack }` or `{ ok: false, reason }` with `reason` one of "report has no scan metadata", "commit is not a 40 character hex string", "body is not serialisable", and SHALL NOT reject and SHALL NOT mutate its input for any input value (rejection, invariant).
2. THE Evidence body `scan` SHALL hold the Canonical URL, the Commit, the Commit note, `generatedAt`, `ENGINE_VERSION`, `policy` `{ version: 1, source, digest }`, the Manifest digests, and `unlocked`, `unlockedPackages`, `lockfileVersion`, `capped`, `totalDirect`, `skipped` and `unresolved` copied from ScanMetadata.
3. THE `policy.digest` SHALL be the given Policy digest WHEN the source is `file` and `null` WHEN the source is `default`.
4. THE Evidence body `packages` SHALL hold every PackageHealth of the report in full, after the Clean copy, every one of its ten Signal envelopes with `source` and `fetchedAt`; `policy` SHALL hold the PolicyResult in full.
5. THE Evidence body `remediation.plans` SHALL hold `{ packageName, kind, status, title, chosenVersion?, majorUpgrade? }` for each RemediationEntry in order.
6. WHEN the remediation log is `null`, `remediation.log` SHALL be `{ available: false, entries: [] }`; otherwise `available` true and `entries` the entries whose `repository` equals the scan Canonical URL and that pass `isValidLogEntry`, sorted by `timestamp` then `branch` in code-unit order.
7. THE Evidence body SHALL never use a package name as an object key.
8. THE pack `integrity.digest` SHALL be the Digest of the Clean copy of the body, and the pack SHALL carry that Clean copy as its body.
9. THE Engine SHALL expose `serialiseEvidencePack(pack)`, which returns the Pack file text.
10. FOR ANY two deeply equal inputs, THE builder SHALL resolve to deeply equal results (determinism).

### Requirement 4: Verifying the pack

**User Story:** As a security reviewer, I want to check a pack I received, so that an edit is caught.

#### Acceptance Criteria

1. THE Engine SHALL expose `verifyEvidencePack(value)`, which resolves to `{ ok: true }` or `{ ok: false, reason }` with `reason` one of `malformed`, `unsupported-version`, `digest-mismatch`, and SHALL NOT reject for any value.
2. IF `evidenceVersion` is a number other than 1, THEN THE verifier SHALL return `unsupported-version`.
3. IF the value is not a plain object, has no numeric `evidenceVersion`, has an `integrity` other than the Integrity shape, or has a `body` that is not a plain object with a Canonical text (so a lone surrogate in the body is `malformed`), THEN THE verifier SHALL return `malformed`.
4. FOR ANY input, verifying the built pack, and the pack after a Pack file serialisation and parse, SHALL give `{ ok: true }` (round trip).
5. FOR ANY built pack, changing any one leaf value of the body to a JSON value with no lone surrogate whose Canonical text differs from the old leaf's SHALL make the verifier return `digest-mismatch` (security, 1000 runs).
6. FOR ANY built pack, reordering the keys of the body SHALL NOT change the verification result (invariant).

### Requirement 5: Markdown report

**User Story:** As a reviewer with three minutes, I want a readable report from the same data, so that I can read the evidence without tools.

#### Acceptance Criteria

1. THE Engine SHALL expose `renderEvidenceMarkdown(pack)`, synchronous and pure, taking the pack and nothing else, with sections in this order: title with the repository, Integrity, Scan, Policy, Packages, Signals, SBOM, Remediation, footer.
2. THE Integrity section SHALL show the digest, the algorithm, the canonicalisation, the sentence "This digest shows an edit only to a reviewer who got it from somewhere else. It is not a signature." and the verification text `VERIFY_TEXT` of design.md, Decisions item 4.
3. THE Packages section SHALL be one table of name, version, state and reason ordered by STATE_ORDER, then by name.
4. THE Signals section SHALL give per package one row per name in SIGNAL_NAMES with the signal, a value summary, the source and `fetchedAt`, and "unavailable" with the reason for an unavailable signal; the formatter map SHALL be typed so a missing SIGNAL_NAMES entry fails the type check.
5. THE report SHALL show at most 20 advisories per package and, WHEN more exist, the line "and N more in the JSON"; no other list SHALL be capped.
6. THE Remediation section SHALL show the plans table, then the log table, the text "remediation log not connected in this deployment" WHEN the log is not available, and "no pull requests recorded" WHEN it is available and empty.
7. THE footer SHALL be "The JSON file is the record. This report is rendered from it. Long values are shortened here."
8. THE report SHALL pass every Untrusted string through `escapeField` before writing it.
9. FOR ANY pack whose Untrusted strings hold Markdown, HTML, pipes, backticks, newlines and a planted marker, removing every `escapeField` code span from the report SHALL leave no marker (security, 1000 runs).
10. FOR ANY two equal packs the reports SHALL be equal, and the Integrity section SHALL contain the digest (determinism, invariant).

### Requirement 6: Intake with manifests

**User Story:** As a security reviewer, I want to know exactly which manifest bytes the scan read, so that I can tie the pack to a repository state.

#### Acceptance Criteria

1. THE Engine SHALL expose `intakeRepoWithManifests(url, ctx)`, which resolves to `{ result, manifests }` where `result` is what `intakeRepo` returns for the same transport and `manifests` is `{ packageJson, packageLock }` with the texts intake read (`packageLock` `null` WHEN there is no lockfile) WHEN `result` is a success, and `null` otherwise; it SHALL NOT reject.
2. THE `intakeRepo` function SHALL keep its signature and results, and `IntakeSuccess`, `ScanMetadata`, `ScanResponse` and the web validator SHALL NOT change.

### Requirement 7: Evidence endpoint

**User Story:** As a security reviewer using the hosted app, I want to download the pack for a public repository, so that I do not need the CLI.

#### Acceptance Criteria

1. THE API SHALL answer `GET /api/evidence` on the existing scan Lambda with no new IAM permission, table or function.
2. THE Evidence request parser SHALL accept `repo` exactly once and `format` at most once with the value `json` or `md`, default `json`, SHALL check `repo` as `parseScanRequest` does, and SHALL return 400 `invalid-request` for any other name, a repeat or another format value, and 405 for a method other than GET.
3. WHEN the scan succeeds, THE API SHALL build the pack with the scan's intake packages, Manifest digests, Policy digest, Commit `null`, an empty remediation list and a `null` remediation log.
4. THE JSON response SHALL have content type `application/json; charset=utf-8` and the Pack file as body; THE Markdown response SHALL have `text/markdown; charset=utf-8` and the report as body.
5. Both responses SHALL carry `content-disposition: attachment; filename="sexton-evidence-<owner>-<repo>.<json|md>"` built from the parsed RepoRef only, `x-sexton-evidence-digest`, `cache-control: no-store`, `x-content-type-options: nosniff` and the correlation id header.
6. FOR ANY valid RepoRef the download file name SHALL hold only `A-Z a-z 0-9 . - _` (security, 1000 runs).
7. FOR ANY query string with an unknown or repeated parameter, THE parser SHALL reject it (rejection).
8. IF the scan fails, THEN THE API SHALL answer with the scan's error; IF the build fails, THEN the internal error; IF the body is larger than 5 MiB in UTF-8, THEN 422 `evidence-too-large` with a fixed message.
9. THE API SHALL log one line `{ msg: "evidence", status, format, packages, bytes, durationMs }` per request and SHALL NOT log the repository.
10. THE `x-sexton-evidence-digest` header SHALL equal `integrity.digest` of the pack.
11. `runScan` SHALL keep its behaviour and its tests.

### Requirement 8: Demo and web

**User Story:** As a reviewer of the demo, I want to download the pack from the header, so that I see the evidence without a scan.

#### Acceptance Criteria

1. THE demo generator SHALL write `packages/web/public/demo/evidence.json` and `evidence.md` from the same demo scan through `buildEvidencePack`, `serialiseEvidencePack` and `renderEvidenceMarkdown`, with Commit `null`, the demo remediations as plans and a `null` remediation log, and both files SHALL be ignored by git as `scan.json` is.
2. THE web HeaderModel SHALL gain `evidenceLinks`: `/demo/evidence.json` and `/demo/evidence.md` WHEN the loaded address is the demo address, directly or through `?scan=`; `${apiBase}/evidence?repo=<encoded Canonical URL>&format=json` and `format=md` WHEN the scan was requested through the repository form and has scan metadata; and `null` for any other `?scan=` load or a hosted scan without scan metadata.
3. WHEN `evidenceLinks` is not null, THE header SHALL show after the policy line "evidence pack: JSON, Markdown" as two links with the `download` attribute and the accessible names "Download evidence pack as JSON" and "Download evidence pack as Markdown".
4. THE web app SHALL NOT fetch the evidence; the axe test SHALL stay green and the e2e run SHALL check both demo links.

### Requirement 9: Fixtures and docs

**User Story:** As a maintainer, I want the pack checked against recorded data and documented, so that it does not drift.

#### Acceptance Criteria

1. THE fixture set SHALL add semver 7.8.6, recorded alone with `--package semver`, and every consumer that counts the fixture packages SHALL follow.
2. THE golden files `test/fixtures/evidence/expected-pack.json` and `expected-report.md` SHALL equal the pack and report built from the fixture scan with a fixed clock, the golden pack SHALL verify, and an edited copy SHALL fail with `digest-mismatch`.
3. THE fixture SBOM SHALL validate against the vendored CycloneDX 1.5 schema.
4. docs/architecture.md SHALL gain an evidence section, docs/threat-model.md the digest limit and the untrusted-text rule, README the evidence pack moved to "on main" and the endpoint, and ROADMAP the line "signed evidence packs".
