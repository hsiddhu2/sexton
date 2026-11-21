# Requirements Document

## Introduction

The hosted-plans module brings remediation plans to the hosted scan. It implements R-RM-1, R-RM-2, R-RM-4 and R-RM-6 of docs/requirements.md on `GET /api/scan`, and the commit part of R-EV-1 for hosted scans. R-RM-3 (remove) is not met on the hosted path by design: the hosted scan never proposes remove. It adds a GitHub token read from the existing Secrets Manager secret, two read requests to api.github.com (the head commit and the tree of a commit), manifests and the policy file read at that commit, a GitHub File source for recipes, plans on the scan response, and the commit and plans in the hosted evidence pack.

It writes nothing to GitHub. `POST /api/remediate`, the executor, the remediation log table and the web button are spec 10c. Import counting and remove on the hosted path are out of scope: the hosted scan never proposes remove. Every path in this spec also works when the secret is empty or the token is rejected. Nothing is deployed by this spec.

## Glossary

- **Engine**, **Transport**, **TransportRequest**, **ClientContext**, **CachedFetcher**, **FileSource**, **Capped source**, **Caps**, **Safe path**, **RemediationEntry**, **EvidencePack**, **ScanWithInputs**, **Logger**: as defined in the earlier specs.
- **Token**: a GitHub personal access token, a string matching `^(ghp_|github_pat_)[A-Za-z0-9_]{20,255}$`. Any other value is not a Token.
- **Token provider**: the API component that answers a Token or null. Null is a normal state.
- **Secret port**: the seam over Secrets Manager GetSecretValue, so tests use a fake.
- **Ref**: the string `HEAD` or a **Commit SHA**, 40 lower-case hexadecimal characters. Any other string is an invalid reference.
- **Pinned read**: a raw.githubusercontent.com read whose Ref is a Commit SHA.
- **API host**: `api.github.com`.
- **Allowed API request**: exactly one of `GET https://api.github.com/repos/{owner}/{repo}/commits/HEAD` or `GET https://api.github.com/repos/{owner}/{repo}/git/trees/{sha}?recursive=1`, with a valid owner, repo and Commit SHA.
- **Authenticated request**: a request whose headers hold `Authorization`.
- **Raw entry**: one element of the tree response's `tree` array, whatever its type.
- **Tree listing**: the blob paths of a tree, with a `capped` flag that is true when the response says `truncated` or holds more than 20000 Raw entries.
- **GitHub File source**: the FileSource over one repository at one Commit SHA, listing from the Tree listing and reading from raw.githubusercontent.com without a Token.
- **Plan stage**: bumpTargets, gatherBumpData, gatherMigrationData, runMigrations, planRemediation and attachRemediations on the hosted scan.
- **Bump target cap**: at most 25 bump targets gathered per scan, in report order.

## Requirements

### Requirement 1: Pinned reads

**User Story:** As a reviewer of an evidence pack, I want the hosted scan to read the manifests and the policy file at one commit, so that the pack names exactly what was scanned.

#### Acceptance Criteria

1. THE manifest URL builder, `fetchManifest`, the policy URL builder, `fetchPolicyText` and `intakeRepoWithManifests` SHALL accept an optional Ref whose default is `HEAD`.
2. WHEN a Ref is not a valid Ref, THE URL builders SHALL throw and the fetch functions SHALL answer their existing invalid-reference failure without a request.
3. WHEN a Ref is a Commit SHA, THE clients SHALL request `https://raw.githubusercontent.com/{owner}/{repo}/{sha}/{file}` and use a cache key that holds the Commit SHA.
4. WHEN no Ref is given, THE clients SHALL build the same URLs and cache keys as before this spec.

### Requirement 2: GitHub API reads

**User Story:** As the operator, I want the hosted scan to make only two kinds of GitHub API request, so that the token can do nothing else.

#### Acceptance Criteria

1. THE Engine SHALL provide `resolveHeadCommit(ctx, repo, auth)` that sends `GET https://api.github.com/repos/{owner}/{repo}/commits/HEAD` with `Accept: application/vnd.github.sha`.
2. WHEN the response is 200 and its body is exactly a Commit SHA, THE function SHALL answer the Commit SHA; otherwise it SHALL answer a failure value carrying the status or null.
3. THE Engine SHALL provide `listTree(ctx, repo, sha, auth)` that sends `GET https://api.github.com/repos/{owner}/{repo}/git/trees/{sha}?recursive=1` and answers the blob paths with a `capped` flag.
4. WHEN the tree response says `truncated` true or holds more than 20000 Raw entries, THE Tree listing SHALL be capped, and it SHALL hold no path from beyond the first 20000 Raw entries.
5. THE Tree listing SHALL be cached under the repository and the Commit SHA; `resolveHeadCommit` SHALL NOT be cached.
6. THE two functions SHALL send `Authorization: Bearer <token>`, `X-GitHub-Api-Version: 2026-03-10` and the Sexton User-Agent, and SHALL ask the Transport not to follow a redirect.
7. WHEN the status is anything other than 200, including any 3xx, THE functions SHALL answer a failure value with the status; 403 and 404 SHALL NOT be retried; 429 and 503 SHALL follow the existing retry rule.
8. THE `auth` argument SHALL be passed to these two functions only and SHALL NOT be part of ClientContext.
9. WHEN the owner, repo, Commit SHA or token is invalid, THE functions SHALL answer a failure without a request.
10. THE Transport SHALL accept a request option that turns redirect following off; the fetch Transport SHALL map it to `redirect: "manual"` so a 3xx is answered as itself.

### Requirement 3: GitHub File source

**User Story:** As a maintainer, I want a hosted migration plan to carry its review sites, so that the hosted drawer matches the CLI.

#### Acceptance Criteria

1. THE GitHub File source SHALL list files from `listTree` at its Commit SHA.
2. WHEN the Tree listing fails, THE `listFiles` method SHALL reject, so the Capped source reports the files as not scanned; WHEN the Tree listing is capped, THE `listFiles` method SHALL answer its paths and `counts()` SHALL report it capped.
3. THE `readFile` method SHALL read only a path that the last successful listing returned and that passes `isSafePath`; any other path SHALL answer undefined without a request.
4. THE `readFile` method SHALL request `https://raw.githubusercontent.com/{owner}/{repo}/{sha}/{path}` with each path segment percent-encoded, without a Token, with a 262144 byte cap, and cache the answer under the repository, the Commit SHA and the path.
5. WHEN a read fails, returns 404, exceeds the cap or is not UTF-8, THE `readFile` method SHALL answer undefined.
6. THE source SHALL expose `counts()` with whether the listing was performed and whether it was capped.
7. WHEN the source's read budget of 15 seconds from its first listing has passed, THE `readFile` method SHALL answer undefined without a request.

### Requirement 4: Token provider

**User Story:** As the operator, I want the token read safely and rarely, so that a missing or wrong secret never breaks a scan.

#### Acceptance Criteria

1. THE Token provider SHALL read the secret named by the environment variable `GITHUB_TOKEN_SECRET_ARN` through the Secret port.
2. WHEN the variable is absent or empty, THE Token provider SHALL answer null without a Secret port call.
3. WHEN the secret value is missing, empty, not a Token, or the read fails, THE Token provider SHALL answer null.
4. THE Token provider SHALL cache its answer, null included, for 15 minutes in the container and SHALL share one in-flight read between concurrent callers.
5. THE Token SHALL NOT appear in a log line, an error message, a URL, a cache key, a cached value or a response body.

### Requirement 5: Hosted scan order

**User Story:** As a user of the hosted site, I want a scan that still works when GitHub's API does not answer.

#### Acceptance Criteria

1. WHEN the Token provider answers null, THE scan SHALL make no request to the API host, read at `HEAD`, and record the commit as null.
2. WHEN a Token exists and the repository URL parses, THE scan SHALL call `resolveHeadCommit` before intake.
3. WHEN `resolveHeadCommit` succeeds, THE scan SHALL read the manifests and the policy file at the Commit SHA and record the Commit SHA as the commit.
4. WHEN `resolveHeadCommit` fails, THE scan SHALL read at `HEAD`, record the commit as null, and write one warn line `github-api-unavailable` carrying the status only.
5. THE ScanResponse contract and ScanMetadata SHALL NOT gain a commit field; ScanWithInputs SHALL carry the commit for the evidence path.

### Requirement 6: Plans on the hosted scan

**User Story:** As a user of the hosted site, I want the scan to show what Sexton would change, so that I can open the plan and the pull request body in the drawer.

#### Acceptance Criteria

1. WHEN a scan succeeds, THE response SHALL carry `remediations`, built by the Plan stage after scoring.
2. THE Plan stage SHALL pass an empty importSites map, so no hosted plan has kind remove.
3. THE Plan stage SHALL gather bump data for at most the first 25 bump targets in report order; a later target SHALL get the existing "bump data was not gathered" plan.
4. THE scripts map SHALL come from `readPackageScripts` over the package.json text intake returned.
5. THE recipe runner SHALL receive a GitHub File source only when the commit is known and the report holds an Unhealthy package that has a recipe; otherwise no File source.
6. WHEN any step of the Plan stage throws, including building the File source, THE scan SHALL answer 200 with the plans that exist, and SHALL write one warn line `plans-partial`.
7. WHEN any GitHub API call or any File-source read fails while the manifest and policy reads succeed, THE scan SHALL still answer 200 with a valid body.

### Requirement 7: Hosted evidence

**User Story:** As a reviewer, I want the hosted evidence pack to name the commit and carry the plans.

#### Acceptance Criteria

1. THE evidence path SHALL pass the scan's commit, null or a Commit SHA, to the pack builder.
2. THE evidence path SHALL pass the scan's remediations to the pack builder.
3. THE remediation log SHALL stay null.

### Requirement 8: Infrastructure

**User Story:** As the operator, I want only the scan function able to read the secret, and the secret resource left exactly as it is.

#### Acceptance Criteria

1. THE scan role SHALL gain one statement allowing `secretsmanager:GetSecretValue` on the GitHub token secret's ARN only.
2. THE scan function SHALL gain the environment variable `GITHUB_TOKEN_SECRET_ARN` set to that ARN.
3. THE snapshotter role SHALL have no Secrets Manager statement and the snapshotter function no `GITHUB_TOKEN_SECRET_ARN`.
4. THE GithubTokenSecret resource SHALL NOT change; an output or export of its ARN MAY be added. WHEN cdk diff shows any change to the resource, THE work SHALL stop and the change SHALL be written under Waiting on HP.
5. THE cdk-nag reason for the secret SHALL be updated; no IAM statement SHALL use a wildcard.
6. THE `.gitignore` file SHALL track `build/infra/`.
7. THIS requirement supersedes infra Requirement 9.6 ("no role reads the secret") for the scan role only; the infra tests that asserted it change with it.

### Requirement 9: Steering, web, logging and docs

**User Story:** As a contributor, I want the written rules and the docs to say what the code now does.

#### Acceptance Criteria

1. THE steering file `.kiro/steering/api-etiquette.md` SHALL say raw.githubusercontent.com is read with no token, no cookies, at `HEAD` or a 40 character commit SHA, and SHALL add api.github.com with the token in the Authorization header only, the two read requests only, no call without a token, no redirect followed.
2. THE request log line SHALL never carry an Authorization header value; api.github.com lines SHALL carry the host and no path.
3. WHEN a hosted-shaped scan response carries remediations, THE web app SHALL render the plan in the drawer.
4. THE docs (docs/architecture.md, docs/threat-model.md, docs/well-architected.md, README.md and build/infra/10-deploy.md) SHALL describe the hosted scan order, the token, where it may travel, the cache, the pinned read, why hosted never proposes remove, token rotation and the new smoke checks.
