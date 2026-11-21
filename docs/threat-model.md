# Sexton threat model

Sexton is a security tool, so its own hosted demo has to hold up. This page lists what can go wrong with each part of the AWS deployment and what stops it. It uses STRIDE: spoofing, tampering, repudiation, information disclosure, denial of service and elevation of privilege.

It covers release 0.1 as designed in `.kiro/specs/infra/design.md`. The scan and snapshotter handlers are not written yet. Controls that live in that code are marked as planned.

## What we protect

1. Snapshot history. It is the only dataset that can show a maintainer handover, so losing or changing it would hurt the product most.
2. The AWS bill. A public endpoint that calls other services can be used to run up cost.
3. The upstream services. npm, OSV, deps.dev and GitHub are free and shared. Sexton must stay a polite client.
4. Visitors to the site. The page must not run code from a scanned repository.

Sexton holds no user accounts, no passwords and no private code. The GitHub token secret exists but is empty in release 0.1, and no role can read it.

## Everything from a repository is untrusted

This is the core rule, and it comes from the repo-intake spec. The `repo` URL a visitor types, every byte of `package.json` and `package-lock.json`, and the `sexton.policy.yml` file are all data from a stranger.

1. The URL is checked by a hand-written parser before any request. It accepts only `https://github.com/{owner}/{repo}` and a few fixed suffixes. Credentials, ports, other hosts, queries and fragments are refused.
2. Manifests are read with `JSON.parse` only. There is no `eval`, no shell and no template rendering. Reads use own-property checks, so a key like `__proto__` cannot change an object's prototype.
3. Every outbound URL is built from validated parts with a fixed host. A `resolved` or `tarball` field in a lockfile is never followed.
4. Bodies are capped at 5 MiB for manifests. The policy file is planned with a 256 KiB cap.
5. Error messages are fixed text. The engine's intake errors already hold no input. Planned: the API adds no input to any response either, so it cannot be used to reflect content.
6. A scan keeps at most 300 direct dependencies.

The policy file is parsed by the engine's YAML parser and checked against a JSON Schema before use. An invalid policy fails the scan with error codes and paths only. Planned: if the policy file cannot be fetched for any reason other than 404, the scan fails with 502. We do not fall back to the default policy, as that could report a pass under a policy the repository never chose.

## STRIDE per component

### CloudFront and WAF

| Threat | Example | Control |
|---|---|---|
| Spoofing | Someone serves a fake Sexton page | The site is served only from the CloudFront domain over HTTPS, with HSTS for two years |
| Tampering | A proxy changes the page in transit | HTTPS only. HTTP redirects to HTTPS for the web app. An HTTP request to the API gets 403 from CloudFront |
| Information disclosure | The page is framed or leaks the referrer | Response headers deny framing, set `nosniff` and send no referrer. A content security policy allows only the site itself plus `data:` images |
| Denial of service | One client floods `/api/` | WAF blocks an IP after 100 requests in 5 minutes with HTTP 429 |
| Denial of service | Known exploit payloads | AWS managed rule groups `AWSManagedRulesCommonRuleSet` and `AWSManagedRulesKnownBadInputsRuleSet` |

### Function URL

| Threat | Example | Control |
|---|---|---|
| Spoofing | A caller skips CloudFront and WAF and calls the function URL directly | The URL uses IAM auth. Only requests signed by CloudFront OAC for this distribution are accepted. An unsigned call gets 403 from Lambda |
| Tampering | A caller sends extra headers or cookies to steer the function | CloudFront forwards only the `repo` query parameter, no cookies and no viewer headers |

### Scan function

| Threat | Example | Control |
|---|---|---|
| Tampering | A hostile manifest tries prototype pollution or a URL in a version field | Own-property reads, validated names and versions, fixed URL hosts. Covered by property tests in the engine |
| Information disclosure | Logs leak a token or a response body | Planned: log lines hold scalars only, the host and path of each upstream call, never the query or the body. A property test plants a marker string to prove it |
| Denial of service | A huge repository or a very slow upstream | The 300-dependency cap, a 60-second timeout, one CloudFront attempt and reserved concurrency of 10 |
| Elevation of privilege | A bug in scan code tries to rewrite history | The scan role cannot write any `snap#` item. It can only add `seen#` records |
| Repudiation | Nobody can tell which request failed | Planned: every response carries `x-sexton-request-id`, and every log line of that request carries the same ID |

### Snapshotter function

| Threat | Example | Control |
|---|---|---|
| Tampering | Code in the snapshotter replaces an old snapshot | See the append-only proof below |
| Denial of service | Too many packages to snapshot in 10 minutes | Planned: it stops 90 seconds before its timeout, counts the names it did not reach and raises an alarm |
| Tampering | Two runs at once write duplicate snapshots | Reserved concurrency of 1 and no retries from the schedule |

### DynamoDB

| Threat | Example | Control |
|---|---|---|
| Tampering | Snapshots are deleted or changed | No role has update, delete or batch-write on the table. No TTL on the table. Deletion protection on. Point-in-time recovery keeps 35 days |
| Information disclosure | Data at rest is read | Encryption with the AWS owned key. The tables hold public package metadata only |
| Denial of service | The cache stops working | Planned: a cache or history failure degrades that one read and never fails the scan. An alarm fires on throttling |

### Web bucket

| Threat | Example | Control |
|---|---|---|
| Information disclosure | Someone reads the bucket directly | Block Public Access, SSL only, read only by CloudFront OAC for this distribution |
| Tampering | A bad deploy overwrites the site | Versioning is on, so an older version can be restored |

### CI

| Threat | Example | Control |
|---|---|---|
| Elevation of privilege | A workflow change deploys to AWS or reads a secret | Planned: the workflow holds no AWS credentials and no secrets, asks only for `contents: read`, and never deploys |
| Tampering | A third-party action is swapped for a bad version | Planned: every action is pinned to a full commit SHA |

## The append-only proof and what it does not cover

Requirement R-SN-2 says a snapshot is never overwritten or deleted. In production this rests on five things.

1. No IAM statement in either stack grants `UpdateItem`, `DeleteItem`, `BatchWriteItem` or a PartiQL write on the snapshots table. A test checks every statement in the synthesised templates.
2. The scan role can write only partitions that start with `seen#`. It cannot write a snapshot at all.
3. The snapshotter writes each snapshot with the condition that no item with that key exists. The sort key ends in 64 random bits, so code that has not read a key cannot address it.
4. The table has no TTL, so DynamoDB never removes snapshots. Point-in-time recovery can restore any point in the last 35 days, so a bad change can be found and reverted. The source is the RestoreTableToPointInTime reference, https://docs.aws.amazon.com/powershell/v5/reference/items/Restore-DDBTableToPointInTime.html.
5. Deletion protection is on, and the stack keeps the table if the stack is deleted.

Here is the gap. `PutItem` replaces an item that has the same key, and no IAM condition key can force a write to carry a condition. So IAM alone does not stop a replace. Think of a library that lets you add books but not remove them. A clerk who copies a shelf number from the catalogue can still put a different book in that exact spot. If an attacker ran code inside the snapshotter, they could read a snapshot key with `Query` and write over it. Catching that needs DynamoDB Streams or CloudTrail data events. Both are out of scope for release 0.1.

## Abuse of the public endpoint

| Abuse | What stops it |
|---|---|
| Scan flooding from one IP | WAF rate limit, 100 requests per 5 minutes per IP on `/api/`, then 429 |
| Scan flooding from many IPs | Reserved concurrency of 10 caps parallel scans, and extra requests get 429 from Lambda. An alarm fires on any throttle |
| Huge repositories | The 300-dependency cap and the 5 MiB manifest cap |
| Hostile manifests and policy files | The untrusted-input rules above, plus fixed error text |
| Using Sexton to hammer npm, OSV or GitHub | Backoff on 429 and 503 and a User-Agent that names Sexton, both in the engine today. Planned: the 24-hour cache shared by every Lambda container |
| Running up the AWS bill | The caps above, one CloudFront attempt per request, a 60-second timeout and on-demand pricing. The alarms on error rate, duration and throttles show unusual load |
| Calling the function URL directly | IAM auth with OAC. An unsigned call gets 403 |
| Reading private repositories | Sexton sends no token, so a private repository answers 404 like a missing one |

## Known limits in release 0.1

### TLS policy

The site uses the default `*.cloudfront.net` certificate. With that certificate CloudFront uses the `TLSv1` security policy, and the minimum TLS version cannot be raised. So an old client could still connect with TLS 1.0 or 1.1. Modern browsers negotiate TLS 1.3, and HSTS keeps them on HTTPS. We accepted this for release 0.1 as the demo holds no secrets and no accounts.

The path to TLS 1.2 minimum needs a domain we own. The steps are short.

1. Request an ACM certificate for the domain in us-east-1, as CloudFront only reads certificates from that region.
2. Add the domain to the distribution's `domainNames` with that certificate.
3. Set `minimumProtocolVersion` to `TLS_V1_2_2021`.
4. Point the domain at the distribution with a Route 53 alias record.

Sources: the TLSv1 limit is in https://repost.aws/knowledge-center/cloudfront-security-protocols-ciphers, and the us-east-1 rule for CloudFront certificates is in https://aws.amazon.com/certificate-manager/faqs/.

### Other accepted limits

1. CloudFront access logs and S3 server access logs are off, for cost and to avoid storing visitor IP addresses. WAF sampled requests and Lambda logs cover day-to-day operations.
2. A request blocked by a managed WAF rule gets a 403, and the site's error page mapping turns it into the web app's `index.html`. The visitor sees an invalid-response message instead of a clear block message.
3. The snapshotter covers a few thousand packages a day. Above that, names wait for the next run and the alarm fires.
4. Everything runs in one region. An outage in us-east-1 takes the demo down. The snapshot table can be restored from point-in-time recovery.
