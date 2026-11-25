# Implementation Plan: infra

## Overview

Builds the hosted side of Sexton: the DynamoDB stores, the scan API and the snapshotter in packages/api, the CDK app in infra/, CI, and the three documents. Pure modules come first, then the stores over the in-memory DynamoDB port fake, then the handlers, then the stacks and their checks, then CI and docs. Deploy is the last task and runs only after HP types `deploy` in the session.

No test touches the network or real AWS. DynamoDB properties run against `packages/api/test/fakes/memory-dynamo.ts`. Upstream responses come from the engine's recorded fixtures through a routed fake transport. Stack tests use CDK assertions and cdk-nag on synthesised templates.

Ordering constraints, recorded here:

- `packages/api/package.json`, `tsconfig.json` and `vitest.config.ts` are created by Kiro's cemetery-ui spec. Tasks 2 to 7 start with `git merge main` after cemetery-ui is merged, and are blocked until then. Task 1 and tasks 8 to 10 (infra) do not depend on it, except that the stacks reference the handler entry files by path; until the handlers exist, `bin/sexton.ts` and the stack tests use the placeholder handler code.
- HP approved adding `"infra"` to the root `workspaces` array (that one line only). Task 1.1 does it and records it in build/handoffs/to-kiro.md as done. The root `tsconfig.json` is not changed; infra type-checks itself in its `pretest` script.
- HP set the order: task 1 with the infra stacks and the IAM-shape and cdk-nag tests (tasks 1, 8, 9 and 10 here), then the documents (task 12), then CI (task 11), then stop and report. Tasks 2 to 7 wait for cemetery-ui. Gates and an independent review run before each commit.
- Until the handlers and the web build exist, `bin/sexton.ts` uses a placeholder handler and skips the BucketDeployment, each with a CDK warning (design.md, Decisions). Task 14 refuses to deploy while either warning is present.
- `contract.ts` is Kiro's. The API imports `ScanResponse` from `contract-pending.ts` until `contract.ts` is on main, then switches (task 6.6).

- [x] 1. Infra workspace skeleton, config and handoff to Kiro
  - Sets up `infra/` as its own package and records what is needed from Kiro.
  - _Requirements: 1.1, 1.2, 1.3_
  - [x] 1.1 Add the infra workspace and write build/handoffs/to-kiro.md
    - Add `"infra"` to the `workspaces` array of the root package.json, that one line only (approved by HP). Record it in build/handoffs/to-kiro.md as done (in the main checkout, where Kiro works; build/handoffs is gitignored).
    - Agreed with HP: Kiro relaxes `parseApiBase` to accept the same-origin path `/api`; the web app is built with `VITE_SEXTON_API=/api`. Recorded in the handoff for Kiro.
    - Optional request: `{ "path": "infra" }` in the root tsconfig.json references.
    - Note for Kiro: the API returns 422 (not 404) for `missing-package-json`, and the response headers policy adds a header CSP that allows everything the meta CSP allows.
    - _Requirements: 1.3_
  - [x] 1.2 Create infra/package.json, tsconfig.json, vitest.config.ts and cdk.json
    - `sexton-infra`, private, `type: module`, exact pins from design.md Dependencies (aws-cdk-lib 2.277.0, constructs 10.8.1, aws-cdk 2.1148.0, cdk-nag 3.0.2, esbuild 0.28.2, tsx exact). Scripts `synth`, `diff`, `test`. tsconfig extends `../tsconfig.base.json`. `cdk.json` app `npx tsx bin/sexton.ts`, no feature flags beyond the CDK defaults for the pinned version.
    - Pin the versions in infra/package.json and install with `npx npm@11 install -w sexton-infra`; `npm ci` gives the full tree from the lockfile. Confirm every new licence is Apache-2.0, MIT, BSD or ISC.
    - _Requirements: 1.3_
  - [x] 1.3 Implement infra/lib/config.ts and the region guard in infra/bin/sexton.ts
    - Constants and name builders exactly as in design.md. `bin/sexton.ts` throws when the region is not `us-east-1`. No `fromLookup` anywhere.
    - _Requirements: 1.1, 1.2, 1.3_
  - [x] 1.4 Write infra/test/config.test.ts
    - Names `SextonData-dev`, `SextonEdge-dev`, `sexton-cache-dev`, `sexton-snapshots-dev`, `sexton/github-token-dev`. Synth with `eu-west-1` throws with a message naming `us-east-1`. Synth with no credentials in the environment succeeds and writes no `cdk.context.json`.
    - _Requirements: 1.1, 1.2, 1.3_

- [x] 2. API wiring and the DynamoDB port
  - _Requirements: 2.1, 3.1, 4.6_
  - [x] 2.1 Merge main and add API dependencies
    - `git merge main` into spec/infra. Add `@aws-sdk/client-dynamodb@3.1166.0` and `@types/aws-lambda@8.10.164` (dev) with `npm install -w @sexton/api <pkg>@<exact>`. Root package.json is not edited by hand.
    - _Requirements: 4.6_
  - [x] 2.2 Implement packages/api/src/contract-pending.ts
    - `ScanResponse = { report, policy }` mirroring cemetery-ui. Skip this sub-task if `contract.ts` is already on main, and import from it instead.
    - Skipped: cemetery-ui merged into main (b7bcef0) before this task, so `contract-pending.ts` was never created. The API imports `ScanResponse` from `./contract.js`. `fast-check` 3.23.1 is also a dev dependency of `@sexton/api`, the same pin as the root.
    - _Requirements: 4.6_
  - [x] 2.3 Implement src/dynamo/port.ts and src/dynamo/aws-port.ts
    - Interface, `ConditionFailedError`, `ItemTooLargeError` and the SDK adapter as in design.md: eventually consistent GetItem, PutItem with `attribute_not_exists(pk)` when asked, Query following `LastEvaluatedKey` ascending. The client is created by the caller and passed in.
    - _Requirements: 2.1, 3.1, 3.6_
  - [x] 2.4 Write test/fakes/memory-dynamo.ts and test/dynamo/port-contract.test.ts
    - The fake models the key schema of both tables, the sparse GSI, ascending sort-key order, the conditional put, the 400 KB item limit, injectable failures and a shuffled-order mode. The contract suite runs against the fake and against `AwsDynamoPort` over a stubbed `send` that returns recorded command outputs, including a two-page Query and a `ConditionalCheckFailedException`.
    - _Requirements: 2.1, 3.1, 3.6_
  - [x] 2.5 Add test/arbitraries.ts
    - `arbCacheKey`, `arbJsonValue`, `arbStoredAt`, `arbTtlSeconds`, `arbPackageName`, `arbIsoUtc`, `arbSequence`, `arbSnapshot`, `arbSeenSet`, `arbEvent`, `arbHostileRepo`, as in design.md.
    - _Requirements: 2.2, 3.3, 3.9, 4.1_

- [x] 3. Cache store with properties 1 to 4
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7_
  - [x] 3.1 Implement src/dynamo/cache-item.ts
    - `expiresAtSeconds`, `encodeCacheItem` (JSON in try/catch, gzip level 6, 350 KB limit on compressed bytes, key length check), `decodeCacheItem` (never throws, ignores `expiresAt`).
    - _Requirements: 2.2, 2.3, 2.4_
  - [x] 3.2 Implement src/dynamo/cache-store.ts
    - `get` and `set` never reject; one log line per failure or skip, with no key or value.
    - _Requirements: 2.1, 2.4, 2.5, 2.6, 2.7_
  - [x] 3.3 Write test/dynamo/cache-item.test.ts and test/dynamo/cache-store.test.ts
    - Property 1 (cache round trip), Property 2 (TTL arithmetic), Property 3 (oversize values are never stored, numRuns 20 stated in the test), Property 4 (store failures never reject). Examples: corrupt gzip, missing `storedAt`, non-JSON value, `CachedFetcher` with this store makes no fetch inside 24 hours and refetches after, an item past `expiresAt` that DynamoDB has not yet deleted is still judged by `storedAt`.
    - Tags: `Feature: infra, Property 1: Cache round trip` and so on.
    - Done with two details: Property 3 draws 400 KB to 600 KB of random bytes as hex (360 KB can compress to just under the limit), and `src/log/logger.ts` gets the `Logger` type and `errorName` here, because the store needs them. Task 5 adds the rest of the logger.
    - _Requirements: 2.2, 2.3, 2.4, 2.5, 2.6, 2.7_

- [x] 4. Snapshot store with properties 5 to 8
  - _Requirements: 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10_
  - [x] 4.1 Implement src/dynamo/snapshot-keys.ts
    - Fixed-width 15-digit capture field with the year-0000 offset, `#`, Sequence. Seen keys use the same number. Decoding splits after the 15 digits.
    - _Requirements: 3.2, 3.3, 3.8_
  - [x] 4.2 Implement src/dynamo/snapshot-store.ts
    - `append` with the engine's capture-time check, conditional put, one retry on collision. `history` sorts explicitly by numeric capture time then Sequence and drops corrupt items with a log line. `recordSeen` without a condition. `listSeenWithin` through the GSI with inclusive numeric bounds, de-duplicated and sorted by code units. The Sequence source is injectable for tests.
    - _Requirements: 3.2, 3.4, 3.6, 3.7, 3.8, 3.9, 3.10_
  - [x] 4.3 Write test/dynamo/snapshot-keys.test.ts and test/dynamo/snapshot-store.test.ts
    - Property 5 (key encoding is injective and round-trips), Property 6 (history order and equivalence with the in-memory store, with shuffled port results), Property 7 (append never replaces, numRuns 1000), Property 8 (Seen listing, numRuns 1000, with exact window boundaries). Examples: `InvalidCaptureTimeError` writes nothing; a forced collision retries once; a second collision rejects; the engine seed `seed-maintainer-change.json` scored with `scorePackages` over this store gives the same Possessed result as with `InMemorySnapshotStore`.
    - _Requirements: 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10_

- [x] 5. Logging with property 11
  - _Requirements: 6.1, 6.2, 6.3, 6.4_
  - [x] 5.1 Implement src/log/logger.ts and src/log/logging-transport.ts
    - Pure `logLine` with scalar fields only, `createLogger` with an injectable sink, `upstreamFields` from host and path only, `withRequestLogging` that times, logs and rethrows, and the correlation ID rule.
    - _Requirements: 6.1, 6.2, 6.3, 6.4_
  - [x] 5.2 Write test/log/logger.test.ts and test/log/logging-transport.test.ts
    - Property 11 (upstream log lines carry no query and no body). Examples: exact key set, `status` 0 and error name on throw, the error is rethrown unchanged, correlation ID from a valid `x-amz-cf-id`, fallback for an absent, empty, 129-character or `/`-containing header.
    - _Requirements: 6.1, 6.2, 6.3, 6.4_

- [x] 6. Scan API with properties 9 and 10
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9, 4.10, 4.11, 4.12, 4.13, 6.5_
  - [x] 6.1 Implement src/http/scan-request.ts
    - Method, exact path, exactly one `repo` and no other parameter, 512-character limit, `parseRepoUrl`, Canonical URL out. Reads no header and no cookie.
    - _Requirements: 4.1, 4.2, 4.3_
  - [x] 6.2 Implement src/http/responses.ts
    - The error table of design.md, 422 for the four intake input errors, headers on every response, `invalid-policy` with at most 20 `{ code, path }` entries and paths cut to 200 characters.
    - _Requirements: 4.2, 4.3, 4.4, 4.5, 4.7, 4.8, 4.10_
  - [x] 6.3 Implement src/policy-source.ts
    - `policyUrl` with re-validation, cached found and 404, not-cached failures, 256 KiB limit through `text()`, no auth or cookie headers.
    - _Requirements: 4.10, 4.11, 4.12, 4.13_
  - [x] 6.4 Implement src/scan.ts and src/handlers/scan.ts
    - `runScan` with injected deps: one `CachedFetcher` and context, intake, then policy fetch and scoring in parallel, policy outcome mapping, `evaluatePolicy`, `attachScan`, one summary log line without the Repo parameter. Never rejects. The handler module builds the DynamoDB client and port once at init, checks the three environment variables, and exports `createScanHandler(deps)` for tests.
    - _Requirements: 4.1, 4.4, 4.6, 4.9, 4.10, 4.11, 4.12, 4.13, 6.5_
  - [x] 6.5 Write tests for 6.1 to 6.4
    - Property 9 (request validation is exclusive, numRuns 1000) across scan-request.test.ts and scan.test.ts. Property 10 (error bodies never echo input, numRuns 1000). Examples: one per error-table row; 405 for POST; 400 for `/api/scan/x`, a repeated `repo`, an extra `x=1`, 513 characters; an end-to-end scan of the engine's ten fixture packages through a routed fake transport and the memory port returns a body that the cemetery-ui validator shape accepts (checked with a type-level test against `ScanResponse` and a JSON round trip); policy found, absent (source `default`), invalid (422) and 500 (502); a shared cache store makes zero packument requests in scoring for names intake already read; `cache-control` values; `x-sexton-request-id` on every response.
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9, 4.10, 4.11, 4.12, 4.13, 6.5_
  - [x] 6.6 Switch to contract.ts when it is on main
    - Replace the `contract-pending.ts` import with `./contract.js`, delete `contract-pending.ts`, re-run the tests. Blocked until cemetery-ui is merged.
    - Done from the start: `contract.ts` was on main before task 2, so the API has always imported `ScanResponse` from `./contract.js` and `contract-pending.ts` never existed.
    - Done with three details. The handler logic is in `src/scan-handler.ts` (`createScanHandler`, `readScanEnvironment`), and `src/handlers/scan.ts` is only the Lambda entry that reads the environment and builds the client, so tests can import the factory without the init-time environment check. The end-to-end test also checks the body with cemetery-ui's own `validateScanResponse`, loaded at run time. Property 10's invalid-policy scenario keeps the repository canary out of the policy file's keys: see design.md, "Notes on requirements and open items", item 13.
    - _Requirements: 4.6_

- [x] 7. Snapshotter with property 12
  - _Requirements: 7.3, 7.4, 7.5, 7.6_
  - [x] 7.1 Implement src/snapshot-run.ts and src/handlers/snapshotter.ts
    - `planChunks`, `runSnapshotJob` with injected `remainingMs`, list once, chunks of 25, 90-second margin, counts, summary line. The handler writes the Embedded Metric Format line for `SnapshotterFailed`, `SnapshotterDeferred` and `SnapshotterError` in namespace `Sexton`, and never throws.
    - _Requirements: 7.3, 7.4, 7.5, 7.6_
  - [x] 7.2 Write test/snapshot-run.test.ts
    - Property 12 (snapshot job accounting). Examples: a listing failure gives `error` and zero counts; a run with plenty of time defers nothing; the EMF line has the three metrics and parses as JSON; the handler resolves when `runSnapshotter` is replaced by a throwing fake.
    - Done with the same split as the scan handler: `src/snapshotter-handler.ts` holds `createSnapshotterHandler` and `emfLine`, and `src/handlers/snapshotter.ts` is only the Lambda entry. A chunk whose `runSnapshotter` call throws counts all its names as failed, so the accounting still adds up.
    - _Requirements: 7.3, 7.4, 7.5, 7.6_

- [x] 8. Data stack
  - _Requirements: 1.1, 2.8, 3.1, 9.5, 9.6_
  - [x] 8.1 Implement infra/lib/data-stack.ts
    - Both tables and the GSI exactly as in design.md Data Models, TTL only on the cache table, PITR, deletion protection and retain on the snapshots table, the empty secret with retain and the `GithubTokenSecretArn` output, termination protection on the stack.
    - _Requirements: 2.8, 3.1, 9.5_
  - [x] 8.2 Write infra/test/data-stack.test.ts
    - Assertions for keys, attribute types, billing mode, encryption, TTL attribute on the cache table only, no TTL on the snapshots table, PITR, deletion protection, the GSI key schema and projection, the secret with no `SecretString` and no `GenerateSecretString`, the output.
    - _Requirements: 2.8, 3.1, 9.5, 9.6_

- [x] 9. Edge stack
  - _Requirements: 4.7, 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8, 5.9, 5.10, 6.6, 7.1, 7.2, 8.1, 8.4, 9.1, 9.2, 9.3_
  - [x] 9.1 Implement roles, log groups and functions in infra/lib/edge-stack.ts
    - Inline-only roles per the IAM table, 30-day log groups passed as `logGroup`, `NodejsFunction` with ESM, `node22`, source maps, the `createRequire` banner, arm64, memory, timeouts and reserved concurrency. A `HandlerCode` prop chooses bundling from the entry file or a placeholder inline handler (503 `not-deployed`) with a CDK warning; tests and synth before the handlers exist use the placeholder.
    - _Requirements: 5.6, 6.6, 7.2, 8.1, 8.4_
  - [x] 9.2 Implement the function URL, web bucket, distribution, headers policy and WAF
    - Function URL `AWS_IAM`; `FunctionUrlOrigin.withOriginAccessControl` with 60 s read, 65 s completion, one attempt; both CloudFront permissions on the function (add `lambda:InvokeFunction` if the helper does not); `S3BucketOrigin.withOriginAccessControl`; the `/api/*` behaviour with `CACHING_DISABLED` and the `repo`-only origin request policy; SPA error responses; `web-security-headers.ts`; the web ACL with the two managed groups and the rate rule; `BucketDeployment` with invalidation; synth fails clearly when `packages/web/dist/index.html` is missing.
    - _Requirements: 4.7, 5.1, 5.2, 5.3, 5.4, 5.5, 5.7, 5.8, 5.9, 5.10_
  - [x] 9.3 Implement the schedule, alarms, topic and outputs
    - `cron(17 3 * * ? *)` with no retries and a scheduler role limited to the snapshotter ARN; the five alarms of design.md including the log metric filter and metric math for the 5xx rate; SNS topic with `enforceSSL` and the `AlarmEmail` parameter subscription; the five outputs.
    - _Requirements: 7.1, 9.1, 9.2, 9.3_
  - [x] 9.4 Write infra/test/edge-stack.test.ts
    - Assertions for every value in 9.1 to 9.3: runtime `nodejs22.x`, `arm64`, memory, timeouts, reserved concurrency, function URL auth type, both `AWS::Lambda::Permission` resources with principal `cloudfront.amazonaws.com` and the distribution `SourceArn`, OAC types `lambda` and `s3` with `always` and `sigv4`, origin timeouts and attempts, behaviours, cache and origin request policies, error responses, headers policy values, WAF rule order, managed group names, rate limit 100, window 300, IP aggregation, `/api/` scope-down, schedule expression and retry policy, alarm thresholds, topic SSL policy, the `AlarmEmail` parameter, and no `@` character in any template string other than the parameter reference.
    - _Requirements: 4.7, 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8, 5.9, 5.10, 6.6, 7.1, 7.2, 9.1, 9.2, 9.3_

- [x] 10. IAM and cdk-nag checks with properties 13 and 14
  - _Requirements: 8.1, 8.2, 8.3, 9.4, 9.6, 10.3, 10.4_
  - [x] 10.1 Implement infra/lib/nag-suppressions.ts and apply it in bin/sexton.ts
    - The table from design.md "cdk-nag suppressions", applied with cdk-nag 3's `Validations.of(construct).acknowledge`, one acknowledgement per finding ID. Run a real `cdk synth` with cdk-nag once; any rule that fires and is not in the table is fixed, or written into the owner's progress notes under "Waiting on HP" if it cannot be fixed.
    - _Requirements: 10.3, 10.4_
  - [x] 10.2 Write infra/test/iam.test.ts
    - Property 13 (IAM policy shape) as an example test over every policy-bearing resource in both templates, with the BucketDeployment invalidation statement and the log group `Arn` attributes (which end in `:*`) as the only allow-listed wildcards, each rendered and checked to hold exactly one `:*`, never `:*:`, and to cover a Lambda stream ARN, matched on exact action sets. Also asserts no role reads the GitHub token secret and no managed policy ARN is attached to the scan or snapshotter role.
    - _Requirements: 8.1, 8.2, 8.3, 9.6_
  - [x] 10.3 Write infra/test/nag.test.ts
    - Property 14 (cdk-nag AwsSolutions is clean): zero error and warning annotations on both stacks; every applied suppression is in `NAG_SUPPRESSIONS`; every reason is at least 20 characters and appears verbatim in design.md. Also a scan of `infra/` and `packages/api/src` for strings that look like keys or tokens (AWS key ID pattern, `ghp_`, `github_pat_`, `-----BEGIN`).
    - _Requirements: 9.4, 10.3, 10.4_

- [x] 11. CI workflow
  - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5_
  - [x] 11.1 Write .github/workflows/ci.yml
    - Jobs `gates` (matrix macos-latest and ubuntu-latest, Node 22), `self-scan` (ubuntu, `npm run build -w @sexton/engine` then `npm run scan:self`) and `infra` (ubuntu, `npm run build` for every workspace that has a build, `cdk synth -q` in infra/, infra tests). `permissions: contents: read`, actions pinned by full SHA (looked up at task time and recorded with their tag in a comment), concurrency per ref, no secrets, no deploy.
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5_
  - [x] 11.2 Check the workflow locally
    - Parse the YAML, assert every `uses:` has a 40-character SHA, no `secrets.` reference, no `aws-actions/configure-aws-credentials`, no `cdk deploy`. Run the `infra` job's commands locally with no AWS credentials in the environment.
    - _Requirements: 11.3, 11.4, 11.5_

- [x] 12. Documentation
  - _Requirements: 10.1, 10.2, 12.1, 12.2, 12.3_
  - [x] 12.1 Write docs/architecture.md
    - One Mermaid diagram, the request path, the data model, the IAM table and the cost table, taken from design.md and kept in step with it.
    - _Requirements: 10.1, 10.2, 12.1_
  - [x] 12.2 Write docs/threat-model.md
    - STRIDE per component (CloudFront and WAF, function URL, scan function, snapshotter, DynamoDB, web bucket, CI), the untrusted-input story from repo-intake, the append-only proof and its residual risk, and the abuse cases of the public endpoint (scan flooding, huge repositories, hostile manifests and policy files, cost exhaustion, direct function URL calls) with their controls.
    - _Requirements: 12.2_
  - [x] 12.3 Write docs/well-architected.md
    - One paragraph each for operational excellence, security, reliability, performance efficiency, cost optimisation and sustainability, naming the trade-offs (default certificate, no access logs, WAF fixed cost, single region).
    - _Requirements: 12.3_

- [ ] 13. Gates, independent review and commit
  - _Requirements: 8.2, 8.3, 9.4, 10.3, 11.1_
  - [ ] 13.1 Run the gates on the Mac
    - `npm run typecheck`, `npm run lint` and `npm test` at the root, zero warnings, which include infra through the workspace. Engine and web tests unchanged.
    - _Requirements: 11.1_
  - [ ] 13.2 Independent review
    - A reviewer that has not seen the implementation gets this spec folder, the diff against main, docs/requirements.md and the steering files. Fix every defect it reports (secret, I/O outside the seams, injection, IAM wider than least privilege, a correctness bug, a test asserting the opposite of its requirement, a file outside ownership). Record notes in build/reviews/10-infra.md.
    - _Requirements: 8.2, 8.3, 9.4, 10.3_
  - [ ] 13.3 Commit on spec/infra and update the owner's progress notes
    - Commit under the configured identity with no trailers. No push. Record hashes, open items and anything waiting on HP.
    - _Requirements: 11.1_

- [ ] 14. Deploy and verify (only after HP types `deploy` in the session)
  - _Requirements: 1.1, 1.2, 4.6, 5.1, 7.3, 10.2_
  - [ ] 14.1 Pre-deploy checks
    - `aws cloudformation describe-stacks --stack-name CDKToolkit --region us-east-1`: bootstrap only if no stack exists, and say so. `aws lambda get-account-settings`: stop for HP if `UnreservedConcurrentExecutions` is below 111 (100 stay unreserved, 11 are reserved). `cdk diff` for both stacks. The steps are in build/infra/10-deploy.md.
    - _Requirements: 1.1, 1.2_
  - [ ] 14.2 Deploy
    - Build web with `VITE_SEXTON_API=/api`. Confirm `cdk synth` shows neither placeholder warning. Deploy `SextonData-dev`, then `SextonEdge-dev` with `--parameters AlarmEmail=<from HP>`. One pass.
    - _Requirements: 4.6, 5.1_
  - [ ] 14.3 Verify and record
    - The CloudFront URL serves the demo. A direct unsigned call to the function URL returns 403. `GET {url}/api/scan?repo=https://github.com/expressjs/express` returns a ScanResponse under 60 seconds cold and under 20 seconds warm, measured with `curl -w` and recorded in build/reviews/10-infra.md. 101 rapid requests from one IP get blocked within about a minute. A manual invoke of the snapshotter appends snapshots (checked with a Query on one `snap#` partition). The three snapshotter metrics appear in the `Sexton` namespace after the manual invoke. The bundled handlers load (no `Cannot find module` at init). The confirmed or corrected `X-Amz-Cf-Id` behaviour is written into design.md; any doc and behaviour mismatch is filed with the owner's notes, outside the repository.
    - _Requirements: 4.6, 5.1, 5.5, 7.3, 10.2_

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2"] },
    { "id": 1, "tasks": ["1.3", "8.1"] },
    { "id": 2, "tasks": ["1.4", "8.2", "9.1"] },
    { "id": 3, "tasks": ["9.2", "9.3", "2.1"] },
    { "id": 4, "tasks": ["9.4", "2.2", "2.3", "2.5"] },
    { "id": 5, "tasks": ["2.4", "3.1", "4.1", "5.1", "6.1", "6.2"] },
    { "id": 6, "tasks": ["3.2", "4.2", "5.2", "6.3", "10.1"] },
    { "id": 7, "tasks": ["3.3", "4.3", "6.4", "7.1", "10.2", "10.3"] },
    { "id": 8, "tasks": ["6.5", "7.2", "11.1", "12.1", "12.2", "12.3"] },
    { "id": 9, "tasks": ["6.6", "11.2"] },
    { "id": 10, "tasks": ["13.1"] },
    { "id": 11, "tasks": ["13.2"] },
    { "id": 12, "tasks": ["13.3"] },
    { "id": 13, "tasks": ["14.1"] },
    { "id": 14, "tasks": ["14.2"] },
    { "id": 15, "tasks": ["14.3"] }
  ]
}
```
