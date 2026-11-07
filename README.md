# Sexton

A sexton keeps the churchyard. He buries the dead, keeps the grounds, and tolls the bell when something changes.

Sexton does that for your dependencies. It finds the packages that will hurt you, proves it, and opens the pull request that fixes it.

Status: pre-release. Built for Kiroween 2026 as release 0.1 of a longer roadmap.

## What it does

- Scores every direct dependency on signals that predict compromise: abandonment, known advisories, install scripts, maintainer change, provenance regression.
- Keeps a daily history of maintainers and attestations, because no registry API does, and that history is what catches a package changing hands.
- Enforces a policy file you commit in your repo. Fails CI when a rule breaks.
- Opens remediation pull requests that carry their evidence: version bumps, removals, and migrations to named successors.
- Produces an evidence pack: CycloneDX SBOM, policy results, remediation log, with a hash a reviewer can verify.
- Renders it all as a cemetery where the visual state of each grave is real information.

## Quick start

Coming with 0.1.

## Roadmap

See ROADMAP.md.

## License

Apache-2.0. See LICENSE and NOTICE.
