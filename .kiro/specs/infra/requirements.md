# Requirements Document

## Introduction

The infra module puts Sexton on AWS in us-east-1. It adds a CDK v2 TypeScript app in `infra/` with two stacks, `SextonData-dev` and `SextonEdge-dev`; the hosted scan API and the scheduled snapshotter in `packages/api`; the DynamoDB implementations of the engine's `CacheStore` and `SnapshotStore` interfaces; CI in `.github/workflows/ci.yml`; and the architecture, threat model and Well-Architected documents in `docs/`.

This spec implements R-SN-1 (scheduled daily job), R-SN-2 and R-SN-3 in production, R-SG-7 in production (a shared 24-hour cache), R-PO-1 and R-PO-2 on the hosted path, the hosted side of R-IN-1 to R-IN-4, N-1 (security), N-3 (performance), N-5 (observability), N-6 (cost), N-7 and N-8 (Sexton scans itself in CI) and N-9 (architecture, threat model and Well-Architected documents) of docs/requirements.md.

The spec was written Design-First. design.md came first and records every AWS fact with its documentation URL. This document states the behaviour design.md must deliver.

Three points need review. First, the default CloudFront certificate uses the TLSv1 security policy, so "TLS 1.2 minimum with the default certificate" cannot be met; HP decided to keep the default certificate with HSTS for 0.1, and Requirement 5.8 states what is met. Second, IAM cannot stop PutItem from replacing an item, so the append-only rule (R-SN-2) is met by IAM together with a conditional write (Requirement 3.6 and 8.2). Third, the API returns 422, not 404, for a repository without `package.json`, because the distribution maps 404 to the web app's `index.html` (Requirement 4.4).

This spec does NOT change `packages/engine`, `packages/web`, `packages/api/src/contract.ts` or any Kiro-owned file. It does NOT add API Gateway, a custom domain, a second stage, private repositories, remediation pull requests, the CLI, a deploy from CI, or any reader of the GitHub token secret.

## Glossary

- **Infra app**: the CDK v2 TypeScript application in `infra/`.
- **Data stack**: the CloudFormation stack `SextonData-dev`, holding the Cache table, the Snapshots table and the GitHub token secret.
- **Edge stack**: the CloudFormation stack `SextonEdge-dev`, holding the Scan function, the Snapshotter function, the Function URL, the Distribution, the Web ACL, the Web bucket, the Schedule, the alarms and the Alarm topic.
- **API**: the code in `packages/api/src` other than `contract.ts`.
- **Scan function**: the Lambda function that serves `GET /api/scan`.
- **Snapshotter function**: the Lambda function the Schedule invokes once a day.
- **Function URL**: the Lambda function URL of the Scan function.
- **Distribution**: the one CloudFront distribution of the Edge stack.
- **Web ACL**: the AWS WAF web ACL attached to the Distribution.
- **Web bucket**: the private S3 bucket that holds the built web app.
- **Schedule**: the EventBridge Scheduler schedule that invokes the Snapshotter function.
- **Cache table**: the DynamoDB table `sexton-cache-dev`.
- **Snapshots table**: the DynamoDB table `sexton-snapshots-dev` and its global secondary index `seen-by-time`.
- **DynamoDB port**: the three-method interface (`getItem`, `putItem`, `query`) through which the stores reach DynamoDB.
- **Cache store**: `DynamoCacheStore`, the API's implementation of the engine's `CacheStore`.
- **Snapshot store**: `DynamoSnapshotStore`, the API's implementation of the engine's `SnapshotStore`.
- **Cache entry**: the engine's `{ value, storedAt }`, with `storedAt` in epoch milliseconds.
- **Value limit**: 350 KB (358,400 bytes), the largest gzip-compressed cache value the Cache store writes.
- **Cache TTL**: 24 hours, 86,400 seconds.
- **Snapshot**, **Seen record**, **InvalidCaptureTimeError**: as defined in the history-signals spec.
- **Capture time**: the `captureTime` of a Snapshot, an ISO 8601 UTC string, used as epoch milliseconds inside the store.
- **Sequence**: the string the Snapshot store adds to each Snapshot key so that two Snapshots of one package with one Capture time have distinct keys.
- **Scan request**: a Function URL event for `GET /api/scan` with one `repo` query parameter.
- **Repo parameter**: the value of the `repo` query parameter of a Scan request. It is Untrusted input.
- **ScanResponse**: the object `{ report, policy }` defined by `packages/api/src/contract.ts` (cemetery-ui), mirrored by `contract-pending.ts` until that file is on main.
- **Policy file**: `sexton.policy.yml` at the root of the scanned repository, read from `https://raw.githubusercontent.com/{owner}/{repo}/HEAD/sexton.policy.yml`.
- **Error body**: the JSON object `{ code, message, file?, errors? }` the API returns for every non-2xx response.
- **Correlation ID**: the identifier of one Scan request or one Snapshotter run, present on every log line of that request or run and returned to the viewer as `x-sexton-request-id`.
- **Upstream request**: one HTTP request from the Scan function or the Snapshotter function to `raw.githubusercontent.com`, `registry.npmjs.org`, `api.osv.dev`, `api.deps.dev` or the npm attestations endpoint.
- **Untrusted input**: the Repo parameter, every byte read from a scanned repository (including the Policy file) and every upstream response body.
- **Time budget**: the Snapshotter function's remaining execution time minus a 90-second safety margin.
- **Deferred name**: a Seen package name the Snapshotter function did not reach inside the Time budget.
- **Suppression table**: the `NAG_SUPPRESSIONS` list in `infra/lib/nag-suppressions.ts` and the matching table in design.md.

## Requirements

### Requirement 1: App, stacks and region

**User Story:** As HP, I want one CDK app with two named stacks in us-east-1, so that data outlives the edge and nothing can be deployed to another region by mistake.

#### Acceptance Criteria

1. THE Infra app SHALL define exactly two stacks, named `SextonData-dev` and `SextonEdge-dev`, where the Edge stack depends on the Data stack and the Data stack depends on nothing in the Edge stack.
2. IF the Infra app is synthesised with a region other than `us-east-1`, THEN THE Infra app SHALL fail synthesis with an error naming the required region.
3. THE Infra app SHALL synthesise without AWS credentials and without context lookups.

### Requirement 2: DynamoDB cache store

**User Story:** As a maintainer, I want upstream responses cached in DynamoDB for 24 hours across all Lambda containers, so that a warm scan is fast and upstreams are not asked twice.

#### Acceptance Criteria

1. THE Cache store SHALL implement the engine's `CacheStore` interface over the Cache table, with the cache key as the partition key `pk`.
2. FOR ANY cache key and any JSON value whose compressed size is within the Value limit, a `set` of `{ value, storedAt }` followed by a `get` of the same key SHALL return an entry deeply equal to `{ value, storedAt }` (round-trip).
3. FOR ANY `storedAt` in milliseconds and any TTL in seconds, THE Cache store SHALL write the TTL attribute `expiresAt` as the integer `floor(storedAt / 1000) + ttlSeconds` (invariant).
4. FOR ANY value whose gzip-compressed JSON exceeds the Value limit, or that cannot be serialised as JSON, THE Cache store SHALL write nothing and SHALL resolve `set` without an error (rejection).
5. WHEN a value is not stored because of criterion 4, THE Cache store SHALL leave any existing entry under that key unchanged, so that a following `get` returns that entry or `undefined`.
6. IF a DynamoDB call fails, THEN THE Cache store SHALL resolve `get` with `undefined` and SHALL resolve `set`, so that a store failure never fails a fetch or a scan.
7. WHEN a DynamoDB call fails, THE Cache store SHALL write one log line naming the operation and the error name, and SHALL NOT log the key or the value.
8. THE Cache table SHALL use on-demand billing, encryption with the AWS owned key, the TTL attribute `expiresAt`, and no sort key.

### Requirement 3: DynamoDB snapshot store

**User Story:** As a security engineer, I want snapshot history kept in DynamoDB and never overwritten, so that maintainer and provenance changes are computed from real history in production.

#### Acceptance Criteria

1. THE Snapshots table SHALL have partition key `pk` and sort key `sk` (both String), on-demand billing, the AWS owned key, point-in-time recovery, deletion protection, a retain removal policy, no TTL attribute, and a global secondary index `seen-by-time` with partition key `gpk` (String) and sort key `seenAt` (Number).
2. THE Snapshot store SHALL store a Snapshot under `pk = "snap#" + name` and `sk` equal to the Capture time in milliseconds plus a fixed offset written as a 15-digit zero-padded number, then `#`, then the Sequence.
3. FOR ANY two distinct triples of package name, Capture time and Sequence, THE Snapshot store SHALL produce distinct `(pk, sk)` pairs, and FOR ANY triple, decoding the encoded `sk` SHALL return the same Capture time and Sequence (injectivity, round-trip).
4. FOR ANY sequence of appends in any order, THE Snapshot store's `history(name)` SHALL return exactly the Snapshots appended for `name`, deeply equal to what was appended, ordered by numeric Capture time and then by append order within one store instance.
5. FOR ANY sequence of appends, THE Snapshot store's `history(name)` SHALL return a result deeply equal to `InMemorySnapshotStore.history(name)` for the same appends (model equivalence).
6. THE Snapshot store SHALL write every Snapshot with the condition that no item with the same key exists, and WHEN that condition fails, SHALL retry once with a new Sequence.
7. FOR ANY sequence of appends, including appends whose Sequence collides with a stored key, THE Snapshot store SHALL NOT change or remove any stored Snapshot item (invariant).
8. THE Snapshot store SHALL store a Seen record under `pk = "seen#" + name` with `gpk = "seen"` and `seenAt` equal to the Seen time in epoch milliseconds as a Number.
9. FOR ANY set of Seen records, any reference time and any window, THE Snapshot store's `listSeenWithin` SHALL return exactly the names with at least one Seen time `t` where `t <= reference` and `reference - t <= window`, each once, in ascending UTF-16 code-unit order, equal to `InMemorySnapshotStore.listSeenWithin` for the same records.
10. IF `append` receives a Capture time that is not an ISO 8601 UTC string, THEN THE Snapshot store SHALL reject with `InvalidCaptureTimeError` and SHALL write nothing.

### Requirement 4: Scan API

**User Story:** As Reviewer Rita, I want to paste a public GitHub URL and get a scan back from the hosted site, so that I can see Sexton work without installing anything.

#### Acceptance Criteria

1. WHEN the Scan function receives a GET request for path `/api/scan` with exactly one query parameter `repo` of at most 512 characters that the engine's `parseRepoUrl` accepts, THE Scan function SHALL call `intakeRepo` exactly once with the Canonical URL of the parsed reference.
2. IF a request uses a method other than GET, THEN THE Scan function SHALL return HTTP 405 with the fixed Error body `method-not-allowed`.
3. IF a GET request has another path, no `repo` parameter, more than one `repo` parameter, any other parameter, a Repo parameter longer than 512 characters, or a Repo parameter that `parseRepoUrl` rejects, THEN THE Scan function SHALL return HTTP 400 with a fixed Error body (`invalid-request` or `invalid-url`) and SHALL make no upstream request and no DynamoDB call (rejection, exclusive with criterion 1).
4. WHEN `intakeRepo` returns an error, THE Scan function SHALL return the status of the error table in design.md (422 for `missing-package-json`, `invalid-package-json`, `invalid-lockfile` and `manifest-too-large`, 502 for `fetch-failed`, 500 for `internal-error`) with the engine's fixed message and file name.
5. FOR ANY failing request, THE Scan function SHALL return an Error body that contains no substring of the Repo parameter longer than 3 characters, apart from substrings of the fixed error text itself (no echo).
6. WHEN intake succeeds, THE Scan function SHALL score the packages with `scorePackages` using the Cache store, the Snapshot store and the Cache TTL, evaluate the policy, attach the scan metadata, and return HTTP 200 with a body that is a ScanResponse.
7. THE Scan function SHALL return every 200 response with `content-type: application/json; charset=utf-8` and `cache-control: public, max-age=300`, and every error response with `cache-control: no-store`.
8. THE Scan function SHALL return the Correlation ID in the `x-sexton-request-id` header of every response.
9. IF any step after request validation throws, THEN THE Scan function SHALL return HTTP 500 with the fixed Error body `internal-error` and SHALL NOT return a partial scan.
10. WHEN the Policy file is found, THE Scan function SHALL evaluate the policy it parses, and IF the Policy file fails `parsePolicy`, THEN THE Scan function SHALL return HTTP 422 with the code `invalid-policy` and at most 20 errors, each with its error code and JSON pointer path only (R-PO-2).
11. WHEN the Policy file request returns HTTP 404, THE Scan function SHALL evaluate `DEFAULT_POLICY` with the source `"default"` (R-PO-1).
12. IF the Policy file request fails with any status other than 404, a body over 256 KiB, or a network error, THEN THE Scan function SHALL return HTTP 502 with the code `fetch-failed` and the file `sexton.policy.yml`, and SHALL NOT fall back to the default policy.
13. THE Scan function SHALL share one Cache store between intake, the Policy file fetch and scoring, so that a key read by intake is not fetched again by scoring within the Cache TTL.

### Requirement 5: Edge

**User Story:** As HP, I want the public endpoint reachable only through CloudFront and WAF, so that abuse is limited at the edge and the function cannot be called directly.

#### Acceptance Criteria

1. THE Function URL SHALL use auth type `AWS_IAM`, and THE Distribution SHALL reach it through an origin access control of type `lambda` that always signs requests.
2. THE Scan function SHALL grant `lambda:InvokeFunctionUrl` and `lambda:InvokeFunction` to the principal `cloudfront.amazonaws.com` only, each with `AWS:SourceArn` equal to the Distribution's ARN.
3. THE Distribution SHALL route `/api/*` to the Function URL with caching disabled, GET and HEAD only, only the `repo` query string forwarded, no cookies and no viewer headers forwarded, an origin response timeout of 60 seconds, a response completion timeout of 65 seconds, and one connection attempt.
4. THE Distribution SHALL serve every other path from the Web bucket through an origin access control of type `s3`, and SHALL answer 403 and 404 from the Web bucket with `/index.html` and status 200.
5. THE Web ACL SHALL be attached to the Distribution with scope `CLOUDFRONT` and SHALL contain the AWS managed rule groups `AWSManagedRulesCommonRuleSet` and `AWSManagedRulesKnownBadInputsRuleSet` and a rate-based rule that blocks an IP address that sends more than 100 requests in 300 seconds to a URI path starting with `/api/`.
6. THE Scan function SHALL run on Node.js 22 (`nodejs22.x`) on arm64 with 1024 MB of memory, a 60-second timeout and a reserved concurrency of 10.
7. THE Distribution SHALL redirect HTTP to HTTPS for the web app, SHALL accept only HTTPS on `/api/*`, and SHALL use HTTPS to both origins.
8. THE Distribution SHALL send `Strict-Transport-Security` with `max-age` of at least one year, and SHALL use the TLS security policy the default CloudFront certificate allows for release 0.1, and docs/threat-model.md SHALL record the TLSv1 limit and the custom-domain path.
9. THE Distribution SHALL add, on every response, a content security policy that allows only `'self'` plus `data:` images, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY` and `Referrer-Policy: no-referrer`, and SHALL set no CORS headers.
10. THE Web bucket SHALL block all public access, enforce SSL, be versioned, be readable only by the Distribution, and be filled from `packages/web/dist` with an invalidation of `/*` on each deploy.

### Requirement 6: Observability

**User Story:** As HP, I want one structured log line per upstream request and a correlation ID on every line, so that I can follow a slow or failed scan without logging anything sensitive (N-5).

#### Acceptance Criteria

1. WHEN the Scan function or the Snapshotter function completes an Upstream request, THE API SHALL write one JSON log line with the keys `level`, `time`, `correlationId`, `msg`, `host`, `path`, `status` and `latencyMs`.
2. WHEN an Upstream request throws, THE API SHALL write one JSON log line with `status` 0 and the error name, and SHALL rethrow the error unchanged.
3. FOR ANY Upstream request, THE API SHALL NOT write its query string, its fragment, any header value, or any byte of its response body to a log line (invariant).
4. THE API SHALL use the `x-amz-cf-id` request header as the Correlation ID when it is 1 to 128 characters from `[A-Za-z0-9_=-]`, and SHALL otherwise use the Lambda request ID.
5. WHEN a scan ends, THE Scan function SHALL write one log line with the status, the package count, `capped`, `unlocked`, the duration in milliseconds and the policy source, and SHALL NOT write the Repo parameter.
6. THE Edge stack SHALL create one log group per function with a retention of 30 days.

### Requirement 7: Snapshotter

**User Story:** As the agent, I want every package seen in the last 90 days snapshotted once a day, so that maintainer and provenance history builds up (R-SN-1).

#### Acceptance Criteria

1. THE Schedule SHALL invoke the Snapshotter function once a day at 03:17 UTC with the expression `cron(17 3 * * ? *)` and no retries.
2. THE Snapshotter function SHALL run on Node.js 22 on arm64 with 1024 MB of memory, a 600-second timeout and a reserved concurrency of 1.
3. WHEN invoked, THE Snapshotter function SHALL list the Seen names of the last 90 days once and SHALL call `runSnapshotter` on chunks of 25 names while the Time budget is greater than zero.
4. FOR ANY Seen list and any sequence of remaining-time readings, THE Snapshotter function SHALL report `snapshotted + failed + deferred` equal to the number of listed names, and SHALL NOT start a chunk when the remaining time is 90 seconds or less (invariant).
5. WHEN a run ends, THE Snapshotter function SHALL publish the counts of failed and Deferred names and a listing error flag as CloudWatch metrics in the namespace `Sexton`, and SHALL write one summary log line.
6. THE Snapshotter function SHALL NOT throw, so that a failed run is reported by metrics and not retried by the Schedule.

### Requirement 8: Least privilege

**User Story:** As Security Sam, I want every role to have only the permissions it uses, so that a bug in one function cannot change data it does not own (N-1).

#### Acceptance Criteria

1. THE Infra app SHALL grant permissions only through inline policies, with no AWS managed policy on the Scan or Snapshotter roles.
2. FOR the synthesised templates, NO IAM statement SHALL grant `dynamodb:UpdateItem`, `dynamodb:DeleteItem`, `dynamodb:BatchWriteItem`, `dynamodb:PartiQLUpdate`, `dynamodb:PartiQLDelete` or a wildcard DynamoDB action on the Snapshots table or its index.
3. FOR the synthesised templates, NO IAM statement SHALL have an action or a resource equal to `*`, except the CDK BucketDeployment invalidation statement listed in design.md.
4. THE Scan role SHALL be limited to GetItem and PutItem on the Cache table, Query on Snapshots table partitions starting with `snap#`, and PutItem on Snapshots table partitions starting with `seen#`, using the `dynamodb:LeadingKeys` condition key.

### Requirement 9: Alarms and secrets

**User Story:** As HP, I want to be told by email when the hosted demo is failing, and a place ready for the GitHub token, with no secret in code.

#### Acceptance Criteria

1. THE Edge stack SHALL create alarms for a scan 5xx rate over 5 percent in 5 minutes, a scan duration p95 over 45 seconds in 5 minutes, any scan throttle in 5 minutes, any Snapshotter failure, deferral, listing error or Lambda error in a day, and any DynamoDB throttled request in 5 minutes.
2. THE Edge stack SHALL send every alarm to one SNS topic that enforces SSL.
3. THE Edge stack SHALL take the alarm email address as the stack parameter `AlarmEmail` and SHALL NOT contain an email address literal.
4. THE Infra app and the API SHALL contain no secret, token, key or password in code or configuration.
5. THE Data stack SHALL create the secret `sexton/github-token-dev` with no value and SHALL output its ARN.
6. THE Infra app SHALL grant no role read access to the secret `sexton/github-token-dev` in this spec.

### Requirement 10: Cost and checks

**User Story:** As HP, I want the demo to stay inside the free tier plus under 20 USD a month and to pass cdk-nag, so that it is cheap and defensible (N-6, N-1).

#### Acceptance Criteria

1. design.md SHALL record the expected monthly cost at zero traffic and at 1000 scans a day, with the prices and assumptions used.
2. THE expected monthly cost at 1000 scans a day recorded in design.md SHALL be under 20 USD.
3. WHEN the stacks are synthesised with the cdk-nag `AwsSolutionsChecks`, THE Infra app SHALL produce no unsuppressed error or warning.
4. THE Infra app SHALL apply only the suppressions in the Suppression table, each with a written reason that also appears in design.md.

### Requirement 11: Continuous integration

**User Story:** As a maintainer, I want every push checked on macOS and Linux, Sexton run against itself, and the infrastructure synthesised, so that a broken change is caught before merge (N-7, N-8).

#### Acceptance Criteria

1. WHEN code is pushed or a pull request is opened, THE CI workflow SHALL run `npm ci`, `npm run typecheck`, `npm run lint` and `npm test` on Node.js 22 on both `macos-latest` and `ubuntu-latest`.
2. THE CI workflow SHALL run `npm run scan:self` on `ubuntu-latest` with network access and SHALL fail when the script exits non-zero.
3. THE CI workflow SHALL run `cdk synth` and the infra tests, including the IAM and cdk-nag tests, with no AWS credentials.
4. THE CI workflow SHALL hold no AWS credentials, SHALL NOT deploy, and SHALL request only `contents: read` permission.
5. THE CI workflow SHALL pin every third-party action to a full commit SHA.

### Requirement 12: Documentation

**User Story:** As Reviewer Rita, I want the architecture, threats and trade-offs written down, so that I can judge the design in three minutes (N-9).

#### Acceptance Criteria

1. THE repository SHALL contain `docs/architecture.md` with one Mermaid diagram, the request path, the data model, the IAM table and the cost table.
2. THE repository SHALL contain `docs/threat-model.md` with STRIDE per component, the untrusted-input story from repo-intake, the append-only proof with its residual risk, and the abuse cases of the public endpoint with their controls.
3. THE repository SHALL contain `docs/well-architected.md` with one paragraph per Well-Architected pillar.
