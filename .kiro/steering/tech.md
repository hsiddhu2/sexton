---
inclusion: always
---
# Stack

- TypeScript 5.7.2, strict, ES2022, NodeNext modules. Node 22 (.nvmrc is 22, engines is >=22).
- npm workspaces: packages/* and infra. Packages: engine, cli, api, web, action, mcp. The infra workspace is named sexton-infra.
- Tests: Vitest 4.1.12. Property tests: fast-check 3.23.1, numRuns 100 default, 1000 for security invariants.
- Lint: ESLint 10.15.0 with typescript-eslint 8.72.2 strict. Zero warnings allowed (--max-warnings=0).
- Web: Vite 8.3.8 and React 19.3.1. Web tests use jsdom 31.0.1, Testing Library and axe-core 4.14.1. End-to-end tests use Playwright 1.65.1.
- API: AWS Lambda on Node.js 22 and arm64. Data: DynamoDB. Static: S3 and CloudFront. IaC: AWS CDK in TypeScript (aws-cdk-lib 2.277.0, cdk-nag 3.0.2).
- Engine runtime dependencies: ajv 8.20.0, semver 7.8.6, yaml 2.9.1.
- MCP runtime dependency: @modelcontextprotocol/server 2.4.0, the protocol library (Apache-2.0, two direct dependencies, no install script). It passed sexton check and the install gate on 26 Nov 2026. The MCP package uses no schema library: its tool schemas are hand-written Standard Schemas.
- API runtime dependencies: @aws-sdk/client-dynamodb and @aws-sdk/client-secrets-manager, both 3.1166.0.

## Commands
- npm run typecheck (tsc -b), npm run lint, npm test and npm run build at the root run every package.
- npm test -w @sexton/engine runs one package.
- npm run build:power builds packages/mcp and bundles powers/sexton/server/sexton-mcp.mjs (target Node 20, the Node Kiro starts the server with). npm test -w @sexton/mcp fails when the committed Bundle is stale.
- npm run scan:self scores Sexton's own dependencies live. It needs network and builds on npm run build -w @sexton/engine.
- npm run synth -w sexton-infra runs cdk synth. npm test -w sexton-infra runs the infra tests.
- npm run demo:generate -w @sexton/api writes the demo scan and evidence files for the web app.
- npm run fixtures:record -w @sexton/engine records upstream fixtures. It needs network.
- CI (.github/workflows/ci.yml) runs typecheck, lint and test on macOS and Ubuntu, then a self-scan job and an infra synth job.

## CLI
- Commands: scan, check, evidence and evidence --verify <file>. Also --help and --version.
- Exit 0: success.
- Exit 1: check found a failing policy rule, or evidence --verify found a digest mismatch.
- Exit 2: anything else. That covers a usage error, a missing or invalid file, an invalid policy and an unexpected throw.
- scan exits 0 once scan.json is written, whatever the policy says.

## Rules
- No network calls in tests. Upstream responses are recorded fixtures under test/fixtures.
- Pin every dependency to an exact version. No ranges.
- No new runtime dependency without a one-line justification in the PR body.
- ESM only. No require.
