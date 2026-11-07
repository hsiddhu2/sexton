---
inclusion: fileMatch
fileMatchPattern: "packages/engine/src/clients/**/*.ts"
---
# Upstream etiquette

Applies to every call to registry.npmjs.org, api.osv.dev, api.deps.dev, api.npmjs.org and api.scorecard.dev.

- Send User-Agent: sexton/<version> (+https://github.com/hsiddhu2/sexton) on every request.
- Check the cache before every fetch. Cache key is source, package, version. TTL 24 hours.
- On HTTP 429 or 503: exponential backoff from 500 ms with full jitter, at most 3 retries, then mark the signal unavailable with the status as reason.
- Never download a tarball. Install-script presence comes from the abbreviated packument with Accept: application/vnd.npm.install-v1+json.
- OSV querybatch returns IDs only. Fetch /v1/vulns/{id} for details. Follow next_page_token.
- npm downloads bulk endpoint takes at most 128 packages and no scoped packages.
- Never log a full response body. Log target, status, latency and correlation ID.
