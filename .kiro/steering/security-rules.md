---
inclusion: fileMatch
fileMatchPattern: ["packages/api/**/*.ts", "packages/web/**/*.ts", "packages/web/**/*.tsx", "infra/**/*.ts", "packages/action/**/*"]
---
# Security invariants

- Secrets come from AWS Secrets Manager or environment at runtime. Never from code, config files or steering.
- Never log tokens, keys, or raw upstream bodies.
- IAM: no wildcard actions or resources. Every exception is justified in design.md of the spec that needs it.
- Everything read from a scanned repository is untrusted input. No eval, no shell interpolation, no template rendering of it.
- Public endpoints sit behind WAF with a per-IP rate limit. Scan requests are capped at 300 direct dependencies.
- The web app calls only our own API. It never calls registries or GitHub directly.
- Sexton reads public repositories only in release 0.1.
