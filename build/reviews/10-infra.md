# Review: spec 10 infra

Spec: .kiro/specs/infra. Branch: spec/infra. Each review was done by a reviewer that had not seen the implementation. The reviewer got the spec folder, the staged diff against main, docs/requirements.md and the steering files.

## Review 1: infra stacks, IAM-shape and cdk-nag tests (tasks 1, 8, 9, 10)

Verdict: READY. No defects.

What the reviewer checked:

- The scope of the change is infra/**, .kiro/specs/infra/**, the approved `"infra"` workspaces line in the root package.json, and package-lock.json.
- Gates: the infra tests pass, and typecheck and lint are clean. `cdk synth` with no AWS credentials succeeds and writes no `cdk.context.json`.
- IAM in the synthesised templates matches the design.md table row for row, including the `dynamodb:LeadingKeys` conditions on the scan role. There is no update, delete, batch-write, PartiQL-write or wildcard DynamoDB action. The only `*` items are the listed exceptions.
- Edge settings match requirement 5: function URL auth, both CloudFront permissions, both OAC types, the origin timeouts and the single attempt, the API behaviour, the origin request policy and the schedule.
- The reviewer ran a probe to check the nag test can fail. With cdk-nag 3.0.2, an unacknowledged warning-level finding also makes `app.synth()` throw.

Notes, and what was done:

| Note | Action |
|---|---|
| The 403/404 to `index.html` mapping also covers `/api/*`, so a managed-rule WAF block or an OAC failure reaches API clients as 200 HTML | Already in docs/threat-model.md, "Other accepted limits", item 2. The web client treats a non-JSON body as an invalid response |
| The snapshotter role has no `dynamodb:LeadingKeys` condition on the snapshots table | Kept as designed. It does not change the append-only argument, which rests on no update or delete and a conditional put. Follow-up: limit PutItem to `snap#*` and Query to `snap#*` once the snapshotter handler exists |
| The "do not deploy" guard is only a warning | Task 14 refuses to deploy while either warning is present. Follow-up: run the deploy with `--strict` |
| The no-web test did not check the warning | Fixed. The test now asserts the warning, and a new test asserts both placeholder warnings |
| The nag test relies on synth throwing | Kept. The reviewer showed it fails on unacknowledged errors and warnings |
| A different `CDK_DEFAULT_REGION` makes synth fail | Intended by requirement 1.2. It will be written into the deploy steps |
| infra used fast-check through hoisting only | Fixed. `fast-check` 3.23.1 is now a dev dependency of infra |
| Two bundled licences inside aws-cdk-lib: `case` (MIT or GPL-3.0-or-later) and `minimatch` (BlueOak-1.0.0) | Recorded in design.md, Dependencies. Both are permissive, and we take `case` under MIT |
| HSTS `includeSubdomains` does nothing on a cloudfront.net host | Kept. It matters once a custom domain is added |
| `LOG_RETENTION_DAYS` is checked with a throw rather than used | Kept. CDK takes an enum, and the check stops the constant and the enum from drifting |

## Review 2: docs/architecture.md, docs/threat-model.md, docs/well-architected.md (task 12)

Verdict: NOT READY, one defect, fixed.

The reviewer checked the documents against the spec, the committed stacks and a fresh synth. Every IAM row, cost number, data-model detail, WAF rule, timeout, alarm and the append-only proof match. HP's TLSv1 limit and custom-domain path are recorded. Every section that requirement 12 asks for is present. There are no secrets, account IDs or local paths.

Defect and fix:

| Defect | Fix |
|---|---|
| threat-model.md promised that handler-level controls are marked "planned", but three were not: the 502 with no policy fallback, the shared 24-hour DynamoDB cache, and "no input comes back in a response". All three live in the unwritten packages/api | Each is now marked planned. The no-echo line says what the engine already does and what the API will add |

Notes, and what was done:

| Note | Action |
|---|---|
| "An upstream failure never fails the whole scan" was too broad | Now limited to scoring signals. It also says a missing manifest or an unreadable policy file fails the scan |
| "Nothing bills by the hour except WAF" left out the secret | Now names WAF and the Secrets Manager placeholder as the fixed costs |
| The request path and the snapshotter steps read as built | Both now say which steps are built and which are planned |
| The architecture IAM table left out the CDK deploy handler | Row added, with its `*` invalidation grant explained |
| Duplicate snapshots were filed under elevation of privilege | Moved to tampering |
| The PITR citation is a PowerShell cmdlet page | Kept, and named as the RestoreTableToPointInTime reference. It is an AWS docs page and states the 35 days |
| CI rows in the threat model are marked planned | Updated in the CI commit, once ci.yml is committed |
| The 60% Graviton figure needs its citation checked | Checked in this session. The cited APN blog says Graviton uses "up to 60% less energy for the same performance compared to their x86 counterparts" |
| HTTP to /api/* gets 403, not a redirect | Added to the threat model |

## Review 3: .github/workflows/ci.yml (task 11)

Verdict: READY. No defects.

The reviewer confirmed both action SHAs against their tags with `git ls-remote` (lightweight tags, so the SHA is the commit). There are no secrets, no AWS variables, no credentials step and no deploy, and the only permission is `contents: read`. The reviewer also checked that each job's commands work on a fresh runner. The self-scan builds the engine before it runs. The infra job finds the hoisted `cdk` and `tsx` after `npm ci`, and it synthesises with placeholder handlers and no web build, so it needs no Docker, no bundling and no credentials.

Notes, and what was done:

| Note | Action |
|---|---|
| The self-scan calls public APIs with no token, so shared runner IPs could hit rate limits | Kept. The self-scan reads local manifests and calls npm, OSV and deps.dev, with backoff on 429 and 503. Watch the first CI runs |
| The infra job repeats the infra tests that gates already ran | Kept. The job's own value is the build plus a real `cdk synth` |
| Once the API handlers exist, macOS gates will bundle with esbuild | esbuild is already a dev dependency of infra |
| `on: push` plus `pull_request` runs twice on PR branches | Accepted |
| When the web build joins, check it runs offline | To check when cemetery-ui is on main |
| Task 11.2's local check is not a committed script | Recorded here instead. The check parsed the YAML, found 6 action uses and 0 unpinned, and found no `secrets.`, credentials step or `cdk deploy`. It then ran `npm run build`, `cdk synth -q` with AWS variables unset, and the infra tests (44 passed), plus `npm run scan:self` (policy passed) |
| Tasks 12.1 to 12.3 are ticked in this commit | They were finished in the docs commit, 126bb27 |
| A note from the session, not the reviewer: the self-scan reads only the root package.json, so infra's dependencies are not scanned. esbuild in infra has an install script | Raised with HP. The script is Kiro's (scripts/self-scan.mjs) |

## Review 4: docs/adr/0001-dev-dependency-licences.md

Verdict: READY. No defects.

The reviewer checked that the quoted N-7 matches the amended wording word for word. That amendment is an uncommitted edit in the main checkout. The reviewer also checked that axe-core 4.14.1 is MPL-2.0 on npm, and that the usage claims match the cemetery-ui design: a dev dependency, used only in jsdom tests, unmodified, kept out of the bundle by a postbuild check. The MPL-2.0 statements are correct in substance.

| Note | Action |
|---|---|
| "a dated change-log entry" does not match how requirements.md tracks changes | Now "a version bump and a date" |
| Condition 4 said "this ADR", narrower than N-7's "docs/adr" | Now "recorded in docs/adr" |
| The GPL and AGPL ban goes beyond N-7 | Now stated as a rule this ADR adds |
| cemetery-ui design.md expects the name `00NN-axe-core-dev-only.md` | Told Kiro the real path |
| The byline reads "Harpreet S. Siddhu" while requirements.md says "Harpreet Singh Siddhu" | Kept. The byline uses the published form of the name |
| MPL-2.0 also requires source when a binary is distributed | Kept as written. Sexton distributes no form of axe-core |

## Review 5: README.md rewritten as a product page

Verdict: READY. No defects.

The reviewer checked every claim against `main` and this branch. The problem statement matches requirements section 2. The ten signals and their source and fetch-time envelope match the engine. The five states match `evaluateState`. packages/cli and packages/action are empty, and `sexton` is not on npm, so the `npx` commands are marked as not published. The clone commands work: the tests passed, the engine built, and `scan:self` showed all eight root packages Alive with three rules passing. The self-scan story matches build/reviews/03-policy.md and commit 614ce5f. The competitor lines stay within requirements section 2 and GitHub's own description of Dependabot. The roadmap matches ROADMAP.md, with every 0.1 item labelled. There is no tool or vendor attribution.

| Note | Action |
|---|---|
| "ten signals" next to the roadmap's "five signals" may read as a conflict | The bullet now says the ten measure the five product signals |
| Intake caps a scan at 300 direct dependencies | Added "up to 300 direct dependencies per scan" |
| "Alive: none of the above" skips the all-signals-unavailable case, which is Restless | Kept. It is a product page, and the full rule is in docs/requirements.md |
| The docs linked at the end exist on spec/infra, not yet on main | Kept. The README lands with them on this branch |
| "due on 4 Dec 2026" against "ships by" | Kept. Same meaning |

## Review 6: task 2, the DynamoDB port, its SDK adapter, the fakes and the generators

Verdict: READY. No defects.

main (with cemetery-ui, b7bcef0) was merged into spec/infra first (bc35860). The gates passed after the merge: engine 664, web 165, api 14 and infra 44 tests. `contract-pending.ts` was never created, because `contract.ts` was already on main, so task 2.2 was skipped and there was nothing to delete.

The reviewer checked:
- the adapter mapping: eventually consistent GetItem, the not-exists condition, ascending Query, paging with a cap, and the two mapped errors
- that the fake models the key schema, the sparse GSI, numeric Number ordering, the conditional put and the 400 KB limit
- that the contract tests can fail
- the exact pins and the licences of the 29 new lock entries (Apache-2.0, MIT, 0BSD)
- the 11 generators the design names

| Note | Action |
|---|---|
| The fake ordered String keys by UTF-16 code units, while DynamoDB orders by UTF-8 bytes | Fixed. The fake now compares UTF-8 bytes |
| The fake does not reproduce some DynamoDB validation errors (wrong GSI key type, empty key, BETWEEN low above high) | Kept. No caller relies on them |
| `itemBytes` counts a Number as one byte per character | Kept. It overestimates, which is the safe direction |
| The paging test name overstated what the memory fake does | Renamed. Paging is proven on the stub path |
| The design's Dependencies table did not list fast-check for packages/api | Row added |
| 2.2 is ticked although it was skipped | Kept, with the note in tasks.md |
| `arbOwner` and `arbRepo` are written locally rather than reused from the engine | Kept. The engine's test files are outside the API's tsconfig. `arbitraries.test.ts` checks them against `parseRepoUrl` |

## Review 7: task 3, the DynamoDB cache store, Properties 1 to 4

Verdict: READY. No defects.

The reviewer checked:
- the round trip
- the TTL arithmetic
- the 350 KB limit, applied to compressed bytes
- the 1024-byte key limit
- that `get` and `set` never reject, including thrown non-Errors and async rejections
- that no key or value reaches a log line, and that `errorName` keeps only the class name
- that freshness depends on `storedAt` alone, with two tests that would fail if decoding read `expiresAt`
- the CachedFetcher behaviour across container instances

| Note | Action |
|---|---|
| A corrupt item gave `undefined` with no log line, while the design asks for one line | Fixed. `cache-decode-failed`, with no key. Test added |
| Property 3 built values with `crypto.randomBytes`, so a failure could not be replayed from its seed | Fixed. It now uses `fc.uint8Array` as hex |
| A `storedAt` that is not a safe integer was logged as `not-json` | Now `invalid-entry`. Test added, and design.md updated |
| Decoding does not check that `pk` equals the requested key | Kept. GetItem reads by that key |
| The CachedFetcher test with a 1-second TTL depends on the wall clock to catch a decoder that compares `expiresAt` with `Date.now()` | Kept. The decode example with `expiresAt: 0` catches that decoder at any time |

## Review 8: task 4, the DynamoDB snapshot store, Properties 5 to 8

Verdict: NOT READY, one defect. Fixed and re-reviewed: READY.

| Defect | Fix |
|---|---|
| `listSeenWithin` clamped only an infinite window. A huge finite window, such as 1e200, sent the lower bound as `"-1e+200"`, which is outside the DynamoDB Number range, so the real query would fail. The in-memory store lists every name seen up to the reference. The fake parses N with `Number()`, so no test caught it | The lower bound is now `Math.max(ref - windowMs, MIN_DATE_MS)`. A new example compares windows of 1e200, `Number.MAX_VALUE` and Infinity with `InMemorySnapshotStore`. It checks that all six bounds sent to the port are plain integers. That test fails against the old line |

Checked and correct:
- key encoding and injectivity
- validation before any write, and the retry only on a collision
- explicit history sort, with differing ISO spellings of one instant tying as they do in memory
- corrupt items dropped, with a log line that holds a count only
- NaN and negative inputs
- Properties 5 to 8 can fail, and the reorder hook really scrambles results

| Note | Action |
|---|---|
| `isSnapshotOf` is shallow | Kept. The engine parses `captureTime` again and checks the versions it reads |
| If the SDK retries a put that already succeeded, the retry hits the condition and the store writes the snapshot again under a new sequence. That gives a duplicate, never a replacement | Kept. The snapshotter's reserved concurrency of 1 makes this rare, and a duplicate snapshot does not change the maintainer diff |
| Snapshots from different store instances with equal capture times are ordered by the random part of the sequence | Accepted in design.md |
| `ISO_UTC` copies the engine's rule | Kept. The engine does not export its validator. Raised as a possible engine export |
| `recordSeen` rejects a time it cannot encode | Kept. The engine swallows `recordSeen` failures |

## Review 9: task 5, logging, Property 11

Verdict: READY. No defects.

The reviewer checked:
- Only the host and path are logged. The host never holds userinfo, and the query, fragment, headers and body are never read.
- No log injection: every line goes through `JSON.stringify`, with scalars only and protected reserved keys.
- The same response object is returned, and the same error is rethrown.
- The correlation ID rule matches requirement 6.4.
- Property 11 uses separate canaries for the query, fragment, body, error message and an Authorization header.
- Logging the raw.githubusercontent.com path, which holds owner and repo, does not contradict a requirement. Requirement 6.5 limits only the end-of-scan line, and 6.1 requires `path`.

| Note | Action |
|---|---|
| A sink that throws after a successful response would lose the response and log the request twice | Fixed. Each log call is wrapped, so a failing sink loses one line only. Test added |
| An error whose `name` getter throws would replace the original error | Fixed. `errorName` returns `Error` in that case. Test added |
| The throw line also carries `latencyMs`, which design.md did not list | design.md updated |
| design.md typed the `upstreamFields` status as `number \| null` | design.md updated to `number` |
| `fc.webUrl()` could in theory contain the canary | Kept. The odds are negligible |

## Review 10: task 6, the scan API, Properties 9 and 10

Verdict: NOT READY, two defects. Fixed and re-reviewed: READY.

| Defect | Fix |
|---|---|
| `runScan` could reject when a step threw and the log sink threw too, because the error log call in its catch block was not guarded | `createLogger` now wraps every sink call, so no log call can throw. Tests added for the logger and for `runScan` with a throwing sink |
| A throwing sink turned a 400 or 405 into a 500, because the rejection's log line sat inside the handler's try | The same logger fix covers it. A test checks that 405 and 400 stay as they are with a throwing sink |

The reviewer checked:
- the validation order, and that a rejected request does no I/O
- the error table, statuses and headers
- that found and 404 policy outcomes are cached and every other policy failure gives 502 with no fallback
- that no partial scan is returned on an error
- no echo: bodies are built from named fields, and Property 10 runs a sliding 4-character window over nine scenarios
- no secrets and no network in tests

During this task, the real `cdk synth` bundle of the scan handler was loaded offline. It fails with `Cannot find module '../package.json'`, because the engine's `version.ts` reads its manifest at run time. This is handed to Kiro (spec engine-version), and deploy is blocked until it is fixed.

| Note | Action |
|---|---|
| The lint run failed on `infra/cdk.out`, the local synth output that git ignores and eslint does not | Deleted. Asked Kiro to add `**/cdk.out/**` to the eslint ignores |
| Upstream log lines carry `/{owner}/{repo}` for github-raw, while the summary line leaves the repository out | Recorded in design.md, "Notes on requirements and open items", item 14, for HP to decide |
| The end-to-end test loads cemetery-ui's validator by path | Kept. A rename in web will break the test loudly |
| design.md quoted old engine text for `invalid-url` | Updated |
| Scoring runs to the end even when the policy fetch fails | Kept. The result is correct, at a small cost in I/O |

## Review 11: task 7, the snapshotter, Property 12

Verdict: READY. No defects.

The reviewer checked:
- Names are listed once over 90 days.
- The 90-second margin is checked before every chunk.
- Deferred names start at the first chunk not started, and snapshotted + failed + deferred = listed holds even when a chunk throws.
- A listing failure gives `error` and zero counts.
- There is one summary line, and no package names are logged.
- The EMF document (namespace `Sexton`, `Dimensions: [[]]`, the three metric names) matches the dimensionless metrics the alarm reads in edge-stack.ts.
- The handler never throws.
- Every DynamoDB call is granted to the snapshotter role.
- The entry reads the three environment variables and exports `handler`.

| Note | Action |
|---|---|
| EMF through `console.log` gets the Lambda text-format prefix, and CloudWatch may not extract metrics from a prefixed line | Changed. The EMF line now goes to `process.stdout` with no prefix. Test added. Task 14.3 now checks that the three metrics appear after the first deploy |
| A missing environment variable throws at init | Kept by design. The function fails fast, and the Lambda Errors part of the alarm catches it |
| The handler's outer catch writes the EMF line but no summary line | Kept. It covers a failure while wiring the stores, which is unlikely |
| `planChunks` turns a size of 0 or less into 1 | Kept. It is a guard only; the constant is 25 |

## Review 12: no Owner or Repo in GitHub log lines (HP decision), and the docs marked "planned"

Verdict: NOT READY, three defects. Fixed and re-reviewed: READY.

| Defect | Fix |
|---|---|
| For github.com and api.github.com, the "last segment" of the path is the repository name. An encoded slash also leaked the owner | raw.githubusercontent.com keeps only the path after `/{owner}/{repo}/{ref}/`. github.com and api.github.com log no path |
| The host check used `host`, so a port or a trailing dot skipped the GitHub rule | It now matches on `hostname`, lower-cased, with trailing dots removed |
| The test regex let a bare repository name through | Replaced by a property with canaries in the owner and repo across eleven URL shapes |

The docs that said handler controls were "planned" now say they are built and not yet deployed. The reviewer checked each claim against packages/api/src.

| Note | Action |
|---|---|
| Other GitHub hosts (gist, codeload, objects.githubusercontent.com) still log full paths | Kept. Nothing fetches them. A new client for one of them must add it to `GITHUB_HOSTS` |
| Three descriptions said "file name only" | Reworded to match design.md item 14 |

## Review 13: build/infra/10-deploy.md, the deploy runbook

Verdict: NOT READY, six defects. Fixed and re-reviewed: READY.

The reviewer synthesised the stacks to a directory outside the repository and checked every resource, setting, IAM statement, resource policy, parameter, output and deletion policy in the runbook against the templates.

| Defect | Fix |
|---|---|
| The log group name in check 10 was wrong. The names are generated | Read from `get-function-configuration --query LoggingConfig.LogGroup` |
| Step 3 ran `cd infra` again and needed `$OUT` from another step | One shell throughout, with `ROOT`, `WORK` and `OUT` set in step 1, and a manifest check before the deploy |
| `cdk diff` with the default method creates and deletes a change set, which is a write | `--method template`. `--strict` was dropped from diff and deploy, where it means something else |
| The Scheduler role's trust conditions were missing | Added: `aws:SourceAccount` and `aws:SourceArn` |
| No rollback for a failed Data create, where the retained resources block a rerun | Rows added that stop for HP. Nobody deletes the table or the secret |
| The rollback and destroy commands synthesised into `infra/cdk.out` | Both write to `$WORK` |

The runbook needs at least 111 for unreserved concurrency, not the 110 in the owner's instructions. Lambda keeps 100 units unreserved, and these two functions reserve 11. The reviewer confirmed this, and design.md item 10 and task 14.1, which said 21, are corrected too.

| Note | Action |
|---|---|
| The header check used HEAD, which gets 405 | It now reads the GET headers from check 4 |
| The engine `dist/` is rebuilt only as a side effect of typecheck | Explicit engine build added as precondition 4 |
| Precondition 1 should check `origin/main`, and HP merges, not the agent | Done |
| `exit 1` in step 3 would close the shell | Replaced by a check that prints, and a "stop" instruction |
| The redeploy row did not make a fresh `$WORK` or run the bundle check | Both added, plus a switch back to the branch afterwards |
| docs/threat-model.md said an HTTP request to the API gets 403. The error mapping may turn it into `index.html` with 200 | Reworded |
| 403/404 from `/api/*` reach clients as `index.html` with 200 | Recorded under "Known behaviour" in the runbook. It was already in the threat model |

## Review 14: the Lambda bundles carry the pinned AWS SDK (HP decision)

Verdict: READY. No defects.

`externalModules: []` in the NodejsFunction bundling options. Without it, CDK leaves `@aws-sdk/*` out of the bundle by default on Node 18 and later, and the functions would use the SDK the Lambda runtime ships. That contradicts design.md, Security: "SDK bundled at a pinned version".

The reviewer checked:
- A real `cdk synth --strict` into a temp directory has no bare import or require of `@aws-sdk`, `@smithy` or `ajv` in either bundle.
- The bundles carry `version:"3.1166.0"`.
- Copies of both bundles load and export `handler` with no `node_modules` on any ancestor path, no credentials and `env -i`.
- The scan handler answers a POST with 405 and does no I/O.
- The new test fails without the change.
- The nag, IAM and stack tests still pass, and lint is clean.

| Function | index.mjs | Unzipped with map | Zipped |
|---|---|---|---|
| Scan | 665 KB | 3.5 MB | 846 KB |
| Snapshotter | 633 KB | 3.4 MB | 815 KB |

| Note | Action |
|---|---|
| The test left its temp directory behind | Removed in a `finally` |
| The dynamic import in vitest goes through Vite's resolver, so the regex assertions are the real guard | Kept. The offline load is also checked in precondition 7 of the runbook, with plain node |
| The source map is deployed with each function | Kept. It is a pre-existing choice and well within the size limits |

## Review 15: log write on the log group ARN itself (defect found by the first deploy)

Verdict: READY. No blocking defects. Two wording fixes and one stricter assertion applied.

The first deploy granted `logs:CreateLogStream` and `logs:PutLogEvents` on `{log group Arn}:log-stream:*`. CloudFormation's `AWS::Logs::LogGroup` `Arn` attribute already ends in `:*`, so the deployed resource was `…:log-group:<name>:*:log-stream:*`. That matches no stream, as a stream ARN is `…:log-group:<name>:log-stream:<stream>` and neither name can contain `:`. Lambda was denied `CreateLogStream` and dropped every log line and every EMF metric without an error. The old IAM test checked only that a logs statement existed, and it asserted the same wrong shape through the nag acknowledgements.

The fix grants both actions on the `Arn` attribute itself, the same shape as the AWS managed basic execution policy, scoped to one group. The two IAM5 acknowledgements for the old shape are removed, as the findings no longer fire.

The reviewer checked:
- The resource against the CloudFormation `AWS::Logs::LogGroup` return values and the Service Authorization Reference for CloudWatch Logs. It is not over-broad: log group names cannot contain `:`, so `<name>:*` cannot reach another group.
- With the old shape and the new nag file, cdk-nag fails the synth on `AwsSolutions-IAM5[Resource::<ScanLogs….Arn>:log-stream:*]`.
- With the old shape and the old nag file, both new tests fail. The render test prints the deployed ARN, `…:log-group:ScanLogsE2E8E605:*:log-stream:*`.
- The design.md nag table and `NAG_SUPPRESSIONS` still agree, row for row.
- No stale mention of the old shape in docs/, build/, .kiro/specs/infra or infra/.

| Note | Action |
|---|---|
| design.md and tasks.md said the resource "holds one `:*`", the test asserted at most one | Assertion changed to exactly one |
| design.md still called the nag table "the full list that fired on the first synth" | Added a sentence on the two IAM5 rows removed on 21 Nov 2026 |
| The "no wildcard" exceptions paragraph said both exceptions sit in an allow list | Reworded: the log exception is pinned by the exact-statement and render tests |
| `render()` resolves `Fn::GetAtt` against the Edge template only, and only the array form | Kept. A future Data stack log statement would fail loudly, not pass |
| The render models the trailing `:*` from the CloudFormation docs | Kept. The redeploy below proves it against the real ARN |

## Deploy 1: SextonData-dev and SextonEdge-dev, us-east-1, 21 Nov 2026

Run by the runbook, build/infra/10-deploy.md, after HP typed `deploy`. Profile `sandbox`. The account ID and the alarm email are not recorded here.

| Step | Result | Time |
|---|---|---|
| Deploy SextonData-dev | CREATE_COMPLETE | 42 s |
| Deploy SextonEdge-dev at 5a67ba0 | CREATE_COMPLETE | 271 s |
| Smoke checks 1 to 7 | Pass | below |
| Smoke check 8, metrics | Fail: none listed | |
| Smoke check 10, correlation ID in logs | Fail: no log streams in either group. Stopped here, as the runbook and HP require | |
| Fix | Review 15, commit 4dbda55. Gates green, infra tests 45 to 47 | |
| Redeploy SextonEdge-dev at 4dbda55, `--exclusively` | UPDATE_COMPLETE. Only the two role policies changed, as `cdk diff --method template` showed | 27 s |
| Smoke checks 8 to 11 | Pass | below |

The first redeploy attempt piped `y` to the approval prompt. It was read before the prompt appeared, so CDK created its change set and exited without executing it. The second, from the `!` prefix, had no TTY and stopped at the prompt. HP then ran the same command from a terminal and approved the IAM change.

CloudFront URL: https://de1giv8lj8sfh.cloudfront.net

| # | Check | Result | Time |
|---|---|---|---|
| 1 | The URL serves the demo | 200, title "Sexton cemetery", `demo/scan.json` 200 | 0.29 s |
| 2 | Security headers | HSTS, CSP, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer` all present | |
| 3 | Cold scan of expressjs/express | 200, 44 packages, `report` and `policy` present, default policy | 8.48 s |
| 4 | Warm scan | 200, `cache-control: public, max-age=300` | 3.91 s |
| 5 | Request ID | `x-sexton-request-id` present, in CloudFront request-ID format | |
| 6 | Direct function URL | 403 | |
| 7 | Snapshotter invoke | `{"listed":44,"snapshotted":44,"failed":0,"deferred":0}`, `snap#body-parser` Count 1. After the redeploy: same counts | 10 s, then 6 s |
| 8 | Snapshotter metrics | `SnapshotterFailed`, `SnapshotterDeferred`, `SnapshotterError` in namespace `Sexton`, plus `ScanErrors5xx` from the metric filter | about 2 min after the invoke |
| 9 | WAF 429 on a burst | 130 requests in 18 s all got 400. Probes from 10 s later got 429 from the 136th request on, with one 400 slipping through 11 s after that. The rule is 100 per 5 min per IP on `/api/`. WAF counts in the background, so detection lags a short burst | first 429 about 40 s after the burst ended |
| 10 | Correlation ID in logs | Scan log lines carry `correlationId` equal to the response's `x-sexton-request-id`, so `x-amz-cf-id` reaches the function and design.md open item 11 is settled. Snapshotter lines carry `snap-<requestId>`, and the EMF line is written alone | scan 5.68 s, Lambda init 435 ms |
| 11 | No alarm firing | `describe-alarms --state-value ALARM` is empty, after the burst too | |

The two alarms that were blind now evaluate real data:

| Alarm | Expression | Inputs over the last hour |
|---|---|---|
| ScanErrorRate | `IF(invocations > 0, 100 * errors / invocations, 0)` above 5 | `ScanErrors5xx` Sum 0 over 555 samples, as the filter writes 0 for every scan line that does not match. Result 0.0 |
| SnapshotterProblems | `FILL(failed,0) + FILL(deferred,0) + FILL(listingError,0) + FILL(lambdaErrors,0)` above 0 | `SnapshotterFailed`, `SnapshotterDeferred`, `SnapshotterError` each Sum 0 over 1 sample, the EMF line. Result 0.0 |

The SNS email subscription is confirmed by HP.

Cost-relevant settings as deployed:

| Item | Setting |
|---|---|
| `sexton-cache-dev` | On demand, TTL on `expiresAt`, no PITR, no deletion protection |
| `sexton-snapshots-dev` | On demand, no TTL, PITR on, deletion protection on |
| Scan function | Reserved concurrency 10, nodejs22.x arm64, 1024 MB, 60 s. Max memory used 235 MB |
| Snapshotter function | Reserved concurrency 1, nodejs22.x arm64, 1024 MB, 600 s. Max memory used 229 MB |
| Log groups | 30-day retention, both |
| WAF | One web ACL with two AWS managed rule groups and the rate rule |

## Deploy 6: the hosted site from main at 31974bb, us-east-1, 28 Nov 2026

Run by the runbook, build/infra/10-deploy.md, after HP gave the deploy word for this one deploy. Profile `sandbox`, stage dev. The commit was checked out detached. The account ID and the alarm email are not recorded here.

Commit: `31974bb3eb17b6a69078360ba33c37d94b679f8b`, the merge of spec/home-page (PR #22). It equalled `origin/main` after a fresh fetch. CI run 46110733552 succeeded on every job: gates on ubuntu-latest and macos-latest, e2e, self-scan and infra.

Preconditions, all pass:

| Check | Result |
|---|---|
| Gates | typecheck, lint and test exit 0. Tests: action 12, api 306, cli 69, engine 1191, mcp 91, web 833, infra 75 |
| Engine build | exit 0 |
| Web build with `VITE_SEXTON_API=/api` | exit 0. The bundle check found 16 files clean |
| `cdk synth --strict` | exit 0, no warnings. 5 resources in Data, 48 in Edge |
| Bundle load | All 3 handlers print `ok` |
| CDKToolkit | `CREATE_COMPLETE` |
| Unreserved concurrency | 977 |

Diff, from `cdk diff --method template`:

- SextonData-dev: "There were no differences".
- SextonEdge-dev: only the code key and asset metadata of `ScanFunction`, `RemediateFunction` and `SnapshotterFunction`, and the source object keys of the web deployment custom resource.
- No role, policy statement, security setting, WAF rule, table, secret or distribution behaviour changed. No approval was asked for.

| Stack | Result | Time |
|---|---|---|
| SextonData-dev | "no changes" | 3 s |
| SextonEdge-dev | UPDATE_COMPLETE, finished 06:31:06 UTC | 84 s, of which 62 s in CloudFormation |

CloudFront URL: https://de1giv8lj8sfh.cloudfront.net

| # | Check | Result | Time |
|---|---|---|---|
| 1 | The URL serves the site | 200, title "Sexton: find the dependencies that will hurt you". The browser rendered the home page | |
| 2 | Security headers | HSTS `max-age=63072000`, CSP, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer` | |
| 3 | Cold scan of expressjs/express | 200. Body keys `report`, `policy`, `remediations`, `actions`, `timelines`, `pullRequests` | 6.17 s |
| 4 | Warm scan | 200 | 3.98 s |
| 5 | Request ID | `x-sexton-request-id` present | |
| 6 | Direct function URL | 403 | |
| 7 | Snapshotter invoke | `{"listed":79,"snapshotted":79,"failed":0,"deferred":0}`, `snap#body-parser` Count 13 | 19 s |
| 8 | Snapshotter metrics | `SnapshotterFailed`, `SnapshotterDeferred`, `SnapshotterError`, plus `ScanErrors5xx` | |
| 9 | WAF 429 on a burst | Pass on a second round. The burst of 130 got 400 on every request. A slower round of 30, one every 2 s, got 4 × 400, then 25 × 429 with `{"code":"rate-limited",...}`, then 1 × 400. The first 429 came after about 134 requests | |
| 10 | Correlation ID in logs | 146 of 456 scan log lines carry `correlationId`. It equals the response's `x-amz-cf-id`: the warm scan's ID appears in 8 lines | |
| 11 | No alarm firing | None in ALARM, after the burst too. All five alarms OK | |
| 12 | Express remediations | `2 false true` | |
| 13 | Evidence commit | `43fca52d28a422c8be48fd489cbd4f2d6152bab6` | |
| 14 | Demo scan offers pull requests | `{"remediate":true}`. Plans: node-sass migrate proposed, uuid bump proposed, left-pad and request bump with no safe version | |
| 15 | Remediate node-sass | 200, `{"status":"existing","prUrl":"https://github.com/hsiddhu2/sexton-demo/pull/1"}`. Existing, as expected, because pull request #1 is still open | |
| 16 | The same POST again | `existing`, the same URL | |
| 17 | Another repository | 422, `"code":"repository-not-allowed"` | |
| 18 | Demo evidence log | `"available":true` with two entries: node-sass `pull/1` (22 Nov 2026, 01:58 UTC) and the uuid bump `pull/2` (22 Nov 2026, 02:18 UTC) | |
| 19 | No GitHub detail in the logs | 8 api.github.com lines, each `"path":""` and status 200. The count of demo, token and pull paths is 0 | |
| 20 | Cache-Control | exit 0. `/`, `/index.html`, `/demo/scan.json` and `/replay/axios.json` PASS with `no-cache`. `/assets/index-DftLFR8B.js` PASS with `public, max-age=31536000, immutable`. INFO: `/sexton-cache-check-fallback` and `/assets/sexton-cache-check-missing.js` are both 200 with `no-cache` (spec fresh-site, Decision 4) | |

The demo repository's pull requests #1 (`sexton/migrate-node-sass`) and #2 (`sexton/bump-uuid`) were open before and after. None was opened, closed or reopened.

New address checks (spec home-page), with curl and then a browser:

| Address | Status | Cache-Control | Result |
|---|---|---|---|
| `/` | 200 | `no-cache` | The home page, with the Overview and Cemetery tabs |
| `/cemetery` | 200 | `no-cache` | The sample cemetery, 12 graves |
| `/cemetery?replay=axios` | 200 | `no-cache` | "Watch the axios attack unfold" |
| `/cemetery?replay=keyv` | 200 | `no-cache` | "Watch the keyv attack unfold" |
| `/scan?repo=hsiddhu2/sexton-demo` | 200 | `no-cache` | A live scan, 10 graves. One `/api/scan` request |
| `/?replay=axios` | 200 | `no-cache` | Forwards to `/cemetery?replay=axios` |
| `/?repo=hsiddhu2/sexton-demo` | 200 | `no-cache` | Forwards to `/scan?repo=hsiddhu2/sexton-demo` |
| `/cemetery.png`, `/replay-axios.png`, `/replay-keyv.png` | 200 | `no-cache` | `image/png` |
| `/demo/scan.json`, `/replay/axios.json`, `/replay/keyv.json` | 200 | `no-cache` | JSON |
| `/assets/index-DftLFR8B.js` | 200 | `public, max-age=31536000, immutable` | The hashed script |

- A reload of `/scan` inside 15 minutes showed the saved scan, "Scanned just now" with a Rescan button, and sent no `/api/` request.
- `og:image` and `twitter:image` point at `/cemetery.png`, which answers 200 `image/png`.

Scan times:

| Scan | Time |
|---|---|
| express, cold (check 3) | 6.17 s |
| express, warm (check 4) | 3.98 s |
| sexton-demo, live in the browser | 2.4 s |

What did not go as written:

1. The live scan at `/scan?repo=hsiddhu2/sexton-demo` did not start by itself. The page first showed the sample cemetery with a "Scan this repository" button, as the spec says (home-page 13.5, clean-site 10.11): an address alone waits for a press. No request went out for at least 10 s. The scan began 28 s after load, and during the deploy checks its cause was not confirmed. It was confirmed afterwards on the live site, on 28 Nov 2026. The address `/scan?repo=expressjs/express` made no scan request for 6 s. One press of "Scan this repository" made exactly one request to `/api/scan`, which took 6.5 s, and the scan tag changed to expressjs/express.
2. Check 9 needed two rounds. The burst of 130 got 400 on every request, because WAF counts with a delay. The 429 came on a slower second round, and its last request got 400 again as the window moved on.
3. Check 18 shows two log entries, not the one the runbook named. The second is the uuid bump from 22 Nov 2026.
4. The alarm email was not passed. CDK kept the stack's previous `AlarmEmail` value, so nobody typed the address.
