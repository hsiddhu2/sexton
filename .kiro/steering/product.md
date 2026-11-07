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
- Dead: deprecated, or last publish more than 24 months ago.
- Haunted: any High or Critical advisory.
- Restless: last publish 12 to 24 months ago, or any Low or Moderate advisory.
- Alive: none of the above.

## Rules that never change
- Every signal carries its source URL and fetch timestamp.
- An upstream failure degrades one signal, never the whole scan.
- Sexton never pushes to a default branch and never merges.
- The hackathon slice is npm, direct dependencies, public repos. Everything else is roadmap.

Requirements: #[[file:docs/requirements.md]]
