---
inclusion: always
---
# Stack

- TypeScript 5.7, strict, ES2022, NodeNext modules. Node 22.
- npm workspaces. Packages: engine, cli, api, web, action.
- Tests: Vitest. Property tests: fast-check 3.23, numRuns 100 default, 1000 for security invariants.
- Lint: ESLint 9 with typescript-eslint strict. Zero warnings allowed.
- Web: Vite and React. API: AWS Lambda. Data: DynamoDB. Static: S3 and CloudFront. IaC: AWS CDK in TypeScript.

## Commands
- npm run typecheck, npm run lint, npm test at the root run every package.
- npm test -w @sexton/engine runs one package.

## Rules
- No network calls in tests. Upstream responses are recorded fixtures under test/fixtures.
- Pin every dependency to an exact version. No ranges.
- No new runtime dependency without a one-line justification in the PR body.
- ESM only. No require.
