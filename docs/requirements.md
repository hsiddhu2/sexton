# Sexton: Product Requirements

Version 0.1, 7 Nov 2026. Owner: Harpreet Singh Siddhu. This document is the single source of truth for what Sexton is and is not. Every spec, every design decision and every line of the write-up traces back to a numbered requirement here. If something is not in this document, it is not in scope. Changes to this document are versioned and dated.

## 1. Product statement

Sexton is an open-source engine that treats a repository's dependency graph as an attack surface. It scores every package on signals that predict compromise, enforces a policy file committed in the repo, opens remediation pull requests that carry their evidence, and produces an evidence pack for security and compliance reviewers. A scheduled agent re-scans and judges when a package's signals cross a policy line.

A sexton keeps the churchyard. He digs the graves, buries the dead, and tolls the bell when something changes. Sexton does that for your dependencies.

One sentence for the README: Sexton finds the dependencies that will hurt you, proves it, and opens the PR that fixes it.

## 2. Problem

Supply-chain compromises arrive through packages that looked fine in the lockfile. event-stream (maintainer handover, 2018), ua-parser-js (account takeover, 2021), colors (maintainer sabotage, 2022), xz (long-game maintainer infiltration, 2024). The signals that preceded each were visible in public registry data at the time. No open-source tool reads those signals, keeps their history, enforces a policy on them, and fixes the result.

Renovate's replacement PRs are name swaps. OSV-Scanner's fix opens no PRs. Socket's open CLI phones home to a hosted service. No open-source tool combines local signals, a repo-committed policy, code-level migration PRs with evidence, and an evidence pack. And no API exposes maintainer or provenance history, so whoever snapshots it owns the only dataset that can detect a handover.

## 3. Users and personas

P1. Maintainer Maya. Owns three to ten JavaScript repos at a mid-size company. Gets Dependabot noise, ignores most of it. Wants to know which of her dependencies are actually dangerous and wants the fix done for her. Primary user of the UI and the PRs.

P2. Security Sam. Application security engineer at a regulated company. Has to answer "what is in our software" for auditors and third-party-risk reviewers. Wants a policy he can commit and enforce in CI, and an evidence pack he can hand over. Primary user of the policy file and the evidence pack.

P3. Reviewer Rita. Hackathon judge or open-source evaluator. Has three minutes. Wants to see it work end to end and understand why it matters. Primary user of the hosted demo.

P4. The agent. Sexton's own scheduled re-scan. Needs the same engine the humans use, plus a way to judge whether a change matters.

## 4. Scope

### 4.1 Release 0.1 (Kiroween 2026, ships by 4 Dec 2026)

In scope:
- npm ecosystem only. package.json and package-lock.json. pnpm and yarn lockfiles are out.
- Direct dependencies scored. Transitive reach computed but transitive packages not individually scored.
- Five signals: abandonment, known advisories, install scripts, maintainer change, provenance presence and regression.
- Daily snapshotter for maintainers, install scripts and attestations per package.
- Policy file sexton.policy.yml with four rule types.
- Remediation PRs: version bump, removal, and one migration (node-sass to sass).
- Evidence pack as JSON and Markdown containing the SBOM in CycloneDX JSON, policy results, remediation log.
- Cemetery UI, hosted, public, no login required to scan a public repo.
- CLI with scan, check and evidence commands.
- GitHub Action wrapping the CLI.
- Kiro Crew app that re-scans on a cron and judges whether a change crosses a policy line.

Out of scope for 0.1, on the public roadmap:
- Other ecosystems (PyPI, Maven, Go, Cargo).
- Typosquat, license drift, bus factor, download trend as signals.
- Migrations beyond node-sass to sass.
- SPDX output.
- Private repos (requires GitHub App installation flow).
- Multi-user accounts, teams, SaaS billing.
- Transitive package scoring.

### 4.2 Product roadmap

See ROADMAP.md. Nothing enters a spec until promoted into this document.

## 5. Functional requirements

Format: R-<area>-<n>. Each is testable. EARS phrasing where it fits.

### 5.1 Intake

R-IN-1. WHEN a user submits a public GitHub repository URL, THE SYSTEM SHALL fetch package.json and package-lock.json from the default branch and resolve the list of direct dependencies with their installed versions.
R-IN-2. IF package-lock.json is absent, THE SYSTEM SHALL resolve installed versions from package.json ranges using the npm registry's latest matching version and SHALL label the scan as "unlocked" in all outputs.
R-IN-3. IF the repository has no package.json, THE SYSTEM SHALL return a clear error naming the missing file and SHALL NOT produce a partial scan.
R-IN-4. THE SYSTEM SHALL cap a scan at 300 direct dependencies and SHALL tell the user when the cap is hit.

### 5.2 Signals

R-SG-1. FOR EACH direct dependency, THE SYSTEM SHALL read last publish date and per-version deprecated flag from the npm registry packument.
R-SG-2. FOR EACH direct dependency, THE SYSTEM SHALL read hasInstallScript for the installed version from the abbreviated packument and SHALL NOT download the tarball.
R-SG-3. FOR EACH direct dependency, THE SYSTEM SHALL query known advisories for the installed version from OSV using querybatch and SHALL record advisory ID, severity and summary.
R-SG-4. FOR EACH direct dependency, THE SYSTEM SHALL read the current maintainers list from the packument and SHALL compare it with the most recent snapshot. A maintainer added or removed since the last snapshot SHALL be recorded as a maintainer change event with both lists.
R-SG-5. FOR EACH direct dependency, THE SYSTEM SHALL query the npm attestations endpoint for the installed version and SHALL record whether a provenance attestation exists and its predicateType. WHEN a previous version had provenance and the installed version does not, THE SYSTEM SHALL record a provenance regression.
R-SG-6. FOR EACH direct dependency, THE SYSTEM SHALL read the resolved dependency graph from deps.dev and SHALL record transitive reach as the count of packages in the repository's graph that depend on it.
R-SG-7. THE SYSTEM SHALL cache every registry, deps.dev and OSV response for 24 hours keyed by package and version and SHALL NOT fetch the same key twice within that window.
R-SG-8. THE SYSTEM SHALL send a User-Agent identifying Sexton and a contact address on every outbound request.
R-SG-9. WHEN any upstream returns HTTP 429, THE SYSTEM SHALL back off with jitter, retry at most three times, and on final failure SHALL mark that signal as "unavailable" for that package rather than failing the scan.

### 5.3 Snapshotter

R-SN-1. THE SYSTEM SHALL run a scheduled job once per day that records, for every package seen in any scan in the last 90 days, the current maintainers list, hasInstallScript per published version, and attestation presence per published version.
R-SN-2. Snapshots SHALL be append-only. THE SYSTEM SHALL NOT overwrite or delete a prior snapshot.
R-SN-3. THE SYSTEM SHALL expose a package's snapshot history to the signals engine so that maintainer change and provenance regression are computed from history, not from a single read.

### 5.4 States

R-ST-1. THE SYSTEM SHALL assign exactly one state to each direct dependency from this set: Alive, Restless, Haunted, Dead, Possessed.
R-ST-2. State rules, evaluated in order, first match wins:
- Possessed: a maintainer change event in the last 90 days, OR a provenance regression, OR a new install script appeared in a version published in the last 90 days.
- Dead: deprecated flag set on the installed version, OR last publish more than 24 months ago.
- Haunted: one or more advisories of severity High or Critical on the installed version.
- Restless: last publish between 12 and 24 months ago, OR one or more advisories of severity Low or Moderate.
- Alive: none of the above.
R-ST-3. The state function SHALL be deterministic: the same inputs always produce the same state.
R-ST-4. The state function SHALL be monotonic in age: holding all else equal, an older last-publish date never produces a healthier state.

### 5.5 Policy

R-PO-1. THE SYSTEM SHALL read sexton.policy.yml from the repository root. IF absent, THE SYSTEM SHALL apply the built-in default policy and SHALL say so in every output.
R-PO-2. The policy file SHALL be versioned (version: 1) and SHALL be validated against a published JSON Schema before use. An invalid policy SHALL fail the scan with the validation error.
R-PO-3. Release 0.1 rule types:
- forbid_state: fail when any direct dependency is in a listed state.
- forbid_install_scripts: fail when any direct dependency has an install script, with an allow list by package name.
- max_age_months: fail when any direct dependency's last publish is older than N months.
- require_provenance: fail when a listed package (or all, with "*") lacks a provenance attestation.
R-PO-4. Every rule SHALL support packageRules-style matchers: matchPackageNames, matchPackagePatterns, excludePackageNames.
R-PO-5. THE SYSTEM SHALL produce a policy result listing every rule, pass or fail, and the packages that caused each failure.
R-PO-6. The CLI check command SHALL exit non-zero when any rule fails, so CI can gate on it.

### 5.6 Remediation

R-RM-1. FOR EACH package in state Haunted, Dead or Possessed, THE SYSTEM SHALL propose exactly one remediation: bump, remove, or migrate.
R-RM-2. Bump: THE SYSTEM SHALL select the lowest version that satisfies the package's declared range, is not deprecated, and has no advisories of severity Moderate or above. IF no such version exists within the range, THE SYSTEM SHALL propose the lowest such version outside the range and SHALL label it as a major upgrade.
R-RM-3. Remove: proposed when the package has zero import sites in the repository.
R-RM-4. Migrate: proposed when a migration recipe exists for the package. Release 0.1 ships one recipe: node-sass to sass.
R-RM-5. WHEN a user requests a remediation PR, THE SYSTEM SHALL create a branch named sexton/<kind>-<package>, commit the change, and open a pull request. THE SYSTEM SHALL NOT push to the default branch and SHALL NOT merge.
R-RM-6. Every PR body SHALL contain: the package and installed version, its state and the signals that caused it with sources and timestamps, the proposed change, and for migrations the list of files changed and the list of sites left for human review.
R-RM-7. The node-sass to sass recipe SHALL: replace node-sass with sass in package.json at a compatible version, update sass-loader if present to a Dart Sass compatible version, and SHALL leave a review comment at every stylesheet containing /deep/ or a legacy render() call rather than editing it.
R-RM-8. THE SYSTEM SHALL record every PR it opens in the remediation log with repository, branch, PR URL, package, kind and timestamp.

### 5.7 Evidence pack

R-EV-1. THE SYSTEM SHALL produce an evidence pack on demand containing: scan metadata (repo, commit, time, Sexton version, policy version), a CycloneDX 1.5 JSON SBOM of direct dependencies, the per-package signal results with sources, the policy results, and the remediation log.
R-EV-2. The evidence pack SHALL be available as a single JSON file and as a Markdown report rendered from the same data.
R-EV-3. The evidence pack SHALL contain a SHA-256 hash of its JSON body so that a reviewer can verify it was not edited.

### 5.8 User interface

R-UI-1. THE SYSTEM SHALL render each direct dependency as a grave in a cemetery scene. Grave form encodes state: upright stone for Alive and Restless, cross for Haunted, cracked tilted stone for Dead, open grave for Possessed. Colour follows the same state. No continuous encodings.
R-UI-2. A ghost above a grave SHALL mean one or more advisories, and nothing else.
R-UI-3. Graves SHALL be ordered by triage priority: Possessed first, then by state from least healthy to most healthy (Dead, Haunted, Restless, Alive), then by highest advisory severity, then by transitive reach descending, then by name.
R-UI-4. Selecting a grave SHALL show the package's signals with sources, its state and the rule that produced it, and the proposed remediation with a preview of the PR body.
R-UI-5. The scene SHALL be readable without the legend by a first-time viewer. Verified by one person outside the project before submission.
R-UI-6. The scene SHALL render 300 graves without visible lag on a 2020 laptop.
R-UI-7. The UI SHALL meet WCAG 2.1 AA for text contrast and keyboard navigation. Every grave SHALL be reachable by keyboard.

### 5.9 CLI and Action

R-CL-1. sexton scan <repo-or-path> SHALL print a table of packages, states and signals and SHALL write scan.json.
R-CL-2. sexton check SHALL evaluate the policy and exit non-zero on failure.
R-CL-3. sexton evidence SHALL write the evidence pack.
R-CL-4. The GitHub Action SHALL run sexton check on pull requests and post a summary comment.

### 5.10 Agent (Kiro Crew app)

R-AG-1. The Crew app SHALL re-scan a configured list of repositories on a daily cron.
R-AG-2. WHEN a re-scan finds a package whose state changed, THE agent SHALL judge whether the change crosses a policy line and SHALL post a summary naming the package, the old and new state, the signal that changed, and the proposed remediation.
R-AG-3. The agent SHALL NOT open PRs on its own. It proposes. A human requests.

## 6. Non-functional requirements

N-1. Security. No secrets in the repository. GitHub credentials held in AWS Secrets Manager. Least-privilege IAM. Public endpoints behind WAF. Private folder gitignored and verified by a pre-commit hook.
N-2. Privacy. Sexton reads only public repositories in release 0.1. It stores package metadata, never source code.
N-3. Performance. A scan of 50 direct dependencies completes in under 20 seconds with a warm cache and under 60 seconds cold.
N-4. Reliability. An upstream outage degrades one signal, never the whole scan.
N-5. Observability. Every outbound request is logged with target, status and latency. Every scan has a correlation ID.
N-6. Cost. The hosted demo runs within the AWS free tier plus under 20 USD per month at launch traffic.
N-7. Licensing. Apache-2.0. All runtime dependencies permissively licensed. Development-only tools may carry a weak copyleft licence such as MPL-2.0 when used unmodified and never shipped, each recorded in docs/adr. Sexton scans itself in CI and must pass its own default policy.
N-8. Quality. Property-based tests on the state function, the bump selector, the cache and the policy evaluator. Unit tests on every recipe. The product's own CI runs Sexton against the product's own repo.
N-9. Documentation. README leads with the one-sentence pitch and a one-command demo. docs/ holds ADRs, threat model, architecture, Well-Architected review.

## 7. Definitions

Direct dependency: a package listed in dependencies or devDependencies of the root package.json.
Installed version: the version recorded in package-lock.json, or resolved per R-IN-2.
Signal: a single observed fact about a package from a named source at a timestamp.
State: the single label assigned to a package by R-ST-2.
Remediation: a proposed change to the repository that moves a package out of Haunted, Dead or Possessed.
Evidence pack: the bundle defined in R-EV-1.
Snapshot: one dated record of a package's maintainers, install scripts and attestations.
Policy: the rules in sexton.policy.yml.

## 8. Assumptions and dependencies

- npm registry, deps.dev, OSV and the attestations endpoint remain free and unauthenticated. Verified 7 Nov 2026.
- GitHub MCP server provides create_branch, push_files, create_pull_request. Verified.
- Kiro IDE generates fast-check property tests from spec requirements. Verified.
- A CycloneDX 1.5 JSON document can be produced with a maintained JS library. To be verified before the evidence spec.

## 9. Risks

- Migration recipe scope creep. Mitigation: one recipe, done well, review comments for everything not mechanical.
- Snapshot history is empty at launch, so maintainer change cannot fire on day one. Mitigation: seed from the first scan and say so in the UI. Demo uses a seeded fixture that shows a change.
- Hosted demo abuse. Mitigation: 300-dependency cap, rate limit per IP at the edge, public repos only.
- Judges will not install Crew. Mitigation: Crew app is a bonus. The hosted UI and CLI are the main entry.

## 10. Traceability

Every Kiro spec names the requirements it implements. Every PR names the spec. The write-up quotes requirement IDs.

## Change log

0.1, 7 Nov 2026. First version. Policy file renamed from graveyard.policy.yml to sexton.policy.yml.
0.2, 20 Nov 2026. R-UI-3 triage order adds state rank after Possessed. N-7 limited to runtime dependencies, dev-only weak copyleft recorded in docs/adr.
