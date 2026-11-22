# Requirements Document

## Introduction

The remediate module is the write side of hosted remediation. It implements R-RM-5 (open the pull request), R-RM-7 for the hosted path (review sites), R-RM-8 (one remediation per pull request, never merge) and the remediation log of R-EV-1. It adds `POST /api/remediate` on a new function, a GitHub executor that opens one pull request for one planned package, an append-only remediation log table, the log in the hosted evidence pack, a button in the drawer, and the contents of the demo repository that is the only repository Sexton may write to.

It does not include any repository other than `hsiddhu2/sexton-demo`, merging, pushing to a default branch, a lockfile change, deleting anything, or a deploy.

## Glossary

- **Engine**, **Transport**, **ClientContext**, **RemediationEntry**, **PrIntent**, **PackageJsonEdit**, **RemediationLogEntry**, **isValidLogEntry**, **Token**, **Token provider**, **scanWithInputs**, **Safe path**: as defined in the earlier specs.
- **Allowlist**: the list of `owner/repo` names that may receive a pull request, `REMEDIATE_ALLOWLIST` in infra/lib/config.ts, exactly `["hsiddhu2/sexton-demo"]`. Compared lower-cased and exact. Empty or missing allows nothing.
- **Allowed repository**: a repository whose lower-cased `owner/repo` is in the Allowlist.
- **Executor**: the API component that turns one RemediationEntry into a pull request through the Write shapes.
- **Write shapes**: exactly these requests to `https://api.github.com`, each with `Authorization: Bearer`, `redirect: "manual"` and `X-GitHub-Api-Version: 2026-03-10`:
  1. `GET /repos/{o}/{r}`
  2. `GET /repos/{o}/{r}/git/matching-refs/heads/sexton/`
  3. `GET /repos/{o}/{r}/pulls?head={o}:{branch}&state=all&per_page=10`
  4. `GET /repos/{o}/{r}/contents/package.json?ref={sha}`
  5. `POST /repos/{o}/{r}/git/refs`
  6. `PUT /repos/{o}/{r}/contents/package.json`
  7. `POST /repos/{o}/{r}/pulls`
  8. `POST /repos/{o}/{r}/issues/{n}/comments`
- **Read shapes**: the two reads of spec hosted-plans (head commit, tree of a commit), used by the scan the Executor runs and by review-site validation.
- **Sexton branch**: a branch whose name starts with `sexton/`.
- **Branch collision**: a Sexton branch whose name equals the intent branch when both are lower-cased.
- **Outcome**: `opened`, `existing`, `refused` or `failed`.
- **PR prefix**: `https://github.com/hsiddhu2/sexton-demo/pull/`.
- **Review-site comment**: one issue comment on the pull request that links each validated review comment to its file line at the commit.

## Requirements

### Requirement 1: Applying edits to package.json

**User Story:** As the Executor, I want a pure function that applies the plan's edits to the package.json text, so that the pull request changes exactly what the plan says.

#### Acceptance Criteria

1. THE Engine SHALL provide `applyPackageJsonEdits(text, edits)` that never throws and answers the new text or a failure from a closed set.
2. WHEN the text is not JSON, its top level is not an object, a named section is not an object, or a set-range or remove names a package absent from its section, THE function SHALL answer a failure.
3. THE output SHALL keep the input's indentation (tab, 2 or 4 spaces, default 2), its key order, and its final newline when present.
4. WHEN add-dependency targets a section whose keys are sorted, THE function SHALL keep it sorted; otherwise it SHALL append; a missing section SHALL be created after the last existing dependency section.
5. WHEN remove-dependency is applied, THE function SHALL remove the name from every dependency section.
6. THE output SHALL always parse, SHALL equal the expected object and SHALL change only the named keys; a second apply of set-range SHALL change nothing, and a second apply of remove SHALL answer the name-absent failure.
7. THE Transport request method SHALL be `GET`, `POST` or `PUT`; DELETE and PATCH SHALL not be expressible.

### Requirement 2: The Executor's requests

**User Story:** As the operator, I want every GitHub write held to a small, fixed set of requests on the demo repository, so that the token can do nothing else.

#### Acceptance Criteria

1. THE Executor SHALL send every request through one builder that knows only the Write shapes, with a validated owner, repository, commit SHA, branch and pull request number.
2. THE builder SHALL refuse a repository that is not an Allowed repository, a `git/refs` body whose ref does not start with `refs/heads/sexton/`, and a contents PUT whose branch is not a Sexton branch.
3. THE Executor SHALL never send DELETE and SHALL never request the default branch's ref.
4. THE token SHALL appear only in the Authorization header and SHALL not appear in any URL, response, log line, log entry or error.

### Requirement 3: Execution order

**User Story:** As a maintainer of the demo repository, I want one pull request per package, opened from the server's own plan.

#### Acceptance Criteria

1. WHEN the repository is not an Allowed repository, THE handler SHALL refuse before any scan or GitHub request.
2. THE Executor SHALL run the hosted scan through `scanWithInputs` with the token; WHEN the commit is null it SHALL refuse with "head commit unknown".
3. THE Executor SHALL take the RemediationEntry for the package from that scan; WHEN it is not proposed or has no intent it SHALL refuse. No edit, branch, title, body or file SHALL come from the request body.
4. WHEN a Branch collision exists and an open pull request has that branch as head, THE Executor SHALL answer existing with its URL; WHEN a Branch collision exists without one, it SHALL refuse with "a Sexton branch for this package already exists, delete it to open a new pull request". A Branch collision SHALL never create a branch.
5. THE Executor SHALL read package.json at the commit, apply the edits, and refuse when nothing changed.
6. THE Executor SHALL create the branch at the commit; WHEN creating it answers 422, it SHALL run the check of 3.4 again, answering existing for an open pull request, refused with "another request is opening this pull request, try again in a minute" for a collision without one, and failed at `create-branch` when no collision is found.
7. THE Executor SHALL put package.json on the branch with the blob SHA it read, with the intent title as the commit message.
8. THE Executor SHALL open the pull request with the branch as head, the default branch as base, and the intent's title and body, never as a draft.
9. WHEN a step fails after the branch exists, THE Executor SHALL leave the branch and answer failed with the step name. No step SHALL delete anything.
10. WHEN applying the edits fails, THE Executor SHALL answer failed at step `apply-edits`.
11. WHEN less than 20 seconds of the function's time remain before the branch is created, THE Executor SHALL refuse with "the scan took too long, try again", so no branch is left by a timeout.
12. THE handler SHALL use the lower-cased repository URL for the scan, GitHub and the log.

### Requirement 4: Review sites

**User Story:** As a reviewer, I want the lines a migration cannot change listed on the pull request with links.

#### Acceptance Criteria

1. WHEN the intent has review comments, THE Executor SHALL post one Review-site comment on the pull request after it opens.
2. THE Executor SHALL keep a review comment only when its path is a Safe path present in the tree of the commit, its line is a positive integer (or null for package.json), and its body is at most 1000 characters; it SHALL count the rest as dropped.
3. EACH kept comment SHALL link to `https://github.com/{o}/{r}/blob/{sha}/{path}#L{line}` (path segments percent-encoded, no fragment for a null line) with link text in a code span and its engine-built body unchanged apart from `neutralise` and line breaks; at most 50 SHALL be listed, then "and N more review sites were found".
4. THE response SHALL carry `reviewSites: { posted, dropped }`, where posted counts the kept comments (listed or summarised) and posted plus dropped equals the input count.

### Requirement 5: Remediation log

**User Story:** As an auditor, I want every opened pull request recorded in an append-only log.

#### Acceptance Criteria

1. THE Data stack SHALL hold the table `sexton-remediation-log-dev`, partition key `repository`, sort key `sk` = timestamp + "#" + branch, on demand, point-in-time recovery on, deletion protection on, retained.
2. WHEN a pull request opens, THE Executor SHALL write one entry that passes `isValidLogEntry`, with a condition that the item does not exist.
3. WHEN the log write fails after the pull request opened, THE response SHALL be opened with `logged: false`.
4. THE remediate role SHALL have only PutItem on the table; the scan role SHALL have only Query on it.

### Requirement 6: Request and response

**User Story:** As the web app, I want a narrow endpoint that is safe to expose.

#### Acceptance Criteria

1. THE handler SHALL accept only POST to `/api/remediate` with content-type `application/json` and a body of at most 2048 bytes that is exactly `{ "repo": <canonical repository URL>, "package": <valid package name> }`, each key once; any other method SHALL answer 405 and any other body 400.
2. WHEN the repository is not an Allowed repository, THE handler SHALL answer 422 `repository-not-allowed` with a fixed message saying pull requests are opened only on the demo repository.
3. EVERY Outcome the Executor reaches SHALL answer 200 with `{ status, prUrl?, reason?, step?, logged?, reviewSites? }`; every reason SHALL be fixed text; no GitHub body SHALL be copied into a response or a log.
4. A `prUrl` SHALL be present only when it starts with the PR prefix followed by digits.
5. THE handler SHALL send no CORS header.

### Requirement 7: Hosted evidence and scan actions

**User Story:** As a reviewer, I want the hosted evidence pack to show the log, and the web app to know when the button applies.

#### Acceptance Criteria

1. THE evidence path SHALL read the log entries of the scanned repository and pass them to the pack builder; WHEN the read fails it SHALL pass null and write one warn line `remediation-log-unavailable`.
2. THE scan response SHALL carry `actions: { remediate: boolean }`, true only for an Allowed repository.
3. THE scan response SHALL not carry the log.

### Requirement 8: Infrastructure

**User Story:** As the operator, I want the write path isolated in its own function with least privilege.

#### Acceptance Criteria

1. THE Edge stack SHALL add `RemediateFunction` (Node 22, arm64, 60 s, reserved concurrency 2) with its own role, log group and IAM-auth function URL behind OAC.
2. THE remediate role SHALL have exactly: log write on its log group, GetSecretValue on the secret ARN, the cache table and snapshots table statements the scan role has, and PutItem on the log table.
3. CloudFront SHALL route `/api/remediate` before `/api/*`, all methods, caching disabled, forwarding no query string and the `content-type` and `x-amz-content-sha256` headers.
4. WAF SHALL add a rate rule of 10 requests per 300 seconds per IP scoped to paths starting with `/api/remediate`, answering 429 JSON; the existing rule SHALL stay.
5. THE scan and remediate functions SHALL receive `REMEDIATE_ALLOWLIST` from the config constant and `REMEDIATION_LOG_TABLE`; the remediate function SHALL also receive `GITHUB_TOKEN_SECRET_ARN`, `CACHE_TABLE`, `SNAPSHOTS_TABLE` and `SEEN_INDEX`. This supersedes hosted-plans 8.2 and 8.3 ("only the scan function"): the scan and remediate roles read the secret, the snapshotter never does.
6. THE GithubTokenSecret resource SHALL not change; WHEN cdk diff shows a change to it, the work SHALL stop.

### Requirement 9: Web

**User Story:** As a visitor to the hosted site, I want to open the pull request from the drawer when that is allowed.

#### Acceptance Criteria

1. THE validator SHALL accept `actions` with exactly one boolean key `remediate` and reject any other key in it.
2. WHEN a hosted scan has `actions.remediate` true and the plan is proposed with an intent, THE drawer SHALL show an "Open pull request" button; otherwise, for a proposed plan with an intent, it SHALL show "Pull requests are opened only on the demo repository".
3. WHEN the button is pressed, THE web app SHALL POST the body with its SHA-256 in `x-amz-content-sha256`, mark the button `aria-disabled` while in flight (focus stays on it), treat a body that is not the response shape as failed, then show the outcome text and, for opened or existing, a link with fixed text that opens in a new tab with `rel="noopener noreferrer"`, only after the PR prefix check passes in the browser.
4. THE demo fixture SHALL never show the button; the drawer SHALL stay keyboard reachable and pass the axe test.

### Requirement 10: Demo repository, steering and docs

**User Story:** As HP, I want the demo repository ready to push and the rules written down.

#### Acceptance Criteria

1. THE demo repository contents SHALL be written to `private/demo-repo/` only: package.json (name sexton-demo, private, Apache-2.0, caret ranges on express 4.18.2, lodash 4.17.21, request 2.88.2, left-pad 1.3.0, moment 2.29.4, uuid 9.0.1, colors 1.4.0; devDependencies node-sass ^7.0.3, sass-loader ^7.1.0, webpack ^4.47.0; a `build:css` script calling node-sass), package-lock.json from `npm install --package-lock-only --ignore-scripts`, src/styles/app.scss with one `/deep/` line, src/styles/theme.scss, scripts/compile.js with one render and one renderSync call, and a README saying the repository is a deliberate target; no `.github` folder and no event-stream.
2. THE steering file api-etiquette.md SHALL name the two reads and the Write shapes, the allowlist and no redirect; THE steering file pr-safety.md SHALL say pull requests are opened only on allowlisted repositories and Sexton never deletes a branch.
3. THE docs (architecture, threat model, README, deploy runbook) SHALL describe the remediate path, the controls and the new smoke checks.
