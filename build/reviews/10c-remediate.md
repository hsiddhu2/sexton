# Reviews: spec 10c remediate

Each review was run by an independent reviewer that had not seen the implementation, with the spec folder, the diff against main, docs/requirements.md and the steering files.

## Review 1: spec (requirements, design, tasks), 21 Nov 2026

Verdict: NOT READY, 4 defects, all fixed before the spec commit.

1. The design built a PUT request, but `TransportRequest.method` allowed only GET and POST, and no task changed it. Fixed: Requirement 1.7 widens it to GET, POST and PUT, with DELETE and PATCH kept out of the type; task 3.1 carries it.
2. The review-site comment would have passed each body through `escapeField`, which cuts at 200 code points and turns the body into one code span, breaking "with its fixed body text". Fixed: the engine-built body is posted unchanged apart from `neutralise` and line breaks; only the link text is a code span.
3. Requirement 1.6 said a second remove changes nothing, while 1.2 makes it a failure; Property 66 claimed to prove 1.2 without exercising a failure. Fixed: a second remove answers name-absent, failures map to failed at `apply-edits` (3.10), and Property 66 proves 1.3 to 1.6 with examples for 1.2.
4. Property 68 said posted plus dropped equals the input count, which fails beyond the 50-link cap. Fixed: posted counts every kept comment, listed or summarised.

Notes acted on: the in-progress refusal when create-ref answers 422 before the other request's pull request exists, and failed when no collision is found (3.6); writes are never retried; the repository URL is lower-cased after the allowlist check (3.12, decision 9); the `head` value is URL-encoded and uses the matched ref's real name; the remediate function's environment and the superseded hosted-plans 8.2 and 8.3 (8.5, decision 12); steering file patterns cover `packages/api/src/remediate` (decision 11); a 20 second check before create-branch (3.11, decision 10); the 403-to-web-page row for a missing payload hash; "and N more review sites were found"; expected permissions per shape; Property 60 scoped to api.github.com, Property 64 rules out the default branch in any letter case; the demo file list in Requirement 10.1; `aria-disabled` so focus stays in the trap.

## Review 1b: spec re-review

Verdict: READY. Notes fixed: Requirement 3 criteria renumbered in order; task traceability for 3.10 to 3.12; four error-table rows; `remainingMs` in the ExecutorDeps interface; a concurrent create-ref test planned.

## Review 2: implementation (engine, api, infra, web, steering, docs), 21 Nov 2026

Verdict: READY, no defects. Checked: the token only in the Authorization header of api.github.com requests; the allowlist before any scan or request and again in the builder, with the URL lower-cased after it; no DELETE or PATCH in the type, no default branch ref, create-ref and put only on `sexton/`; the client body steers nothing; any-case collision never reaches create-ref, and the 422 path as specified; writes sent once; null-prototype edits; the request parser; no CORS header; isValidLogEntry before the conditional put; IAM per role; behavior order and the WAF rule; the web client; steering limited to the two files.

Notes acted on:
1. The Property 64 builder test caught its own assertion. Fixed: only the builder call is inside the try, and the arbitrary also generates `sexton/` names.
2. A failed review-site post broke posted plus dropped equals input. Fixed: a failed post counts every comment as dropped.
4. `(` and `)` in a tree path could end the Markdown link. Fixed: both are percent-encoded; test added.
6. A failed branch check after a 422 answered failed at `branch-check`. Fixed: it answers failed at `create-branch`, as 3.6 says.
8. Tests added for Requirement 7.1 (a failed log read gives no log and one warn line) and 7.2 (`actions.remediate` false off the allowlist).
11. The threat model now says the endpoint can be called directly, and what bounds it.

Notes kept, recorded as design decision 15: integer-like key order and CRLF in applyPackageJsonEdits; `per_page=10` on list-pulls; a comment over 65536 characters; POSIX env syntax in the e2e script; Properties 66 to 68 at 100 runs as the spec says.

## Review 3: deploy 3 fix (fix/remediate-origin-policy), 22 Nov 2026

The Edge deploy failed: "AWS::CloudFront::OriginRequestPolicy: The parameter Headers contains x-amz-content-sha256 that is not allowed." The stack rolled back with no change; Data had deployed. Fix: the remediate policy forwards `content-type` only; spec 8.3, design decision 2, architecture and runbook updated; filing written for the owner. Also a flaky spec-09 property test: its fixed template words (`npm run a`, `"preset"`) matched a generated name by chance; the fixed words can no longer be a generated name.

Verdict: READY, no defects. Notes acted on: the docs no longer claim the header never reaches the function (OAC signing may add it; the first `bodyHash` shows it); the test comment names both reasons a fixed word cannot collide.
