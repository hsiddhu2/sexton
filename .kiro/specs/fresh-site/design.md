# fresh-site Bugfix Design
## Overview
The hosted site sends no `Cache-Control` header on any web file. Browsers then cache `index.html` and the demo and replay data for a heuristic lifetime and use the old copy after a deploy without asking. Deploy 4 showed both failures: the old application, and the new application with the old `demo/scan.json`, which failed the format check.
The fix sets the header at CloudFront. Two new response headers policies replace the existing one on the web behaviours only:
- `WebHeaders` on the default behaviour: the existing security headers, plus `Cache-Control: no-cache` with origin override.
- `AssetHeaders` on a new `/assets/*` behaviour: the existing security headers, plus `Cache-Control: public, max-age=31536000, immutable` with origin override.
The API behaviours keep `SecurityHeaders` as it is. A second guard in the web loader fetches a static `.json` scan once more with `cache: "reload"` when the first copy fails the format check. A check script prints the live headers, and the runbook runs it as a smoke check.
## Glossary
- **Hashed file**: a file the web build writes under `assets/`. The bundler names it `[name]-[hash][extname]` by default, so a change of content gives a new name.
- **Unhashed file**: every other file in the web build: `index.html` and the files under `demo/`, `replay/` and `fonts/`. Its name stays the same when its content changes.
- **Fallback path**: a path the bucket does not hold. CloudFront answers it with `/index.html` and 200 through the 403 and 404 custom error responses.
- **Heuristic lifetime**: the freshness lifetime a browser picks for a response that has no explicit expiry. RFC 9111 section 4.2.2 allows it and suggests no more than 10% of the time since `Last-Modified`.
- **Static scan address**: any loader address whose URL path ends in `.json`, on any origin the loader accepts: `/demo/scan.json`, `/replay/<id>.json`, or a `?scan=` file. `/api/scan` is not one.
- **WEB_CACHE_CONTROL**: `"no-cache"`. **ASSET_CACHE_CONTROL**: `"public, max-age=31536000, immutable"`. Both live in `infra/lib/web-cache-headers.ts`, the single source for the stack, the tests and the check script.
## Bug Details
### Bug Condition
```
FUNCTION isBugCondition(X)
  INPUT: X of type (path: string, browserCopy: { body, lastModified, storedAt } | none, now: Date)
  OUTPUT: boolean
  RETURN NOT X.path STARTS WITH "/assets/"
         AND NOT X.path STARTS WITH "/api/"
         AND X.browserCopy IS NOT none
         AND X.browserCopy.body IS NOT the body the site serves now
         AND responseCacheControl(X.path) IS absent
         AND X.now - X.browserCopy.storedAt < heuristicLifetime(X.browserCopy)
END FUNCTION
```
On the current stack `responseCacheControl` is absent for every web path, so the condition reduces to: a stale browser copy of an unhashed file, still inside its heuristic lifetime. After the fix `responseCacheControl` is `no-cache` for every such path, so the browser must revalidate and the condition is false.
### Examples
- Deploy 4, 26 Nov 2026: `GET /` from a browser that opened the site on 22 to 25 Nov. Expected: the new `index.html` with `index-rdKLS1Oq.js`. Actual: the cached page with `index-tDpRQ5lZ.js`, `transferSize` 0.
- Same browser, `/?fresh=1`: the new bundle loads, then `GET /demo/scan.json` returns the cached body without `newDependency` and `publisherChange`. Expected: the new body. Actual: "Scan could not be loaded".
- Not a bug: `GET /assets/index-rdKLS1Oq.js`. A new build gives a new name, so a cached copy is never stale. After the fix it is cached for a year without revalidation.
- Not a bug: `GET /api/scan?...`. CachingDisabled at CloudFront; the browser behaviour is unchanged by this spec.
- Edge: `GET /no-such-page`. CloudFront answers with `/index.html` through the custom error response. Whether the response headers policy applies to that response is not stated in the AWS documentation; the cache header check prints it on deploy 5 (see Decision 4).
## Expected Behavior
### Preservation Requirements
**Unchanged Behaviors:**
- The API behaviours `/api/remediate` and `/api/*`: same `SecurityHeaders` policy, CachingDisabled, same origin request policies.
- The five security headers on every behaviour, with the same values and origin override.
- CachingOptimized on the web behaviours, one S3 origin with one origin access control, the bucket deployment invalidating `/*`.
- The 403 and 404 custom error responses to `/index.html`, 200, error caching 0.
- The Data stack, `GithubTokenSecret`, every IAM role and policy, the bucket policy, the WAF web ACL.
- The loader's results and fetch options for every case except a static scan address whose first response fails the format check.
**Scope:**
Only response headers change for web paths, and only one loader case gains a second fetch. Nothing changes in what CloudFront caches or for how long, because a `Cache-Control` header added by a response headers policy reaches the viewer only.
## Hypothesized Root Cause
1. **No header anywhere**: the response headers policy sets security headers only, and the bucket deployment sets no `cacheControl`. S3 returns no `Cache-Control` for an object stored without one. Confirmed on deploy 4: the responses for `/` and `/demo/scan.json` had `last-modified` and `etag` and no `cache-control`.
2. **Unhashed names for changing data**: `demo/scan.json` and `replay/*.json` keep their names across builds while their format changes with the engine, so a cached copy can be of an older format than the bundle that reads it.
3. **The loader trusts the first copy**: `loadScan` shows `invalid-response` at once. For a static file a second fetch that bypasses the browser cache gets the site's current copy.
## Correctness Properties
Property 1: Bug Condition - Unhashed web paths are sent no-cache
_For any_ path that does not start with `/api/` or `/assets/`, the behaviour that CloudFront selects for it in the synthesised Edge template (path patterns in template order, then the default) SHALL carry a response headers policy whose only custom header is `Cache-Control` with the value `no-cache` and origin override true.
**Validates: Requirements 2.1, 2.3**
Property 2: Fix Checking - Hashed assets are sent immutable
_For any_ path that starts with `/assets/`, the selected behaviour SHALL be the `/assets/*` behaviour, with the S3 origin, CachingOptimized, redirect to HTTPS, compression, and a response headers policy whose only custom header is `Cache-Control` with the value `public, max-age=31536000, immutable` and origin override true.
**Validates: Requirements 2.2**
Property 3: Preservation - API behaviours unchanged
_For any_ path that starts with `/api/`, the selected behaviour SHALL be `/api/remediate` or `/api/*` exactly as before, with the `SecurityHeaders` policy, no custom header, and CachingDisabled.
**Validates: Requirements 3.1**
Property 4: Preservation - Security headers on every behaviour
_For every_ behaviour in the Edge template, the attached response headers policy SHALL have a `SecurityHeadersConfig` equal to the existing one, and no CORS configuration.
**Validates: Requirements 3.2**
Property 5: Fix Checking - One reload fetch for a stale static scan
_For any_ static scan address and any second response, when the first response fails the format check, `loadScan` SHALL call `fetchFn` exactly twice, the second call SHALL carry `cache: "reload"` and otherwise the same URL and options as the first, and the result SHALL equal what a single fetch of the second response would give.
**Validates: Requirements 2.4**
Property 6: Preservation - Every other load is one fetch with the old result
_For any_ address and first response where the address is not a static scan address or the first response does not fail the format check, `loadScan` SHALL call `fetchFn` exactly once, without a `cache` option, and SHALL return the same result as before the fix.
**Validates: Requirements 2.5, 3.6**
Property 7: Fix Checking - The check verdict is exact
_For any_ checked path other than the fallback path and any header value, the check script's verdict SHALL be PASS exactly when the value, trimmed and with its directives compared case-insensitively in order, equals the expected value for that path, and the expected value SHALL be `WEB_CACHE_CONTROL` for every path outside `/assets/` and `ASSET_CACHE_CONTROL` inside it. The fallback path's verdict SHALL be INFO for any header value, and the exit status SHALL be 1 exactly when at least one other verdict is FAIL.
**Validates: Requirements 2.7**
## Fix Implementation
### Decision 1: how the headers are set
Chosen: CloudFront response headers policies, not the bucket deployment's `cacheControl`, and not both.
- A response headers policy can add `Cache-Control` to control browser caching. CloudFront modifies the headers in responses it serves from the cache and in the ones it forwards from the origin. A `Cache-Control` added this way reaches the viewer response only and does not affect how CloudFront caches the object. https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/modifying-response-headers.html
- With origin override true, CloudFront sends the policy's header and ignores the origin's; without a header from the origin it adds the policy's in either case. https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/understanding-response-headers-policies.html (section Custom headers)
- The bucket deployment's `cacheControl` would need two deployments on one bucket, split by include and exclude filters, each with its own pruning, and would rewrite the metadata of every object. https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_s3_deployment-readme.html (sections Prune, Objects metadata)
- Why the policies win: one place in the stack, no change to the bucket deployment or its role, it applies to every copy CloudFront already holds the moment the distribution update completes, and it covers the response headers whoever uploads the files. The cost is that CloudFront's own cache lifetime does not follow the header (Decision 2), which does not matter here because each web deploy invalidates `/*`.
### Decision 2: what CloudFront itself caches
- The web behaviours use the managed CachingOptimized policy: minimum TTL 1 second, default TTL 86,400 seconds (24 hours), maximum TTL 31,536,000 seconds. With a minimum TTL above 0, CloudFront caches for at least the minimum even when the origin sends `no-cache`. https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/using-managed-cache-policies.html (section CachingOptimized)
- When the origin sends no `Cache-Control: max-age`, CloudFront caches for the default TTL; browser caching then depends on the browser. https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/Expiration.html
- S3 objects carry no `Cache-Control`, so CloudFront keeps each web file for 24 hours at most, and the response headers policy does not change that.
- The bucket deployment invalidates `distributionPaths: ["/*"]` after it copies the files. https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_s3_deployment-readme.html (section CloudFront Invalidation). Deploy 4 confirmed it: the first requests after the deploy were `x-cache: Miss from cloudfront` with the new `last-modified`.
- So after a web deploy CloudFront serves the new files at once, and with this fix the browser revalidates every unhashed file against CloudFront. A deploy that changes only the distribution does not invalidate, which is fine because the files did not change and the new headers apply to cached responses too.
### Decision 3: values
- `no-cache` lets the browser store the response but requires validation with the origin before each reuse. RFC 9111 section 5.2.2.4: https://www.rfc-editor.org/rfc/rfc9111#section-5.2.2.4. CloudFront and S3 answer conditional requests with 304 using the `ETag` and `Last-Modified` S3 already returns, so a reload costs a round trip, not a download.
- `public, max-age=31536000, immutable` for hashed files: one year, and `immutable` tells the browser not to revalidate on reload. RFC 8246: https://www.rfc-editor.org/rfc/rfc8246. The bundler hashes every file it writes to `assets/` by default: https://vite.dev/config/build-options#build-assetsdir and https://rollupjs.org/configuration-options/#output-assetfilenames.
- Files under `fonts/` are unhashed and get `no-cache`: four `.woff2` fonts and four `OFL-*.txt` licences. They revalidate with 304.
### Decision 4: the fallback path
The AWS documentation does not say whether a response headers policy applies to a custom error response. The cache header check requests `/sexton-cache-check-fallback` on deploy 5 and prints its header as INFO, outside the exit status, so a missing header cannot fail smoke check 20. If it is absent, the fallback page is cached heuristically, which affects only unknown paths; the result goes in this section after deploy 5, and no further change is made in this spec. The infra tests can show only that such a path selects the default behaviour, not the header CloudFront puts on the error response. The check also requests `/assets/sexton-cache-check-missing.js` as a second INFO line: a missing hashed file falls back on the `/assets/*` behaviour, where the header, if applied, is the immutable one (see "Known behaviour to remember" in the runbook).
Result on deploy 5 (26 Nov 2026, 16:14 UTC): both INFO lines were `200` with `cache-control: no-cache`, for `/sexton-cache-check-fallback` and for `/assets/sexton-cache-check-missing.js`. On deploy 5 the `index.html` fallback was sent `no-cache` on both behaviours, so a browser revalidates it, and it was not sent as immutable under a missing `/assets/` name. No change follows.
### Decision 5: the loader guard
- In scope because it changes `packages/web/src/load/load-scan.ts` only, and lane 1 is working on other files in `packages/web/src`. No other file under `packages/web/src` changes.
- `run` already returns `invalid-response` as a distinct result. `loadScan` calls `run` once; when the result is `invalid-response` and `new URL(url).pathname` ends in `.json`, it calls `run` once more with `cache: "reload"` added to the fetch options and returns that result. `cache: "reload"` makes the browser fetch from the network and update its cache: https://developer.mozilla.org/en-US/docs/Web/API/Request/cache.
- The second fetch uses the same signal, so an abort cancels it, and the same size limit. The address is not shown in any error, as before.
- Why only `.json`: `/api/scan` runs a scan and counts against the WAF rate rule, so it is never fetched twice, and an API answer is never cached by CloudFront or by the browser in a way this guard could fix.
### Changes Required
**File**: `infra/lib/web-cache-headers.ts` (new)
1. Export `WEB_CACHE_CONTROL = "no-cache"`, `ASSET_CACHE_CONTROL = "public, max-age=31536000, immutable"`, `ASSET_PATH_PATTERN = "/assets/*"`, and `expectedCacheControl(path)` that returns the asset value for paths starting with `/assets/` and the web value otherwise.
**File**: `infra/lib/edge-stack.ts`
1. Build the security headers behaviour object once and use it in three policies: `SecurityHeaders` (unchanged logical ID and content), `WebHeaders` and `AssetHeaders`, the last two with one custom header each.
2. Create the S3 origin once and use it for the default behaviour and the new `/assets/*` behaviour, so the template keeps one S3 origin and one S3 origin access control.
3. Default behaviour: `responseHeadersPolicy: webHeaders`. New additional behaviour `/assets/*`, placed after `/api/*`: the S3 origin, redirect to HTTPS, CachingOptimized, `assetHeaders`, compression. The API behaviours keep `headers`.
**File**: `infra/scripts/check-cache-headers.ts` (new), run with `npx tsx infra/scripts/check-cache-headers.ts <domain>`
1. Pure exports: `findHashedAsset(html)` returns the first `/assets/...` script path in `index.html`; `checkPaths(asset)` returns `/`, `/index.html`, `/demo/scan.json`, `/replay/axios.json`, the asset and `/sexton-cache-check-fallback`; `verdict(path, header)` returns PASS or FAIL against `expectedCacheControl`, and INFO for the fallback path; `exitStatus(verdicts)` is 1 when any verdict is FAIL, else 0.
2. `main` fetches each path with GET over HTTPS, prints path, status, header and the verdict, and exits with `exitStatus`. No credentials, no secrets, read-only. `main` runs only when the file is the entry point (`import.meta.url === pathToFileURL(process.argv[1]).href`), so importing the module in a test makes no request. No test calls `main`.
3. `infra/tsconfig.json` includes `scripts`, so the infra `pretest` type check (`tsc -p infra/tsconfig.json`) covers it; the root `tsc -b` does not reference infra. Lint covers `infra/**/*.ts`.
**File**: `packages/web/src/load/load-scan.ts`
1. `run` takes an optional `cache` value and passes it to `fetchFn` only when set. `loadScan` adds the one retry described in Decision 5.
**File**: `build/infra/10-deploy.md`
1. Smoke check 20 runs the cache header check. Pass: exit 0, every checked line PASS, and the INFO line for the fallback path recorded.
2. The Edge resource table lists the two new policies and the `/assets/*` behaviour; the resource count line is updated from the synth.
**File**: `docs/architecture.md`
1. One paragraph on browser caching: unhashed files `no-cache`, hashed files immutable, CloudFront TTL and invalidation as in Decision 2.
### IAM and resources
- IAM: none. No role, policy or statement is added or changed. The bucket deployment, its role and the bucket policy are untouched.
- New resources: two `AWS::CloudFront::ResponseHeadersPolicy` (`WebHeaders`, `AssetHeaders`). The account holds one custom response headers policy today (checked 26 Nov 2026 with `list-response-headers-policies --type custom`), so it will hold three of the default quota of 20, and each new policy has one of the 10 custom headers allowed. https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/cloudfront-limits.html (General quotas on policies)
- Changed: `AWS::CloudFront::Distribution` in place: the default behaviour's `ResponseHeadersPolicyId`, and one more entry in `CacheBehaviors`. 4 cache behaviours stay far below the quota of 75.
- Unchanged: the Data stack and `GithubTokenSecret`, every Lambda, the bucket, the bucket deployment, the WAF web ACL, `SecurityHeaders`.
- Expected `cdk diff`: SextonData-dev no differences. SextonEdge-dev: `[+]` two response headers policies, `[~]` the distribution's `DistributionConfig`. Any other line stops the deploy.
## Testing Strategy
### Validation Approach
First show the bug on the unfixed stack and loader with exploration tests, then write the preservation tests and run them on the unfixed code, then apply the fix and run everything. No test uses the network or AWS.
### Exploratory Bug Condition Checking
**Goal**: show that no behaviour sends `Cache-Control`, and that the loader shows `invalid-response` without a second fetch.
**Test Cases**:
1. **Default behaviour**: its response headers policy has a `Cache-Control` custom header `no-cache` (will fail on unfixed code: there is no custom header)
2. **Assets behaviour**: a `/assets/*` behaviour exists with the immutable header (will fail: there is none)
3. **Loader**: `loadScan("https://x.example/demo/scan.json")` with a first response missing required fields and a second valid one gives ok after two fetches (will fail: one fetch, `invalid-response`)
**Expected Counterexamples**: the default behaviour's policy is `SecurityHeaders` with no `CustomHeadersConfig`; `loadScan` returns `invalid-response` after one call.
### Fix Checking
```
FOR ALL path WHERE NOT startsWith(path, "/api/") DO
  b := selectBehaviour(edgeTemplate, path)
  ASSERT cacheControlOf(policyOf(b)) = expectedCacheControl(path) AND override(policyOf(b)) = true
END FOR
FOR ALL (url, second) WHERE pathname(url) endsWith ".json" AND first fails the format check DO
  ASSERT calls(fetchFn) = 2 AND calls[1].init.cache = "reload" AND result = singleLoad(second)
END FOR
```
`selectBehaviour` is a test helper that applies CloudFront path pattern matching (`*` any sequence, `?` one character, case-sensitive, first match in template order, else the default) to the synthesised `CacheBehaviors`. https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/DownloadDistValuesCacheBehavior.html (section Path pattern)
### Preservation Checking
```
FOR ALL path WHERE startsWith(path, "/api/") DO
  ASSERT selectBehaviour(fixed, path) = selectBehaviour(original, path) AND policyOf(...) = SecurityHeaders
END FOR
FOR ALL (url, first) WHERE NOT (pathname(url) endsWith ".json" AND first fails the format check) DO
  ASSERT calls(fetchFn) = 1 AND calls[0].init.cache IS undefined AND result = original(url, first)
END FOR
```
### Unit Tests
- `infra/test/edge-stack.test.ts`, two existing assertions change and no other:
  - line 118, `expect(behaviours).toHaveLength(2)`, becomes 3, with a check that `behaviours[2]` is `/assets/*`;
  - the "adds the security headers to every behaviour" test changes from "every policy ID contains SecurityHeaders" to "every attached policy has the same SecurityHeadersConfig" (Property 4).
- `infra/test/cache-headers.test.ts` (new) holds every new infra case: the three policies and their custom headers (`SecurityHeaders` none, `WebHeaders` and `AssetHeaders` one each); the `/assets/*` behaviour with its settings and its order after `/api/*`; one S3 origin; three origin access controls in total as before; the error responses unchanged; the bucket deployment's `DistributionPaths`; one example per file group (`/`, `/index.html`, `/demo/scan.json`, `/replay/axios.json`, `/fonts/pirata-one-400.woff2`, `/assets/index-abc12345.js`, `/no-such-page`); Properties 1 to 4.
- `infra/test/iam.test.ts` and `infra/test/data-stack.test.ts`: unchanged and passing proves no IAM or Data change.
- `infra/test/nag.test.ts`: passes with no new acknowledgement.
- `infra/test/check-cache-headers.test.ts`, named after the script as the structure steering asks: `findHashedAsset`, `checkPaths`, `verdict` and `exitStatus` examples, including INFO for the fallback path, and Property 7.
- `packages/web/test/load-scan.test.ts`: Properties 5 and 6 and examples: demo and replay addresses, `/api/scan`, a valid first response, a 500, an over-size body, invalid JSON, an abort between the two fetches, a second response that also fails.
- `packages/web/test/asset-names.test.ts` (new): `packages/web/public` has no `assets` entry, and `vite.config.ts` sets none of `assetsDir`, `assetFileNames`, `entryFileNames`, `chunkFileNames` (Requirement 2.6).
### Property-Based Tests
- Properties 1 to 3 over generated paths: a prefix from `/`, `/demo/`, `/replay/`, `/fonts/`, `/assets/`, `/api/`, `/api/remediate`, `/apix`, `/asset`, `/Assets/`, followed by up to 40 characters from `[A-Za-z0-9._/-]`. `numRuns` 100.
- Property 4 is a check over the fixed set of behaviours, not generated.
- Properties 5 and 6 over generated addresses (static `.json` on the page origin, `/api/scan?repo=...`, paths without `.json`) and response kinds (valid, missing field, non-JSON, 404, 500, over-size, fetch rejects). `numRuns` 100.
- Property 7 over generated header strings, including the expected values with changed case and spacing. `numRuns` 100.
### Integration Tests
- Root `npm run typecheck`, `npm run lint`, `npm test`.
- `cdk synth --strict` with the web build, no warnings; the bundles load; `cdk diff` reported in full against the expectation above.
- After deploy 5 only, and only after the owner types deploy: the cache header check against the hosted site, and a browser that opened the site before deploy 5 loading it with a normal reload after a later web change.
## Owner decisions at go
26 Nov 2026: every call in this design is accepted, including the two limits (browser copies stored before deploy 5, and the unknown header on the fallback page). The loader change is the one retry in `load-scan.ts`; no other file under `packages/web/src` changes, because lane 1 is changing how views, addresses and error cards load and will merge main after this branch. No push and no deploy from the build.
## Review notes
Build review, 26 Nov 2026, independent: no defects. Notes applied: a second INFO path for a missing file under `/assets/` (Decision 4 risk), smoke check 20 runs from `$ROOT`, "the browser reuses them without asking" in the architecture page, fixed PASS and FAIL spellings in the check script test, the index status on a missing script, the `/assets/*` row in the runbook names its cache policy. Kept as is: Property 3 is checked by pattern, cache policy and headers policy, and the origin and origin request policy of the API behaviours by the existing examples in `edge-stack.test.ts`; `asset-names.test.ts` resolves from the package folder like `fonts.test.ts`, because `import.meta.url` is not a file URL under jsdom.
Spec review, 26 Nov 2026, by an independent reviewer who had not seen the spec being written. Five defects, all fixed before the spec commit:
1. The spec said no other existing infra assertion changes; `edge-stack.test.ts:118` asserts two cache behaviours and becomes three. Now in the Unit Tests and task 3.2.
2. Requirement 2.7 failed the check on any FAIL while Decision 4 accepts a missing header on the fallback path. The fallback line is now INFO and outside the exit status (2.7, Property 7, Decision 4, the check script, smoke check 20).
3. Importing the check script in a test could have fetched the hosted site. `main` now runs only when the file is the entry point.
4. The design and the tasks put the new infra cases in different files. All new infra cases are in `infra/test/cache-headers.test.ts`, each with a task.
5. Parent tasks 3 to 7 had no `_Requirements_` line. Added.
Notes applied: the type check of the script runs through the infra `pretest`, not the root `tsc -b`; the script's test is `check-cache-headers.test.ts`; a static scan address is any `.json` path on any accepted origin; `fonts/` holds four fonts and four licence files; `/no-such-page` in the infra tests shows the selected behaviour only. Confirmed by the reviewer: one `S3BucketOrigin` instance used twice binds once (one S3 origin access control, three in total), and no existing caller passes a `cache` option, so Property 6 holds on the current loader.
## Decisions made during implementation
1. `infra/test/helpers.ts` gains `pathMatches` and `policyConfigOf` next to `selectBehaviour`; `edge-stack.test.ts` uses `policyConfigOf` for the changed security headers assertion.
2. The infra path generators follow the Property-Based Tests list above, plus fixed `/`, `/index.html` and one hashed asset so each group appears in every run.
3. The check script prints the status but its verdict depends on the header only (Property 7). A bad or missing domain argument prints the usage line and exits 2. Requests use `cache: "no-store"`.
4. In the loader, a URL that `new URL` cannot parse is treated as not static, so it is never fetched twice. It cannot happen after `checkScanUrl`.
5. The runbook resource count line was stale (4 and 37). It now gives this synth: 5 resources in Data and 48 in Edge, with 4 Lambda functions.
6. The `cdk diff` also changes the bucket deployment's `SourceObjectKeys`, because the loader change gives a new web bundle. The Lambda code keys do not change.
7. After the build review: the check script also requests `/assets/sexton-cache-check-missing.js` and reports it as INFO, because a missing hashed file falls back to `index.html` on the `/assets/*` behaviour and may carry the immutable header (Decision 4). The runbook records this under "Known behaviour to remember". When the index fetch has no script, the script prints its status.
## Note for lane 3
`.kiro/steering/structure.md` describes `infra` without a `scripts` folder. This lane does not edit steering; lane 3 can add one line for `infra/scripts` (runbook scripts, run with tsx, not deployed).
