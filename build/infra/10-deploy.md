# Deploy runbook: spec 10 infra

This runbook puts Sexton's hosted demo on AWS. It deploys two CloudFormation stacks to one account, in `us-east-1` only. Spec: `.kiro/specs/infra`. Architecture: `docs/architecture.md`. Threat model: `docs/threat-model.md`.

Nobody runs a command in the "Deploy" section until HP types the single word `deploy` in the session. Everything before that section is read-only.

## What the two stacks create

### SextonData-dev

It has termination protection, so `cdk destroy` cannot remove it by accident.

| Resource | Name | Notes |
|---|---|---|
| DynamoDB table (`TableV2`) | `sexton-cache-dev` | Key `pk` (S), on demand, AWS owned key, TTL attribute `expiresAt`. Removal policy DELETE: it holds only cached upstream responses |
| DynamoDB table (`TableV2`) | `sexton-snapshots-dev` | Keys `pk` (S) and `sk` (S), on demand, AWS owned key, no TTL, point-in-time recovery, deletion protection, removal policy RETAIN. GSI `seen-by-time`: `gpk` (S) and `seenAt` (N), projects `name` |
| DynamoDB table (`TableV2`) | `sexton-remediation-log-dev` | Keys `repository` (S) and `sk` (S, time#branch), on demand, AWS owned key, point-in-time recovery, deletion protection, RETAIN. Append-only remediation log (spec remediate) |
| Secrets Manager secret | `sexton/github-token-dev` | Holds the fine-grained token since 21 Nov (its description is out of date on purpose). The scan and remediate roles read it. RETAIN |
| Outputs | `GithubTokenSecretArn`, plus four exports the Edge stack imports | Table names and ARNs |

### SextonEdge-dev

| Resource | Notes |
|---|---|
| Lambda `ScanFunction` | Node.js 22 (`nodejs22.x`), arm64, 1024 MB, 60 s timeout, reserved concurrency 10. Code from `packages/api/src/handlers/scan.ts`, bundled with esbuild as ESM |
| Lambda function URL | Auth type `AWS_IAM`, invoke mode BUFFERED. Reached only through CloudFront |
| Lambda `RemediateFunction` | Node.js 22, arm64, 1024 MB, 60 s timeout, reserved concurrency 2. Code from `packages/api/src/handlers/remediate.ts`. Its own function URL with `AWS_IAM` auth (spec remediate) |
| Lambda `SnapshotterFunction` | Node.js 22, arm64, 1024 MB, 600 s timeout, reserved concurrency 1. Code from `packages/api/src/handlers/snapshotter.ts` |
| 3 log groups | One per function, 30-day retention. Names are generated; find one with `aws lambda get-function-configuration --query LoggingConfig.LogGroup` |
| S3 web bucket | Private, Block Public Access, SSL enforced, versioned, S3-managed keys, RETAIN. Filled from `packages/web/dist` |
| CloudFront distribution | Default certificate with HSTS. The default behaviour serves the bucket through OAC (s3). `/api/*` goes to the function URL through OAC (lambda), with caching disabled, only the `repo` query string forwarded, a 60 s read timeout, a 65 s completion timeout and 1 connection attempt. 403 and 404 map to `/index.html` with 200 |
| 3 origin access controls | Type `s3` and two of type `lambda` (scan, remediate), always sign, SigV4. `/api/remediate` comes before `/api/*`, all methods, no cache |
| Origin request policies | API: forwards the `repo` and `format` query strings only, no cookies, no headers. Remediate: no query string, no cookies, the `content-type` and `x-amz-content-sha256` headers only |
| Response headers policy | CSP, HSTS (2 years), `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer` |
| WAF web ACL (scope CLOUDFRONT) | `AWSManagedRulesCommonRuleSet`, `AWSManagedRulesKnownBadInputsRuleSet`, and a rate rule of 100 requests per 300 s per IP on paths starting `/api/`, answered with 429 and a JSON body |
| EventBridge Scheduler schedule | `cron(17 3 * * ? *)` in UTC, no retries, invokes the snapshotter |
| CDK BucketDeployment | A custom resource (a CDK-owned Python Lambda and a layer) that copies `packages/web/dist` to the bucket and invalidates `/*` |
| Log metric filter | Counts scan summary lines with `status >= 500` |
| 5 CloudWatch alarms | `ScanErrorRate`, `ScanDurationP95`, `ScanThrottles`, `SnapshotterProblems`, `DynamoThrottles` (construct IDs; CloudFormation generates the alarm names) |
| SNS topic and subscription | SSL-only publish policy. One email subscription to `AlarmEmail` |
| Parameter | `AlarmEmail` |
| WAF rate rule `RemediateRateLimit` | 10 requests per 300 s per IP on paths starting with `/api/remediate`, 429 JSON (spec remediate) |
| Outputs | `DistributionDomainName`, `DistributionId`, `WebBucketName`, `ScanFunctionName`, `SnapshotterFunctionName`, `RemediateFunctionName` |

The last `cdk synth --strict` produced 4 resources in the Data stack and 37 in the Edge stack, with no warnings. The Edge stack has 3 Lambda functions: scan, snapshotter and the CDK BucketDeployment handler.

## IAM roles and their statements

All five roles have inline policies only. No AWS managed policy is attached, except to the CDK-owned BucketDeployment role.

| Role | Trusted by | Statements |
|---|---|---|
| Remediate role (spec remediate) | `lambda.amazonaws.com` | 1. `logs:CreateLogStream`, `logs:PutLogEvents` on the remediate log group ARN. 2. `secretsmanager:GetSecretValue` on the GitHub token secret's exact ARN. 3. `dynamodb:GetItem`, `dynamodb:PutItem` on the cache table. 4. `dynamodb:Query` on the snapshots table with `LeadingKeys ["snap#*"]`. 5. `dynamodb:PutItem` on the snapshots table with `LeadingKeys ["seen#*"]`. 6. `dynamodb:PutItem` on the remediation log table |
| Scan role | `lambda.amazonaws.com` | 1. `logs:CreateLogStream`, `logs:PutLogEvents` on the scan log group ARN (`…:log-group:<name>:*`). 2. `dynamodb:GetItem`, `dynamodb:PutItem` on the cache table. 3. `dynamodb:Query` on the snapshots table, with the condition `ForAllValues:StringLike dynamodb:LeadingKeys ["snap#*"]`. 4. `dynamodb:PutItem` on the snapshots table, with the condition `ForAllValues:StringLike dynamodb:LeadingKeys ["seen#*"]`. 5. `secretsmanager:GetSecretValue` on the GitHub token secret's exact ARN (spec hosted-plans) |
| Snapshotter role | `lambda.amazonaws.com` | 1. `logs:CreateLogStream`, `logs:PutLogEvents` on the snapshotter log group ARN (`…:log-group:<name>:*`). 2. `dynamodb:GetItem`, `dynamodb:PutItem` on the cache table. 3. `dynamodb:PutItem`, `dynamodb:Query` on the snapshots table. 4. `dynamodb:Query` on `{snapshots table ARN}/index/seen-by-time` |
| Scheduler role | `scheduler.amazonaws.com`, on the conditions `aws:SourceAccount` = this account and `aws:SourceArn` = `arn:aws:scheduler:us-east-1:{account}:schedule-group/default` | `lambda:InvokeFunction` on the snapshotter function ARN and `{ARN}:*` |
| BucketDeployment role (CDK-owned) | `lambda.amazonaws.com` | Managed `AWSLambdaBasicExecutionRole`. Read on the CDK asset bucket. Read, write and delete on the web bucket. `cloudfront:CreateInvalidation`, `cloudfront:GetInvalidation` on `*` |

Resource policies:

| On | Principal | Statement |
|---|---|---|
| Scan function | `cloudfront.amazonaws.com` | `lambda:InvokeFunctionUrl`, and `lambda:InvokeFunction` with `InvokedViaFunctionUrl`. Both carry `AWS:SourceArn` set to this distribution |
| Web bucket | `cloudfront.amazonaws.com` | `s3:GetObject` on `{bucket}/*` with `AWS:SourceArn` set to this distribution. Deny any request without SSL |
| SNS topic | anyone | Deny `sns:Publish` without SSL |

No role grants `dynamodb:UpdateItem`, `DeleteItem`, `BatchWriteItem`, PartiQL writes or `dynamodb:*`. Only the scan role can read the GitHub token secret, by its exact ARN (spec hosted-plans). `infra/test/iam.test.ts` checks this on every commit.

## What HP supplies

| Item | Where it goes |
|---|---|
| The word `deploy`, typed in the session | Unlocks the Deploy section. Nothing else does |
| Alarm email address | `--parameters SextonEdge-dev:AlarmEmail=<email>`. It is a stack parameter, never written into a file |
| AWS profile for the Sexton account | `AWS_PROFILE`. Credentials come from that profile's login, never from a file in the repository |

## Preconditions

Stop if any check fails. Each one is read-only.

1. **The engine fix is on main.** Kiro's `version.ts` Bugfix spec (to-kiro.md item 7) is merged into `origin/main`, and HP has merged `main` into `spec/infra`. Agents do not merge. Without the fix, both bundled Lambdas fail on load with `Cannot find module '../package.json'`.
2. **`parseApiBase` accepts `/api`.** The cemetery-ui change in to-kiro.md item 2 is on `origin/main` and merged in. Without it, the deployed web app shows the demo but treats the live API as not configured.
3. **Gates pass** on the commit being deployed: typecheck, lint and test.
4. **The engine is built** (`npm run build -w @sexton/engine`). The API bundle reads the engine from `packages/engine/dist`, so a stale `dist` would bundle old engine code.
5. **The web app is built** with `VITE_SEXTON_API=/api`.
6. **No warnings under `--strict`.** `cdk synth --strict` succeeds, so there is no placeholder handler and no missing web build.
7. **The bundles load.** Each bundled handler imports offline with no error at init.
8. **CDKToolkit is present** in `us-east-1` with status `CREATE_COMPLETE` or `UPDATE_COMPLETE`. If it is absent, stop. Bootstrapping changes the account, so it waits for HP's word, and the check that it is absent is reported first.
9. **Lambda concurrency.** Before the first deploy, `AccountLimit.UnreservedConcurrentExecutions` in `us-east-1` is at least **113**. Lambda keeps 100 units unreserved for functions without reserved concurrency, and these functions reserve 13 (10 for scan, 1 for the snapshotter, 2 for remediate, spec remediate). On a stack that already has scan and the snapshotter, the remediate deploy needs at least 102. Source: https://docs.aws.amazon.com/lambda/latest/dg/configuration-concurrency.html ("You can reserve up to the Unreserved account concurrency value minus 100"). Later deploys have the reservations deducted already, so the value then only needs to stay at least 100.
10. **The diff is what you expect.** `cdk diff` shows only the intended changes. On a first deploy, every resource is new.

## Commands, in order

Run every command in **one shell session**, starting from the repository root on branch `spec/infra`. The variables from step 1 are used all the way through. Replace `<profile>` and `<email>`. Never write the email or the account ID into a file. All build output and scratch files go to `$WORK`, outside the repository, so `npm run lint` never sees the bundles.

### 1. Environment (read-only)

```sh
export AWS_PROFILE=<profile>
export AWS_REGION=us-east-1 CDK_DEFAULT_REGION=us-east-1
ROOT="$(git rev-parse --show-toplevel)"
WORK="$(mktemp -d)"
OUT="$WORK/cdk.out"
aws sts get-caller-identity --query Account --output text   # the Sexton account; do not paste it anywhere
```

### 2. Preconditions (read-only)

```sh
cd "$ROOT"
git fetch origin
git merge-base --is-ancestor origin/main HEAD && echo "origin/main is merged"   # must print
git status --short                                          # must be empty
npm ci
npm run typecheck && npm run lint && npm test
npm run build -w @sexton/engine
VITE_SEXTON_API=/api npm run build -w @sexton/web

aws cloudformation describe-stacks --stack-name CDKToolkit --region us-east-1 \
  --query 'Stacks[0].StackStatus' --output text              # CREATE_COMPLETE or UPDATE_COMPLETE
aws lambda get-account-settings --region us-east-1 \
  --query 'AccountLimit.UnreservedConcurrentExecutions'      # at least 102 before the remediate deploy (113 on an empty account)

cd "$ROOT/infra"
npx cdk synth --strict -q -o "$OUT"                          # must succeed with no warnings
for f in "$OUT"/asset.*/index.mjs; do
  CACHE_TABLE=c SNAPSHOTS_TABLE=s SEEN_INDEX=i AWS_REGION=us-east-1 \
    node -e "import('$f').then(m => console.log(typeof m.handler === 'function' ? 'ok' : 'no handler', '$f'), e => { console.error('init failed', e.message); process.exit(1); })"
done                                                         # every line must say ok
npx cdk diff --method template -a "$OUT" SextonData-dev SextonEdge-dev
```

`--method template` compares with the deployed template and creates no change set, so the diff writes nothing to the account.

### 3. Deploy (only after HP types `deploy`)

In the same shell. `$OUT` must still hold the bundles checked in step 2.

```sh
test -f "$OUT/manifest.json" && echo "bundles from step 2 found"   # if this prints nothing, stop and run step 2 in this shell
cd "$ROOT/infra"
npx cdk deploy SextonData-dev -a "$OUT" --require-approval broadening
npx cdk deploy SextonEdge-dev -a "$OUT" --require-approval broadening \
  --parameters SextonEdge-dev:AlarmEmail=<email>
```

Data goes first, because Edge imports its exports. `--require-approval broadening` stops for a yes on any IAM change, and the first deploy always asks because every role is new. The warnings check already ran in step 2 with `synth --strict`. Deploying from `-a "$OUT"` uses exactly the checked templates and bundles. Then HP confirms the SNS subscription from the email AWS sends. Until it is confirmed, no alarm reaches anyone.

## Smoke checks after deploy

Run in the same shell. Record every result, with the times, in `build/reviews/10-infra.md`.

```sh
output() { aws cloudformation describe-stacks --stack-name SextonEdge-dev --region us-east-1 \
  --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" --output text; }
DOMAIN="$(output DistributionDomainName)"
SCAN_FN="$(output ScanFunctionName)"
SNAP_FN="$(output SnapshotterFunctionName)"
SCAN_LOGS="$(aws lambda get-function-configuration --function-name "$SCAN_FN" --region us-east-1 --query LoggingConfig.LogGroup --output text)"
EXPRESS="https://$DOMAIN/api/scan?repo=https%3A%2F%2Fgithub.com%2Fexpressjs%2Fexpress"
```

1. **The CloudFront URL serves the demo.**
   - Command: `curl -sS -o /dev/null -w '%{http_code}\n' "https://$DOMAIN/"`, then open the URL in a browser.
   - Pass: 200, and the cemetery renders the demo scan.
2. **Security headers are present.**
   - Command: `curl -sS -D - -o /dev/null "https://$DOMAIN/" | grep -iE 'strict-transport|content-security|x-frame|referrer'`
   - Pass: all four headers appear.
3. **Cold scan.**
   - Command: `curl -sS -o "$WORK/cold.json" -w '%{http_code} %{time_total}\n' "$EXPRESS"`, as the first scan after the deploy.
   - Pass: 200 in under 60 s, and `cold.json` holds `report` and `policy`.
4. **Warm scan.**
   - Command: `curl -sS -D "$WORK/warm.headers" -o "$WORK/warm.json" -w '%{http_code} %{time_total}\n' "$EXPRESS"`, within a few minutes of check 3.
   - Pass: 200 in under 20 s.
5. **Request ID.**
   - Command: `grep -i x-sexton-request-id "$WORK/warm.headers"`. This uses GET, because HEAD gets 405.
   - Pass: the header is present.
6. **The direct function URL is closed.**
   - Command: `curl -sS -o /dev/null -w '%{http_code}\n' "$(aws lambda get-function-url-config --function-name "$SCAN_FN" --region us-east-1 --query FunctionUrl --output text)api/scan"`
   - Pass: 403.
7. **The snapshotter appends rows.**
   - Command:
     ```sh
     aws lambda invoke --function-name "$SNAP_FN" --region us-east-1 --cli-read-timeout 900 \
       --cli-binary-format raw-in-base64-out --payload '{}' "$WORK/snap.json"
     cat "$WORK/snap.json"
     aws dynamodb query --table-name sexton-snapshots-dev --region us-east-1 \
       --key-condition-expression 'pk = :p' \
       --expression-attribute-values '{":p":{"S":"snap#body-parser"}}' --select COUNT
     ```
   - Pass: `snap.json` shows `listed` above 0, `snapshotted` above 0, and `failed` and `deferred` at 0. The query's `Count` is at least 1.
   - Why body-parser: it is a direct dependency of express, so check 3 recorded it as Seen. `recordSeen` swallows errors, so a `Count` of 0 means read the scan log for the cause.
8. **The snapshotter metrics exist.**
   - Command: `aws cloudwatch list-metrics --namespace Sexton --region us-east-1`. Allow a few minutes after check 7.
   - Pass: `SnapshotterFailed`, `SnapshotterDeferred` and `SnapshotterError` are listed.
9. **WAF answers 429 on a burst.**
   - Command: `for i in $(seq 1 130); do curl -s -o /dev/null -w '%{http_code}\n' "https://$DOMAIN/api/scan?repo=x"; done | sort | uniq -c`
   - Pass: 400 at first, then 429 after about 100 requests.
   - WAF checks the rate about every 10 s, so a few extra requests may get through. `repo=x` is rejected before any upstream call, so the burst sends no traffic to npm, OSV or GitHub. It still invokes the Lambda about 100 times.
10. **The correlation ID is logged.**
    - Command: `aws logs tail "$SCAN_LOGS" --region us-east-1 --since 15m | head`
    - Pass: the lines carry `correlationId`. Record whether it equals the `x-amz-cf-id` (design.md, open item 11).
11. **No alarm is firing.**
    - Command: `aws cloudwatch describe-alarms --region us-east-1 --state-value ALARM --query 'MetricAlarms[].AlarmName'`
    - Pass: empty, apart from any alarm the burst in check 9 caused on purpose. The alarm names are generated by CloudFormation, for example `SextonEdge-dev-ScanErrorRate…`.

12. **A hosted scan of express carries remediations** (spec hosted-plans).
    - Command: `curl -sS "$EXPRESS" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const b=JSON.parse(s);console.log((b.remediations||[]).length, (b.remediations||[]).some(r=>r.kind==="remove"))})'`
    - Pass: a number above 0, then `false`.
13. **The evidence pack of a scanned repository names a 40 character commit** (spec hosted-plans).
    - Command: `curl -sS "https://$DOMAIN/api/evidence?repo=https%3A%2F%2Fgithub.com%2Fexpressjs%2Fexpress&format=json" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).body.scan.commit))'`
    - Pass: 40 lower-case hex characters. `null` means the token is missing or rejected: check the scan logs for `github-api-unavailable` and its status.

The path without a token is proven by tests only. The live secret is never emptied for a check.

Checks 14 to 19 (spec remediate) run after HP has pushed the demo repository to `hsiddhu2/sexton-demo`. They open one real pull request there.

```sh
REMEDIATE_FN="$(output RemediateFunctionName)"
REMEDIATE_LOGS="$(aws lambda get-function-configuration --function-name "$REMEDIATE_FN" --region us-east-1 --query LoggingConfig.LogGroup --output text)"
remediate() { BODY="{\"repo\":\"$1\",\"package\":\"$2\"}"; HASH="$(printf %s "$BODY" | shasum -a 256 | cut -d' ' -f1)";
  curl -sS -X POST "https://$DOMAIN/api/remediate" -H 'content-type: application/json' -H "x-amz-content-sha256: $HASH" --data-binary "$BODY" -w '\n%{http_code}\n'; }
DEMO_REPO="https://github.com/hsiddhu2/sexton-demo"
```

14. **A scan of the demo repository offers pull requests.**
    - Command: `curl -sS "https://$DOMAIN/api/scan?repo=https%3A%2F%2Fgithub.com%2Fhsiddhu2%2Fsexton-demo" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const b=JSON.parse(s);console.log(JSON.stringify(b.actions),(b.remediations||[]).map(r=>r.packageName+":"+r.kind+":"+r.status).join(" "))})'`
    - Pass: `{"remediate":true}`, a proposed migrate for node-sass, and the bump plans.
15. **POST remediate opens the node-sass pull request.**
    - Command: `remediate "$DEMO_REPO" node-sass`
    - Pass: `{"status":"opened","prUrl":"https://github.com/hsiddhu2/sexton-demo/pull/<n>","logged":true,"reviewSites":{"posted":<n>,"dropped":0}}` and 200. On GitHub: the pull request changes package.json only, base `main`, branch `sexton/migrate-node-sass`, and has one comment that links each review site.
    - If it answers the web page with 200 instead of JSON, the payload hash did not reach Lambda: check the `remediate` log line's `bodyHash`, and the origin request policy (design decision 2).
16. **The same POST again answers existing.**
    - Command: `remediate "$DEMO_REPO" node-sass`
    - Pass: `{"status":"existing","prUrl":<the same URL>}`.
17. **Another repository is refused.**
    - Command: `remediate https://github.com/expressjs/express debug`
    - Pass: 422 with `"code":"repository-not-allowed"`. (Not 403: the distribution would turn a 403 into the web page.)
18. **The demo evidence pack shows the log.**
    - Command: `curl -sS "https://$DOMAIN/api/evidence?repo=https%3A%2F%2Fgithub.com%2Fhsiddhu2%2Fsexton-demo&format=json" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.stringify(JSON.parse(s).body.remediation.log)))'`
    - Pass: `"available":true` and one entry for node-sass with the pull request URL.
19. **No GitHub path, owner, repository or token in the logs.**
    - Command: `aws logs tail "$REMEDIATE_LOGS" --region us-east-1 --since 15m | grep -E 'api.github.com' | head`, then `aws logs tail "$REMEDIATE_LOGS" --region us-east-1 --since 15m | grep -ciE 'sexton-demo|github_pat_|/pull/'`
    - Pass: the api.github.com lines have `"path":""`, and the count is 0.

The remediate deploy moves the scan function's CloudFront origin from Origin2 to Origin3 (spec remediate, design decision 13). cdk diff shows two Lambda permissions replaced. Run checks 3 and 13 right after the deploy to confirm the scan still answers.

## GitHub token rotation

The secret `sexton/github-token-dev` holds a fine-grained token that HP created on 21 Nov 2026. It expires on 31 Jan 2027. Rotate it before then, or at once if it may have leaked. Only HP runs these commands, at a real terminal. Nobody prints or reads the value back.

```sh
read -s SEXTON_TOKEN                       # paste the new token; nothing is echoed or kept in shell history
aws secretsmanager put-secret-value --secret-id sexton/github-token-dev \
  --secret-string "$SEXTON_TOKEN" --profile sandbox --region us-east-1
unset SEXTON_TOKEN
aws secretsmanager describe-secret --secret-id sexton/github-token-dev \
  --profile sandbox --region us-east-1 --query 'VersionIdsToStages'   # the new version is AWSCURRENT
```

Running functions keep the old token for up to 15 minutes. Then revoke the old token on GitHub. Run smoke check 13 to see a commit again.

Never change the `GithubTokenSecret` resource in the CDK app. A change to it is an update CloudFormation applies to the live secret. Its description still says it is empty; that is out of date on purpose. Since spec hosted-plans, SextonData exports the secret's ARN for SextonEdge. CloudFormation will not remove that export while SextonEdge imports it.

## Rollback

Every synth or deploy below writes to `$WORK`, never into the repository.

| Situation | Action |
|---|---|
| The first `SextonData-dev` create fails | **Stop for HP.** CloudFormation rolls back, but the retained resources stay behind under their fixed names: `sexton-snapshots-dev` and `sexton/github-token-dev`. Termination protection also blocks deleting the `ROLLBACK_COMPLETE` stack. A second deploy then fails with "already exists". Nobody deletes the table or the secret. HP decides how to clear the stack |
| A later `SextonData-dev` update fails | CloudFormation rolls back to the previous state. Read the cause with `aws cloudformation describe-stack-events --stack-name SextonData-dev --region us-east-1 --max-items 20`, then stop for HP |
| A `SextonEdge-dev` deploy fails part way | CloudFormation rolls the stack back by itself. Read the cause with `aws cloudformation describe-stack-events --stack-name SextonEdge-dev --region us-east-1 --max-items 20`. Fix it and run steps 2 and 3 again |
| A deploy succeeds, but the new code is wrong | Redeploy Edge from the last good commit: `cd "$ROOT" && git switch --detach <last-good-sha> && WORK="$(mktemp -d)" && OUT="$WORK/cdk.out" && npm ci && npm run build -w @sexton/engine && VITE_SEXTON_API=/api npm run build -w @sexton/web && cd infra && npx cdk synth --strict -q -o "$OUT"`. Then run the bundle-load loop from step 2. If every line says ok, run `npx cdk deploy SextonEdge-dev -a "$OUT" --require-approval broadening --parameters SextonEdge-dev:AlarmEmail=<email>`. Data does not change. Afterwards, `git switch spec/infra` to leave the detached HEAD |
| Take the hosted demo down | `cd "$ROOT/infra" && npx cdk destroy SextonEdge-dev -o "$WORK/destroy.out"`. This removes the distribution, the functions, WAF, the schedule and the alarms. The web bucket is retained and private. A later redeploy creates a new bucket, so delete the old one by hand when it is no longer wanted. `SextonData-dev` stays, with termination protection on it and deletion protection plus RETAIN on the snapshots table |

Nobody deletes `sexton-snapshots-dev` or turns off its protection as part of a rollback. Snapshot history cannot be rebuilt. If an item is ever replaced, PITR keeps 35 days to restore from.

## Known behaviour to remember

- CloudFront maps 403 and 404 to `/index.html` with 200 for every path, including `/api/*`. A WAF managed-rule block (403) therefore reaches an API client as HTML with status 200. The web app treats a body that is not JSON as an invalid response. Recorded in docs/threat-model.md.
- Lambda throttling at the reserved concurrency of 10 reaches the viewer as 429 or 502, and the `ScanThrottles` alarm fires.

## Last dry run

20 Nov 2026, on `spec/infra`:
- With the web app built by `VITE_SEXTON_API=/api`, `cdk synth --strict` succeeded with no warnings. It gave 4 resources in Data and 37 in Edge.
- Loading the bundled scan handler offline failed with `Cannot find module '../package.json'` (precondition 1, open).
- `parseApiBase` on `main` still rejects `/api` (precondition 2, open).
- `cdk diff` against the account did not run, because the session's AWS credentials had expired. It needs HP to log in to the Sexton profile.
