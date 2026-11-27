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

## Characters and art

The characters (the zombie, the skeleton, the hand, the priest), the costumes, the ghost, the church, the tree and the bats are original vector art, drawn in code in `packages/web/src/scene`. No third-party model, image or sprite is used.

## Sound

The site plays no generated sound. It ships one recorded music track, `packages/web/public/music/ghost-party.mp3`, which plays only after the visitor presses Music. Its credit, as its licence asks:

Ghost Party by The Piano Says | https://soundcloud.com/thepianosays

Royalty Free Music by https://www.free-stock-music.com

Creative Commons / Attribution 3.0 Unported License (CC BY 3.0)

https://creativecommons.org/licenses/by/3.0/deed.en_US

The SIL Open Font License, Version 1.1: https://openfontlicense.org/
