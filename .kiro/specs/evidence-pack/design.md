# Design Document: evidence-pack

## Overview

The evidence pack is the record a security reviewer hands to an auditor (R-EV-1 to R-EV-3). One JSON file holds the scan metadata, a CycloneDX 1.5 SBOM of the direct dependencies, every package with its ten signal envelopes, the policy result, and the remediation plans and log. A Markdown report is rendered from that file and nothing else. A SHA-256 digest over the RFC 8785 canonical form of the body lets a reviewer see an edit, when the reviewer got the digest from somewhere else.

The Engine stays pure. It builds, verifies and renders. Callers gather the inputs: the API on `GET /api/evidence` (this spec), the demo generator (this spec), the CLI (09), the hosted remediate path (10b).

```
caller ── intakeRepoWithManifests ─► result + manifest texts ── sha256HexOfText ─► manifest digests
       ── scorePackages, evaluatePolicy (as the scan does)
       ── buildEvidencePack({ report, dependencies, policyResult, policyDigest, commit, manifestDigests,
                               remediations, remediationLog }) ─► { ok, pack }
                 ├─ buildSbom ─► npmPurl, canonicalJson, sha256Hex (serial number)
                 └─ cleanJsonCopy(body) ─► canonicalJson ─► sha256HexOfText ─► integrity.digest
       ── serialiseEvidencePack(pack)       JSON file
       ── renderEvidenceMarkdown(pack)      Markdown file
reviewer ── verifyEvidencePack(value)  (exact)  or  jq -cjS .body file | shasum -a 256  (limits in Decisions, item 4)
```

### Research findings that shape the design

All read or run on 21 Nov 2026.

1. **No CycloneDX library.** `@cyclonedx/cyclonedx-library` 10.5.1 exists, is maintained and is Apache-2.0, so the requirements assumption in docs/requirements.md section 8 holds. It is not used: it is 5.2 MB unpacked, CommonJS while the Engine is ESM only, and it needs peer packages to validate. The SBOM here is about ten fields. It is written by hand and the official schema checks it in tests (handoff decision 1).
2. **The schema accepts a hand-written BOM.** A BOM with the fields of the SBOM section validates against the official CycloneDX 1.5 JSON schema under ajv 8.20.0 with `strict: false, validateFormats: false`, after `spdx.schema.json` and `jsf-0.82.schema.json` are added to the Ajv instance. The three files are vendored for tests in `packages/engine/test/fixtures/cyclonedx` (from https://github.com/CycloneDX/specification, folder schema, Apache-2.0). CycloneDX 1.5 requires only `bomFormat` and `specVersion` on the document and only `type` and `name` on a component, so a component may have no version. The `serialNumber` pattern is `^urn:uuid:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`.
3. **RFC 8785** (https://www.rfc-editor.org/rfc/rfc8785). Section 3.2.3: property names are sorted as arrays of UTF-16 code units compared as unsigned integers, recursively; array order is kept. Section 3.2.1: no white space between tokens. Section 3.2.2.2: strings are serialised as ECMAScript does (ECMA-262 24.3.2.2, which is `JSON.stringify`), and the Appendix A reference canonicaliser uses `JSON.stringify` for primitives. Section 3.2.2.3: numbers per ECMA-262 7.1.12.1, which is `JSON.stringify` for finite numbers; NaN and Infinity are errors. Section 3.2.2.2: lone surrogates must make the canonicaliser fail. Section 3.2.4: the result is encoded in UTF-8. So `canonicalJson` returns `null` for a lone surrogate or a non-finite number, and the builder first makes a Clean copy in which lone surrogates are already U+FFFD.
4. **Package URL, npm type.** https://github.com/package-url/purl-spec/blob/main/types/npm-definition.json: the namespace is the scope, "The npm scope @ sign prefix is always percent encoded", example `pkg:npm/%40angular/animation@12.3.1`; name and namespace are case sensitive. ECMA-427 (https://ecma-tc54.github.io/ECMA-427/) section 5.4: components are UTF-8 then percent-encoded; letters, digits and `. - _ ~` are never encoded, and "the colon ':', whether used as a separator character or otherwise" shall not be percent-encoded. The standard's examples use upper-case hex. See Decisions, item 2.
5. **CycloneDX property taxonomy.** `cdx:npm:package:development` is registered in https://github.com/CycloneDX/cyclonedx-property-taxonomy/blob/main/cdx/npm.md: "Whether the package was flagged as devDependency. Boolean value. If the property is missing, then assume the value to be false." So a dev dependency carries `cdx:npm:package:development` = `"true"` and no `sexton:origin`.
6. **semver 7.8.6** publishes provenance: its attestations hold the predicate `https://slsa.dev/provenance/v1` (recorded fixture `test/fixtures/packages/semver/attestations.json`). Recorded 21 Nov 2026 with `--package semver`: 0 advisories, published 2026-11-02, state Alive. No remediation fixture is needed.
7. **Web Crypto.** `globalThis.crypto.subtle.digest("SHA-256", bytes)` gives the same digest as `node:crypto` on Node 22, and exists in browsers, so the Engine needs no `node:` import.
8. **Byte order mark.** The Transport decodes bodies with `new TextDecoder("utf-8", { fatal: true })` (`packages/engine/src/http.ts`), whose `ignoreBOM` is false, so a leading U+FEFF is removed before intake or the policy reader sees the text. Manifest digests and the Policy digest are therefore over the decoded text without a BOM, re-encoded as UTF-8. A manifest with a BOM gives a digest that differs from `shasum` of the raw file by exactly those three bytes. The design records this rather than re-reading raw bytes, which the Transport does not expose.
9. **CloudFront forwards only `repo`.** The API behaviour `/api/*` exists, but its origin request policy (`infra/lib/edge-stack.ts`) forwards the `repo` query parameter only, so `format=md` would never reach the Lambda. See Decisions, item 1.

## Architecture

New files under `packages/engine/src/evidence`, one exported concept each:

```
canonical-json.ts    canonicalJson, cleanJsonCopy                      pure
sha256.ts            sha256Hex, sha256HexOfText                         Web Crypto only
purl.ts              npmPurl                                            pure
sbom.ts              buildSbom, SBOM_SCOPE_PROPERTY                     pure, async for the digest
build-pack.ts        buildEvidencePack, serialiseEvidencePack, BUILD_FAILURES, COMMIT_NOTE   pure, async
verify-pack.ts       verifyEvidencePack                                 pure, async
signal-summary.ts    SIGNAL_SUMMARIES                                   pure
render-markdown.ts   renderEvidenceMarkdown, DIGEST_LIMIT_SENTENCE      pure, sync
```

Changed: `types.ts` (pack types), `index.ts`, `intake/intake.ts` (`intakeRepoWithManifests`), `scripts/record-fixtures.mjs` (`--package`).

`packages/api`: `src/http/evidence-request.ts` (parser), `src/http/evidence-response.ts` (responses), `src/evidence.ts` (`runEvidence`), `src/scan.ts` (internal `scanWithInputs`), `src/scan-handler.ts` (routes by path), `src/http/responses.ts` (`evidence-too-large`), `src/contract.ts` (re-export `EvidencePack`), `scripts/generate-demo-scan.mjs`.

`packages/web`: `header/header-model.ts`, `header/Header.tsx`, `load/use-scan-loader.ts` (load source), `App.tsx`, e2e.

`infra/lib/edge-stack.ts`: the origin request policy forwards `format` too (Decisions, item 1).

Dependency direction: `evidence/*` imports `types.ts`, `version.ts`, `intake/resolve.ts` (`UNRESOLVED_VERSION`), `intake/url.ts`, `remediation/escape-field.ts`, `remediation/log-entry.ts`. Nothing under `evidence/` performs I/O.

## Components and Interfaces

### evidence/canonical-json.ts (Requirements 1.1 to 1.4)

```ts
export type JsonValue = null | boolean | number | string | readonly JsonValue[] | { readonly [key: string]: JsonValue };
export function canonicalJson(value: unknown): string | null;
export function cleanJsonCopy(value: unknown): { ok: true; value: JsonValue } | { ok: false };
```

`canonicalJson` walks the value with a stack of open containers: `null`, booleans; a number with `Number.isFinite` through `JSON.stringify`; a string with no lone surrogate through `JSON.stringify`; an array whose every element is a JSON value (an `undefined` or a hole fails); a plain object (prototype `Object.prototype` or `null`) whose own enumerable string keys hold no lone surrogate, sorted with the default `Array.prototype.sort` (UTF-16 code units), each `JSON.stringify(key) + ":" + value`. Anything else, a cycle, a symbol key or an accessor fails, and the whole result is `null`.

`cleanJsonCopy` builds the Clean copy with the same walk: strings and keys get lone surrogates replaced by U+FFFD; an own key whose value is `undefined` is dropped; a cycle, a non-JSON value, a non-finite number, or two keys that become equal after replacement fails. It reads values with own data property access only, never a getter, so it never runs input code. Both functions catch everything and never throw.

### evidence/sha256.ts (Requirements 1.5, 1.6)

```ts
export async function sha256Hex(bytes: Uint8Array): Promise<string>;
export async function sha256HexOfText(text: string): Promise<string>;   // TextEncoder, UTF-8
```

`globalThis.crypto.subtle.digest("SHA-256", bytes)`, lower-case hex. No `node:` import.

### evidence/purl.ts (Requirement 2.8)

```ts
export function npmPurl(name: string, version: string | null): string;
```

`@scope/name` gives namespace `%40scope` (the `@` encoded as part of the scope segment), name `name`. Each component is UTF-8 encoded, and every byte outside `A-Z a-z 0-9 . - _ ~ :` becomes `%XX` in upper case. Version `null` or `UNRESOLVED_VERSION` gives no `@` part.

### evidence/sbom.ts (Requirements 2.1 to 2.7)

```ts
export interface SbomInput {
  readonly repo: RepoRef; readonly commit: string | null; readonly generatedAt: string;
  readonly packages: readonly PackageHealth[]; readonly dependencies: readonly IntakePackage[];
}
export async function buildSbom(input: SbomInput): Promise<CycloneDxBom>;
```

Exactly these fields:

```json
{
  "bomFormat": "CycloneDX", "specVersion": "1.5", "version": 1, "serialNumber": "urn:uuid:…",
  "metadata": {
    "timestamp": "<generatedAt>",
    "tools": { "components": [ { "type": "application", "name": "sexton", "version": "<ENGINE_VERSION>",
      "externalReferences": [ { "type": "vcs", "url": "<REPO_URL>" } ] } ] },
    "component": { "type": "application", "name": "<owner>/<repo>", "bom-ref": "<canonical URL>", "version": "<commit, when known>",
      "externalReferences": [ { "type": "vcs", "url": "<canonical URL>" } ] },
    "properties": [ { "name": "sexton:sbom:scope", "value": "direct-dependencies" } ]
  },
  "components": [ { "type": "library", "group": "@scope", "name": "pkg", "version": "1.2.3",
    "purl": "pkg:npm/%40scope/pkg@1.2.3", "bom-ref": "pkg:npm/%40scope/pkg@1.2.3", "scope": "excluded",
    "properties": [ { "name": "sexton:state", "value": "Dead" }, { "name": "sexton:resolution", "value": "locked" },
                    { "name": "cdx:npm:package:development", "value": "true" } ] } ],
  "dependencies": [ { "ref": "<canonical URL>", "dependsOn": [ "<sorted bom-refs>" ] } ],
  "compositions": [ { "aggregate": "incomplete", "assemblies": [ "<canonical URL>" ], "dependencies": [ "<canonical URL>" ] } ]
}
```

- Components: the first PackageHealth per name, sorted by name in code-unit order. The IntakePackage is the first with the same name. Without one, no `scope`, no `sexton:resolution`, no development property.
- `compositions` is `incomplete` because transitive packages are not listed, peer and optional dependencies are skipped by intake, and the 300 cap may apply.
- No licences and no component hashes: Sexton collects neither. The SBOM does not claim what it does not know.
- `serialNumber`: build the BOM without it, take `canonicalJson`, SHA-256, the first 16 bytes; byte 6 becomes `(b & 0x0f) | 0x80`, byte 8 becomes `(b & 0x3f) | 0x80`; format as 8-4-4-4-12 lower-case hex. Same input, same serial; the builder stays pure. Inserted as the fourth key.

### evidence/build-pack.ts (Requirement 3)

```ts
export const COMMIT_NOTE = "commit not recorded, the scan read the default branch head";
export const BUILD_FAILURES = ["report has no scan metadata", "commit is not a 40 character hex string", "body is not serialisable"] as const;
export interface EvidenceInput {
  readonly report: HealthReport; readonly dependencies: readonly IntakePackage[];
  readonly policyResult: PolicyResult; readonly policyDigest: string | null; readonly commit: string | null;
  readonly manifestDigests: ManifestDigests; readonly remediations: readonly RemediationEntry[];
  readonly remediationLog: readonly RemediationLogEntry[] | null;
}
export async function buildEvidencePack(input: EvidenceInput): Promise<EvidenceBuildResult>;
export function serialiseEvidencePack(pack: EvidencePack): string;   // JSON.stringify(pack, null, 2) + "\n"
```

Steps: `report.scan` missing gives the first failure; a Commit that is neither `null` nor `/^[0-9a-f]{40}$/` the second; build the body from the input (fresh arrays and objects, nothing shared), `buildSbom`, `cleanJsonCopy(body)` (failure gives the third), `canonicalJson`, `sha256HexOfText`. Any throw on the way, from an arbitrary input value, is caught and gives "body is not serialisable". Log entries: `isValidLogEntry`, `repository` equal to the scan Canonical URL, sorted by `timestamp` then `branch` in code-unit order.

### evidence/verify-pack.ts (Requirement 4)

```ts
export async function verifyEvidencePack(value: unknown): Promise<{ ok: true } | { ok: false; reason: "malformed" | "unsupported-version" | "digest-mismatch" }>;
```

Order: not a plain object, or `evidenceVersion` not a number: `malformed`; a number other than 1: `unsupported-version`; `integrity` not exactly `{ algorithm: "SHA-256", canonicalization: "RFC 8785", digest: /^[0-9a-f]{64}$/ }`: `malformed`; `body` not a plain object or `canonicalJson(body) === null`: `malformed`; digest differs: `digest-mismatch`. Strict canonicalisation: a body with a lone surrogate is malformed rather than silently cleaned, so a cleaned and an uncleaned body never verify against one digest. Everything inside a try; never rejects.

### evidence/signal-summary.ts (Requirement 5.4)

```ts
export const SIGNAL_SUMMARIES: { readonly [K in SignalName]: (value: NonNullable<PackageSignals[K]["value"]>) => string };
```

A mapped type over `SignalName`, so a missing entry is a type error. Each returns Markdown in which every untrusted string is already through `escapeField`: `lastPublish` the instant or "no parseable publish date"; `deprecated` yes or no; `hasInstallScript` yes or no; `advisories` the count by severity; `maintainers` the count and names; `provenance` present with the predicate type, or absent; `transitiveReach` reach and graphs missing; `maintainerChange` status and event count; `provenanceRegression` status, with the versions for a regression; `newInstallScript` the versions. Advisory lines are listed under the table, at most 20 (`MAX_ADVISORIES_SHOWN`).

### evidence/render-markdown.ts (Requirement 5)

`renderEvidenceMarkdown(pack): string`. Sync, pure, the pack only. Every string from the pack goes through `escapeField` (escape, then truncate at 200 code points; no file is moved). Numbers through `String`. Booleans as yes or no. Fixed engine text is written as is.

```
# Sexton evidence pack: `{repository}`

## Integrity
- Digest: `{digest}`
- Algorithm: `SHA-256` over the `RFC 8785` canonical form of `body`, UTF-8 encoded
This digest shows an edit only to a reviewer who got it from somewhere else. It is not a signature.
{verification text}

## Scan
- Repository, Commit (or the note), Generated at, Engine version, Policy (version, source, digest or "none"),
  package.json digest, package-lock.json digest, Lockfile version, Unlocked, Capped, Direct dependencies,
  Skipped (peer, optional, invalid name), Unresolved, Unlocked packages

## Policy
Result: **pass** | **fail**
### Rule {index}: `{type}` `{name}`
Result, then "Failures:" list, "Not evaluated:" list, "Not found:" list (each only when non-empty)

## Packages
| Package | Version | State | Reason |     ordered by STATE_ORDER, then name

## Signals
### `{name}` `{version}`
| Signal | Value | Source | Fetched at |   ten rows, SIGNAL_NAMES order
advisory lines, at most 20, then "and N more in the JSON"

## SBOM
- Spec version, Serial number, Components; then the purl list

## Remediation
### Plans
| Package | Kind | Status | Title | Version | Major |     or "no plans"
### Log
| Repository | Branch | Package | Kind | Pull request | Time |   or one of the two fixed texts

The JSON file is the record. This report is rendered from it. Long values are shortened here.
```

Verification text: see Decisions, item 4.

### intake/intake.ts (Requirement 6)

```ts
export interface IntakeManifests { readonly packageJson: string; readonly packageLock: string | null }
export async function intakeRepoWithManifests(url: string, ctx: ClientContext): Promise<{ result: IntakeResult; manifests: IntakeManifests | null }>;
export async function intakeRepo(url, ctx): Promise<IntakeResult>;   // returns (await intakeRepoWithManifests(url, ctx)).result
```

`run` records the two texts it already holds. `manifests` is null for any failure. `IntakeSuccess` does not change (as 06 did for the scripts map), so every intake test and fixture stays as it is.

### packages/api/src/http/evidence-request.ts (Requirements 7.2, 7.7)

```ts
export const EVIDENCE_PATH = "/api/evidence";
export type EvidenceFormat = "json" | "md";
export function parseEvidenceRequest(event): { ok: true; repoUrl: string; repo: RepoRef; format: EvidenceFormat } | { ok: false; status: 405 | 400; code: … };
```

Method GET, path exact. `URLSearchParams` entries: every name is `repo` or `format`, `repo` exactly once, `format` at most once and `json` or `md`. `repo` at most 512 characters and through `parseRepoUrl`, as `parseScanRequest`. Pure.

### packages/api/src/http/evidence-response.ts (Requirements 7.4 to 7.6, 7.8, 7.10)

`evidenceFileName(repo, format)`: `sexton-evidence-${safe(owner)}-${safe(repo)}.${json|md}` where `safe` replaces any character outside `A-Za-z0-9._-` with `_` (a valid RepoRef never has one; the filter is belt and braces). `evidenceResponse(body, format, repo, digest, requestId)` builds the headers. `MAX_EVIDENCE_BYTES = 5 * 1024 * 1024`; the size check counts UTF-8 bytes; over it the spec is `{ status: 422, body: { code: "evidence-too-large", message: "The evidence pack is larger than 5 MiB." } }`.

### packages/api/src/scan.ts and evidence.ts (Requirements 7.3, 7.8, 7.9, 7.11)

`scan.ts` gains an internal `scanWithInputs(repoUrl, deps, summary)` that returns the scan body plus `dependencies` (intake packages), `manifestDigests` and `policyDigest`. `scan()` calls it and keeps only the body, so `runScan` keeps its behaviour and tests. With an injected `deps.intake` the manifests are unknown, so both manifest digests are `null`. `runEvidence(request, deps)` calls `scanWithInputs`, then `buildEvidencePack` with commit `null`, remediations `[]`, log `null`, then serialises or renders, checks the size, and logs `{ msg: "evidence", status, format, packages, bytes, durationMs }`. Never rejects.

### packages/api/src/scan-handler.ts

When `rawPath === EVIDENCE_PATH` the handler runs the evidence path; every other path goes to the scan path unchanged (which rejects unknown paths as before). One Lambda, one role, no new IAM.

### Demo (Requirement 8.1)

`generate-demo-scan.mjs` returns the demo intake list from `demoRemediations` and, from the same scan, calls `buildEvidencePack` (commit `null`, manifest digests `null` because the demo has no manifests, policy digest `null`, the demo remediations, log `null`) and writes `evidence.json` with `serialiseEvidencePack` and `evidence.md` with `renderEvidenceMarkdown`. `.gitignore` lists both beside `scan.json`.

### Web (Requirements 8.2 to 8.4)

`LoadState` ready gains `source: "demo" | "hosted" | "address"`: `submitRepo` loads with `hosted`, the initial load with `demo` when the address is the demo address and `address` otherwise. `headerModel(response, isDemo, hostedApiBase)` sets `evidenceLinks`: demo links when `isDemo`; hosted links when `hostedApiBase` is not null and `report.scan` exists; otherwise null. `App` passes `apiBase` only for a hosted load. `Header` renders `<p className="header-evidence">evidence pack: <a href download aria-label="Download evidence pack as JSON">JSON</a>, <a … Markdown>Markdown</a></p>` after the policy line. No fetch.

## Data Models

```ts
export interface ManifestDigests { readonly packageJson: string | null; readonly packageLock: string | null }
export interface EvidenceScan {
  readonly repository: string; readonly commit: string | null; readonly commitNote: string | null;
  readonly generatedAt: string; readonly engineVersion: string;
  readonly policy: { readonly version: 1; readonly source: PolicySource; readonly digest: string | null };
  readonly manifests: ManifestDigests;
  readonly unlocked: boolean; readonly unlockedPackages: readonly string[]; readonly lockfileVersion: LockfileVersion | null;
  readonly capped: boolean; readonly totalDirect: number; readonly skipped: SkippedCounts; readonly unresolved: readonly string[];
}
export interface EvidencePlan { packageName; kind; status; title; chosenVersion?; majorUpgrade? }
export interface EvidenceBody {
  readonly scan: EvidenceScan; readonly sbom: CycloneDxBom; readonly packages: readonly PackageHealth[];
  readonly policy: PolicyResult;
  readonly remediation: { readonly plans: readonly EvidencePlan[]; readonly log: { readonly available: boolean; readonly entries: readonly RemediationLogEntry[] } };
}
export interface EvidenceIntegrity { readonly algorithm: "SHA-256"; readonly canonicalization: "RFC 8785"; readonly digest: string }
export interface EvidencePack { readonly evidenceVersion: 1; readonly body: EvidenceBody; readonly integrity: EvidenceIntegrity }
export type EvidenceBuildResult = { ok: true; pack: EvidencePack } | { ok: false; reason: EvidenceBuildFailure };
export type EvidenceVerifyResult = { ok: true } | { ok: false; reason: "malformed" | "unsupported-version" | "digest-mismatch" };
```

`CycloneDxBom` and its parts are typed in `types.ts` with exactly the fields above. No package name is ever an object key: every collection is a list.

Fixtures:

- `test/fixtures/cyclonedx/`: the three schema files and their README, copied from the handoff assets. Tests only.
- `test/fixtures/packages/semver/`: recorded with `node scripts/record-fixtures.mjs --package semver`.
- `test/fixtures/evidence/expected-pack.json`, `expected-report.md` and `README.md` (companion notes): the fixture scan of the eleven packages at `NOW`, intake rows `^installed` in dependencies except where the notes say, default policy, no remediations, log `null`, commit `null`.

## Error Handling

| Situation | Result |
|---|---|
| report without `scan` | `{ ok: false, reason: "report has no scan metadata" }` |
| commit not null and not 40 lower-case hex | "commit is not a 40 character hex string" |
| a non-finite number, a cycle, a function, a key collision after cleaning, any throw | "body is not serialisable" |
| log entry invalid or for another repository | dropped, never thrown |
| verify: not an object, wrong integrity, unserialisable body | `malformed` |
| verify: evidenceVersion 2 | `unsupported-version` |
| verify: any edit | `digest-mismatch` |
| API: bad query | 400 `invalid-request` or `invalid-url`, 405 for a method |
| API: scan error | the scan's error spec |
| API: build failure | 500 `internal-error` |
| API: body over 5 MiB | 422 `evidence-too-large`, fixed message |

No error message copies input.

## Security

- The digest is not a signature. Anyone who can edit the file can recompute it. It proves integrity only against a digest obtained separately, which is why the API also sends it in `x-sexton-evidence-digest` and why the threat model says so. Signing is on the roadmap.
- Every string in the pack except the fixed engine texts is untrusted: package names, versions, reasons, advisory summaries, maintainer names, sources, URLs, titles. The Markdown report writes each only through `escapeField`, so no line of it can open a heading, a link, HTML or a table cell.
- The download file name is built from the parsed RepoRef and filtered to `A-Za-z0-9._-`, so no header injection or path is possible through it.
- The evidence path uses the scan path's fetches, caps, WAF and logging. No new permission, table, function or origin.
- The API never logs the repository on the evidence line.

## Dependencies

None added at run time. `ajv` 8.20.0 is already an Engine dependency and is used by the schema test only.

## Testing Strategy

Vitest and fast-check 3.23.1, `numRuns` 100, 1000 for properties 32, 39 and 41. Arbitraries in `test/evidence/arbitraries.ts`: `arbJsonValue` (deep, astral strings, large and small numbers; properties 30 and 32 use values without lone surrogates or `-0`, properties 31, 33 and 40 also see lone surrogates through the hostile packages), `arbPackageHealth` (from the existing report arbitraries, with scoped names, `unresolved` versions, hostile strings in reasons, sources and advisory summaries), `arbEvidenceInput` (report with scan, intake rows matching some packages with either origin, policy result, digests, commit or null, remediations, log entries valid and invalid), `arbRepoRef`.

Example tests: canonical texts from the RFC 8785 Appendix B number samples that JavaScript produces, key order with astral keys, the BOM schema test with the fixture scan, the purl example `pkg:npm/%40types/node@22.10.2`, each build failure, each verify reason, each Markdown fixed text, the golden pack and report, the edited golden pack, a source scan for `node:` under `src`, the intake wrapper equivalence, the API request table, response headers, the size limit, the log line, the demo files, header links, the axe test, the e2e links.

Deliberate test changes: tests that count the fixture packages (ten to eleven, demo eleven to twelve graves and totalDirect).

## Correctness Properties

Each property is one test tagged `Feature: evidence-pack, Property {n}: {title}`. Numbering continues from the migration spec's 29.

### Property 30: Canonical round trip and idempotence
For any JSON value without lone surrogates or negative zero, `JSON.parse(canonicalJson(v))` deep-equals `v`, and `canonicalJson` of that equals the first text.
**Validates: Requirements 1.1, 1.2**

### Property 31: Key order does not change the digest
For any JSON value and any reordering of its object keys, the canonical text is equal; for any built pack, reordering the body keys and a Pack file parse and reprint leave `verifyEvidencePack` ok and the digest recomputed equal.
**Validates: Requirements 1.3, 4.6**

### Property 32: Any leaf edit is caught (1000 runs)
For any built pack and any one leaf of its body changed to a JSON value with no lone surrogate whose canonical text differs, the verifier returns `digest-mismatch`.
**Validates: Requirement 4.5**

### Property 33: Built packs verify
For any input that builds, the pack verifies, and so does `JSON.parse(serialiseEvidencePack(pack))`.
**Validates: Requirements 3.8, 3.9, 4.4**

### Property 34: SHA-256 equals node:crypto
For any string, `sha256HexOfText` equals `createHash("sha256").update(s, "utf8")` hex (test-side import only).
**Validates: Requirement 1.5**

### Property 35: The SBOM validates for any package set
For any package set with scoped names, unresolved versions, dev and prod origins, missing intake rows and zero packages, the SBOM validates against the vendored 1.5 schema.
**Validates: Requirements 2.1 to 2.4, 2.6**

### Property 36: SBOM references
For any package set with distinct names, bom-refs are unique, `dependsOn` equals the set of component bom-refs, and the component count equals the package count.
**Validates: Requirements 2.2, 2.3, 2.7**

### Property 37: purl round trip
For any valid package name and version string, decoding the purl (split, percent-decode, rejoin the scope) gives back the name and the version; an unresolved version gives no version part.
**Validates: Requirement 2.8**

### Property 38: Serial number
For any package set, the serial number matches the schema pattern, has version nibble 8 and variant bits 10, and is equal for equal input.
**Validates: Requirement 2.5**

### Property 39: No raw untrusted line in the report (1000 runs)
For any pack whose untrusted strings carry a planted marker with Markdown, HTML, pipes, backticks and newlines, removing every `escapeField` code span from the report leaves no marker.
**Validates: Requirements 5.8, 5.9**

### Property 40: Builder total, pure and deterministic
For any input value, including arbitrary values in every field, `buildEvidencePack` resolves, never rejects, does not change a deep copy taken before the call, returns a reason from `BUILD_FAILURES` on failure, and returns deeply equal results for deeply equal inputs. Equal packs give equal Markdown, and the Integrity section contains the digest.
**Validates: Requirements 1.4, 3.1, 3.10, 5.10**

### Property 41: Download file name (1000 runs)
For any valid RepoRef and format, the file name matches `^sexton-evidence-[A-Za-z0-9._-]+-[A-Za-z0-9._-]+\.(json|md)$`.
**Validates: Requirement 7.6**

### Property 42: The request parser rejects unknown and repeated parameters
For any query string that holds a name other than `repo` and `format`, a repeated name, or a format other than `json` and `md`, `parseEvidenceRequest` returns 400 `invalid-request`; for any valid repo with format absent, `json` or `md` in any order, it accepts with the canonical URL.
**Validates: Requirements 7.2, 7.7**

## Requirement Traceability

| Criterion | Covered by |
|---|---|
| 1.1, 1.2 | property 30, RFC examples |
| 1.3 | property 31 |
| 1.4 | property 40, examples |
| 1.5 | property 34 |
| 1.6 | source scan test |
| 2.1 to 2.4 | property 35, schema test, examples |
| 2.5 | property 38 |
| 2.6 | property 35, fixture schema test |
| 2.7 | property 36 |
| 2.8 | property 37, example |
| 3.1, 3.10 | property 40 |
| 3.2 to 3.7 | examples, golden pack |
| 3.8, 3.9 | property 33 |
| 4.1 to 4.3 | examples |
| 4.4 | property 33 |
| 4.5 | property 32 |
| 4.6 | property 31 |
| 5.1 to 5.7 | examples, golden report |
| 5.8, 5.9 | property 39 |
| 5.10 | property 40 |
| 6.1, 6.2 | examples, intake equivalence test over the recorded intake fixtures |
| 7.1 | review constraint, infra tests unchanged except the forwarded parameter |
| 7.2, 7.7 | property 42, request table |
| 7.3 to 7.5, 7.8 to 7.11 | api examples |
| 7.6 | property 41 |
| 8.1 | demo generator test |
| 8.2, 8.3 | header model and header tests, including `?scan=/demo/scan.json` |
| 8.4 | axe test, e2e |
| 9.1 | fixture scan test |
| 9.2, 9.3 | golden test, schema test |
| 9.4 | review |

## Decisions made during implementation

Each is the choice that keeps the smallest surface.

1. **CloudFront forwards `format`.** The handoff says no infra change. The `/api/*` behaviour already reaches the Lambda, but its origin request policy forwards only `repo`, so the hosted Markdown link would silently return JSON. The one change is `allowList("repo", "format")` in `infra/lib/edge-stack.ts` and the matching line of its test: no new permission, table, function or behaviour. It takes effect on the next deploy, which this spec does not run. Until then the hosted JSON link works and the hosted Markdown link returns JSON.
2. **purl leaves `:` unencoded.** The handoff lists the unencoded set as letters, digits and `. - _ ~`. ECMA-427 section 5.4 also never encodes the colon. A valid npm name never holds `:` and a semver version never does, so only an odd lockfile version could differ; the standard wins.
3. **Duplicate package names** (never produced by intake) keep the first PackageHealth in the SBOM, so bom-refs stay unique; the `packages` list keeps every entry.
4. **Verification text.** `jq-1.7.1-apple` is installed on the Mac. `jq -cjS .body evidence.json | shasum -a 256` is run once against the demo pack in task 9 and recorded in item 9. jq differs from RFC 8785 in three places that a pack can reach: it writes U+007F as `\u007f` where `JSON.stringify` leaves it raw, it sorts keys by code point rather than UTF-16 code units (only keys holding characters above U+FFFF and U+E000 to U+FFFF differ), and it writes numbers of 1e21 and above with an exponent in upper case. Pack keys are fixed engine names, and its numbers are small integers, so only a U+007F inside an upstream string can make the command disagree with an unedited pack. The report therefore prints the command together with that limit and names `verifyEvidencePack` (and `sexton evidence` from 09) as the exact check: `VERIFY_TEXT` = "To check it, run `jq -cjS .body <evidence JSON file> | shasum -a 256` and compare the result with the digest above. The command matches RFC 8785 for this pack unless a string in it holds the character U+007F; verifyEvidencePack in the Sexton engine is exact." When the demo trial fails, the report prints only "Recompute SHA-256 over the RFC 8785 canonical form of body." and item 9 says so.
5. **`canonicalJson` is strict and `cleanJsonCopy` is separate.** The builder cleans then canonicalises; the verifier only canonicalises, so a lone surrogate in a received body is `malformed`, never silently cleaned into a match.
6. **The web load source.** A load through `?scan=` of the demo address itself is the demo (the existing `isDemo` rule), so it shows the demo links (Requirement 8.2); every other `?scan=` load shows none.
7. **Fixture intake rows for the golden pack** are built as the demo builds them: `^installed`, dependencies, locked.
8. **Manifest and policy digests over decoded text.** See Research finding 8.
9. **Verification trial.** Filled in task 9 from the demo pack.
10. **Hosted Markdown before the next deploy.** Until item 1 is deployed, CloudFront strips `format`, so the hosted Markdown link downloads JSON. The README says so. The local and demo paths are unaffected.
11. **Evidence request errors carry their own fixed message.** `invalid-request` on `/api/evidence` reads "Send GET /api/evidence?repo=<public GitHub URL>&format=json or md." so the scan text never appears on the evidence path.
12. **Each hosted download runs its own scan.** The pack can differ from the scan on screen (time, signals) and each download counts against the WAF rate rule. The README and the threat model say so.
13. **Log entries sort by timestamp text.** `isValidLogEntry` admits offsets, so two instants with different offsets sort by text, not time. Entries written by 10b are UTC (`Z`), where text order is time order.
14. **The golden files embed `ENGINE_VERSION`.** A version bump changes `expected-pack.json` and `expected-report.md`; the fixture README says so.
15. **`evidence-too-large` is an API code only.** The web app never reads API error codes, so its validator does not change.
