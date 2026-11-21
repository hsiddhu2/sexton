# Golden evidence pack

Spec: .kiro/specs/evidence-pack, Requirements 9.2 and 9.3. Built by `test/evidence/golden.test.ts`.

How the files were made:

- The eleven fixture packages of `test/fixtures/packages.json` scored against the recorded responses at the fixed clock `2026-11-12T00:00:00Z`.
- Scan metadata for `https://github.com/sexton-demo/fixture`, lockfile version 3, nothing capped, skipped or unresolved.
- Intake rows declared `^installed` in `dependencies`, locked, as the demo does. So no component has `scope` or the development property.
- The default policy. Policy digest, manifest digests and commit are null. No remediations. Remediation log null.

Checked by hand on 21 Nov 2026:

- The six Dead packages fail `forbid_state`, nothing else fails, so the policy result is fail.
- The packages table follows STATE_ORDER, then name: six Dead, lodash Haunted, express and moment Restless, react and semver Alive.
- semver shows provenance present with `https://slsa.dev/provenance/v1`, matching its recorded attestations.
- event-stream shows `hasInstallScript` unavailable with its reason, and its one Critical advisory listed.
- The SBOM has eleven components, sorted by name, each with a purl and `bom-ref` equal to it, and validates against the vendored CycloneDX 1.5 schema.
- `jq -cjS .body expected-pack.json | shasum -a 256` prints the same digest as `integrity.digest` (`7043f538…`), run with jq-1.7.1-apple.

The files embed `ENGINE_VERSION`, so a version bump changes both. Rewrite them with `SEXTON_WRITE_GOLDEN=1 npx vitest run test/evidence/golden.test.ts` and check the diff by hand.
