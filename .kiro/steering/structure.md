---
inclusion: always
---
# Layout

- packages/engine: pure core. Signals, states, policy, remediation planning. No AWS, no UI, no filesystem writes.
- packages/cli: thin wrapper over engine. Commands scan, check, evidence.
- packages/api: Lambda handlers. Calls engine. Owns the DynamoDB cache and the snapshotter.
- packages/web: the cemetery. Reads from api. Never calls registries directly.
- packages/action: GitHub Action wrapping cli.
- infra: CDK app.
- docs: ADRs, threat model, architecture. docs/requirements.md is the product requirements.
- .kiro: specs, steering, hooks, agents, settings. Committed. Never ignored.
- private: research and filings. Ignored. Never committed.

## Naming
- Files kebab-case. Types PascalCase. Functions camelCase. Constants UPPER_SNAKE.
- One exported concept per file. Tests mirror source paths under test/.
- Signal clients live in packages/engine/src/clients/<source>.ts. One file per upstream.

## Dependencies between packages
- engine depends on nothing internal.
- cli, api and action depend on engine.
- web depends on api's response types only.
