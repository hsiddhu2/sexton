# Implementation Plan: cemetery-theme

## Overview

Restyles packages/web as a night scene (palette, larger graves with the inscription on a plinth, scenery, ghost drift, header and drawer), adds a same-origin path API base with a stricter CSP origin, and makes the self-scan cover every workspace. Pure modules come first in each part, then the painter and CSS that execute them, then the tests that pin them. All paths are under packages/web unless stated. No test touches the network.

Run-time notes for the agents:

- The impl agent edits files and runs only the test and typecheck commands. The orchestrator runs the live self-scan (7.4), the Playwright run (8.2), the screenshot review stop (8.3) and the root gates (9.x). No task installs a dependency: this spec adds none and changes no pin.
- Every test sub-task names its test file and the property numbers from design.md. `numRuns` is 100 by default and 1000 for Properties 9, 10 and 11. Every property test carries the tag `Feature: cemetery-theme, Property N: <title>`.
- Tests change only where design.md lists a Deliberate test change (numbered 1 to 16 there). Any other existing test that fails is a regression: fix the source, not the test.
- Do not change anything under src/triage, src/selection, src/drawer/drawer-model.ts, src/header/header-model.ts, src/load/validate-scan-response.ts, src/load/load-scan.ts, src/load/use-scan-loader.ts or packages/engine/src (requirement 8.2).
- After 1.1 and before 1.3, 2.1 and 3.1 land, some existing web tests fail because they pin the values that change. That is expected inside this plan. The checkpoints are where the whole suite must be green.

## Tasks

- [x] 1. Palette and theme tokens
  - Replaces the light and dark tables with one Night table, adds the new tokens and the Backdrop stops, makes the app night-only, and updates the contrast tests.
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 1.10, 1.11_
  - [x] 1.1 Rewrite src/scene/palette.ts
    - `PaletteTheme` with the tokens `skyTop`, `skyMid`, `skyHorizon`, `groundTop`, `bg`, `horizon`, `moon`, `fog`, `surface`, `text`, `muted`, `border`, `focus`, `ring`, `ghost`, `ink`, `pit` and `states`, with the hex values of design.md. One `NIGHT` object, `PALETTE = { light: NIGHT, dark: NIGHT }`. Export `FOG_PEAK_ALPHA_BYTE` ("34"), `ALPHA_ZERO_BYTE` ("00"), `MOON_HALO_ALPHA_BYTE` ("40"), and `backdropStops(theme)` returning the five Backdrop tokens plus the fog composites over `skyHorizon` and `groundTop` at 52/255 (sRGB mix, rounded per channel).
    - `cssVariables` keeps every existing name (`--bg`, `--surface`, `--text`, `--muted`, `--border`, `--focus`, `--ring`, `--ghost`, `--state-*`) and adds `--sky-top`, `--sky-mid`, `--sky-horizon`, `--ground-top`, `--horizon`, `--moon`, `--fog`, `--ink`. `applyPalette` is unchanged. Keep the `Theme` type and `colourFor`.
    - Covered by tests in 1.3.
    - _Requirements: 1.1, 1.3, 1.4, 1.9, 1.10_
  - [x] 1.2 Make the app night-only
    - In `src/App.tsx` remove `useMediaQuery("(prefers-color-scheme: dark)")` and set `const theme: Theme = "dark"`; keep the Reduced motion query. Add `<meta name="color-scheme" content="dark" />` to `index.html`. Add `:root { color-scheme: dark; }` to `src/styles.css`. Change nothing else in the CSS here (5.1 restyles it).
    - Covered by tests in 1.3.
    - _Requirements: 1.1, 1.2_
  - [x] 1.3 Update test/shapes-palette.test.ts and add the contrast property
    - Apply Deliberate test changes 1 to 3 (palette identity assertion, text and muted against `[surface, ...backdropStops]`, non-text colours against every Backdrop stop).
    - Add Property 1 (palette contrast over every backdrop stop), exhaustive over the table and both Theme keys: text and muted at least 4.5 against surface and every stop; the five State colours, ghost, ring, focus and border at least 3 against every stop, with the darkest and lightest stop asserted by name from `backdropStops`; focus and border at least 3 against surface; ink at least 4.5 against each State colour; Alive against Restless at least 1.5; five distinct State colours; every token a six-digit hex.
    - Add examples: `styles.css` and every file under `src` contain no `prefers-color-scheme`; `styles.css` holds no `url(`; `horizon`, `moon` and `fog` variables do not appear in `styles.css` (1.10); `PALETTE.light` is `PALETTE.dark`.
    - Tag: `Feature: cemetery-theme, Property 1: Palette contrast over every backdrop stop`.
    - _Requirements: 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 1.10, 1.11_

- [x] 2. Layout cell size and inscription on the stone
  - Grows the Cell to 192 by 224, adds the sky band offset and the Scenery record, moves the minimum width to 224, and extends the inscription to 16 code units.
  - _Requirements: 2.1, 2.2, 2.3, 2.6, 2.7, 2.9, 2.10, 3.1, 3.2, 3.3_
  - [x] 2.1 Update src/scene/layout.ts and src/scene/shapes.ts
    - Constants: `CELL_WIDTH` 192, `CELL_HEIGHT` 224, `PADDING` 16, `SKY_HEIGHT` 80, `MIN_WIDTH` 224, `INSCRIPTION_UNITS` 16, `GHOST_STEPS` 48, `GHOST_STEP_MS` 100, `GHOST_AMPLITUDE` 6, `GHOST_WIDTH` 24, `GHOST_HEIGHT` 28, `GRAVE_GEOMETRY` as in design.md. Add `Scenery`, `sceneryFor(width)`, `ghostOffset(phase)` (`round2(6 * sin(2 * PI * phase / 48))`), and `scenery` on `ScenePlan`. Widen `SceneInput.ghostPhase` to `number`. `planScene`: rows start at y `SKY_HEIGHT + PADDING`, height `SKY_HEIGHT + PADDING + rows * 224 + PADDING`, ghost at `{ x: rect.x + 84, y: rect.y + 12 + ghostOffset(phase) }`. `inscriptionFor` cuts at 16 (15 code units plus the ellipsis). `GravePlan` keeps its eight keys. Leave `backingStore` and `hasGhost` as they are.
    - In `shapes.ts` add `PLINTH_PATH` and `plinthPath()` (cached Path2D). `SHAPES`, `SHAPE_BY_STATE`, `GHOST_PATH` are unchanged.
    - Covered by tests in 2.2 and 3.3.
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.6, 2.7, 2.9, 3.1, 3.2, 3.3, 4.1, 4.3_
  - [x] 2.2 Update test/layout.test.ts and test/arbitraries.ts, add Properties 2 and 3
    - Apply Deliberate test changes 4 to 10.
    - Property 2 (layout formulas, containment and determinism), numRuns 100, any width including NaN, Infinity and values under 224, 0 to 300 Packages, with the formulas of requirement 2.2, containment, no overlap (checked on a sample of pairs above 60 Packages and on all pairs up to 60), order and determinism. Property 3 (inscription truncation), numRuns 100, over `arbSceneName` names and counts drawn from 0, 1, 59, 60, 61 and 300.
    - Examples: first Cell is `{ x: 16, y: 96, w: 192, h: 224 }`; 300 graves at width 224 give 1 column, height 67312, and `backingStore(224, 67312, 2)` has `scale` equal to `16384 / 67312` and `height` at most 16384; 300 graves at width 1280 give 6 columns and height 11312; widths 415 and 416 give 1 and 2 columns; 60 Packages give 60 inscriptions and 61 give none.
    - Tags: `Feature: cemetery-theme, Property 2: Layout formulas, containment and determinism`, `Feature: cemetery-theme, Property 3: Inscription truncation`.
    - _Requirements: 2.1, 2.2, 2.3, 2.6, 2.7, 2.9_
  - [x] 2.3 Add Property 8 to test/grave-buttons.test.tsx
    - Property 8 (overlay buttons follow the plan), numRuns 100: for any count from 1 to 300, render `Cemetery` with `cheapScan(count)` and assert that each `button[data-grave-index]` has `style.left`, `top`, `width` and `height` equal to the plan rectangle of its Grave, computed with `planScene` at the same width. Existing tests in the file are unchanged.
    - Tag: `Feature: cemetery-theme, Property 8: Overlay buttons follow the plan`.
    - _Requirements: 2.10_

- [x] 3. Background painter and drawn grave styling
  - Draws the night scenery, then each Grave as the scaled state shape, the Plinth, the Ghost and the Inscription, with the painter call discipline of requirement 3.
  - _Requirements: 2.4, 2.5, 2.8, 3.1, 3.4, 3.5, 3.6, 3.7, 3.8, 3.10_
  - [x] 3.1 Rewrite src/scene/draw.ts
    - Extend `PaintContext2D` with `createLinearGradient`, `createRadialGradient`, `beginPath`, `arc`, `fill()` without argument, `scale` and `fillText(text, x, y, maxWidth?)`, plus `GradientLike`. Implement `drawScenery` (sky, moon halo and disc, ground, horizon line, fog, in that order, with `fillRect`, `arc` and `fill` only), `drawGrave` (shape at scale 2 with the shape tilt, crack detail in `ink`, Plinth, Ghost at scale 2, Inscription with `maxWidth` 136 in `ink`, 14px monospace, centred at x + 96, baseline y + 193) and the unchanged selection ring (`strokeRect` once). Every colour comes from `PALETTE`; alpha is formed with the `*_ALPHA_BYTE` constants. No `globalAlpha`. `Scene.tsx` is unchanged.
    - Covered by tests in 3.2 and 3.3.
    - _Requirements: 2.4, 2.5, 2.8, 3.1, 3.4, 3.5, 3.6, 3.7_
  - [x] 3.2 Update the recording contexts and the theme-change test
    - In `test/setup.ts` `makeContext()` and in `test/scene.test.tsx` `recorder()`: return `{ addColorStop() {} }` for `createLinearGradient` and `createRadialGradient` (Deliberate test change 11). In `test/scene.test.tsx` apply Deliberate test change 12 to "repaints with the other palette after a theme change". Leave the "draws a ghost only for graves with advisories" example and Properties 9 and 17 unchanged; they must pass.
    - _Requirements: 3.4, 3.8, 3.10_
  - [x] 3.3 Write test/draw.test.ts with Properties 4 and 5
    - Property 4 (painter call discipline), numRuns 100: a recording context that logs every method call and every `fillStyle` and `globalAlpha` assignment and returns gradient stubs, plans from `planScene` over generated Packages (0 to 70), widths, selections and phases. Assert the order (`clearRect` first, all Scenery calls before the first Grave call), `fillText` count equals the Inscription count with `maxWidth` 136, `strokeRect` once with a ring and never without, no `globalAlpha` assignment, and every string assigned to `fillStyle` is a palette token, a Grave fill, or a token plus `34`, `00` or `40`.
    - Property 5 (scenery depends on the width only), numRuns 100: for any two package lists, any selection and phase, and any width of at least 224, `plan.scenery` is deeply equal, and the moon disc lies inside the sky band.
    - Examples: a plan for zero Packages still has Scenery; the draw call list for one Grave of each State uses the same Plinth path object.
    - Tags: `Feature: cemetery-theme, Property 4: Painter call discipline`, `Feature: cemetery-theme, Property 5: Scenery depends on the width only`.
    - _Requirements: 2.4, 2.5, 2.8, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7_

- [x] 4. Ghost drift with reduced motion
  - Replaces the 0 and 1 toggle with the 48-step drift driven by the existing interval, with no timer under Reduced motion or without a Ghost.
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9_
  - [x] 4.1 Update src/hooks/use-ghost-phase.ts
    - `useGhostPhase(anyGhost, reducedMotion): number` with `setInterval` every `GHOST_STEP_MS` adding 1 modulo `GHOST_STEPS`, the same cleanup that resets the phase to 0, and the same `running` rule (`anyGhost && !reducedMotion`). `Cemetery.tsx` is unchanged.
    - Covered by tests in 4.2 and 4.3.
    - _Requirements: 4.2, 4.6, 4.7, 4.8, 4.9_
  - [x] 4.2 Update the ghost timer tests in test/scene.test.tsx
    - Apply Deliberate test changes 13 and 14. The "holds 0 and runs no timer under Reduced motion or without a ghost" test stays unchanged.
    - _Requirements: 4.2, 4.6, 4.7, 4.8_
  - [x] 4.3 Write test/ghost-drift.test.ts with Properties 6 and 7
    - Property 6 (ghost offset function), numRuns 100: for any integer phase from 0 to 200 and any Packages, every Ghost has the same offset equal to `ghostOffset(phase)`, `abs(offset) <= 6`, top `rect.y + 12 + offset`, left `rect.x + 84`, box inside the Cell; `ghostOffset(0)` is 0; `ghostOffset(p)` equals `ghostOffset(p + 48)`; changing only the phase leaves rectangle, shape, fill and inscription unchanged.
    - Property 7 (ghost timer), numRuns 100: `renderHook(useGhostPhase)` with fake timers and a generated event list of `advance k` (k from 1 to 120 steps of 100 ms), `reduced on`, `reduced off`; after each event assert phase `(steps since start) mod 48` while running, phase 0 and `vi.getTimerCount() === 0` while Reduced motion is on, and no timer when `anyGhost` is false.
    - Tags: `Feature: cemetery-theme, Property 6: Ghost offset function`, `Feature: cemetery-theme, Property 7: Ghost timer`.
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8_

- [x] 5. Header and drawer restyle
  - Restyles the header and drawer from the Night tokens only, with every focus rule kept.
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7_
  - [x] 5.1 Restyle src/styles.css
    - As listed in design.md under "App.tsx, index.html, styles.css": header sky gradient from `var(--sky-top)` to `var(--sky-mid)` with `border-bottom: 2px solid var(--border)`, serif system stack for `h1` to `h4`, drawer stone panel with `var(--surface)` and a `box-shadow` in `var(--bg)`, rounded controls, `.scene-container` background `var(--bg)`. Keep every selector read by `a11y.test.tsx` and every `:focus-visible` rule (outline 3px solid `var(--focus)`). No colour literal, no `url()`, no `@media (prefers-color-scheme)`, no use of `--horizon`, `--moon` or `--fog`. Keep plain `color: var(--x)` and `background: var(--y)` declarations where text sits, so the existing pair test reads them. No markup or behaviour change in Header.tsx, Legend.tsx or Drawer.tsx, except a class name where the CSS needs one.
    - Covered by tests in 1.3, 5.2 and the unchanged a11y.test.tsx.
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.6, 5.7_
  - [x] 5.2 Extend test/shapes-palette.test.ts for the header gradient
    - Add an example in the contrast block: the text and muted tokens against `skyTop` and `skyMid` (the header gradient stops) at least 4.5, and the `border` token against `skyTop` and `bg` at least 3. Confirm that the existing "every pair that styles.css builds from custom properties" test still passes with `checked` above 20. Run `test/a11y.test.tsx` and `test/drawer.test.tsx` and confirm they pass without change (axe, focus rules, keyboard, inert).
    - _Requirements: 5.1, 5.3, 5.4, 5.5, 5.6_

- [x] 6. parseApiBase path base, checkScanUrl, vite CSP origin check
  - Adds the same-origin path base, keeps it same-origin in the URL check, keeps the CSP at `'self'` for it, and validates the CSP origin pattern.
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.9, 6.10_
  - [x] 6.1 Update src/load/api-base.ts
    - Add `parsePathBase` as in design.md (whitelist `^/[A-Za-z0-9._~/-]*$`, reject `/`, `//`, `..` and `.` segments, strip one trailing slash) and route raw values that start with `/` to it. The https branch is unchanged.
    - Covered by tests in 6.4.
    - _Requirements: 6.1, 6.2, 6.3, 6.4_
  - [x] 6.2 Update src/load/check-scan-url.ts
    - Derive the cross-origin API origin only when `apiBaseUrl` is not null and does not start with `/`; a Path base never reaches `new URL`. Everything else is unchanged.
    - Covered by tests in 6.5.
    - _Requirements: 6.5, 6.6_
  - [x] 6.3 Update vite.config.ts
    - Export `apiOrigin` with the `CSP_ORIGIN` pattern check and the null result for values that start with `/`, as in design.md. `cspPlugin` is unchanged.
    - Covered by tests in 6.6.
    - _Requirements: 6.8, 6.9, 6.10_
  - [x] 6.4 Add Property 9 and examples to test/api-base.test.ts
    - Property 9 (parseApiBase is total and safe), numRuns 1000: strings from `fc.string`, `fc.webUrl`, and a token mix of `/`, `//`, `..`, `.`, `?`, `#`, `\`, space, `%2e`, `api`, `v1` and `https://`. Assert the result is null, or an https URL with no credentials, query, fragment or trailing slash, or a path that starts with a single `/` and contains none of `//`, `..`, `?`, `#`, backslash, whitespace or `%`, with no trailing slash; and a valid generated path base returns itself with one trailing slash stripped.
    - Examples: `/api`, `/api/`, `/v1/api` accepted; `/`, `//host`, `/api//x`, `/a\b`, `/a?x`, `/a#x`, `/a/../b`, `/a/./b`, `/a%2e%2e/b`, `/a b`, `/api\n` return null. All existing examples stay.
    - Tag: `Feature: cemetery-theme, Property 9: parseApiBase is total and safe`.
    - _Requirements: 6.1, 6.2, 6.3, 6.4_
  - [x] 6.5 Add Property 10 to test/check-scan-url.test.ts
    - Apply Deliberate test change 15 (Path bases in `arbApi` and the oracle). Property 10 (checkScanUrl with a path base), numRuns 1000: any input string, page origin and API base from null, an https origin or a Path base; no throw, determinism, accept only same-origin or https on the origin of a non-path base, never a cross-origin URL for a Path base, and acceptance of `{base}/scan?repo=` plus `encodeURIComponent(v)` for any `v`, with the URL equal to the page origin plus that string.
    - Tag: `Feature: cemetery-theme, Property 10: checkScanUrl with a path base`.
    - _Requirements: 6.5, 6.6_
  - [x] 6.6 Write test/vite-csp.test.ts with Property 11
    - Property 11 (CSP origin), numRuns 1000: any raw string; `apiOrigin` returns null or a string that matches `^https://[A-Za-z0-9.-]+(:\d+)?$`, returns null whenever `parseApiBase(raw)` is a string that starts with `/`, and returns `new URL(raw).origin` for generated valid https values with host and optional port.
    - Examples: `https://api.sexton.example` and `https://api.sexton.example:8443/v1` give their origins; `/api` gives null; `https://[::1]` gives null (fails closed); `https://user:pw@api.example` gives null. Build the CSP string through the plugin for `/api` and assert `connect-src 'self'` with no other origin, and for an https value assert `connect-src 'self' <origin>`.
    - Tag: `Feature: cemetery-theme, Property 11: CSP origin`.
    - _Requirements: 6.8, 6.9, 6.10_
  - [x] 6.7 Add the path-base submit example to test/load-scan.test.ts
    - With `apiBase: "/api"` and `pageOrigin` `https://sexton.example`, `submitRepo("https://github.com/a/b")` returns null and the injected `fetchFn` receives exactly one GET to `https://sexton.example/api/scan?repo=https%3A%2F%2Fgithub.com%2Fa%2Fb`. A `scan` parameter of `/api/x.json` is accepted and `https://evil.example/x.json` is rejected. No change to any existing test or to `use-scan-loader.ts`.
    - _Requirements: 6.6, 6.7_

- [x] 7. Self-scan workspace coverage
  - Adds the pure collector, rewires the script and updates the policy comment, then runs the live scan.
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8, 7.9, 7.10, 7.11, 7.12_
  - [x] 7.1 Create scripts/lib/collect-direct.mjs
    - `collectDirect({ root, workspaces, lock })` exactly as in design.md: union of `dependencies` and `devDependencies`, skip Workspace-internal names, workspace `node_modules` first then root `node_modules`, root-declared names at root only, a `Map` keyed `name@version`, an error naming the package and the declaring directory for a missing version, sort by name then version with `<` and `>`. JSDoc types, no I/O, no imports.
    - Covered by tests in 7.2.
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7_
  - [x] 7.2 Write packages/engine/test/policy/collect-direct.test.ts with Property 12
    - Import with `// @ts-expect-error plain JavaScript module without declarations` as packages/api/test/generate-demo-scan.test.ts does. Property 12 (collectDirect), numRuns 100: generated root and workspace manifests (names from a small pool, some workspace-internal), lockfile objects that hold an entry at a random mix of workspace-nested and root paths for every declared name, and permutations of the workspace list. Assert uniqueness by name and version, sort order, no internal names, the resolution order, coverage of the union, permutation invariance, and an error that contains the name when a lockfile entry is removed.
    - Examples with fixtures that mirror the repo: root with `vitest`, engine declaring `ajv` 8.20.0 nested at `packages/engine/node_modules/ajv` beside a root `ajv` 6.15.0 (the engine row is 8.20.0), web declaring `vite` 8.3.8 nested at `packages/web/node_modules/vite`, `@sexton/engine` and `@sexton/api` skipped, a name locked at two versions in two workspaces gives two rows, and the same pair declared by two workspaces gives one.
    - Tag: `Feature: cemetery-theme, Property 12: collectDirect`.
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.11_
  - [x] 7.3 Update scripts/self-scan.mjs and the comment in sexton.policy.yml
    - Replace the manifest and lockfile reading with the workspace expansion and `collectDirect` call shown in design.md (`import { readFile, readdir } from "node:fs/promises"` and `import { collectDirect } from "./lib/collect-direct.mjs"`), update the header comment to say it scans the root and every workspace. Output format and exit codes stay. In `sexton.policy.yml` replace only the comment above `allow: []` with the text in design.md; keep `allow: []`, the three rules and their order. Do not edit `packages/engine/test/policy/self-policy.test.ts`; run it and confirm it passes.
    - _Requirements: 7.8, 7.9, 7.10_
  - [x] 7.4 Orchestrator runs the live self-scan
    - The orchestrator runs `npm run build -w @sexton/engine` and then `npm run scan:self` at the repository root (needs the network). Record the rows and the policy result.
    - STOP for the user in either case: (a) a direct dependency of any workspace has an install script (the scan fails the "No install scripts" rule), in which case the user decides the `allow` entry and the comment that says what the script does, and nobody edits `allow` meanwhile; (b) any other rule fails or any signal for a direct dependency is unavailable in a way that changes a State, in which case the orchestrator reports the result and waits. On a pass, report the number of rows and continue.
    - _Requirements: 7.9, 7.10, 7.12_

- [x] 8. Playwright: the budget, the screenshot and the wait for paint
  - Retakes the screenshot with the first Possessed grave selected and the drawer open, after the first canvas paint, and keeps the 16 ms budget.
  - _Requirements: 3.9, 8.4, 8.5, 8.6_
  - [x] 8.1 Update e2e/smoke.spec.ts
    - Apply Deliberate test change 16: `page.emulateMedia({ reducedMotion: "reduce" })` before the first `goto`; click the `button[data-grave-index]` whose `aria-label` contains `left-padder` and assert `getByRole("dialog")` is visible; `waitForFunction` that the canvas pixel at device (2, 2) has alpha 255; then the screenshot to `docs/cemetery.png` at the configured 1280 by 800 viewport; then `emulateMedia({ reducedMotion: "no-preference" })` before the 300-grave step, and the same pixel wait before the timing call. Keep the CSP assertions, the abort of non-local requests, the 300-grave response and `BUDGET_MS = 16`.
    - _Requirements: 3.9, 8.4, 8.5, 8.6_
  - [x] 8.2 Orchestrator runs the Playwright test
    - The orchestrator runs `npm run test:e2e -w @sexton/web` (its `pretest:e2e` regenerates the demo scan and builds `dist-e2e`). Confirm the test ran and was not skipped (if chromium is missing, run `npx playwright install chromium` first), that the median of 30 repaints of 300 graves is at most 16 ms, that there is no CSP violation, and that `docs/cemetery.png` is 1280 by 800.
    - If the median is above 16 ms, apply the "Performance fallback" of design.md once (gradients to CSS background layers) and run again. If it is still above 16 ms, STOP and report the number to the user. Do not raise the budget.
    - _Requirements: 3.9, 8.4, 8.5, 8.6, 8.7_
  - [x] 8.3 STOP: the user reviews docs/cemetery.png
    - The orchestrator stops and shows `docs/cemetery.png`. The user checks the night look, that `left-padder` is selected with its drawer open, and repeats the R-UI-5 first-time-viewer sign-off in `docs/ui-readability-sign-off.md` for the new scene. Continue only after the user agrees.
    - _Requirements: 8.4, 8.5, 8.6_

- [x] 9. Root gates
  - Runs every gate at the repository root and checks that nothing outside the plan changed.
  - _Requirements: 3.8, 5.5, 8.1, 8.2, 8.3, 8.7_
  - [x] 9.1 Orchestrator runs typecheck and lint
    - `npm run typecheck` and `npm run lint` at the root, both with zero errors and zero warnings.
    - _Requirements: 8.1_
  - [x] 9.2 Orchestrator runs the test suites
    - `npm test` at the root, then `npm test -w @sexton/web` and `npm test -w @sexton/engine`. Every existing test is green apart from the Deliberate test changes, which now pass in their new form. Confirm `test/a11y.test.tsx` (the axe scenarios) passes with no violations.
    - _Requirements: 3.8, 5.5, 8.1_
  - [x] 9.3 Orchestrator runs the build, the bundle check and the diff checks
    - `npm run build -w @sexton/web` (its `postbuild` runs `scripts/check-bundle.mjs`, which must find neither `__sextonTiming` nor `axe-core` in `dist`). Then `git diff --name-only` and confirm: no file under the paths named in requirement 8.2 changed, no package.json changed, and package-lock.json did not change.
    - _Requirements: 5.7, 8.1, 8.2, 8.3, 8.7_

## Notes

- Test sub-tasks are not optional in this plan, as in cemetery-ui.
- Each task references the requirements it implements. Requirement numbers are those of requirements.md in this spec.
- Orchestrator-run sub-tasks (7.4, 8.2, 8.3, 9.1, 9.2, 9.3) need the network, a browser or a user decision, and are not run by the impl agent.
- Deliberate test changes are numbered in design.md. Anything not listed there must pass unmodified.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "6.1", "6.2", "6.3", "7.1"] },
    { "id": 1, "tasks": ["1.2", "1.3", "2.1", "6.4", "6.5", "6.6", "6.7", "7.2", "7.3"] },
    { "id": 2, "tasks": ["2.2", "2.3", "3.1", "4.1"] },
    { "id": 3, "tasks": ["3.2", "3.3", "4.3", "5.1"] },
    { "id": 4, "tasks": ["4.2", "5.2", "8.1"] },
    { "id": 5, "tasks": ["7.4", "8.2"] },
    { "id": 6, "tasks": ["8.3", "9.1"] },
    { "id": 7, "tasks": ["9.2"] },
    { "id": 8, "tasks": ["9.3"] }
  ]
}
```
