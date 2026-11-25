# Design Document: new-signals

## Overview

Two Possession signals join the ten of history-signals:

- **publisherChange** compares who published the Installed version, and how, with its Earlier version.
- **newDependency** lists the dependencies the Installed version added, and for each one (at most five) the version a fresh install would have resolved at the Parent publish time, when that version was published, and whether it has an install script.

Both come from the full packument scoring already holds. newDependency also reads two packuments per added dependency name, through the cache.

Two Possessed rules read them, and they sit after the Existing rules (owner decision at `go`, 25 Nov 2026):

1. New dependency rule: an added dependency whose resolved version has an install script, or was published at most 7 days before the parent version. Reason `new dependency in <version>: <name>`.
2. Publisher rule: the publisher name changed and the method went from trusted publisher to token. Reason `publisher changed in <version>: <old> to <new>`.

Everything else the signals see is evidence only.

### What is fetched today (checked in the code, 25 Nov 2026)

- `scoreOne` reads the full packument once through `readFullPackument` (cache key `npm-packument|<name>|*`). It feeds `fetchPackumentSignals`, `fetchFullPackumentDocument` (maintainers, history signals) and the timeline sink.
- It reads the abbreviated packument once (`npm-abbreviated|<name>|*`) for `hasInstallScript` and `newInstallScript`.
- The provenance signal reads `/-/npm/v1/attestations/<name>@<version>` and keeps only whether an attestation with the SLSA predicate exists. It does not say how the version was published.
- The full packument version entry carries `_npmUser` (with `trustedPublisher` for an OIDC publish), `dependencies` and `dist.attestations`. Nothing reads `_npmUser` or `dependencies` today.

So publisherChange needs no new request. The Publish method comes from `_npmUser.trustedPublisher` in the same document, not from the attestations endpoint (see Decisions, 2).

### Research findings (25 Nov 2026)

| Fact | Where checked |
|---|---|
| A trusted-publisher version entry has `_npmUser: { name: "GitHub Actions", email: "npm-oidc-no-reply@github.com", trustedPublisher: { id: "github", oidcConfigId: … } }`. A token publish has `_npmUser: { name, email }` only. | `https://registry.npmjs.org/axios` (1.13.6, 1.14.0, 1.15.0) and `https://registry.npmjs.org/keyv` (6.0.0-beta.3 on), read live. Trusted publishing is described at https://docs.npmjs.com/trusted-publishers. |
| The abbreviated packument has `name`, `dist-tags`, `versions`, `modified`, and no `time` map. Its version entries have `hasInstallScript`. | `https://registry.npmjs.org/esbuild` with `Accept: application/vnd.npm.install-v1+json`, read live. |
| axios 1.14.1 was "published by compromised jasonsaayman account", "published manually with a stolen npm access token, with no OIDC binding". "Every legitimate Axios 1.x release is published via GitHub Actions with npm's OIDC Trusted Publisher mechanism". "The only change in both poisoned Axios versions is a single new dependency: plain-crypto-js@^4.2.1." plain-crypto-js 4.2.1 "executed a postinstall hook". | https://www.trendmicro.com/en_us/research/26/c/axios-npm-package-compromised.html (redirects to the same slug on trendaisecurity.com) |
| plain-crypto-js time map: 4.2.0 `2026-03-30T05:57:32.867Z`, 4.2.1 `2026-03-30T23:59:12.278Z`. Both versions are now removed; the holder 0.0.1-security.0 remains. | `https://registry.npmjs.org/plain-crypto-js`, read live |
| axios 1.14.0 dependencies: `form-data ^4.0.5`, `proxy-from-env ^2.1.0`, `follow-redirects ^1.15.11`. 1.14.1 has no version entry any more. | `https://registry.npmjs.org/axios` |
| "The npm manifest identifies GitHub Actions as the trusted publisher for `keyv@6.0.0`". No new dependency is named; "Only three paths differ". 6.0.0-rc.1 is a trusted-publisher version. | https://snyk.io/blog/inside-keyv-npm-compromise-preinstall-malware-trusted-provenance-ide-hooks/ and `https://registry.npmjs.org/keyv` |

### Express scan before this spec (25 Nov 2026, engine 0.1.0)

44 packages: 2 Dead (eslint 8.47.0, supertest 6.3.4, both deprecated), 14 Restless, 28 Alive, 0 Possessed. Output kept in `build/ns-express-before/scan.json`.

A throwaway script computed the proposed rules on the same 44 packages before the spec was written:

- Earlier version as defined here: 15 publisher name changes, every one token to token or token to trusted publisher. No trusted publisher to token change. No new dependency in any package. **0 packages turn Possessed.**
- Earlier version as "published just before it" in Version order: the same 0, but cross-line noise: body-parser 2.4.0 compared with 1.20.9, finalhandler 2.1.1 with 1.3.2, send 2.x with 0.19.2 (one "new" dependency, mime-types), and mocha 11.8.0 with 12.0.0-rc.5 (five "new" dependencies, the cap hit). That noise is why the Earlier version is defined by semver (Decisions, 1).

The after run is recorded in "Notes and open items".

## Architecture

```
scoreOne
  ├─ readFullPackument ─────────────┐ (already fetched, cached)
  │                                 ├─ publisherChangeValue(full, installed)        pure, publisher.ts
  │                                 └─ dependencyDiff(full, installed)              pure, new-dependency.ts
  │                                        │ names (≤5, valid)
  │                                        ▼
  │                         readFullPackument(dep), readAbbreviatedPackument(dep)   clients/npm.ts, cached
  │                                        │
  │                                        ▼
  │                         newDependencyValue(diff, docs)                          pure, new-dependency.ts
  ▼
buildHealth → stateFromSignals → evaluateState (two new rules first)               state.ts
timeline sink / timelineFacts(... publisherChange, newDependency) → stateAsOf      timeline/
```

The pure parts take documents in and give values out. The only I/O is the two dependency reads, through the existing client functions and the cache.

## Components and Interfaces

### history.ts: earlierVersion (pure)

```ts
export function earlierVersion(fullPackument: unknown, installed: string): PublishedVersion | null
```

Uses `publishedVersions` and `semver` (already an engine dependency). Candidates: valid semver, publish time strictly before the Installed version's, `semver.lt(candidate, installed)`. Returns the one with the greatest semver precedence. Null when the Installed version is not a valid semver version or not a Published version.

### publisher.ts (pure, new file)

```ts
export function publishRecord(fullPackument: unknown, version: PublishedVersion): PublishRecord
export function publisherChangeValue(fullPackument: unknown, installed: string): PublisherChangeValue
```

Reads `versions[v]._npmUser` with own-property checks only. `name` must be a non-empty string, else null. Method per the Glossary.

### new-dependency.ts (pure, new file)

```ts
export const NEW_DEPENDENCY_CAP = 5;
export const FRESH_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export interface DependencyDiff {
  readonly status: "no-earlier-version" | "compared";
  readonly installedVersion: string;
  readonly installedPublishTime: string | null;
  readonly earlierVersion: string | null;
  readonly added: readonly { readonly name: string; readonly range: string }[];   // all, sorted
}
export function dependencyDiff(fullPackument: unknown, installed: string): DependencyDiff
export function detailNames(diff: DependencyDiff): readonly { name: string; range: string }[]  // first 5
export function resolveDependency(dep: { name; range }, parentPublishMs: number,
  full: DocRead, abbreviated: DocRead): NewDependencyEntry
export function newDependencyValue(diff: DependencyDiff, details: readonly NewDependencyEntry[]): NewDependencyValue
export function isFresh(entryPublishMs: number, parentPublishMs: number): boolean
```

`DocRead` is `{ ok: true; doc: unknown } | { ok: false; reason: string }`. A range longer than 256 characters is treated as not a semver range and is cut to 256 characters in the entry. `resolveDependency` uses `semver.validRange` and `semver.maxSatisfying` over the dependency's Published versions with publish time ≤ the Parent publish time. Install script flag: `hasInstallScript === true` in the abbreviated entry gives true; an abbreviated entry present without it gives false; no entry gives null.

### clients/new-dependency.ts (I/O, new file)

```ts
export async function fetchNewDependencySignal(ctx: ClientContext, name: string, installed: string,
  full: PackumentDocument): Promise<Signal<NewDependencyValue>>
```

Calls the pure functions, then reads each detail name with `readFullPackument` and `readAbbreviatedPackument` (the existing cache keys, so a dependency that is also a direct dependency costs nothing), one name at a time. Invalid names (`isValidPackageName` from intake/names.ts) are not requested. Never throws.

### state.ts

`StateInputs` gains optional `publisherChange` and `newDependency`. `evaluateState` checks, after the Existing rules and before the all-unavailable shortcut:

```ts
const fresh = inputs.newDependency?.status === "compared"
  ? inputs.newDependency.added.find((d) => d.installScript === true || d.fresh === true) : undefined;
if (fresh) return { state: "Possessed", stateReason: `new dependency in ${inputs.newDependency.installedVersion}: ${fresh.name}` };
const pc = inputs.publisherChange;
if (pc?.status === "changed" && pc.earlier.method === "trusted-publisher" && pc.installed.method === "token")
  return { state: "Possessed", stateReason: `publisher changed in ${pc.installed.version}: ${pc.earlier.publisher} to ${pc.installed.publisher}` };
```

`fresh` is stored in each entry (computed by `isFresh` when the value is built), so the state function does no date arithmetic on these inputs and the as-of code passes the same value. `stateFromSignals` copies the two signals when available, as it does for the other Possession signals.

### types.ts

```ts
export type PublishMethod = "trusted-publisher" | "token" | "unknown";
export interface PublishRecord { version: string; publisher: string | null; method: PublishMethod; publishTime: string }
export type PublisherChangeValue =
  | { status: "no-earlier-version"; installed: PublishRecord | null }
  | { status: "same" | "changed" | "unknown"; installed: PublishRecord; earlier: PublishRecord };

export interface NewDependencyEntry {
  name: string; range: string;
  resolvedVersion: string | null; resolvedPublishTime: string | null;
  installScript: boolean | null; fresh: boolean;
  reason?: string;              // why a field is null, fixed texts only
}
export type NewDependencyValue =
  | { status: "no-earlier-version"; installedVersion: string }
  | { status: "compared"; installedVersion: string; earlierVersion: string; installedPublishTime: string;
      addedCount: number; capped: boolean; added: readonly NewDependencyEntry[] };
```

`NEW_SIGNAL_NAMES` gains `"publisherChange"` and `"newDependency"` at the end, so `SIGNAL_NAMES` has twelve entries. `NewSignals` gains both. `buildHealth` fills them with "not evaluated" when absent, as for the others. `unresolvedHealth` covers them through `SIGNAL_NAMES`.

Entry reasons are a closed set: "invalid package name", "range is not a semver range", "no version satisfies the range at the parent publish time", "packument unavailable: <failure>", "abbreviated packument unavailable: <failure>". The failure text comes from `describeFailure` and passes `cleanReason`.

### timeline

`TimelineFactsInput` gains `publisherChange` and `newDependency` (signals or null). `TimelineFacts` gains the two values or null. `stateAsOf`'s `buildInputs` sets them in the inputs when the Installed version's Seen time is at or before the As-of date. No candidate instant is added: the Installed version's Seen time is already one. `api/src/timelines.ts` and the demo generator pass `health.signals.publisherChange` and `.newDependency`.

### Evidence, PR body, CLI

- `evidence/signal-summary.ts`: `publisherChange`: `same: <name> (<method>)`, `changed: <old> (<method>) to <new> (<method>) in <version>`, `unknown`, `no earlier version`. `newDependency`: `none`, `no earlier version`, or `<n> new: name range -> version (published <time>, install script yes|no|unknown)`, joined with `; `, plus `, capped at 5` when capped. All strings through `escapeField`.
- `remediation/pr-body.ts`: two `case` rows with the same content through `F` and `list(..., limit)`.
- `cli/src/table.ts`: columns "Publisher" (`same`, `changed`, `unknown`, `none`) and "New deps" (the count, `5+` when capped). Through `safe`.
- The PR body lists signals by `SIGNAL_NAMES`, so the order is the type order. No other PR body change.

### Recorder and fixtures

`scripts/record-fixtures.mjs` gains `--signals`. For each fixture package it reads the live full and abbreviated packuments, finds the Earlier version with the same rule as the engine (a copy in plain JavaScript, as the recorder already copies `attestationsUrl` and `isValidPackageName`), and merges into the existing files:

- `packument.json`: for the Installed and the Earlier version, `_npmUser` (`name` and, when present, `trustedPublisher: {}` only), `dependencies` and `maintainers` (names only). The Earlier version's key is new in `versions`; its `time` entry is already recorded, because the recorder keeps the whole time map.
- `abbreviated.json`: the Earlier version's `hasInstallScript`, so that the new key does not read as "no install script" in `newInstallScriptEvents`.

`maintainers` is recorded per version because `timeline/facts.ts` falls back to `[_npmUser.name]` when a version entry has no `maintainers`. Without it, adding `_npmUser` would invent a one-name maintainer list and could give a false maintainer-change Segment. With it, the timeline reads the real per-version lists of two versions, which can change a demo Segment where the real lists differ. The task diffs the demo timelines and the signals before and after and records every change in "Notes and open items".

For each New dependency name read in detail it writes `test/fixtures/new-dependencies/<name>/packument.json` (time map and the version keys) and `abbreviated.json` (`hasInstallScript` of the resolved version only). Every other recorded field stays byte-identical.

The recorded `trustedPublisher` keeps no `oidcConfigId`: only presence is read.

`fixture-routes` (engine test helper and the api copy) add routes for `new-dependencies/<name>` when the folder exists.

### Replays

`replay-facts.mjs` gains, per version, `publisher` (`{ name, method }` or null) and `dependencies` (object or null), and per replay a `newDependencies` map `{ <name>: { resolvedVersion, resolvedPublishTime, installScript } }`. The axios facts:

| Version | Publisher | Method | Dependencies | Source |
|---|---|---|---|---|
| 1.14.0 | GitHub Actions | trusted-publisher | form-data ^4.0.5, proxy-from-env ^2.1.0, follow-redirects ^1.15.11 | registry |
| 1.14.1 | null (left out, see Decisions 12) | token | the three above and plain-crypto-js ^4.2.1 | Trend Micro |
| plain-crypto-js 4.2.1 | | | published 2026-03-30T23:59:12.278Z, install script true (postinstall) | registry time map, Trend Micro |

keyv: 6.0.0-rc.1 GitHub Actions trusted-publisher (registry), 6.0.0 GitHub Actions trusted-publisher (Snyk). Dependencies null for 6.0.0 (no source gives them), so newDependency for 6.0.0 is not derived.

`replayStateInputs` builds `publisherChange` and `newDependency` from the facts with the Earlier version taken from the facts list by the same semver rule, and leaves them out when a needed fact is null. Expected Segments:

- axios: 23:21:58 Alive; 00:21:58 Possessed `provenance regression: 1.14.1 has no provenance, 1.14.0 had it`, unchanged. The New dependency rule also matches on the 1.14.1 facts and is kept as evidence; publisherChange is `unknown` because the 1.14.1 name is left out; 03:29 Alive. The replay files change only by the evidence. The story text keeps its words until task 10, which adds one sentence: plain-crypto-js 4.2.1 was published 22 minutes before axios 1.14.1.
- keyv: 08:35 Alive; 09:35 Possessed `install script added in 6.0.0`, unchanged. publisherChange for 6.0.0 is `same` (both trusted publisher).

The replay report signals of the Scan-date version: axios's is 1.14.0, whose Earlier version (1.13.6) is not in the facts, so both signals are unavailable "not in public reports". keyv's 6.0.0 has publisherChange available (`same`) and newDependency unavailable "not in public reports".

## Data Models

publisherChange for a version shaped like axios 1.14.1 (the replay itself leaves the name out, Decisions 12):

```json
{ "status": "changed",
  "installed": { "version": "1.14.1", "publisher": "a maintainer account", "method": "token", "publishTime": "2026-03-31T00:21:58.168Z" },
  "earlier":   { "version": "1.14.0", "publisher": "GitHub Actions", "method": "trusted-publisher", "publishTime": "2026-03-27T19:01:40.915Z" } }
```

newDependency for axios 1.14.1:

```json
{ "status": "compared", "installedVersion": "1.14.1", "earlierVersion": "1.14.0",
  "installedPublishTime": "2026-03-31T00:21:58.168Z", "addedCount": 1, "capped": false,
  "added": [ { "name": "plain-crypto-js", "range": "^4.2.1", "resolvedVersion": "4.2.1",
               "resolvedPublishTime": "2026-03-30T23:59:12.278Z", "installScript": true, "fresh": true } ] }
```

## Error Handling

| Failure | Result |
|---|---|
| Full packument of the package fails | Both signals unavailable with the failure reason. No dependency request. |
| Installed version not a Published version, or not semver | `no-earlier-version` for both. |
| `_npmUser` missing or malformed | Publisher null, method `unknown`; status `unknown` when compared. Never Possessed. |
| A dependency packument fails, 404 included | The entry has null fields and a reason. The signal stays available. Resolving needs the full packument's time map, so when the full read fails the entry has no Resolved dependency version, no Install script flag and cannot give Possessed. When only the abbreviated read fails, the entry can still be Fresh. |
| Invalid dependency name | No request, reason "invalid package name". |
| Range not semver (git URL, `file:`, `npm:` alias, `workspace:`) | No resolved version, reason "range is not a semver range". |
| More than 5 new names | First 5 by name in detail, `capped` true, `addedCount` the total. |

No path throws. The client catches every rejection and turns it into an entry reason or an unavailable signal.

## Decisions

1. **Earlier version by semver, not by publish time alone.** The handoff says "the version published just before it". Packages that keep two release lines publish them interleaved, so the version published just before a 2.x release is often a 1.x backport with other dependencies and other publishers. The express measurement shows four such pairs and one false cap hit. The Earlier version here is the greatest semver version below the Installed version that was published before it. For axios 1.14.1 and keyv 6.0.0 it is the same version as "published just before" (1.14.0 and 6.0.0-rc.1). For a prerelease line it includes prereleases, as semver precedence does.
2. **Publish method from `_npmUser.trustedPublisher`.** The handoff says "from the fields the provenance signal already reads". The provenance signal reads the attestations endpoint, which says whether a provenance statement exists, not who signed in: a token publish from CI with `--provenance` also has one. `_npmUser.trustedPublisher` is the registry's own record of an OIDC publish and sits in the document already fetched. Provenance stays its own signal and rule.
3. **Two requests per new dependency name, not one.** The handoff allows one. The `time` map is only in the full packument. The steering file api-etiquette.md says "Install-script presence comes from the abbreviated packument". Steering is binding, so the Install script flag comes from the abbreviated packument and the publish times from the full one. With the cap that is at most 10 extra requests per package, both cached under the existing keys.
4. **Resolution at the Parent publish time.** The rule asks whether the dependency was new when the parent was published. Resolving at the scan date would pick versions published after the parent and make the 7-day test meaningless.
5. **No 90-day window.** Provenance regression has none, and the two rules describe a fact of the Installed version that does not age. The express data shows no old match. Revisit if the after run shows one.
6. **Rule order (owner decision at `go`, 25 Nov 2026).** The Existing rules stay first and unchanged, then the New dependency rule, then the Publisher rule. Every package an Existing rule marks keeps its state and reason. Both replays keep their reasons and their Segments; the new signals are evidence there.
7. **A publisher change between two trusted publishes, or token to token, is evidence only.** Express has 15 token-to-token or token-to-trusted changes, every one a normal maintainer rotation. In practice the Publisher rule means "trusted publisher to token", because a trusted publish always records the name "GitHub Actions": a legitimate manual hotfix after trusted publishing also fires it. That is the brief's rule, kept as written, and the after run measures it.
8. **No policy rule type.** `forbid_state: [Possessed]` in the default policy already fails both rules.
9. **Web paths touched before the last task.** The handoff keeps packages/web for the last task. These paths change earlier, each because the brief's own outputs require it, and need the owner's approval:
   - `src/load/lists.ts`, `test/lists.test.ts`, `test/arbitraries.ts` (task 1): `lists.ts` asserts at compile time that its `SIGNAL_NAMES` equals the API contract's, so two new signal names fail the root typecheck unless the list, its test and the signal generator gain them in the same commit.
   - `public/replay/axios.json`, `public/replay/keyv.json` (task 8): the replay generator writes them; the brief asks for the new axios reason.
   - `public/demo/scan.json`, `evidence.json`, `evidence.md` are generated at test time and not committed; they change with the fixtures and the version.
   No web source file other than `lists.ts`, and no web test that quotes the axios reason, changes before task 10. Approved by the owner at `go`, 25 Nov 2026.
10. **Engine version 0.2.0.** Two signals change the evidence body shape. `packages/api` and `packages/cli` pin `@sexton/engine` exactly, so their pins move to 0.2.0 and the lockfile is updated with `npm install` (no new package).
11. **Demo evidence digest.** Before: `c8fb6cab465d46ca92cf83dbc10022b6a662c8fad68ec8f64d827ef16f43344d`. After: `de2736eabb384057dd9946972ac4f8516ff7e12a2213d9cabc09ffeeb3f138f1`. Golden pack: `d797b6ec…` to `212bb42b…`.
12. **The compromised account's name is left out of the replay facts.** It is sourced, but no output needs it: the reason at 00:21 is provenance regression and the report version is 1.14.0. In the spirit of Requirement 9.3, the replay does not name the person whose account was taken. publisherChange for 1.14.1 is therefore `unknown`.
13. **The New dependency rule is unmeasured on express.** No express package added a dependency, so the after run exercises only the Publisher rule. Known false-alarm sources: a long-standing package added as a dependency that happened to publish within 7 days of the parent, and a native dependency whose `hasInstallScript` comes from a binding.gyp rather than a named script. Both are recorded as accepted risks of the brief's rule. The demo fixtures and the replays exercise the rule.
14. **product.md is steering and stays as it is.** It lists three Possessed conditions and says these signals "come in a later spec". Steering is outside this lane's paths. Follow-up for the owner: update product.md (the Kiro lane owns steering).
15. **Client file.** structure.md says one client file per upstream. `clients/new-dependency.ts` is a second registry.npmjs.org client, following the precedent of `clients/maintainers.ts`.

## Deliberate test changes

- Tests that count signals (ten) count twelve: `index.test.ts`, `score.test.ts`, `score-unresolved.test.ts`, the web list test, and any test that lists `SIGNAL_NAMES` literally.
- The golden evidence files and the CLI table expectations change with the two signals and the version bump.
- No replay reason changes. Tests that check the replay signals gain the two signals as evidence. Each changed assertion is listed in the task notes.

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

fast-check 3.23.1, `numRuns` 100, and 1000 for Properties 1, 2 and 5: a false or missed Possessed is a mislabelled compromise.

### Property 1: The new rules only ever produce Possessed

For any state inputs and Reference time, and any publisherChange and newDependency inputs, `evaluateState` with the two new inputs either equals `evaluateState` without them or gives Possessed.

**Validates: Requirements 3.3, 3.6**

### Property 2: No change, no new reason

For any packument in which the Installed version and the Earlier version have equal `_npmUser` and Dependencies maps with the same names, the publisherChange status is `same` or `unknown`, newDependency lists no names and issues no dependency request, and the state and reason equal those with both signals unavailable.

**Validates: Requirements 2.12, 3.7**

### Property 3: As-of equals the scan

For any Timeline facts and health entry, the inputs `stateAsOf` builds at any As-of date at or after the Installed version's Seen time and before the Scan date hold publisherChange and newDependency deep-equal to the scan's; and `stateAsOf` at the Scan date gives `currentForm`.

**Validates: Requirements 4.2, 4.4, 4.5**

### Property 4: Unavailable and malformed inputs never throw

For any JSON values as packuments (the package's, the dependencies', abbreviated or full, or failed reads) and any version string, `publisherChangeValue`, `dependencyDiff`, `resolveDependency` and `newDependencyValue` return, and `fetchNewDependencySignal` with a transport that fails or answers anything resolves to a signal.

**Validates: Requirements 1.7, 1.8, 2.7, 2.10, 2.11**

### Property 5: Rule precise

For any inputs, the state is Possessed through the new rules if and only if an oracle written in the test says so: some detailed entry has `installScript === true` or `fresh === true`, or the status is `changed` with the methods `trusted-publisher` then `token`. When an Existing rule matches, its state and reason win. Otherwise the reason is the New dependency rule's when both new rules match, and names the first matching entry by name.

**Validates: Requirements 3.1, 3.2, 3.4**

### Property 6: Earlier version

For any packument, `earlierVersion` returns null or a version that is valid semver, published strictly before the Installed version and lower than it, and no other such version is greater.

**Validates: Requirements 1.2, 1.6, 2.1**

### Property 7: Cap and order

For any two Dependencies maps, the added names are sorted, their count is `addedCount`, at most 5 are detailed, and `capped` holds exactly when more than 5 are added.

**Validates: Requirements 2.2, 2.3, 2.11**

### Property 8: Determinism

For any inputs, each pure function gives deep-equal results on two calls.

**Validates: Requirements 1.8**

### Property 9: Escaping

For any signal value with arbitrary strings, the evidence summary and the PR body row contain no raw Markdown control text from the value, and the CLI cell is Safe text.

**Validates: Requirements 6.4**

## Testing Strategy

- Unit and property tests beside the source: `test/publisher.test.ts`, `test/new-dependency.test.ts`, `test/clients/new-dependency.test.ts`, `test/state-new-signals.test.ts`, `test/timeline/as-of-new-signals.test.ts`.
- Example tests for the axios and keyv facts as packuments built in the test, for each error row above, and for a scoped and an invalid dependency name.
- The fixture scan and the golden evidence pack run on recorded data with the routed transport. An unrouted request fails the test.
- api: replay-facts tests for the two expected Segments and the replay signals. CLI: table tests for the two columns.
- No network in tests. The express runs are made by hand and recorded here.

## Review notes

Spec review, 25 Nov 2026, by an independent reviewer who had not seen the work. Verdict not ready, one defect, fixed:

1. Defect: Decisions 9 named only the three list files as web changes before the last task, but tasks 7 and 8 also change generated replay files and web tests that quote the axios reason. Fixed: Decisions 9 lists every web path and its reason.

Notes acted on: the recorder records per-version `maintainers` and the Earlier version's `hasInstallScript`, so that the new version key cannot invent a maintainer change or a missing install-script flag (design "Recorder and fixtures"); the state.ts snippet uses the right field names; the axios replay summary text is updated (task 8.1); the error row on a failed full read is corrected; Decisions 7, 13, 14 and 15 record the Publisher rule in practice, the unmeasured New dependency rule, product.md and the client file; Requirements 5.6 and 5.7 cover facts without dependencies or method; the compromised account's name is left out of the replay facts (Decisions 12); ranges are capped at 256 characters.

Notes kept as they are: "FOR EACH" and "FOR ANY" criteria follow history-signals; Requirement 2.5 holds within one scan's cache, while the DynamoDB cache may refuse very large items, as it does for every packument today; Property 3's Scan-date half is true by construction and stays as a guard.

## Owner decisions at go (25 Nov 2026)

- Rule order: the three Existing rules first and unchanged, then the New dependency rule, then the Publisher rule.
- The axios replay keeps its provenance regression reason and its story text. No web test quoting the axios reason changes. Task 8 only regenerates the replay files with the new signals as evidence. Task 10 adds one sentence to the axios story about plain-crypto-js being published 22 minutes earlier.
- All other decisions accepted. Approved lines: epitaph "A new hand signed this one. The pipeline did not." and bubble "Published by hand. The robot usually does it." for `publisher changed in`; epitaph "It brought a new friend along. Check the friend." and bubble "I brought a plus-one. Nobody checked the list." for `new dependency in`.

## Decisions made during implementation

16. **No per-version `maintainers` in the fixtures (changes the recorder plan above).** The first recording added them as planned. The demo then gained a Possessed "maintainer change in the last 90 days" Segment on semver from 2 Nov 2026 to the scan date, because the registry lists differ between semver 7.8.5 and 7.8.6 (owlstronaut replaced by martinrrm), and the existing as-of maintainer rule reads per-version lists. That is an existing rule seeing new data, outside this spec, and it would show npm's own semver as Possessed in the demo scrubber. So the recorder records only `_npmUser` and `dependencies`. The `_npmUser` fallback in timeline/facts.ts then gives one-name lists; every recorded pair has the same publisher, so no Segment changes: the demo states and all twelve demo timelines are identical before and after (checked by a script, 25 Nov). Open item for the owner: the as-of maintainer rule now has real per-version data available if it is ever recorded; decide then whether a per-version maintainer change should count.
17. **Timeline facts fields are optional.** `publisherChange` and `newDependency` in TimelineFacts and TimelineFactsInput are optional and nullable, so hand-built facts in existing tests stay valid. Absent and null both mean unavailable.
18. **`stateInputsAsOf` is exported.** It returns the inputs `stateAsOf` gives the rules, so Property 3 checks the inputs directly. `stateAsOf` is unchanged in behaviour.
19. **The client takes no package name** (`fetchNewDependencySignal(ctx, installed, full)`): the source and time come from the full packument read. `DependencyDiff` is a tagged union. A cut range carries `tooLong` and is never resolved.
20. **Web count tests.** Besides the three files of Decisions 9, four web tests count signal rows (drawer-model, drawer, markdown, pr-preview) and go from ten to twelve. They are counts, not reason text, and fall under "Deliberate test changes".
21. **A missing publisher name reads "no name"** in the evidence summary and the PR body, outside the code span, so it cannot be mistaken for a publisher called "unknown".

## Owner decisions of 25 Nov 2026, with task 10

- Main with phase 2 merged in; change-log line 0.8.
- The four approved lines added; the axios story gains "plain-crypto-js 4.2.1 was published 22 minutes before axios 1.14.1." (the facts give 22 minutes 46 seconds).
- The PR body Possessed warning now reads "Check the maintainer, provenance, install-script, new dependency or publisher change before you merge."
- The README state-table Possessed row names the two new conditions.
- A missing publisher name reads "unknown" in the publisher-changed reason (`UNKNOWN_PUBLISHER` in state.ts), never an empty gap. The status rules make `changed` need both names, so this guards hand-built or replay values; tested in state-new-signals.test.ts. The web patterns accept any non-empty text for each name.
- product.md is left alone.

## Notes and open items

- **Open item, semver maintainer finding (owner decision, 25 Nov).** The registry's per-version maintainer lists for semver 7.8.5 and 7.8.6 differ: owlstronaut was replaced by martinrrm. When the recorder saved per-version `maintainers`, the existing as-of maintainer rule (timeline/as-of.ts, spec cemetery-time) gave the demo a Possessed "maintainer change in the last 90 days" Segment on semver from 2026-11-02T17:05:43.359Z to the scan date, while the scan itself says Alive (snapshot history is empty). The fixtures therefore hold no per-version maintainers (Decisions 16). To decide later: whether a per-version maintainer change seen only in packument data should count on the timeline, and if so whether the scan-date rule should read the same data so the two agree.

- Review of tasks 1 to 6 (independent, 25 Nov): verdict not ready, two defects, both fixed with tests:
  1. A range over 256 characters was cut and then checked, so the cut text could resolve (for example `>=1.0.0` + 250 spaces + `<0.0.0-0` resolved 2.0.0). Fixed: the diff marks it `tooLong`, the client makes no request and the entry reason is "range is not a semver range".
  2. `earlierVersion` rejected versions with build metadata (`2.0.0+b1`). Fixed: a version is semver when `semver.parse(v).raw === v`; the recorder copy matches.
  Notes acted on: the abbreviated read is skipped when the full read failed; Property 9 runs 1000 times; "no name" (Decisions 21); the client Property 4 test now checks the signal shape. Notes kept: the design snippets differ in small names from the code (Decisions 19).
- Demo: 0 state changes and 0 timeline changes across the twelve demo packages. Every fixture publisher is `same`; node-sass 7.0.3 added npmlog ^5.0.0 (5.0.1, 2021) and request ^2.88.0 (2.88.2, 2020), no install script; event-stream has no Earlier version.
- Replays: Segments byte-identical in content; the files gain the two signals as evidence. axios's report version (1.14.0) has both unavailable "not in public reports"; keyv 6.0.0 publisherChange is `same` and newDependency unavailable.
- The PR body's Possessed warning was extended to the two new reasons on the owner's decision of 25 Nov (above).
- Express after (25 Nov 2026, engine 0.2.0, built CLI, `build/ns-express-after/scan.json`): 44 packages, 2 Dead, 14 Restless, 28 Alive, 0 Possessed. Every package has the same version, state and reason as before (0 changes). publisherChange: 29 same, 9 changed token to token, 6 changed token to trusted publisher, none from trusted publisher to token. newDependency: no package added a dependency. The stop line (more than 2 new Possessed) is far from reached. The New dependency rule stays unmeasured on express (Decisions 13).
- docs/requirements.md: R-SG-10, R-SG-11 and the R-ST-2 Possessed line added, change-log line written as 0.7 and renumbered to the next free number when main is merged in (task 10.1). README: the two signal lists only. The README state table row for Possessed (line 29, "A maintainer changed in the last 90 days, provenance regressed, or a new install script appeared") is outside this lane's README part and does not name the two new conditions. Open item for the owner, with steering product.md (Decisions 14).
- Review of tasks 1 to 8 (independent, 25 Nov): verdict ready, no defect. Notes acted on: a replay publisher fact with method `unknown` now leaves publisherChange unavailable; new-dependency facts are looked up with `Object.hasOwn`; the recorder skips a new dependency name that is itself a fixture package (its own recorded files answer it), so `new-dependencies/request` is removed; the recorder counts a name as present before only when its value is a string, as the engine does; two comments fixed. Notes kept: duplicate new-dependency routes in multi-package scans are harmless (first match wins); keyv's publisherChange cites Snyk only, while its rc.1 half comes from the registry listed in the replay sources.
