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

## Characters and art

The characters (the zombie, the skeleton, the hand, the priest), the costumes, the ghost, the church, the tree and the bats are original vector art, drawn in code in `packages/web/src/scene`. No third-party model, image or sprite is used.

## Sound

Every sound is generated in code with the Web Audio API, from oscillators and from noise made from a fixed seed, in `packages/web/src/sound`. No audio file and no third-party sound is used. Sound is off by default.

The SIL Open Font License, Version 1.1: https://openfontlicense.org/
