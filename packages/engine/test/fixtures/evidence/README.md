# Golden evidence pack

Spec: .kiro/specs/evidence-pack, Requirements 9.2 and 9.3. Built by `test/evidence/golden.test.ts`.

How the files were made:

- The eleven fixture packages of `test/fixtures/packages.json` scored against the recorded responses at the fixed clock `2026-11-12T00:00:00Z`.
- Scan metadata for `https://github.com/sexton-demo/fixture`, lockfile version 3, nothing capped, skipped or unresolved.
- Intake rows declared `^installed` in `dependencies`, locked, as the demo does. So no component has `scope` or the development property.
- The default policy. Policy digest, manifest digests and commit are null. No remediations. Remediation log null.

Checked by hand on 21 Nov 2026:

- The five Dead packages fail `forbid_state`, nothing else fails, so the policy result is fail.
- The packages table follows STATE_ORDER, then name: five Dead, lodash Haunted, colors, express and moment Restless, react and semver Alive.
- semver shows provenance present with `https://slsa.dev/provenance/v1`, matching its recorded attestations.
- event-stream shows `hasInstallScript` unavailable with its reason, and its one Critical advisory listed.
- The SBOM has eleven components, sorted by name, each with a purl and `bom-ref` equal to it, and validates against the vendored CycloneDX 1.5 schema.
- `jq -cjS .body expected-pack.json | shasum -a 256` prints the same digest as `integrity.digest` (`d797b6ec…`), run with jq-1.7.1-apple.

Regenerated on 25 Nov 2026 for spec new-signals (engine 0.2.0): each package gains the publisherChange and newDependency rows. Every recorded publisher is the same as on its Earlier version; node-sass 7.0.3 adds npmlog and request, both old and without an install script; event-stream has no Earlier version. No state changed. The digest is now `212bb42b…`, checked the same way with jq.

The files embed `ENGINE_VERSION`, so a version bump changes both. Rewrite them with `SEXTON_WRITE_GOLDEN=1 npx vitest run test/evidence/golden.test.ts` and check the diff by hand.
