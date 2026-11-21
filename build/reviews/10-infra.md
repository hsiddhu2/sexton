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
| cemetery-ui design.md expects the name `00NN-axe-core-dev-only.md` | Told Kiro the real path in build/handoffs/to-kiro.md |
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

During this task, the real `cdk synth` bundle of the scan handler was loaded offline. It fails with `Cannot find module '../package.json'`, because the engine's `version.ts` reads its manifest at run time. This is handed to Kiro (build/handoffs/to-kiro.md, item 7), and deploy is blocked until it is fixed.

| Note | Action |
|---|---|
| The lint run failed on `infra/cdk.out`, the local synth output that git ignores and eslint does not | Deleted. Asked Kiro to add `**/cdk.out/**` to the eslint ignores (to-kiro.md, item 8) |
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
