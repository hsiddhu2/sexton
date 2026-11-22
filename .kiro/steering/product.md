---
inclusion: always
---
# Sexton

Sexton finds the dependencies that will hurt you, proves it, and opens the pull request that fixes it.

A sexton keeps the churchyard: buries the dead, keeps the grounds, tolls the bell when something changes. Sexton does that for npm dependencies.

## Users
- Maintainers who want dangerous dependencies found and fixed for them.
- Security engineers who need a committed policy, CI enforcement and an evidence pack.
- Reviewers who have three minutes and a hosted demo.

## States, assigned in this order, first match wins
- Possessed: maintainer changed in 90 days, or provenance regressed, or a new install script appeared.
- Dead: deprecated, or last publish more than 24 months ago and at least one advisory of any severity.
- Haunted: any High or Critical advisory.
- Restless: last publish more than 24 months ago, or any Low or Moderate advisory.
- Alive: none of the above.
- When lastPublish, deprecated and advisories are all unavailable and no Possessed rule matched, the state is Restless.

## What exists today
- Evidence pack: one JSON body and a Markdown report rendered from it. It holds a CycloneDX 1.5 SBOM of the direct dependencies. Its integrity block is a SHA-256 digest over the RFC 8785 canonical form of the body.
- The CLI writes the pack as sexton-evidence.json and sexton-evidence.md. The hosted API serves it at GET /api/evidence with format=json or format=md.
- Hosted scan: GET /api/scan?repo=<url> returns the report, the policy result, remediation plans and actions.remediate. A hosted plan is never a removal.
- POST /api/remediate takes only { repo, package }. A repository outside the allowlist gets 422 repository-not-allowed before any scan or GitHub request. The allowlist today is hsiddhu2/sexton-demo.
- Remediation log: append-only. Each entry holds repository, branch, prUrl, package, kind and timestamp.
- GitHub Action: a composite action. It runs sexton check on pull requests, writes the job summary, posts or updates one comment and fails the job with the CLI exit code.

## Rules that never change
- Every signal carries its source URL and fetch timestamp.
- An upstream failure degrades one signal, never the whole scan.
- Sexton never pushes to a default branch and never merges.
- The hackathon slice is npm, direct dependencies, public repos. Everything else is roadmap.

Requirements: #[[file:docs/requirements.md]]
