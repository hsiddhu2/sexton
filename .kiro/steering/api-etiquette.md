---
inclusion: fileMatch
fileMatchPattern: ["packages/engine/src/clients/**/*.ts", "packages/api/src/remediate/**/*.ts"]
---
# Upstream etiquette

Applies to every call to registry.npmjs.org (packuments and /-/npm/v1/attestations), api.osv.dev, api.deps.dev and raw.githubusercontent.com (no token, no cookies, HEAD or a 40 character commit SHA).

- api.github.com: token in the Authorization header only, no call without a token, no redirect followed. Reads: the head commit and the tree of a commit. Writes, only on a repository in the remediate allowlist: get the repository, list refs under heads/sexton/, list pull requests for one head, get package.json at a commit, create a sexton/ branch, put package.json on it, open a pull request, comment on it. No other request and no DELETE.
- Send User-Agent: sexton/<version> (+https://github.com/hsiddhu2/sexton) on every request.
- Check the cache before every fetch. Cache key is source, package, version. TTL 24 hours.
- On HTTP 429 or 503: exponential backoff from 500 ms with full jitter, at most 3 retries, then mark the signal unavailable with the status as reason.
- Never download a tarball. Install-script presence comes from the abbreviated packument with Accept: application/vnd.npm.install-v1+json.
- OSV querybatch returns IDs only. Fetch /v1/vulns/{id} for details. Follow next_page_token, at most 10 pages.
- Never log a full response body. Log target, status, latency and correlation ID.
