# Reviews: spec 10b hosted-plans

Each review was run by an independent reviewer that had not seen the implementation, with the spec folder, the diff against main, docs/requirements.md, the handoff and the steering files.

## Review 1: spec (requirements, design, tasks), 21 Nov 2026

Verdict: NOT READY, 3 defects, all fixed before the spec commit.

1. A capped tree made the GitHub File source reject, which contradicted handoff decision 8 ("a capped tree is reported through a counts method like the working-tree source"). Fixed: the source lists the paths of the first 20000 raw entries and `counts()` reports capped; Requirement 3.2 and design decision 1. The edge case where a tree capped mostly by ignored directories shows capped false is recorded for HP.
2. Property 52 claimed to prove Requirement 4.5, which it does not cover. Fixed: 4.5 is proven by Property 53; traceability updated.
3. Property 57 included manifest and policy reads among "failing raw reads", which give 502 or 422 by design, and planStage had no seam through which a step could throw. Fixed: the property covers File-source reads with the manifest and policy reads succeeding; planStage takes injectable steps and a File-source thunk, every step is guarded, and scan.ts wraps the call.

Notes acted on: the superseded infra Requirement 9.6 and its two tests named (Requirement 8.7); `DataRefs` gains the secret; the cdk diff stop rule restated in 8.4 and task 8.1; the runbook notes the new export; a 15 second read budget on the File source (Requirement 3.7, decision 8), because the measurement did not cover the node-sass path; the tree read under an 8 MiB text cap; Property 52 checks the header in any letter case and that the token is in no other header, URL or body; Property 54 also refuses `HEAD` for the tree and file builders; tasks carry the licence check, `scan:self`, the describe-secret rule and the report items; the introduction says R-RM-3 is not met on the hosted path; EARS wording for 8.6 and 9.x; top-level requirement lines on every task; test tokens built at run time; the shared rate budget, a private sexton-demo and the raw path log lines in the threat model and design Security.

## Review 1b: spec re-review

Verdict: NOT READY, 1 defect: the interface comment on `listFiles` still described the old reject-on-capped behaviour. Fixed. Notes fixed: traceability ranges 3.7 and 8.7, criteria 3.6 and 3.7 in order, the budget does not abort a read already running (accepted and recorded in decision 8), Property 56 uses a fixed clock. Treated as READY after the one-line fix.

## Review 2: implementation (engine, api, infra, web, steering, docs), 21 Nov 2026

Verdict: READY, no defects. Checked: the token travels only as the Authorization header of the two api.github.com GETs, never in ClientContext, a URL, an error, a failure value, a cache key or value, or a log line; both authenticated requests set `redirect: "manual"` and any non-200 is a failure; HEAD cache keys unchanged; head commit, tree, raw and plan-step failures still give 200; the 25 cap in report order; importSites always empty; the provider validates, caches null too and shares one read; one IAM statement on the exact secret ARN for the scan role only, the variable on the scan function only, data-stack.ts untouched; Properties 52 to 54 at 1000 runs; no change under .kiro/hooks, agents or settings.

Notes acted on:
1. No hosted test reached the File source, because the sass packument answered 404 and the recipe stopped before reading files. Fixed: a hosted case declares node-sass and sass, and asserts one tree read with the token and `redirect: "manual"`, one raw read at the commit without it, and a proposed migrate plan; with no token, neither read happens. The scan-level properties include that case.
2. Property 52 at client level added to the engine tests, 1000 runs.
8. A stray `scan.json` from the express timing run removed.

Notes kept: Property 59 at 100 runs (the spec names 52 to 54 as the security properties; 59 checks input shape and its outcome is null either way); the cap test checks the gathered list, and `planRemediation`'s "bump data was not gathered" for later targets is covered by the remediation spec's tests; an injected `deps.intake` (tests only) ignores the ref; a commit that resolves but whose pinned manifest read fails answers the intake error with no HEAD fallback, as the spec says; a secret with a trailing newline gives no token, which smoke check 13 shows as commit null; the README sentence becomes true at the merge; the 3xx body is not consumed (design Security).
