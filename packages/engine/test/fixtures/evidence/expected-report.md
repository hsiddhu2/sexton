# Sexton evidence pack: `https://github.com/sexton-demo/fixture`

## Integrity

- Digest: `7043f538bbc8a15e465c3c6bdb239d648b4312968f51be67f855f776baac33fc`
- Algorithm: `SHA-256` over the `RFC 8785` canonical form of `body`, UTF-8 encoded

This digest shows an edit only to a reviewer who got it from somewhere else. It is not a signature.

To check it, run `jq -cjS .body <evidence JSON file> | shasum -a 256` and compare the result with the digest above. The command matches RFC 8785 for this pack unless a string in it holds the character U+007F; verifyEvidencePack in the Sexton engine is exact.

## Scan

- Repository: `https://github.com/sexton-demo/fixture`
- Commit: not recorded (`commit not recorded, the scan read the default branch head`)
- Generated at: `2026-11-12T00:00:00.000Z`
- Engine version: `0.1.0`
- Policy: version 1, source `default`, digest none
- package.json digest: not recorded
- package-lock.json digest: not recorded
- Lockfile version: 3
- Unlocked: no
- Capped: no
- Direct dependencies: 11
- Skipped: peer 0, optional 0, invalid name 0
- Unresolved: none
- Unlocked packages: none

## Policy

Result: **fail**, source `default`

### Rule 0: `forbid_state`

Result: fail

Failures:
- `request` `2.88.2`: `state is Dead: installed version is deprecated`
- `node-sass` `7.0.3`: `state is Dead: installed version is deprecated`
- `left-pad` `1.3.0`: `state is Dead: installed version is deprecated`
- `event-stream` `3.3.6`: `state is Dead: last publish more than 24 months ago`
- `colors` `1.4.0`: `state is Dead: last publish more than 24 months ago`
- `uuid` `9.0.1`: `state is Dead: installed version is deprecated`

## Packages

| Package | Version | State | Reason |
|---|---|---|---|
| `colors` | `1.4.0` | `Dead` | `last publish more than 24 months ago` |
| `event-stream` | `3.3.6` | `Dead` | `last publish more than 24 months ago` |
| `left-pad` | `1.3.0` | `Dead` | `installed version is deprecated` |
| `node-sass` | `7.0.3` | `Dead` | `installed version is deprecated` |
| `request` | `2.88.2` | `Dead` | `installed version is deprecated` |
| `uuid` | `9.0.1` | `Dead` | `installed version is deprecated` |
| `lodash` | `4.17.21` | `Haunted` | `advisory of severity High or Critical` |
| `express` | `4.18.2` | `Restless` | `advisory of severity Moderate or Low` |
| `moment` | `2.29.4` | `Restless` | `advisory of severity Moderate or Low` |
| `react` | `18.3.1` | `Alive` | `no rule matched` |
| `semver` | `7.8.6` | `Alive` | `no rule matched` |

## Signals

### `colors` `1.4.0`

| Signal | Value | Source | Fetched at |
|---|---|---|---|
| lastPublish | `2022-01-09T19:35:35.048Z` | `https://registry.npmjs.org/colors` | `2026-11-12T00:00:00.000Z` |
| deprecated | no | `https://registry.npmjs.org/colors` | `2026-11-12T00:00:00.000Z` |
| hasInstallScript | no | `https://registry.npmjs.org/colors` | `2026-11-12T00:00:00.000Z` |
| advisories | none | `https://api.osv.dev/v1/querybatch` | `2026-11-12T00:00:00.000Z` |
| maintainers | 1: `marak` | `https://registry.npmjs.org/colors` | `2026-11-12T00:00:00.000Z` |
| provenance | absent | `https://registry.npmjs.org/-/npm/v1/attestations/colors@1.4.0` | `2026-11-12T00:00:00.000Z` |
| transitiveReach | reach 0, graphs missing 1 | `https://api.deps.dev/v3/systems/npm/packages/colors/versions/1.4.0:dependencies` | `2026-11-12T00:00:00.000Z` |
| maintainerChange | history insufficient | `https://registry.npmjs.org/colors` | `2026-11-12T00:00:00.000Z` |
| provenanceRegression | history insufficient: `history is empty` | `https://registry.npmjs.org/-/npm/v1/attestations/colors@1.4.0` | `2026-11-12T00:00:00.000Z` |
| newInstallScript | none | `https://registry.npmjs.org/colors` | `2026-11-12T00:00:00.000Z` |

### `event-stream` `3.3.6`

| Signal | Value | Source | Fetched at |
|---|---|---|---|
| lastPublish | `2018-09-29T06:55:49.107Z` | `https://registry.npmjs.org/event-stream` | `2026-11-12T00:00:00.000Z` |
| deprecated | no | `https://registry.npmjs.org/event-stream` | `2026-11-12T00:00:00.000Z` |
| hasInstallScript | unavailable: `version not found` | `https://registry.npmjs.org/event-stream` | `2026-11-12T00:00:00.000Z` |
| advisories | 1: `Critical` 1 | `https://api.osv.dev/v1/querybatch` | `2026-11-12T00:00:00.000Z` |
| maintainers | 1: `npm` | `https://registry.npmjs.org/event-stream` | `2026-11-12T00:00:00.000Z` |
| provenance | absent | `https://registry.npmjs.org/-/npm/v1/attestations/event-stream@3.3.6` | `2026-11-12T00:00:00.000Z` |
| transitiveReach | reach 0, graphs missing 1 | `https://api.deps.dev/v3/systems/npm/packages/event-stream/versions/3.3.6:dependencies` | `2026-11-12T00:00:00.000Z` |
| maintainerChange | history insufficient | `https://registry.npmjs.org/event-stream` | `2026-11-12T00:00:00.000Z` |
| provenanceRegression | history insufficient: `history is empty` | `https://registry.npmjs.org/-/npm/v1/attestations/event-stream@3.3.6` | `2026-11-12T00:00:00.000Z` |
| newInstallScript | none | `https://registry.npmjs.org/event-stream` | `2026-11-12T00:00:00.000Z` |

Advisories:
- `GHSA-mh6f-8j2x-4483` `Critical`: `Critical severity vulnerability that affects event-stream and flatmap-stream`

### `left-pad` `1.3.0`

| Signal | Value | Source | Fetched at |
|---|---|---|---|
| lastPublish | `2018-04-09T01:10:45.796Z` | `https://registry.npmjs.org/left-pad` | `2026-11-12T00:00:00.000Z` |
| deprecated | yes | `https://registry.npmjs.org/left-pad` | `2026-11-12T00:00:00.000Z` |
| hasInstallScript | no | `https://registry.npmjs.org/left-pad` | `2026-11-12T00:00:00.000Z` |
| advisories | none | `https://api.osv.dev/v1/querybatch` | `2026-11-12T00:00:00.000Z` |
| maintainers | 2: `stevemao`, `westlac` | `https://registry.npmjs.org/left-pad` | `2026-11-12T00:00:00.000Z` |
| provenance | absent | `https://registry.npmjs.org/-/npm/v1/attestations/left-pad@1.3.0` | `2026-11-12T00:00:00.000Z` |
| transitiveReach | reach 0, graphs missing 1 | `https://api.deps.dev/v3/systems/npm/packages/left-pad/versions/1.3.0:dependencies` | `2026-11-12T00:00:00.000Z` |
| maintainerChange | history insufficient | `https://registry.npmjs.org/left-pad` | `2026-11-12T00:00:00.000Z` |
| provenanceRegression | history insufficient: `history is empty` | `https://registry.npmjs.org/-/npm/v1/attestations/left-pad@1.3.0` | `2026-11-12T00:00:00.000Z` |
| newInstallScript | none | `https://registry.npmjs.org/left-pad` | `2026-11-12T00:00:00.000Z` |

### `node-sass` `7.0.3`

| Signal | Value | Source | Fetched at |
|---|---|---|---|
| lastPublish | `2023-05-20T06:03:42.097Z` | `https://registry.npmjs.org/node-sass` | `2026-11-12T00:00:00.000Z` |
| deprecated | yes | `https://registry.npmjs.org/node-sass` | `2026-11-12T00:00:00.000Z` |
| hasInstallScript | yes | `https://registry.npmjs.org/node-sass` | `2026-11-12T00:00:00.000Z` |
| advisories | none | `https://api.osv.dev/v1/querybatch` | `2026-11-12T00:00:00.000Z` |
| maintainers | 2: `nex3`, `xzyfer` | `https://registry.npmjs.org/node-sass` | `2026-11-12T00:00:00.000Z` |
| provenance | absent | `https://registry.npmjs.org/-/npm/v1/attestations/node-sass@7.0.3` | `2026-11-12T00:00:00.000Z` |
| transitiveReach | reach 0, graphs missing 1 | `https://api.deps.dev/v3/systems/npm/packages/node-sass/versions/7.0.3:dependencies` | `2026-11-12T00:00:00.000Z` |
| maintainerChange | history insufficient | `https://registry.npmjs.org/node-sass` | `2026-11-12T00:00:00.000Z` |
| provenanceRegression | history insufficient: `history is empty` | `https://registry.npmjs.org/-/npm/v1/attestations/node-sass@7.0.3` | `2026-11-12T00:00:00.000Z` |
| newInstallScript | none | `https://registry.npmjs.org/node-sass` | `2026-11-12T00:00:00.000Z` |

### `request` `2.88.2`

| Signal | Value | Source | Fetched at |
|---|---|---|---|
| lastPublish | `2020-02-11T16:35:36.122Z` | `https://registry.npmjs.org/request` | `2026-11-12T00:00:00.000Z` |
| deprecated | yes | `https://registry.npmjs.org/request` | `2026-11-12T00:00:00.000Z` |
| hasInstallScript | no | `https://registry.npmjs.org/request` | `2026-11-12T00:00:00.000Z` |
| advisories | 1: `Moderate` 1 | `https://api.osv.dev/v1/querybatch` | `2026-11-12T00:00:00.000Z` |
| maintainers | 4: `fredkschott`, `mikeal`, `nylen`, `simov` | `https://registry.npmjs.org/request` | `2026-11-12T00:00:00.000Z` |
| provenance | absent | `https://registry.npmjs.org/-/npm/v1/attestations/request@2.88.2` | `2026-11-12T00:00:00.000Z` |
| transitiveReach | reach 1, graphs missing 1 | `https://api.deps.dev/v3/systems/npm/packages/request/versions/2.88.2:dependencies` | `2026-11-12T00:00:00.000Z` |
| maintainerChange | history insufficient | `https://registry.npmjs.org/request` | `2026-11-12T00:00:00.000Z` |
| provenanceRegression | history insufficient: `history is empty` | `https://registry.npmjs.org/-/npm/v1/attestations/request@2.88.2` | `2026-11-12T00:00:00.000Z` |
| newInstallScript | none | `https://registry.npmjs.org/request` | `2026-11-12T00:00:00.000Z` |

Advisories:
- `GHSA-p8p7-x288-28g6` `Moderate`: `Server-Side Request Forgery in Request`

### `uuid` `9.0.1`

| Signal | Value | Source | Fetched at |
|---|---|---|---|
| lastPublish | `2026-10-10T00:30:19.423Z` | `https://registry.npmjs.org/uuid` | `2026-11-12T00:00:00.000Z` |
| deprecated | yes | `https://registry.npmjs.org/uuid` | `2026-11-12T00:00:00.000Z` |
| hasInstallScript | no | `https://registry.npmjs.org/uuid` | `2026-11-12T00:00:00.000Z` |
| advisories | 1: `Moderate` 1 | `https://api.osv.dev/v1/querybatch` | `2026-11-12T00:00:00.000Z` |
| maintainers | 2: `broofa`, `ctavan` | `https://registry.npmjs.org/uuid` | `2026-11-12T00:00:00.000Z` |
| provenance | absent | `https://registry.npmjs.org/-/npm/v1/attestations/uuid@9.0.1` | `2026-11-12T00:00:00.000Z` |
| transitiveReach | reach 2, graphs missing 1 | `https://api.deps.dev/v3/systems/npm/packages/uuid/versions/9.0.1:dependencies` | `2026-11-12T00:00:00.000Z` |
| maintainerChange | history insufficient | `https://registry.npmjs.org/uuid` | `2026-11-12T00:00:00.000Z` |
| provenanceRegression | history insufficient: `history is empty` | `https://registry.npmjs.org/-/npm/v1/attestations/uuid@9.0.1` | `2026-11-12T00:00:00.000Z` |
| newInstallScript | none | `https://registry.npmjs.org/uuid` | `2026-11-12T00:00:00.000Z` |

Advisories:
- `GHSA-w5hq-g745-h8pq` `Moderate`: `uuid: Missing buffer bounds check in v3/v5/v6 when buf is provided`

### `lodash` `4.17.21`

| Signal | Value | Source | Fetched at |
|---|---|---|---|
| lastPublish | `2026-04-01T21:01:20.458Z` | `https://registry.npmjs.org/lodash` | `2026-11-12T00:00:00.000Z` |
| deprecated | no | `https://registry.npmjs.org/lodash` | `2026-11-12T00:00:00.000Z` |
| hasInstallScript | no | `https://registry.npmjs.org/lodash` | `2026-11-12T00:00:00.000Z` |
| advisories | 2: `High` 1, `Moderate` 1 | `https://api.osv.dev/v1/querybatch` | `2026-11-12T00:00:00.000Z` |
| maintainers | 1: `jdalton` | `https://registry.npmjs.org/lodash` | `2026-11-12T00:00:00.000Z` |
| provenance | absent | `https://registry.npmjs.org/-/npm/v1/attestations/lodash@4.17.21` | `2026-11-12T00:00:00.000Z` |
| transitiveReach | reach 4, graphs missing 1 | `https://api.deps.dev/v3/systems/npm/packages/lodash/versions/4.17.21:dependencies` | `2026-11-12T00:00:00.000Z` |
| maintainerChange | history insufficient | `https://registry.npmjs.org/lodash` | `2026-11-12T00:00:00.000Z` |
| provenanceRegression | history insufficient: `history is empty` | `https://registry.npmjs.org/-/npm/v1/attestations/lodash@4.17.21` | `2026-11-12T00:00:00.000Z` |
| newInstallScript | none | `https://registry.npmjs.org/lodash` | `2026-11-12T00:00:00.000Z` |

Advisories:
- `GHSA-r5fr-rjxr-66jc` `High`: `lodash vulnerable to Code Injection via '_.template' imports key names`
- `GHSA-xxjr-mmjv-4gpg` `Moderate`: `Lodash has Prototype Pollution Vulnerability in '_.unset', '_.omit', and '_.pullAt' functions`

### `express` `4.18.2`

| Signal | Value | Source | Fetched at |
|---|---|---|---|
| lastPublish | `2026-10-09T12:56:54.505Z` | `https://registry.npmjs.org/express` | `2026-11-12T00:00:00.000Z` |
| deprecated | no | `https://registry.npmjs.org/express` | `2026-11-12T00:00:00.000Z` |
| hasInstallScript | no | `https://registry.npmjs.org/express` | `2026-11-12T00:00:00.000Z` |
| advisories | 2: `Low` 1, `Moderate` 1 | `https://api.osv.dev/v1/querybatch` | `2026-11-12T00:00:00.000Z` |
| maintainers | 5: `wesleytodd`, `jonchurch`, `ctcpip`, `ulisesgascon`, `sheplu` | `https://registry.npmjs.org/express` | `2026-11-12T00:00:00.000Z` |
| provenance | absent | `https://registry.npmjs.org/-/npm/v1/attestations/express@4.18.2` | `2026-11-12T00:00:00.000Z` |
| transitiveReach | reach 0, graphs missing 1 | `https://api.deps.dev/v3/systems/npm/packages/express/versions/4.18.2:dependencies` | `2026-11-12T00:00:00.000Z` |
| maintainerChange | history insufficient | `https://registry.npmjs.org/express` | `2026-11-12T00:00:00.000Z` |
| provenanceRegression | history insufficient: `history is empty` | `https://registry.npmjs.org/-/npm/v1/attestations/express@4.18.2` | `2026-11-12T00:00:00.000Z` |
| newInstallScript | none | `https://registry.npmjs.org/express` | `2026-11-12T00:00:00.000Z` |

Advisories:
- `GHSA-qw6h-vgh9-j6wx` `Low`: `express vulnerable to XSS via response.redirect()`
- `GHSA-rv95-896h-c2vc` `Moderate`: `Express.js Open Redirect in malformed URLs`

### `moment` `2.29.4`

| Signal | Value | Source | Fetched at |
|---|---|---|---|
| lastPublish | `2026-09-15T01:07:26.131Z` | `https://registry.npmjs.org/moment` | `2026-11-12T00:00:00.000Z` |
| deprecated | no | `https://registry.npmjs.org/moment` | `2026-11-12T00:00:00.000Z` |
| hasInstallScript | no | `https://registry.npmjs.org/moment` | `2026-11-12T00:00:00.000Z` |
| advisories | 1: `Moderate` 1 | `https://api.osv.dev/v1/querybatch` | `2026-11-12T00:00:00.000Z` |
| maintainers | 6: `ichernev`, `gilmoreorless`, `timrwood`, `maggiepint`, `marwahaha`, `mattjohnsonpint` | `https://registry.npmjs.org/moment` | `2026-11-12T00:00:00.000Z` |
| provenance | absent | `https://registry.npmjs.org/-/npm/v1/attestations/moment@2.29.4` | `2026-11-12T00:00:00.000Z` |
| transitiveReach | reach 0, graphs missing 1 | `https://api.deps.dev/v3/systems/npm/packages/moment/versions/2.29.4:dependencies` | `2026-11-12T00:00:00.000Z` |
| maintainerChange | history insufficient | `https://registry.npmjs.org/moment` | `2026-11-12T00:00:00.000Z` |
| provenanceRegression | history insufficient: `history is empty` | `https://registry.npmjs.org/-/npm/v1/attestations/moment@2.29.4` | `2026-11-12T00:00:00.000Z` |
| newInstallScript | none | `https://registry.npmjs.org/moment` | `2026-11-12T00:00:00.000Z` |

Advisories:
- `GHSA-4p3w-j4w9-5jqw` `Moderate`: `moment vulnerable to Path Traversal via crafted non-string locale name`

### `react` `18.3.1`

| Signal | Value | Source | Fetched at |
|---|---|---|---|
| lastPublish | `2026-11-12T16:22:00.893Z` | `https://registry.npmjs.org/react` | `2026-11-12T00:00:00.000Z` |
| deprecated | no | `https://registry.npmjs.org/react` | `2026-11-12T00:00:00.000Z` |
| hasInstallScript | no | `https://registry.npmjs.org/react` | `2026-11-12T00:00:00.000Z` |
| advisories | none | `https://api.osv.dev/v1/querybatch` | `2026-11-12T00:00:00.000Z` |
| maintainers | 2: `fb`, `react-bot` | `https://registry.npmjs.org/react` | `2026-11-12T00:00:00.000Z` |
| provenance | absent | `https://registry.npmjs.org/-/npm/v1/attestations/react@18.3.1` | `2026-11-12T00:00:00.000Z` |
| transitiveReach | reach 0, graphs missing 1 | `https://api.deps.dev/v3/systems/npm/packages/react/versions/18.3.1:dependencies` | `2026-11-12T00:00:00.000Z` |
| maintainerChange | history insufficient | `https://registry.npmjs.org/react` | `2026-11-12T00:00:00.000Z` |
| provenanceRegression | history insufficient: `history is empty` | `https://registry.npmjs.org/-/npm/v1/attestations/react@18.3.1` | `2026-11-12T00:00:00.000Z` |
| newInstallScript | none | `https://registry.npmjs.org/react` | `2026-11-12T00:00:00.000Z` |

### `semver` `7.8.6`

| Signal | Value | Source | Fetched at |
|---|---|---|---|
| lastPublish | `2026-11-02T19:47:44.122Z` | `https://registry.npmjs.org/semver` | `2026-11-12T00:00:00.000Z` |
| deprecated | no | `https://registry.npmjs.org/semver` | `2026-11-12T00:00:00.000Z` |
| hasInstallScript | no | `https://registry.npmjs.org/semver` | `2026-11-12T00:00:00.000Z` |
| advisories | none | `https://api.osv.dev/v1/querybatch` | `2026-11-12T00:00:00.000Z` |
| maintainers | 4: `saquibkhan`, `npm-cli-ops`, `reggi`, `martinrrm` | `https://registry.npmjs.org/semver` | `2026-11-12T00:00:00.000Z` |
| provenance | present, `https://slsa.dev/provenance/v1` | `https://registry.npmjs.org/-/npm/v1/attestations/semver@7.8.6` | `2026-11-12T00:00:00.000Z` |
| transitiveReach | reach 9, graphs missing 1 | `https://api.deps.dev/v3/systems/npm/packages/semver/versions/7.8.6:dependencies` | `2026-11-12T00:00:00.000Z` |
| maintainerChange | history insufficient | `https://registry.npmjs.org/semver` | `2026-11-12T00:00:00.000Z` |
| provenanceRegression | history insufficient: `history is empty` | `https://registry.npmjs.org/-/npm/v1/attestations/semver@7.8.6` | `2026-11-12T00:00:00.000Z` |
| newInstallScript | none | `https://registry.npmjs.org/semver` | `2026-11-12T00:00:00.000Z` |

## SBOM

- Spec version: `1.5`
- Serial number: `urn:uuid:f3a9dfe0-f163-8ba7-8d86-42ed888cc9da`
- Components: 11

- `pkg:npm/colors@1.4.0`
- `pkg:npm/event-stream@3.3.6`
- `pkg:npm/express@4.18.2`
- `pkg:npm/left-pad@1.3.0`
- `pkg:npm/lodash@4.17.21`
- `pkg:npm/moment@2.29.4`
- `pkg:npm/node-sass@7.0.3`
- `pkg:npm/react@18.3.1`
- `pkg:npm/request@2.88.2`
- `pkg:npm/semver@7.8.6`
- `pkg:npm/uuid@9.0.1`

## Remediation

### Plans

no plans

### Log

remediation log not connected in this deployment

---

The JSON file is the record. This report is rendered from it. Long values are shortened here.
