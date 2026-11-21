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
