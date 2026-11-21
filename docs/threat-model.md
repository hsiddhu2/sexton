# Sexton threat model

Sexton is a security tool, so its own hosted demo has to hold up. This page lists what can go wrong with each part of the AWS deployment and what stops it. It uses STRIDE: spoofing, tampering, repudiation, information disclosure, denial of service and elevation of privilege.

It covers release 0.1 as built from `.kiro/specs/infra/design.md`. The stacks and both handlers are written and tested. Nothing is deployed yet.

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
4. Bodies are capped at 5 MiB for manifests and 256 KiB for the policy file.
5. Error messages are fixed text. The engine's intake errors hold no input, and the API adds none, so it cannot be used to reflect content. A property test plants a marker in the `repo` parameter and checks every error body for it.
6. A scan keeps at most 300 direct dependencies.

The policy file is parsed by the engine's YAML parser and checked against a JSON Schema before use. An invalid policy fails the scan with error codes and paths only. If the policy file cannot be fetched for any reason other than 404, the scan fails with 502. We do not fall back to the default policy, as that could report a pass under a policy the repository never chose.

## STRIDE per component

### CloudFront and WAF

| Threat | Example | Control |
|---|---|---|
| Spoofing | Someone serves a fake Sexton page | The site is served only from the CloudFront domain over HTTPS, with HSTS for two years |
| Tampering | A proxy changes the page in transit | HTTPS only. HTTP redirects to HTTPS for the web app. An HTTP request to the API is refused with 403. The distribution maps 403 to `index.html`, so the visitor may see the page with status 200 instead. Either way, no API response is sent over plain HTTP |
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
| Information disclosure | Logs leak a token or a response body | Log lines hold scalars only: the host and path of each upstream call, never the query, a header or the body. For GitHub hosts no owner or repository is logged: raw file requests keep only the file path, and other GitHub hosts log no path. Property tests plant marker strings in the query, the body, and the owner and repository to prove it |
| Denial of service | A huge repository or a very slow upstream | The 300-dependency cap, a 60-second timeout, one CloudFront attempt and reserved concurrency of 10 |
| Elevation of privilege | A bug in scan code tries to rewrite history | The scan role cannot write any `snap#` item. It can only add `seen#` records |
| Repudiation | Nobody can tell which request failed | Every response carries `x-sexton-request-id`, and every log line of that request carries the same ID |

### Snapshotter function

| Threat | Example | Control |
|---|---|---|
| Tampering | Code in the snapshotter replaces an old snapshot | See the append-only proof below |
| Denial of service | Too many packages to snapshot in 10 minutes | It stops 90 seconds before its timeout, counts the names it did not reach and raises an alarm |
| Tampering | Two runs at once write duplicate snapshots | Reserved concurrency of 1 and no retries from the schedule |

### DynamoDB

| Threat | Example | Control |
|---|---|---|
| Tampering | Snapshots are deleted or changed | No role has update, delete or batch-write on the table. No TTL on the table. Deletion protection on. Point-in-time recovery keeps 35 days |
| Information disclosure | Data at rest is read | Encryption with the AWS owned key. The tables hold public package metadata only |
| Denial of service | The cache stops working | A cache or history failure degrades that one read and never fails the scan. An alarm fires on throttling |

### Web bucket

| Threat | Example | Control |
|---|---|---|
| Information disclosure | Someone reads the bucket directly | Block Public Access, SSL only, read only by CloudFront OAC for this distribution |
| Tampering | A bad deploy overwrites the site | Versioning is on, so an older version can be restored |

### CI

| Threat | Example | Control |
|---|---|---|
| Elevation of privilege | A workflow change deploys to AWS or reads a secret | The workflow in `.github/workflows/ci.yml` holds no AWS credentials and no secrets, asks only for `contents: read`, and never deploys |
| Tampering | A third-party action is swapped for a bad version | Every action is pinned to a full commit SHA, and checkout keeps no credentials |

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
| Using Sexton to hammer npm, OSV or GitHub | Backoff on 429 and 503 and a User-Agent that names Sexton, both in the engine. The 24-hour cache in DynamoDB is shared by every Lambda container |
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

### The evidence digest is not a signature

The evidence pack carries a SHA-256 digest over the RFC 8785 canonical form of its body. It shows an edit only to a reviewer who got the digest from somewhere else, such as the `x-sexton-evidence-digest` header of the download or a CI log. Anyone who can change the file can recompute the digest, so it proves nothing on its own. Signed evidence packs are on the roadmap.

The pack is built from untrusted text: package names, versions, advisory summaries, maintainer names and reasons all come from upstream or the repository. The Markdown report writes every such string only inside an escaped inline code span (`escapeField`), so none of them can open a heading, a link, HTML or a table cell. A property test plants Markdown, HTML and a marker in every field and checks that no marker is left outside a code span. The download file name is built from the parsed owner and repository and filtered to letters, digits, dot, hyphen and underscore. Each evidence download runs a full scan, so it counts against the same rate rule as a scan.

### The CLI and the Action

1. **Terminal escape injection.** Package names, reasons, advisory summaries and policy pointers are attacker-controlled. Every string is neutralised before it is printed: control characters (C0, C1, DEL), line and paragraph separators, bidi controls and direction marks become spaces. A property test plants escape sequences and checks every output.
2. **The working-tree boundary.** The CLI never lists or follows a symbolic link, resolves the real path of every file it reads and refuses one outside the root, and caps each file at 256 KiB. It never writes through a link: `scan.json` and the evidence files are opened with `O_NOFOLLOW`, so a checkout cannot plant a link that makes `sexton scan .` overwrite another file.
3. **Git inside an untrusted checkout.** A checkout's `.git/config` can set `core.fsmonitor`, a command git runs when it reads the index. The CLI runs its three git commands with `-c core.fsmonitor=false`, through `execFile` with no shell.
4. **The fork token.** On a pull request from a fork the workflow token is read-only and secrets are not passed, so the comment fails with a warning and the check result still decides the job.
5. **Why `pull_request_target` is refused.** It runs with a write token in the base repository's context. Combined with reading the pull request's files that is the pattern GitHub's hardening guide warns about. The Action documents `pull_request` only. Inputs reach scripts only through environment variables, never through `${{ }}` inside a script.
6. **Comment hijack.** The Action updates a marker comment only when `github-actions[bot]` wrote it, so nobody can plant a marker comment for Sexton to fill and then rewrite.
7. **The limit of the remove check.** Sexton counts quoted references in source, config and style files and script commands. A package loaded by a computed name, or named only in a file type it does not read, is not seen. Also unseen: untracked files, files under `dist`, `build` or `coverage`, unquoted paths such as `node_modules/n/x.js` in a script or `/node_modules/n/` in HTML, a package used only through a binary of another name (such as `tsc` for `typescript`), and escaped quotes. Remove is offered only for `dependencies`, only when every file was read (a sparse checkout counts as not read), and the pull request body tells the reviewer to check.
8. **The dogfood workflow builds pull request code**, as ci.yml does. Callers using the published Action build only the Action's own checkout.

### Other accepted limits

1. CloudFront access logs and S3 server access logs are off, for cost and to avoid storing visitor IP addresses. WAF sampled requests and Lambda logs cover day-to-day operations.
2. A request blocked by a managed WAF rule gets a 403, and the site's error page mapping turns it into the web app's `index.html`. The visitor sees an invalid-response message instead of a clear block message.
3. The snapshotter covers a few thousand packages a day. Above that, names wait for the next run and the alarm fires.
4. Everything runs in one region. An outage in us-east-1 takes the demo down. The snapshot table can be restored from point-in-time recovery.
