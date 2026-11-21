# Expected migration for the sample repository

Spec: .kiro/specs/migration-node-sass, Requirement 4.11, task 8.2. Checked by hand against the recorded data in `packages/` (recorded 21 Nov 2026 with `node scripts/record-fixtures.mjs --migration`) and the files in `node-sass-app/`.

## Inputs

- `node-sass-app/package.json`: devDependencies `node-sass` `^7.0.3`, `sass-loader` `^7.1.0`, `webpack` `^4.47.0`; dependencies `lodash` `^4.17.21`; scripts `build` (webpack), `build:css` (`node-sass src/styles -o dist/css`), `test`. The test treats each declared range's lowest version as installed, so sass-loader is installed at 7.1.0.
- Files: `package.json`, `scripts/compile.js`, `src/styles/app.scss`, `src/styles/theme.scss`, `node_modules/ignored/x.scss`.

## Data

- sass: 335 versions, 319 releases, one deprecated (1.26.12, not among the newest 20), no advisory for any release. The newest release is 1.108.2. It is the first sass candidate (descending order), not deprecated, no advisory, so it passes.
- sass-loader: 117 versions, 115 releases, one deprecated (3.2.2), no advisory. Installed 7.1.0 is below the minimum 7.2.0, so a raise is needed. Candidates are releases at or above 7.2.0 and above 7.1.0, ascending: 7.2.0, 7.3.0, 7.3.1, 8.0.0, ... The first, 7.2.0, is not deprecated and has no advisory, so it is chosen. The declared range `^7.1.0` is caret style, so the new range is `^7.2.0`.

## Edits (3)

1. `{ op: "remove-dependency", section: "devDependencies", name: "node-sass" }`
2. `{ op: "add-dependency", section: "devDependencies", name: "sass", range: "^1.108.2" }` (sass is not listed, caret range)
3. `{ op: "set-range", section: "devDependencies", name: "sass-loader", range: "^7.2.0" }`

All with `path: "package.json"`. `filesChanged`: `["package.json"]`.

## Review sites (4), in order

1. `package.json`, line null, `node-sass-script`, excerpt `build:css` (the only script whose command contains `node-sass`; `build` runs webpack).
2. `scripts/compile.js:3`, `legacy-render`: the file contains `require("node-sass")`; line 3 has `sass.render(`. Line 1 (`require`) has no `.render(`.
3. `scripts/compile.js:8`, `legacy-render`: line 8 has `sass.renderSync(`.
4. `src/styles/app.scss:3`, `deep-combinator`: `.card /deep/ .title {`.

`src/styles/theme.scss` has no `/deep/`. `node_modules/ignored/x.scss` has `/deep/` but sits under an Ignored directory, so it is never listed or read.

## Scan counts

`{ performed: true, listed: 4, read: 3, skipped: 0, capped: false }`: four paths listed (node_modules dropped, not counted as skipped), three Style or Script files read (package.json is not a Style or Script file).

## Notes

`["sass-loader was raised, check that your webpack version is supported by the new sass-loader"]`.

## Requests

One packument and one querybatch for sass (20 candidates), one packument and one querybatch for sass-loader (20 candidates), no advisory detail: 4 requests.

## Intent

Branch `sexton/migrate-node-sass`, title `Sexton: migrate node-sass to sass`, `files` the three Edits, four review comments.
