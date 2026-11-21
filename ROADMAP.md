# Roadmap

Sexton is a product with a long road. Release 0.1 is the Kiroween 2026 slice. Everything below is sequenced, not promised by date.

## 0.1 (Kiroween 2026)

- npm, direct dependencies, public GitHub repos
- Five signals: abandonment, advisories, install scripts, maintainer change, provenance regression
- Daily snapshotter for maintainers and attestations
- Policy file with four rule types and packageRules matchers
- Remediation PRs: bump, remove, one migration (node-sass to sass)
- Evidence pack: CycloneDX JSON SBOM, policy results, remediation log, hash
- Cemetery UI, CLI, GitHub Action, Kiro Crew re-scan agent

## 0.2

- Transitive package scoring
- Typosquat distance and license drift signals
- Private repositories through a GitHub App
- Two more migration recipes
- Workspace scanning in the CLI
- CLI published to npm

## 0.3

- PyPI
- SPDX export
- Download trend and bus factor signals
- Policy inheritance and organisation defaults

## 1.0

- Maven, Go, Cargo
- Team accounts and audit retention
- Signed evidence packs
- Evidence pack export for SOC 2, DORA and CRA reporting
