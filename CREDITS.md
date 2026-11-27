# Credits

## Fonts

The web app serves these fonts from its own origin, under `packages/web/public/fonts`. Each is under the SIL Open Font License, Version 1.1, and its licence file sits beside it.

| Family | Use | Source | Licence file |
|---|---|---|---|
| Pirata One | the Sexton wordmark | https://fonts.google.com/specimen/Pirata+One | `OFL-pirataone.txt` |
| IM Fell English SC | grave names | https://fonts.google.com/specimen/IM+Fell+English+SC | `OFL-imfellenglishsc.txt` |
| IM Fell English (italic) | epitaphs | https://fonts.google.com/specimen/IM+Fell+English | `OFL-imfellenglish.txt` |
| Instrument Sans | the interface | https://fonts.google.com/specimen/Instrument+Sans | `OFL-instrumentsans.txt` |

The files are the Latin subsets that Google Fonts serves, unchanged. Pirata One's licence reserves the font name "Pirata", so the font is used under its own name and is not modified here.

## Vendored files

The tests validate the CycloneDX SBOM against the published schemas, kept unchanged in `packages/engine/test/fixtures/cyclonedx`. They are used only by tests and never shipped.

| Files | Source | Licence |
|---|---|---|
| `bom-1.5.schema.json`, `spdx.schema.json`, `jsf-0.82.schema.json` | https://github.com/CycloneDX/specification, folder `schema`, downloaded 21 November 2026 | Apache License 2.0. The repository has no NOTICE file. |

## Third-party code in the Power's Bundle
`powers/sexton/server/sexton-mcp.mjs` is one file built by `scripts/build-power.mjs`. It contains the code of these packages, unmodified, so the Power installs with no `node_modules`. Each is under a permissive licence that allows redistribution with its notice. The notices are in the packages' own files at the versions in `package-lock.json`; the Bundle is rebuilt from those exact versions and a test fails if it is not.
| Package | Version | Licence | Source |
|---|---|---|---|
| @modelcontextprotocol/server, @modelcontextprotocol/core | 2.4.0 | Apache License 2.0 | https://github.com/modelcontextprotocol/typescript-sdk |
| zod (a dependency of the MCP library) | 4.6.7 | MIT | https://github.com/colinhacks/zod |
| ajv | 8.20.0 | MIT | https://github.com/ajv-validator/ajv |
| semver | 7.8.6 | ISC | https://github.com/npm/node-semver |
| yaml | 2.9.1 | ISC | https://github.com/eemeli/yaml |
| fast-uri | 3.1.9 | BSD-3-Clause | https://github.com/fastify/fast-uri |
| fast-deep-equal | 3.1.3 | MIT | https://github.com/epoberezkin/fast-deep-equal |
| json-schema-traverse | 1.0.0 | MIT | https://github.com/epoberezkin/json-schema-traverse |

The Bundle also contains Sexton's own Engine, CLI composition and MCP server (Apache License 2.0, see `LICENSE`). esbuild builds it and is not part of it. The Power's tool results carry package metadata from the npm registry, OSV and deps.dev at run time; none of it is stored in the repository.

The npm packages `sexton` and `sexton-mcp` (spec release) are built with the same esbuild options. Each carries a `THIRD-PARTY-NOTICES.md` with the licence text of every package in its file, copied from the package at build time; `sexton` holds ajv, semver, yaml and the three ajv dependencies, and `sexton-mcp` holds the same packages as the Power's Bundle.

## Characters and art

The characters (the zombie, the skeleton, the hand, the priest), the costumes, the ghost, the church, the tree and the bats are original vector art, drawn in code in `packages/web/src/scene`. No third-party model, image or sprite is used.

## Sound

Every sound is generated in code with the Web Audio API, from oscillators and from noise made from a fixed seed, in `packages/web/src/sound`. No audio file and no third-party sound is used. Sound is off by default.

The SIL Open Font License, Version 1.1: https://openfontlicense.org/
