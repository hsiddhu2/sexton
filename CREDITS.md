# Credits

## Fonts

The web app serves these fonts from its own origin, under `packages/web/public/fonts`. Each is under the SIL Open Font License, Version 1.1, and its licence file sits beside it.

| Family | Use | Source | Licence file |
|---|---|---|---|
| Inter 5.3.0 (variable, Latin) | the interface and the grave name labels | https://www.npmjs.com/package/@fontsource-variable/inter, file `files/inter-latin-wght-normal.woff2`, upstream https://github.com/rsms/inter | `OFL-inter.txt` |
| Cormorant Garamond 5.3.0 (600, Latin) | the wordmark and headlines | https://www.npmjs.com/package/@fontsource/cormorant-garamond, file `files/cormorant-garamond-latin-600-normal.woff2`, upstream https://github.com/CatharsisFonts/Cormorant | `OFL-cormorantgaramond.txt` |

The files are copied unchanged from the published Fontsource packages at version 5.3.0, renamed `inter-variable.woff2` and `cormorant-garamond-600.woff2`. No package is added as a dependency.

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
## Characters and art

The characters (the zombie, the skeleton, the hand, the priest), the costumes, the ghost, the church, the tree and the bats are original vector art, drawn in code in `packages/web/src/scene`. No third-party model, image or sprite is used.

## Sound

The site plays no generated sound. It ships one recorded music track, `packages/web/public/music/ghost-party.mp3`, which plays only after the visitor presses Music. Its credit, as its licence asks:

Ghost Party by The Piano Says | https://soundcloud.com/thepianosays

Royalty Free Music by https://www.free-stock-music.com

Creative Commons / Attribution 3.0 Unported License (CC BY 3.0)

https://creativecommons.org/licenses/by/3.0/deed.en_US

The SIL Open Font License, Version 1.1: https://openfontlicense.org/
