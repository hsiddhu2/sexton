# Requirements Document

## Introduction

The cemetery-theme module restyles the Sexton Web app (`packages/web`) as a night scene and makes two small fixes. It builds on the cemetery-ui spec and changes no logic of triage, contract validation, loading, selection or policy.

Part A is a visual theme. The canvas gains a dark sky gradient, a moon, a horizon line, a ground band with a gradient, and a faint fog layer. Graves become at least twice the current size (the Cell goes from 96 by 112 to 192 by 224 CSS pixels) and carry the inscription on a plinth that is part of the stone. Ghosts drift smoothly and slowly unless Reduced motion applies. The header and the drawer are restyled to match. The app is night-only: the scene, header and drawer use one Night palette under both values of `prefers-color-scheme`. Everything that encodes meaning stays as cemetery-ui defined it: grave shape by State, grave colour by State, a Ghost if and only if advisories exist, no continuous encoding, the triage order and the keyboard Overlay.

Part B makes `parseApiBase` accept a same-origin path such as `/api`, makes `checkScanUrl` treat it as same-origin, keeps the Content-Security-Policy `connect-src` at `'self'` for it, and validates the CSP origin against a pattern before it is inserted.

Part C makes `scripts/self-scan.mjs` scan the direct dependencies of every workspace, not only the root. The policy file keeps `allow: []`.

This spec traces to R-UI-1, R-UI-2, R-UI-6 and R-UI-7 of docs/requirements.md (kept intact by the restyle) and to N-7 and N-8 (Sexton scans itself and must pass its own default policy). It amends the cemetery-ui values of Cell size, minimum layout width, inscription length, palette and ghost animation, and no other cemetery-ui requirement. R-UI-5 (readability by a first-time viewer) was signed off on the old scene, so the user repeats the sign-off on the new screenshot (task 8.3).

This spec does NOT add a light theme, a theme switch, a new dependency, a web font, an image file, an audio file, a new signal, a new State, a new grave shape, per-package decoration, tiling of the canvas for very tall scenes, or any change to the API contract or the engine.

## Glossary

- **Web app**: the `@sexton/web` package.
- **Night palette**: the one colour table in `packages/web/src/scene/palette.ts`. The Theme keys `light` and `dark` both point to it. It is the single colour source for the canvas painter, the CSS custom properties and the contrast tests.
- **Token**: one named colour of the Night palette, always a six-digit hex string.
- **Backdrop stops**: the colours that can lie behind a grave, a Ghost, the header text or the focus ring. They are the tokens `skyTop`, `skyMid`, `skyHorizon`, `groundTop` and `bg`, plus two fog composites: the `fog` token at its peak alpha of 52 out of 255 over `skyHorizon`, and the same over `groundTop`. The darkest and the lightest of them are named in the design.
- **Scenery**: the canvas decoration drawn before the graves: sky gradient, moon, ground gradient, horizon line and fog band. It carries no meaning and does not depend on any package.
- **Sky height**: 80 CSS pixels, the height of the sky band and the y of the horizon line.
- **Cell**: the layout box of one Grave, 192 by 224 CSS pixels, inside a canvas padding of 16 CSS pixels. The first row of Cells starts at y = Sky height + padding = 96.
- **Plinth**: the rounded base of every Grave, 144 by 40 CSS pixels at offset (24, 168) of the Cell, drawn in the State colour of the Grave. Its form and size are the same for every State, so it carries no meaning.
- **Ink**: the token used for text and crack lines drawn on a stone.
- **Inscription**: the package name drawn on the Plinth, truncated to 16 UTF-16 code units with a final ellipsis when longer. It is drawn only when the scan holds 60 or fewer Packages.
- **Ghost phase**: an integer from 0 to 47. One step is 100 ms, so a full cycle is 4800 ms.
- **Ghost offset**: the vertical displacement of every Ghost, `round2(6 * sin(2 * PI * phase / 48))` CSS pixels, with `round2` rounding to two decimals. The amplitude of 6 is the same for every Ghost.
- **Reduced motion**: the state in which the `prefers-reduced-motion: reduce` media query matches.
- **API base**: the value of the build-time variable `VITE_SEXTON_API` after `parseApiBase`. It is either an https URL (origin plus optional path) or a Path base.
- **Path base**: an API base that is a same-origin path beginning with a single `/`, for example `/api`.
- **CSP origin**: the origin that the build inserts into `connect-src` next to `'self'`.
- **Collector**: the pure function `collectDirect` in `scripts/lib/collect-direct.mjs` that turns the root manifest, the workspace manifests and the lockfile object into the list of name and locked version pairs to scan.
- **Workspace package**: a directory matched by an entry of `workspaces` in the root package.json that holds its own package.json.
- **Workspace-internal name**: the `name` field of a Workspace package, for example `@sexton/engine`.
- **Deliberate test change**: a change to an existing test that is listed in the design under "Deliberate test changes" because the test pins a value this spec changes on purpose.

## Requirements

### Requirement 1: Night palette and theme tokens

**User Story:** As a reviewer with three minutes, I want one coherent night look with readable text and visible graves, so that the scene is atmospheric without costing legibility.

#### Acceptance Criteria

1. THE Web app SHALL define one Night palette in `scene/palette.ts` and SHALL give the Theme keys `light` and `dark` the same table, so that the scene, the header and the drawer look the same under both values of `prefers-color-scheme`.
2. THE Web app SHALL contain no `prefers-color-scheme` query in `src` or in `styles.css`, and SHALL declare `color-scheme: dark` in `styles.css` and in `index.html`.
3. THE Night palette SHALL hold the tokens `skyTop`, `skyMid`, `skyHorizon`, `groundTop`, `bg`, `horizon`, `moon`, `fog`, `surface`, `text`, `muted`, `border`, `focus`, `ring`, `ghost`, `ink`, `pit` and the five State colours, each a six-digit hex string, where `bg` is both the lowest ground colour and the page background.
4. THE Web app SHALL write every token as a CSS custom property through `applyPalette`, and `styles.css` SHALL hold no colour literal and SHALL use only custom properties that `cssVariables` defines.
5. FOR EACH of `text` and `muted`, THE Night palette SHALL give a contrast ratio of at least 4.5 to 1 against `surface` and against every Backdrop stop (exhaustive over the table).
6. FOR EACH of the five State colours, `ghost`, `ring`, `focus` and `border`, THE Night palette SHALL give a contrast ratio of at least 3 to 1 against every Backdrop stop, including the darkest and the lightest (exhaustive over the table).
7. FOR EACH of `focus` and `border`, THE Night palette SHALL give a contrast ratio of at least 3 to 1 against `surface`.
8. FOR EACH State, THE Night palette SHALL give `ink` a contrast ratio of at least 4.5 to 1 against the State colour, so that the Inscription is readable on every stone.
9. THE Night palette SHALL give Alive and Restless State colours a contrast ratio of at least 1.5 to 1 and SHALL give the five State colours pairwise distinct values.
10. THE Web app SHALL use `horizon`, `moon` and `fog` only for Scenery drawn on the canvas, and SHALL use none of them for text, a Grave, a Ghost, a border or a focus outline.
11. FOR ANY two Packages with the same State, THE Web app SHALL produce the same Grave shape and the same Grave colour, and FOR ANY Package THE Web app SHALL give its Grave a Ghost if and only if its advisories signal is available and non-empty (invariant, unchanged from cemetery-ui requirements 4 and 5).

### Requirement 2: Larger graves and the inscription on the stone

**User Story:** As a maintainer, I want large graves with the package name written on the stone, so that I can read the scene from a normal viewing distance.

#### Acceptance Criteria

1. THE Web app SHALL lay Graves out in Cells of 192 by 224 CSS pixels with a padding of 16 CSS pixels and a Sky height of 80 CSS pixels, and SHALL use a layout width of at least 224 CSS pixels, so that one Cell and its padding always fit.
2. FOR ANY width and one or more Packages, THE Web app SHALL derive `columns = max(1, floor((width - 32) / 192))`, `rows = ceil(n / columns)` and `height = 80 + 16 + rows * 224 + 16`, and SHALL place Cell `i` at `x = 16 + (i mod columns) * 192` and `y = 96 + floor(i / columns) * 224`.
3. FOR ANY width and any number of Packages from 0 to 300, THE Web app SHALL return a Scene plan in which every Grave rectangle lies inside the canvas, no two Grave rectangles overlap, there is exactly one Grave per Package in triage order, and two calls with equal inputs return deeply equal plans (invariant, determinism).
4. THE Web app SHALL draw the Possessed shape as an open grave (a dark pit sunk into the ground, a mound of earth beside it and the lid tilted off, lid and mound in the Possessed colour), and SHALL write the header policy count as "1 failing rule" and "N failing rules" (including 0). THE Web app SHALL draw each Grave as the shape of its State at scale 2 in a 128 by 128 box at offset (32, 48) of the Cell, together with the Plinth in the State colour, and the Plinth SHALL be identical for all five States.
5. THE Web app SHALL draw the Inscription with one `fillText` call in the Ink colour, 14 px monospace, centred at x = 96 of the Cell, baseline y = 193 of the Cell, with a `maxWidth` of 136 CSS pixels, so that the text lies on the Plinth.
6. WHERE the number of Packages is 60 or fewer, THE Web app SHALL give every Grave an Inscription equal to the package name when it has 16 UTF-16 code units or fewer, and otherwise the first 15 code units followed by an ellipsis, never leaving a lone surrogate (invariant, for any name).
7. WHERE the number of Packages is greater than 60, THE Web app SHALL give no Grave an Inscription (boundary: 60 Packages give 60 Inscriptions, 61 give none).
8. FOR ANY Scene plan, THE Web app SHALL issue exactly as many `fillText` calls as the plan has Inscriptions, and SHALL issue exactly one `strokeRect` call when the plan has a selection ring and none otherwise (invariant).
9. FOR 300 Packages at the minimum width of 224 CSS pixels, THE Web app SHALL compute a canvas height of 67312 CSS pixels and a backing scale of `16384 / 67312`, with no backing dimension above 16384, and FOR 300 Packages at width 1280 THE Web app SHALL compute 6 columns and a height of 11312 CSS pixels (boundary).
10. FOR ANY number of Packages from 1 to 300, THE Web app SHALL give each Grave button the `left`, `top`, `width` and `height` of its Grave rectangle in the Scene plan (invariant).

### Requirement 3: Night scenery

**User Story:** As a reviewer, I want a night sky, a moon, a ground and a little fog behind the graves, so that the page reads as a churchyard at night.

#### Acceptance Criteria

1. THE Web app SHALL include in the Scene plan a Scenery record computed from the layout width only: the Sky height 80, the horizon y 80, a moon with centre `(floor(width / 6), 40)` and radius 20 (centre x at most width / 3, so the moon sits in the left third of the sky), a fog band at y 56 with height 96, and a ground fade length of 640.
2. FOR ANY two lists of Packages and the same width and Theme, THE Web app SHALL produce deeply equal Scenery (invariant, so that decoration never varies per Package).
3. FOR ANY width of at least 224, THE Web app SHALL place the moon disc inside the rectangle from (0, 0) to (width, Sky height) (invariant).
4. WHEN the painter draws a Scene plan, THE Web app SHALL draw in this order: clear, sky gradient over y 0 to 80 with stops skyTop at 0, skyMid at 0.6 and skyHorizon at 1, moon halo and moon disc, ground gradient from groundTop at y 80 to bg at y 720 extended to the canvas bottom, horizon line 2 CSS pixels high at y 80, fog band, every Grave, and the selection ring last.
5. THE Web app SHALL draw Scenery with `fillRect`, `arc` and `fill` only, and SHALL reserve `fillText` for Inscriptions and `strokeRect` for the selection ring (invariant, checked on a recording context for any plan).
6. THE Web app SHALL build every Scenery gradient stop from a Night palette token, and SHALL form the fog and moon-halo transparency by appending an alpha byte to a token (`34` at the fog peak, `00` at the fog edges), so that no colour literal appears in `draw.ts`.
7. THE Web app SHALL draw every Grave fill, Plinth, Ghost and Inscription as an opaque palette colour and SHALL NOT assign `globalAlpha`, so that no opacity scale exists (invariant).
8. WHEN no Package, selection, width, Ghost phase or Theme value changes, THE Web app SHALL issue no repaint, and WHEN several values change within one animation frame, THE Web app SHALL issue one repaint (invariant, cemetery-ui Property 17 still holds).
9. FOR 300 Packages in the e2e build at a 1280 by 800 viewport, THE Web app SHALL repaint the full scene with a median of 30 timed repaints of at most 16 ms (performance).
10. WHEN the ScanResponse holds no Packages, THE Web app SHALL render no canvas and SHALL show the text "no direct dependencies in this scan".

### Requirement 4: Ghost drift

**User Story:** As a viewer, I want ghosts to float gently, so that the scene feels alive, and as a user who prefers reduced motion I want no motion at all.

#### Acceptance Criteria

1. THE Web app SHALL define the Ghost phase as an integer from 0 to 47 and the Ghost offset as `round2(6 * sin(2 * PI * phase / 48))` CSS pixels.
2. WHILE Reduced motion does not apply and the Scene plan holds at least one Ghost, THE Web app SHALL advance the Ghost phase by 1 modulo 48 every 100 ms.
3. FOR ANY Ghost phase and any list of Packages, THE Web app SHALL give every Ghost the same offset, with an absolute value of at most 6, a top at `rect.y + 12 + offset`, a left at `rect.x + 84`, and a 24 by 28 box that lies inside its Cell (invariant).
4. FOR ANY integer phase, THE Web app SHALL give the offset 0 at phase 0 and equal offsets at phase `p` and `p + 48` (periodicity).
5. FOR ANY Ghost phase, THE Web app SHALL leave every Grave rectangle, shape, fill and Inscription unchanged (invariant).
6. WHILE Reduced motion applies, THE Web app SHALL keep the Ghost phase at 0 and SHALL create no timer of any kind for the drift.
7. WHEN Reduced motion starts or stops applying, THE Web app SHALL stop or start the drift timer without a page reload.
8. WHILE the Scene plan holds no Ghost, THE Web app SHALL create no drift timer.
9. WHEN the Ghost phase changes, THE Web app SHALL repaint through the redraw scheduler, with at most one repaint per animation frame.

### Requirement 5: Night header and drawer

**User Story:** As a user, I want the header and the drawer to look like part of the night scene, so that the page is one piece.

#### Acceptance Criteria

1. THE Web app SHALL style the header with a gradient from the `skyTop` token to the `skyMid` token, a bottom border in `border`, and text in `text` and `muted`, all through custom properties.
2. THE Web app SHALL style the drawer as a stone panel with the `surface`, `text`, `border` and `focus` tokens, and SHALL set headings in a system serif font stack, with no web font file and no `url()` in `styles.css`.
3. THE Web app SHALL keep every existing `:focus-visible` rule with an outline of at least 2 px, SHALL keep the outline colour at `focus`, and SHALL NOT remove an outline without replacing it (invariant, static check on `styles.css`).
4. FOR EACH text, border and outline pair that `styles.css` builds from custom properties, THE Web app SHALL meet 4.5 to 1 for text and 3 to 1 for borders and outlines, against `bg`, `surface` and every gradient stop the rule uses.
5. THE Web app SHALL pass the axe-core check in every scenario of `test/a11y.test.tsx`.
6. THE Web app SHALL keep the tab order, the roving tabindex, the focus trap, the `inert` regions and the Escape, button and backdrop close paths of the drawer exactly as cemetery-ui defines them.
7. THE Web app SHALL keep the production Content-Security-Policy equal to the cemetery-ui policy apart from the `connect-src` value, so that the restyle adds no network request and no font request.

### Requirement 6: Same-origin path API base

**User Story:** As an operator who serves the API behind the same CloudFront domain as the page, I want `VITE_SEXTON_API=/api` to work, so that the build needs no second origin and the CSP stays at `'self'`.

#### Acceptance Criteria

1. WHEN the raw value begins with a single `/`, uses only the characters `A-Z`, `a-z`, `0-9`, `.`, `_`, `~`, `-` and `/`, contains neither `//` nor `..` nor a `.` path segment, and is not exactly `/`, THE `parseApiBase` function SHALL return the value with one trailing slash stripped.
2. IF the raw value begins with `//`, or contains a backslash, `?`, `#`, `..`, a `.` path segment, `%`, whitespace, any other character outside the set of criterion 1, or equals `/`, THEN THE `parseApiBase` function SHALL return null.
3. THE `parseApiBase` function SHALL keep its https behaviour: it returns the normalised https URL without a trailing slash for a valid value, and null for http, credentials, `?` or `#`.
4. FOR ANY string, THE `parseApiBase` function SHALL return null, or an https origin with an optional path, or a Path base that starts with a single `/` and contains no `//`, `..`, `?`, `#` or backslash, and SHALL NOT throw (invariant).
5. FOR ANY input string and page origin, WHERE the API base is a Path base, THE `checkScanUrl` function SHALL accept the input if and only if it resolves to the page origin with no credentials over `http` or `https`, and SHALL reject every cross-origin input without calling `new URL` on the Path base (invariant, determinism).
6. WHERE the API base is a Path base, THE `checkScanUrl` function SHALL accept `{base}/scan?repo=` followed by any `encodeURIComponent` value, and the resolved URL SHALL equal the page origin followed by that string.
7. WHERE the API base is a Path base, THE `submitRepo` function SHALL issue one GET request to `{base}/scan?repo=` followed by the trimmed value passed through `encodeURIComponent`, and the repository field SHALL be enabled.
8. WHERE the API base is a Path base, THE build SHALL write `connect-src 'self'` into the Content-Security-Policy with no other origin.
9. THE build SHALL insert a CSP origin only when it matches `^https://[A-Za-z0-9.-]+(:\d+)?$`, and IF the origin does not match, THEN THE build SHALL write `connect-src 'self'` (fail closed).
10. FOR ANY raw string, THE build function `apiOrigin` SHALL return null or a string that matches the pattern of criterion 9, and SHALL return null for every Path base (invariant).

### Requirement 7: Self-scan covers every workspace

**User Story:** As a security engineer, I want Sexton to scan the direct dependencies of every package in the repository, so that "Sexton scans itself" is true for all the code we ship.

#### Acceptance Criteria

1. THE Collector SHALL be a pure function of `{ root, workspaces, lock }`, where `root` is the root manifest, `workspaces` is a list of `{ dir, manifest }` and `lock` is the parsed `package-lock.json`, and SHALL perform no file, network or process access.
2. THE Collector SHALL take the union of the names in `dependencies` and `devDependencies` of the root manifest and of every Workspace package.
3. THE Collector SHALL skip every Workspace-internal name.
4. THE Collector SHALL resolve the locked version of a name declared by Workspace package `dir` from `lock.packages["<dir>/node_modules/<name>"]` first and from `lock.packages["node_modules/<name>"]` second, and SHALL resolve a name declared by the root manifest from `node_modules/<name>` only.
5. IF no lockfile entry with a `version` exists for a declared name, THEN THE Collector SHALL throw an error that names the package and the declaring directory.
6. THE Collector SHALL return one row `{ name, installedVersion }` per distinct name and version pair, so that a name locked at two different versions in two workspaces yields two rows, and the same pair declared twice yields one row.
7. THE Collector SHALL return the rows sorted by name and then by version in UTF-16 code-unit order, and SHALL return the same rows for any ordering of the `workspaces` list (invariant, determinism).
8. THE self-scan script SHALL read the root package.json, SHALL expand each `workspaces` entry of the form `<dir>/*` into the directories that hold a package.json, and IF an entry has any other form, THEN THE script SHALL exit with an error naming the entry.
9. THE self-scan script SHALL keep its output format and exit codes (0 pass, 1 policy failed, 2 policy invalid) and SHALL pass the Collector rows to `scorePackages`.
10. THE `sexton.policy.yml` file SHALL keep `allow: []`, the same three rules and the same rule order, and SHALL state in its comment that the self-scan covers the root and every workspace, that esbuild is not in the dependency tree because Vite 8 uses Rolldown, and that the only install-script package in the lockfile is fsevents 2.3.3, which is optional and transitive.
11. THE tests for the Collector SHALL use fixture manifest and lockfile objects and SHALL make no network call.
12. IF the live self-scan reports a direct dependency with an install script, THEN THE implementer SHALL stop and ask the user to decide the `allow` entry and its comment, and SHALL NOT edit `allow` itself (review constraint, not a correctness property).

### Requirement 8: Regression guard, screenshot and gates

**User Story:** As the project owner, I want the restyle to leave behaviour untouched and to ship with a fresh screenshot, so that I can review it in one look.

#### Acceptance Criteria

1. THE Web app SHALL keep every existing test green, apart from the Deliberate test changes listed in design.md, and every Deliberate test change SHALL change only the value this spec changes on purpose (review constraint, not a correctness property).
2. THE Web app SHALL change no file under `packages/web/src/triage`, `packages/web/src/selection`, `packages/web/src/drawer/drawer-model.ts`, `packages/web/src/header/header-model.ts`, `packages/web/src/load/validate-scan-response.ts`, `packages/web/src/load/load-scan.ts` or `packages/engine/src`, and SHALL change `packages/web/src/load/use-scan-loader.ts` in no way (review constraint, checked by `git diff --name-only`).
3. THE Web app SHALL add no dependency and SHALL change no pinned version in any package.json (review constraint).
4. THE Playwright test SHALL retake `docs/cemetery.png` at a 1280 by 800 viewport with the first Possessed grave (`left-padder`) selected and its drawer open.
5. THE Playwright test SHALL wait until the canvas holds a painted pixel (alpha 255 at device pixel (2, 2)) before it takes the screenshot, so that the screenshot never shows an unpainted canvas.
6. THE Playwright test SHALL emulate `prefers-reduced-motion: reduce` while it takes the screenshot, so that the Ghost phase is 0 and the screenshot is repeatable.
7. THE production build SHALL pass `scripts/check-bundle.mjs`, which finds neither `__sextonTiming` nor `axe-core` in `dist`.
