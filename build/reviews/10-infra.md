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
