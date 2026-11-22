---
inclusion: always
---
# Layout

- packages/engine: pure core. Signals, states, policy, remediation planning. No AWS, no UI, no filesystem writes.
- packages/cli: thin wrapper over engine. Commands scan, check, evidence.
- packages/api: Lambda handlers. Calls engine. Owns the DynamoDB cache and the snapshotter.
  - src/handlers: three Lambda entries, scan.ts, remediate.ts and snapshotter.ts.
  - The scan handler serves GET /api/scan and GET /api/evidence.
  - src/remediate: allowlist, executor, GitHub requests and the DynamoDB remediation log store.
  - src/dynamo: the cache store and the snapshot store.
  - src/contract.ts: the response types that web imports.
- packages/web: the cemetery. Reads from api. Never calls registries directly.
  - src/scene: canvas drawing. src/drawer and src/header: DOM. src/triage: ordering. src/load: API clients.
- packages/action: GitHub Action wrapping cli. action.yml is the composite action. src/post-comment.ts posts the comment.
- infra: CDK app. bin/sexton.ts is the entry. lib/app.ts builds two stacks.
  - SextonData: cache table, snapshots table, remediation log table and an empty GitHub token secret.
  - SextonEdge: scan, remediate and snapshotter functions, function URLs, CloudFront, WAF, the web bucket, the daily schedule and alarms.
  - Deployed only to us-east-1. Stack and table names end in the stage, which is dev.
- scripts/self-scan.mjs: Sexton scans its own dependencies. CI runs it as npm run scan:self.
- .github/workflows: ci.yml runs the gates, the self-scan and the infra synth. sexton.yml runs the Action on pull requests.
- docs: ADRs, threat model, architecture. docs/requirements.md is the product requirements.
- .kiro: specs, steering, hooks, agents, settings. Committed. Never ignored.
- private: research and filings. Ignored. Never committed.

## Naming
- Files kebab-case. Types PascalCase. Functions camelCase. Constants UPPER_SNAKE.
- One exported concept per file. Tests mirror source paths under test/.
- Signal clients live in packages/engine/src/clients/<source>.ts. One file per upstream.

## Dependencies between packages
- engine depends on nothing internal.
- cli and api depend on engine (their package.json files list @sexton/engine).
- action has no internal package dependency in package.json. At run time action.yml builds and runs the cli.
- web depends on api's response types only (a devDependency on @sexton/api).
- infra depends on no internal package. It bundles the api handler files by path.
