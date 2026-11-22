# Sexton

Sexton finds the dependencies that will hurt you, proves it, and opens the pull request that fixes it.

Screenshot placeholder: the cemetery view, `docs/cemetery.png`, arrives with the cemetery UI.

Status: pre-release. Release 0.1 is due on 4 Dec 2026. Each feature below says whether it is on `main` today, in progress, or planned.

## The problem

Supply-chain attacks arrive through packages that looked fine in the lockfile. Think of event-stream in 2018, ua-parser-js in 2021, colors in 2022 and xz in 2024. In each case the warning signs were visible in public registry data before the damage. No open-source tool reads those signals, keeps their history, enforces a policy on them and fixes the result.

## What Sexton does

- **Signals.** It scores up to 300 direct dependencies per scan on ten signals. These ten measure the five product signals in the roadmap, from last publish date and known advisories to maintainer change, provenance and transitive reach. Every signal carries its source URL and fetch time. On `main` today.
- **History.** It keeps a dated snapshot of each package's maintainers, install scripts and attestations, because no registry API keeps that history. A maintainer change or lost provenance is computed from the history, not from one read. The snapshot engine is on `main`. The hosted daily job is in progress.
- **Policy.** You commit a `sexton.policy.yml` with four rule types and package matchers. Sexton evaluates it and fails CI when a rule breaks. The policy engine, `sexton check` and the GitHub Action are on `main`.
- **Remediation pull requests.** For each dangerous package it proposes one fix: a version bump, a removal, or a migration such as node-sass to sass. The pull request carries its evidence. The plans are on `main` in the engine and the CLI. Hosted scans on `main` carry the plans too, without removals, and name the commit they read; the hosted site shows them after its next deploy. Opening the pull request is on `main` for the demo repository `hsiddhu2/sexton-demo` only, and arrives on the hosted site at its next deploy. Every other repository shows the plan and the pull request body, with no button.
- **Evidence pack.** It writes a CycloneDX 1.5 SBOM, every signal with its source, the policy results and the remediation plans and log as one JSON file, and a Markdown report rendered from it. A SHA-256 digest over the canonical JSON body lets a reviewer check it against a digest they got separately. The digest is not a signature. On `main` today: the engine, `GET /api/evidence?repo=<url>&format=json|md`, and the demo download links in the cemetery header. Each hosted download runs its own scan. The hosted site gains the evidence endpoint and the header links at its next deploy.

## The five states

Each package gets exactly one state. The rules run in this order, and the first match wins.

| State | When |
|---|---|
| Possessed | A maintainer changed in the last 90 days, provenance regressed, or a new install script appeared |
| Dead | The installed version is deprecated, or the last publish was more than 24 months ago |
| Haunted | It has a High or Critical advisory |
| Restless | The last publish was 12 to 24 months ago, or it has a Low or Moderate advisory |
| Alive | None of the above |

## Quick start

The CLI is on `main`. It is not published to npm yet, so run it from a clone (see "CLI" below).

```sh
sexton scan https://github.com/<owner>/<repo>   # score every direct dependency and write scan.json
sexton check                                    # evaluate sexton.policy.yml, exit non-zero on failure
sexton evidence                                 # write the evidence pack
```

Hosted demo: the link arrives with the first deploy.

What runs today, from a clone of this repository, with Node.js 22:

```sh
npm ci                              # install the exact versions in the lockfile
npm test                            # run every package's tests, no network
npm run build -w @sexton/engine     # build the engine
npm run scan:self                   # score Sexton's own dependencies live and check its policy
```

The last command calls the npm registry, OSV and deps.dev, so it needs network. It exits non-zero when the policy fails.

## CLI

Not published to npm yet, run it from a clone with Node.js 22:

```sh
npm ci && npx tsc -b packages/cli
node packages/cli/dist/bin.js scan <repo-or-path> [--repo <url>] [--out <file>]
node packages/cli/dist/bin.js check [repo-or-path] [--repo <url>] [--summary <file>]
node packages/cli/dist/bin.js evidence [repo-or-path] [--repo <url>] [--out-dir <dir>]
node packages/cli/dist/bin.js evidence --verify <file>
```

- A target that is a GitHub repository URL is read from GitHub. Any other target is a local directory, default the current one. A local directory needs its repository name: `--repo`, or an `origin` remote on github.com.
- `scan` prints a table and writes `scan.json`. `check` prints every rule and exits non-zero when one fails. `evidence` writes `sexton-evidence.json` and `sexton-evidence.md` and prints the digest. `--verify` checks a pack.
- Exit codes: 0 success, 1 the policy failed or the pack did not verify, 2 anything else (a usage error, a missing or invalid file, an invalid policy).
- For a local directory Sexton also counts references to each dependency in the working tree, and proposes removing a package from `dependencies` only when it found none and read every file. A package loaded by a computed name at run time is not detected, and the pull request body says so.

## GitHub Action

`packages/action` is a composite action. It builds the CLI from its own checkout, runs `sexton check` on your checkout, writes the job summary and posts one summary comment on the pull request. It never installs or runs code from your repository.

```yaml
on:
  pull_request:          # never pull_request_target
permissions:
  contents: read
  pull-requests: write
jobs:
  sexton:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@<commit SHA>   # pin to a full commit SHA
        with:
          persist-credentials: false
      - uses: hsiddhu2/sexton/packages/action@<PLACEHOLDER: commit SHA of a Sexton release>
```

Inputs: `path` (default `.`), `comment` (default `true`), `token` (default the workflow token). On a pull request from a fork the token is read-only, so the comment is skipped with a warning and the check still decides the job. The comment is updated only when `github-actions[bot]` wrote it; with a personal token each run adds a new comment.

## Sexton scans itself

Sexton runs its own policy against its own dependencies with `npm run scan:self`. A CI job that runs it on every push is in progress. The first time we ran it, it failed.

It rated eslint 9.17.0 Dead, as that version is deprecated on npm. It rated vitest 2.1.8 Haunted, with two Critical advisories (GHSA-9crc-q9x8-hgqq and GHSA-5xrq-8626-4rwp) and one Moderate (GHSA-82fw-gwwq-j7x9). We moved to eslint 10.15.0, @eslint/js 10.0.1, typescript-eslint 8.72.2 and vitest 4.1.12. On the second scan all seven packages were Alive and all three rules passed. The scan on 20 Nov 2026 showed all eight root packages Alive and all three rules passing.

## How Sexton is different

- **Dependabot** opens pull requests when a dependency has a known advisory or a newer version. Sexton also flags packages before any advisory exists, from maintainer change, lost provenance and new install scripts.
- **Renovate** keeps versions current, and its replacement pull requests swap one package name for another. Sexton's migration recipes are planned to change the code that uses the package too.
- **OSV-Scanner** finds known vulnerabilities, and its fix command opens no pull requests. Sexton is planned to open one pull request per fix, carrying its evidence.
- **Socket's** open CLI sends data to a hosted service. Sexton scores locally against public sources, and its engine needs no Sexton service.

## Roadmap

Releases are sequenced, not promised by date. Release 0.1 lists each item's state today.

### 0.1

- npm, direct dependencies, public GitHub repositories. Repository intake is on `main`.
- Five signals: abandonment, advisories, install scripts, maintainer change, provenance regression. On `main`.
- Daily snapshotter for maintainers and attestations. The engine is on `main`, and the hosted schedule is in progress.
- Policy file with four rule types and packageRules matchers. On `main`.
- Remediation pull requests: bump, remove, and one migration (node-sass to sass), planned
- Evidence pack: CycloneDX JSON SBOM, policy results, remediation log, hash. On `main`. The CLI command arrives with the CLI
- Cemetery UI, in progress
- CLI with scan, check and evidence. On `main`, not published to npm yet
- GitHub Action. On `main`
- Scheduled re-scan agent that judges changes against the policy, planned

### 0.2

- Transitive package scoring
- Typosquat distance and license drift signals
- Private repositories through a GitHub App
- Two more migration recipes
- Workspace scanning in the CLI
- CLI published to npm

### 0.3

- PyPI
- SPDX export
- Download trend and bus factor signals
- Policy inheritance and organisation defaults

### 1.0

- Maven, Go, Cargo
- Team accounts and audit retention
- Signed evidence packs
- Evidence pack export for SOC 2, DORA and CRA reporting

## Documentation

- `docs/requirements.md`: the product requirements
- `docs/architecture.md`: how Sexton runs on AWS
- `docs/threat-model.md`: what can go wrong and what stops it
- `docs/well-architected.md`: the deployment against the six pillars
- `docs/adr/`: architecture decision records

## Licence

Apache-2.0. See LICENSE and NOTICE.
