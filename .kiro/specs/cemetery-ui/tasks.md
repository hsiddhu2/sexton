# Implementation Plan: cemetery-ui
## Overview
Adds the response contract and the demo scan generator to packages/api, and the whole Web app to packages/web: the contract validator and loader, the triage sort, the scene planner and canvas painter, the keyboard overlay and selection, the drawer, the header with its notices and legend, accessibility checks, the Playwright smoke test and the final gates. Pure modules come first in each area, then the React components that execute them, then the tests that pin them. All paths are under packages/ unless stated. No test touches the network: tests inject `fetch`, use recording stubs for canvas, Path2D, matchMedia, ResizeObserver and requestAnimationFrame, and read the generated demo scan from disk. Engine tests stay unchanged: no file under packages/engine/test is edited, and the only engine source change is one added name in packages/engine/src/index.ts (task 1).
Run-time notes for the agents:
- The orchestrator, not the impl agent, runs the npm installs: `npx --yes npm@11 install --no-progress --logs-dir build/npm-logs --loglevel http` at the repository root (sub-task 2.2), and the Playwright browser download `npx playwright install chromium` (sub-task 11.5). The impl agent edits package.json files only and never runs either command.
- The impl agent's shell is limited to the test and typecheck commands. The Playwright run, the screenshot review and the install steps are marked orchestrator-run.
- The ADR for axe-core under N-7 (docs/adr) is written by the user, outside the agent's paths. No task here writes it. docs/ui-readability-sign-off.md is created as a template and filled in by the user.
- Test sub-tasks are not optional in this plan, as in repo-intake. Each names its test file, the property numbers from design.md and `numRuns`: 100 by default, 1000 for properties 7, 10, 11 and 12. Every property test carries the tag `Feature: cemetery-ui, Property N: <title>`.
- Demo-scan examples in web tests need the generated file, so they are added in sub-task 9.5, after the generator exists. Before that, web tests use generated or inline responses.
- Components are built in the order they are wired: Cemetery.tsx starts in 5.5 (triage, plan, Scene, empty text), gains selection and the overlay in 6.3 and the drawer in 7.3, and App.tsx wires the loader, the header and the load states in 8.3. No component is left unused.
Deviations from design.md, recorded here:
- design.md lists `test/imports.test.ts` among the early files. It is created in 12.1, when every source file exists, because it scans all of `src`.
- The palette contrast test (design.md puts it in test/shapes-palette.test.ts) is added to that file in 10.2, after styles.css is final, so the CSS pairs are checked too.
- design.md's Playwright section saved the screenshot under e2e-artifacts. It now goes to docs/cemetery.png, and the user reviews it before the final commit (11.6).
- [x] 1. contract.ts and the RULE_TYPES export
  - Adds the @sexton/api package with the response contract, and the one-word engine export that the contract needs. Property tests do not apply here: the contract is types, so the test is a type-level test.
  - _Requirements: 1.1, 1.2, 1.4_
  - [x] 1.1 Export RULE_TYPES from packages/engine/src/index.ts
    - Add `RULE_TYPES` to the existing `export { SEVERITIES, SIGNAL_NAMES, STATE_ORDER } from "./types.js"` line. Change nothing else in the engine. Do not edit any file under packages/engine/test.
    - Covered by the type-level test in 1.5 and the check in 1.6.
    - _Requirements: 1.4_
  - [x] 1.2 Create the packages/api package files
    - `package.json`: name `@sexton/api`, version 0.1.0, license Apache-2.0, `"type": "module"`, `dependencies: { "@sexton/engine": "0.1.0" }`, `exports` mapping `"."` to `types: ./dist/contract.d.ts` and `default: ./dist/contract.js`, scripts `build` (`tsc -b`), `pretest` (`tsc -b`) and `test` (`vitest run`). No range in any version.
    - `tsconfig.json` extends `../../tsconfig.base.json` with `rootDir: src`, `outDir: dist`, `include: ["src"]` and `references: [{ "path": "../engine" }]`. `tsconfig.test.json` extends it for the type-level test: `noEmit`, `composite: false`, include `src` and `test`.
    - `vitest.config.ts` as the engine's (environment node, include `test/**/*.test.ts`), plus `typecheck: { enabled: true, include: ["test/**/*.test-d.ts"], tsconfig: "./tsconfig.test.json" }`. If Vitest typecheck mode does not run under this setup, fall back to a `typecheck:test` script `tsc -p tsconfig.test.json` that the `test` script calls first, and say so in the sub-task report.
    - _Requirements: 1.1, 1.4_
  - [x] 1.3 Implement src/contract.ts
    - Exactly as in design.md: type-only imports from `@sexton/engine` (`import type`, including `SIGNAL_NAMES`, `STATE_ORDER`, `SEVERITIES`, `RULE_TYPES` used only through `typeof`), re-exports of the listed types, the list types `SignalNameList`, `StateList`, `SeverityList` and `RuleTypeList`, the runtime constant `REMEDIATION_KINDS`, `RemediationKind`, the placeholder `RemediationEntry`, and `ScanResponse`.
    - Covered by tests in 1.5.
    - _Requirements: 1.1, 1.2, 1.4_
  - [x] 1.4 Add the api reference to the root tsconfig.json
    - Set `references` to engine and api. The web reference is added in 2.3.
    - _Requirements: 1.1_
  - [x] 1.5 Write the type-level test in packages/api/test/contract.test-d.ts and packages/api/test/contract.test.ts
    - `contract.test-d.ts` uses `expectTypeOf` and the `Same`/`Assert` helpers to check: `ScanResponse` has `report`, `policy` and an optional `remediations` of `readonly RemediationEntry[]`; `SignalNameList`, `StateList`, `SeverityList` and `RuleTypeList` equal the engine's tuple types in members and order (so a drifted list fails the type check); `RemediationEntry.kind` is `"bump" | "remove" | "migrate"`.
    - `contract.test.ts` is one runtime example: `REMEDIATION_KINDS` equals `["bump", "remove", "migrate"]`. No property test: the module holds types and one constant.
    - _Requirements: 1.1, 1.2, 1.4_
  - [x] 1.6 Check that no engine test file changed
    - The orchestrator runs `git diff --name-only -- packages/engine/test` and expects empty output, and `git diff -- packages/engine/src` and expects only the one added name in `index.ts`. Report both results. The engine's own `npm test -w @sexton/engine` still passes unmodified.
    - _Requirements: 1.4_
- [x] 2. Web package scaffold
  - Creates packages/web with its pinned dependencies, build and test configuration, a minimal App, the jsdom stubs, the lint additions and a smoke test that confirms the JSX transform and `.js`-to-`.tsx` resolution before the rest is written.
  - _Requirements: 1.3, 1.16, 9.8, 10.6_
  - [x] 2.1 Create packages/web/package.json with exact pins
    - Name `@sexton/web`, version 0.1.0, private, license Apache-2.0, `"type": "module"`. `dependencies`: `react` 19.3.1, `react-dom` 19.3.1, and nothing else. `devDependencies`: `vite` 8.3.8, `@vitejs/plugin-react` 6.3.0, `@types/react` 19.3.0, `@types/react-dom` 19.3.0, `jsdom` 31.0.1, `@testing-library/react` 16.3.3, `@testing-library/dom` 10.4.2, `@testing-library/user-event` 14.6.13, `@playwright/test` 1.65.1, `axe-core` 4.14.1 (development-only, allowed by the amended N-7), `@sexton/api` 0.1.0 (workspace link, types only). No `^`, `~` or range anywhere. Scripts: `dev` (`vite`), `build` (`vite build`), `preview` (`vite preview`), `test` (`vitest run`). `pretest`, `prebuild`, `postbuild`, `test:e2e` and `pretest:e2e` come in 9.3 and 11.1.
    - `vitest`, `typescript`, `fast-check`, `@types/node` and ESLint stay at the root. Add no other dependency.
    - _Requirements: 1.16_
  - [x] 2.2 Orchestrator runs install
    - The orchestrator runs `npx --yes npm@11 install --no-progress --logs-dir build/npm-logs --loglevel http` at the repository root, so the lockfile gains @sexton/api and @sexton/web and every new package. The impl agent does not run it.
    - Afterwards confirm package-lock.json resolves each pin exactly, and check each new package for an `install`, `preinstall` or `postinstall` script with `npm view <name>@<version> scripts`. Record the result, the licences (axe-core is MPL-2.0, dev-only) and the one-line justification of each new dependency from design.md for the PR body, not in source.
    - _Requirements: 1.16_
  - [x] 2.3 Create the web tsconfig files and the root reference
    - `tsconfig.json` is a solution file referencing `./tsconfig.app.json` and `./tsconfig.node.json`. `tsconfig.app.json` extends the base with NodeNext kept, `lib` ES2022, DOM and DOM.Iterable, `jsx: react-jsx`, `verbatimModuleSyntax: true`, `types: ["vite/client"]`, `emitDeclarationOnly: true`, `outDir: dist-types`, `include: ["src"]` and `references: [{ "path": "../api" }]`. `tsconfig.node.json` includes `test`, `e2e` and the config files, sets `types: ["node", "vite/client"]` and references the app project.
    - Add `{ "path": "packages/web" }` to the root `tsconfig.json` references.
    - _Requirements: 1.3_
  - [x] 2.4 Create vite.config.ts and vitest.config.ts
    - `vite.config.ts`: the React plugin, `define: { __SEXTON_E2E__: JSON.stringify(mode === "e2e") }`. The CSP plugin and the e2e output settings are added in 11.1. `vitest.config.ts`: environment `jsdom`, `setupFiles: ["test/setup.ts"]`, `include: ["test/**/*.test.{ts,tsx}"]`, `exclude: ["e2e/**", "node_modules/**"]`, `testTimeout: 20000`, `define: { __SEXTON_E2E__: false }`, and no React plugin unless 2.8 shows it is needed.
    - _Requirements: 9.8_
  - [x] 2.5 Create index.html, main.tsx, a minimal App.tsx, styles.css and vite-env.d.ts
    - `index.html` has `<html lang="en">`, `<title>Sexton cemetery</title>` and `<div id="root">`. `main.tsx` renders `<App />` with `createRoot`. `App.tsx` renders one `h1` with the text "Sexton cemetery" inside a `header` and a `main`. `styles.css` holds layout rules only and no colour literal (colours come from custom properties written by `applyPalette` in 5.1). `vite-env.d.ts` holds `/// <reference types="vite/client" />` and `declare const __SEXTON_E2E__: boolean;`. Relative imports use `.js` suffixes.
    - _Requirements: 10.6_
  - [x] 2.6 Write test/setup.ts with the jsdom stubs
    - Install recording stubs: a canvas 2D context returned by `HTMLCanvasElement.prototype.getContext` that records every call and counts each `clearRect` as one paint; a `Path2D` class that stores its `d` string; `window.matchMedia` settable per query with a working change event; a `ResizeObserver` with a manual trigger; and a `requestAnimationFrame` and `cancelAnimationFrame` pair backed by a manual queue. Export small helpers (`paintCount`, `setMedia`, `triggerResize`, `flushFrame`) for later tests. Reset all state in `afterEach`.
    - _Requirements: 9.8_
  - [x] 2.7 Add the eslint configuration and confirm root test wiring
    - Add to eslint.config.js: the extra ignores (`packages/web/dist-e2e/**`, `dist-types`, `test-results`, `playwright-report`, `e2e-artifacts`, `public/demo/**`) and the `packages/web/src/**/*.{ts,tsx}` block with `no-restricted-syntax` for `dangerouslySetInnerHTML`, `innerHTML`/`outerHTML` assignment and `insertAdjacentHTML`, and `no-restricted-imports` for `node:*`, exactly as in design.md. Add no new lint dependency.
    - The root `npm test` already runs `npm run test --workspaces --if-present`, so api and web are reached once their package.json files exist. Confirm and change no root script.
    - _Requirements: 2.21, 9.8_
  - [x] 2.8 Write the smoke test in test/smoke.test.tsx
    - Render `App` with `@testing-library/react` and assert the `h1` text. The test imports `../src/App.js`, which proves both the JSX transform (no React plugin in Vitest) and the `.js`-to-`.tsx` resolution. It asserts the setup stubs exist (`Path2D`, `matchMedia`, `ResizeObserver`, a canvas `getContext`).
    - Fallbacks, applied only if the test fails: if JSX does not transform, add `@vitejs/plugin-react` to `vitest.config.ts`; if `.js` specifiers do not resolve, change `module` to `ESNext` and `moduleResolution` to `Bundler` in `tsconfig.app.json` and `tsconfig.node.json`. In the second case report it so the user can write the ADR (docs/adr is the user's), and do not write the ADR.
    - _Requirements: 1.3, 9.8_
- [x] 3. Validator and loader
  - Adds the web's literal lists, the fixed-text load errors, the API base parser, the URL check, the contract validator, the loader with its body limit and the hook that owns the abort controller. Properties 7, 10, 11, 12 and 13 land here.
  - _Requirements: 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 1.10, 1.11, 1.12, 1.13, 1.14, 1.15, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 2.10, 2.12, 2.13, 2.14, 2.15, 2.16, 2.17, 2.18, 8.12_
  - [x] 3.1 Implement load/lists.ts, load/load-error.ts and load/api-base.ts
    - `lists.ts`: `STATES` (Possessed, Dead, Haunted, Restless, Alive), `SEVERITIES`, `SIGNAL_NAMES`, `RULE_TYPES`, `REMEDIATION_KINDS` as `as const` tuples, and the `Same`/`Assert` compile-time `ListsMatchContract` check against the contract list types, with `import type` only. `load-error.ts`: `LoadErrorCode`, `LoadError`, `LOAD_ERROR_TEXT` and `makeLoadError` (status kept only as an integer 100 to 599, at most five Contract errors). `api-base.ts`: `parseApiBase` (https only, no credentials, no `?` or `#` anywhere in the raw text, one trailing slash stripped, null otherwise).
    - Covered by tests in 3.5.
    - _Requirements: 1.4, 2.9, 2.10, 2.17_
  - [x] 3.2 Implement load/check-scan-url.ts
    - `checkScanUrl(input, pageOrigin, apiBaseUrl)` as in design.md: empty input rejected, `new URL(input, page.origin + "/")` in a try, only `http:` and `https:`, no credentials, same-origin accepted, otherwise accepted only for `https:` on the API base origin. Never throws.
    - Covered by tests in 3.6.
    - _Requirements: 2.3, 2.4, 2.5_
  - [x] 3.3 Implement load/validate-scan-response.ts
    - Export `CONTRACT_ERROR_CODES`, `ContractError`, `CONTRACT_ERROR_TEXT`, `MAX_PACKAGES` (300), `MAX_CONTRACT_ERRORS` (20), `ValidationResult` and `validateScanResponse`, as in design.md. A fixed-shape walk; opaque signal values are never traversed; paths and messages come only from fixed field names, indices and the seven-entry text table; at most 20 errors, ordered by path then code; `DUPLICATE`, `TOO_MANY_PACKAGES`, available envelope requires a `value` key; unknown keys ignored; `Object.hasOwn` for every read.
    - Covered by tests in 3.7.
    - _Requirements: 1.5, 1.6, 1.7, 1.8, 1.9, 1.10, 1.11, 1.12, 1.13, 1.14, 1.15_
  - [x] 3.4 Create test/arbitraries.ts with the shared generators
    - Export `arbState`, `arbSeverity`, `arbIsoDate`, `arbName`, `arbEnvelope`, `arbPackage`, `arbPackages(n)`, `arbPolicyResult`, `arbRemediations`, `arbScanResponse`, `arbBigScanResponse`, `arbFault`, `arbJson` and `arbHostile` as listed in design.md, typed against `@sexton/api`'s contract and not against engine test helpers. Later tasks append to this file in later waves.
    - _Requirements: 1.12, 1.13, 1.14, 2.21_
  - [x] 3.5 Write tests in test/lists.test.ts and test/api-base.test.ts
    - `lists.test.ts`: the five literal lists equal their expected arrays. `api-base.test.ts`: valid https value, empty, undefined, `http`, query, fragment, bare `?`, credentials, and trailing slash stripped. Examples only, no property.
    - _Requirements: 1.4, 2.17_
  - [x] 3.6 Write tests in test/check-scan-url.test.ts including Property 11
    - Property 11 (checkScanUrl accepts only same-origin or https API-origin URLs), numRuns 1000: never throws, deterministic, and every accepted URL is same-origin or `https` on the API base origin with no credentials; the generator mixes strings, web URLs, `//evil.example/x`, backslash forms, credentials, `javascript:`, `data:`, `blob:` and `file:`.
    - Examples from 2.4: each rejection row, and the same-origin accept rows.
    - Tag: `Feature: cemetery-ui, Property 11: checkScanUrl accepts only same-origin or https API-origin URLs`.
    - _Requirements: 2.3, 2.4, 2.5_
  - [x] 3.7 Write tests in test/validate-scan-response.test.ts including Properties 7 and 10
    - Property 7 (validateScanResponse accepts every valid response and rejects every faulty one), numRuns 1000: valid responses (including 0 and 300 packages) give `ok` true with a deeply equal value that survives `JSON.stringify` and `JSON.parse`; each one fault from `arbFault` gives `ok` false with an error at the faulty path. Property 10 (the validator is total, pure and deterministic on arbitrary JSON), numRuns 1000: never throws, does not mutate its input, equal results on two calls, `ok` iff no errors, at most 20 errors ordered by path then code, and no input string appears in any error.
    - Examples: one per error code; 300 accepted and 301 rejected; `report.scan` absent and present; unknown keys ignored.
    - Tags: `Feature: cemetery-ui, Property 7: validateScanResponse accepts every valid response and rejects every faulty one`, `Property 10: The validator is total, pure and deterministic on arbitrary JSON`.
    - _Requirements: 1.5, 1.6, 1.7, 1.8, 1.9, 1.10, 1.11, 1.12, 1.13, 1.14, 1.15_
  - [x] 3.8 Implement load/load-scan.ts
    - `MAX_SCAN_BYTES`, `LoadResult`, `LoadScanOptions` and `loadScan` as in design.md: GET with `credentials: "omit"`, `redirect: "error"`, `referrerPolicy: "no-referrer"`, only `Accept: application/json`; non-2xx gives `fetch-failed` with the status and the body unread; `Content-Length` early exit; streaming byte count against `maxBytes` with the reader cancelled on overflow; fatal UTF-8 decode; `JSON.parse` in a try; `validateScanResponse`; never rejects; no input string in any error.
    - Covered by tests in 3.10.
    - _Requirements: 2.6, 2.7, 2.8, 2.9, 2.10_
  - [x] 3.9 Implement load/use-scan-loader.ts
    - `LoadState` (with `isDemo` on the `ready` state), `ScanLoader` and `useScanLoader({ fetchFn, pageOrigin, apiBase, initialSearch })`: default address `/demo/scan.json` only when there is no `scan` parameter, no fallback to the demo when an explicit `scan` fails, one `AbortController` per start with the previous one aborted, results applied only for the current controller, `loadId` incremented per start, and `submitRepo` with the 1 to 200 character rule and the `{apiBase}/scan?repo=` form with `encodeURIComponent`. `isDemo` is true if and only if the address that passed `checkScanUrl` equals `new URL("/demo/scan.json", pageOrigin).href`; it is never read from the response, so a real repository named `sexton-demo/fixture` is not mislabelled.
    - Covered by tests in 3.10 and 8.5.
    - _Requirements: 2.1, 2.2, 2.12, 2.13, 2.14, 2.15, 2.16, 2.18, 8.12_
  - [x] 3.10 Write tests in test/load-scan.test.ts including Properties 12 and 13
    - Property 12 (load errors carry fixed text and never input), numRuns 1000: an injected `fetchFn` built from generated outcomes (statuses, bodies, invalid JSON, invalid responses, a hostile `scan` value) gives errors whose message is a fixed text plus at most a status and Contract errors, with no input string. Property 13 (the displayed result is the result of the latest load), numRuns 100: loads started in a generated sequence with deferred fetches resolved in a generated permutation, using `renderHook` on `useScanLoader`; the oracle is the last start's outcome.
    - Examples: request shape (GET, omit, error, one header); exactly 5 MiB accepted and one byte over rejected without parsing; status 503 gives "(HTTP 503)"; a `scan` that fails never falls back to the demo; `isDemo` true for the default load and false for another address whose response names `sexton-demo/fixture`; submit boundary at 200 and 201 characters.
    - Tags: `Feature: cemetery-ui, Property 12: Load errors carry fixed text and never input`, `Property 13: The displayed result is the result of the latest load`.
    - _Requirements: 2.1, 2.2, 2.6, 2.7, 2.8, 2.9, 2.10, 2.13, 2.15, 2.16, 2.18, 8.12_
- [x] 4. Triage sort and its properties
  - Adds the pure triage order: Possessed first, then state from least healthy to most healthy (Dead, Haunted, Restless, Alive), then advisory severity, then transitive reach, then name in code-unit order.
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10, 3.11, 3.12, 3.14_
  - [x] 4.1 Implement triage/triage.ts
    - Export `severityRank`, `reachRank`, `stateRank` (the index in `STATES`: Possessed 0, Dead 1, Haunted 2, Restless 3, Alive 4), `compareTriage` and `triageOrder`. `compareTriage` compares `stateRank` ascending, then `severityRank` descending, then `reachRank` descending, then name by `<` and `>` (no `localeCompare`). `triageOrder` returns `packages.slice().sort(compareTriage)` and does not mutate its input.
    - Covered by tests in 4.2 and 4.3.
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.14_
  - [x] 4.2 Write tests in test/triage.test.ts including Property 1
    - Property 1 (the triage sort is a total, stable, deterministic order), numRuns 100: antisymmetric, transitive and total over triples drawn from one list, a permutation of the input, deeply equal on two calls and on any reordering of distinct names, input deep-frozen to prove non-mutation, every Possessed package before every non-Possessed one, and the packages grouped by State in the order Possessed, Dead, Haunted, Restless, Alive (the `stateRank` sequence is non-decreasing). Result for 0 to 300 packages never throws.
    - Tag: `Feature: cemetery-ui, Property 1: The triage sort is a total, stable, deterministic order`.
    - _Requirements: 3.1, 3.2, 3.5, 3.6, 3.7, 3.10, 3.11, 3.14_
  - [x] 4.3 Add Property 23 and examples to test/triage.test.ts
    - Property 23 (triage monotonicity, stability and idempotence), numRuns 100: applying `triageOrder` twice equals once; packages with equal keys (same State, severity rank, reach rank and name, marked by a distinct `installedVersion`) keep input order; raising only a package's reach rank, or adding an advisory above its current maximum severity, never moves it later.
    - Examples: severity then reach then name tie-breaks inside one State; an unavailable advisories signal and an available empty one rank equally; an unavailable `transitiveReach` ranks as 0; names compare in code-unit order (an uppercase name before a lowercase one).
    - Tag: `Feature: cemetery-ui, Property 23: Triage monotonicity, stability and idempotence`.
    - _Requirements: 3.3, 3.4, 3.8, 3.9, 3.12_
- [x] 5. Layout and canvas renderer
  - Adds the shape and colour tables, the scene planner, the painter, the redraw scheduler, the e2e-only timing hook, the browser-state hooks, the Scene component and the first version of Cemetery.tsx. Properties 2, 3, 8, 9, 17, 19 and 20 land here.
  - _Requirements: 3.13, 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9, 4.10, 4.11, 4.12, 4.13, 4.14, 4.15, 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8, 5.9, 5.10, 6.13, 9.2, 9.3, 9.4, 9.5, 9.6_
  - [x] 5.1 Implement scene/shapes.ts and scene/palette.ts
    - `shapes.ts`: `shapeFor(state)` returning `upright` for Alive and Restless, `cross` for Haunted, `cracked` for Dead and `open` for Possessed, and four distinct SVG path strings with one fixed tilt for `cracked`. `palette.ts`: one colour table per theme (state colours, ghost, canvas background, selection ring, text, control borders, focus), `colourFor(state, theme)`, `applyPalette` writing CSS custom properties and `cssVariables`. State colours pairwise distinct per theme. No colour literal elsewhere.
    - Covered by tests in 5.7 and 10.2.
    - _Requirements: 4.2, 4.3, 4.4, 4.12, 5.5, 5.6_
  - [x] 5.2 Implement scene/layout.ts
    - `planScene`, `hasGhost`, `inscriptionFor` and `backingStore` with the constants and types of design.md: width at least 128, `columns = max(1, floor((width - 32) / 96))` (0 with no packages), `height = 32 + rows * 112`, one grave per package in triage order, ghosts only for an available non-empty advisories signal, inscriptions for 60 or fewer packages cut to 14 code units with an ellipsis (without splitting a surrogate pair), a ghost position that depends only on the phase, the selection ring, and `backingStore` with `scale = min(2, dpr, 16384 / cssW, 16384 / cssH)`.
    - Covered by tests in 5.6 and 5.7.
    - _Requirements: 3.13, 4.5, 4.6, 4.7, 4.8, 4.9, 4.10, 4.11, 4.13, 5.1, 5.4, 5.5, 5.10, 6.13_
  - [x] 5.3 Implement scene/scheduler.ts, scene/draw.ts and scene/timing-hook.ts
    - `scheduler.ts`: `createRedrawScheduler` coalescing invalidations into one `requestAnimationFrame` callback, with `dispose`. `draw.ts`: executes a `ScenePlan` with `Path2D` objects built once per shape, reading colours from the palette, with no layout logic. `timing-hook.ts`: `installTimingHook(repaint)` setting `window.__sextonTiming.redraw(n)`, reachable only through `if (__SEXTON_E2E__)` so it is compiled out of production.
    - Covered by tests in 5.8 and 5.9.
    - _Requirements: 4.1, 4.12, 4.13, 5.5, 9.2, 9.3, 9.4, 9.5, 9.6_
  - [x] 5.4 Implement hooks/use-media-query.ts, hooks/use-container-width.ts and hooks/use-ghost-phase.ts
    - `use-media-query`: `matchMedia` subscription for `prefers-color-scheme` and `prefers-reduced-motion`. `use-container-width`: `ResizeObserver` with notifications coalesced to at most one state update per animation frame. `use-ghost-phase(anyGhost, reducedMotion)`: toggles 0 and 1 every 1000 ms only while a ghost exists and Reduced motion does not apply, holds 0 and runs no timer under Reduced motion, and starts or stops without a reload when the query changes.
    - Covered by tests in 5.9.
    - _Requirements: 4.12, 4.9, 5.7, 5.8, 5.9, 9.5_
  - [x] 5.5 Implement scene/Scene.tsx and the first version of Cemetery.tsx, and add scene styles
    - `Scene.tsx`: one `canvas` with `aria-hidden="true"`, backing size from `backingStore`, painting through the scheduler only when the plan or palette identity changes, theme change repaints, and the timing hook installed only under `__SEXTON_E2E__`. `Cemetery.tsx`: `order = useMemo(triageOrder)`, `width`, `phase`, `plan = useMemo(planScene)`, the text "no direct dependencies in this scan" with no canvas for zero packages, and `key={loadId}` ready for 8.3. Selection state and the overlay are added in 6.3 and the drawer in 7.3. Add the scene rules to styles.css with colours only through custom properties.
    - Covered by tests in 5.9.
    - _Requirements: 4.1, 4.12, 4.14, 4.15, 9.2, 9.3, 9.4, 9.6_
  - [x] 5.6 Write tests in test/layout.test.ts including Properties 8, 19 and 20
    - Property 8 (layout is deterministic and no two graves overlap), numRuns 100, over any width and 0 to 300 packages, including every grave rectangle inside the canvas and the top-left Cell holding the first package. Property 19 (scene plan invariants), numRuns 100, with counts drawn from 0, 1, 59, 60, 61 and 300: one grave per package in order, equal width and height, opacity 1, no per-package numeric style, the ghost count equal to the non-empty advisories count, and inscriptions present for 60 packages and absent for 61, and a changed ghost phase leaving every rectangle, shape, fill and inscription unchanged. Property 20 (the canvas backing store respects the caps), numRuns 100: scale at most 2, no dimension above 16384, integer sizes.
    - Examples: 60 and 61 inscription boundary; zero packages gives `columns` 0 and `height` 0; widths 223 and 224 column boundary; 300 graves at width 128.
    - Tags: `Feature: cemetery-ui, Property 8: Layout is deterministic and no two graves overlap`, `Property 19: Scene plan invariants`, `Property 20: The canvas backing store respects the caps`.
    - _Requirements: 3.13, 4.6, 4.7, 4.8, 4.9, 4.10, 4.11, 4.13, 5.4, 5.5, 5.10, 6.13_
  - [x] 5.7 Write tests in test/shapes-palette.test.ts including Properties 2 and 3
    - Property 2 (grave shape and colour are functions of state only), numRuns 100: two packages with the same State give the same `shape` and `fill` whatever else differs; two different States differ in the (`shape`, `fill`) pair, Alive and Restless sharing `upright`; in both themes. Property 3 (a ghost is present if and only if the advisories signal is available and non-empty), numRuns 100: `hasGhost` and the planned ghosts match the direct predicate and the count matches.
    - Examples: four distinct shape path strings; five pairwise distinct colours per theme; `styles.css` holds no colour literal and every `var(--x)` it uses is in `cssVariables`.
    - Tags: `Feature: cemetery-ui, Property 2: Grave shape and colour are functions of state only`, `Property 3: A ghost is present if and only if the advisories signal is available and non-empty`.
    - _Requirements: 4.2, 4.3, 4.5, 5.1, 5.2, 5.3, 5.4_
  - [x] 5.8 Write tests in test/scheduler.test.ts including Property 17 (scheduler part)
    - Property 17 (redraws happen once per frame, and only for a change), numRuns 100: for any sequence of invalidations, focus-like no-op events and frame flushes, the number of paints equals the number of frames that held at least one change, several changes before a frame give one paint, and `dispose` cancels a pending frame.
    - Tag: `Feature: cemetery-ui, Property 17: Redraws happen once per frame, and only for a change`.
    - _Requirements: 9.2, 9.3, 9.4, 9.5_
  - [x] 5.9 Write tests in test/scene.test.tsx including Properties 9 and 17 (component part)
    - Property 9 (rendering never throws for 0 to 300 packages), numRuns 100, Scene and Cemetery part: any valid response renders without throwing, with a few size-300 cases. Property 17, component part, numRuns 100: events that change nothing (focus, blur, pointer move) leave the recorded paint count unchanged and a change gives exactly one paint.
    - Examples: canvas has `aria-hidden="true"` and a backing size; a theme change repaints with the other palette; the ghost timer with fake timers, Reduced motion on and off, started and stopped by a media change (5.7 to 5.9); zero packages shows the empty text and no canvas.
    - Tags: `Feature: cemetery-ui, Property 9: Rendering never throws for 0 to 300 packages`, `Property 17: Redraws happen once per frame, and only for a change`.
    - _Requirements: 4.12, 4.14, 4.15, 5.7, 5.8, 5.9, 9.2, 9.3_
- [x] 6. Keyboard overlay and selection
  - Adds the pure selection reducer, the grave label, the overlay of one button per package and the selection state in Cemetery. Properties 4, 5, 16 and 18 land here.
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.9, 6.10, 6.11, 6.12, 10.1, 10.2, 10.5_
  - [x] 6.1 Implement selection/selection.ts
    - Export `ArrowKey`, `moveSelection`, `KeyEvent`, `KeyOutcome` and `reduceSelection`. `moveSelection` clamps to `0..count-1` and treats `columns` below 1 as 1. `reduceSelection`: count 0 gives `{ index: null, handled: false, preventDefault: false }`; a non-arrow key leaves the index; an arrow key with no Ctrl, Alt or Meta gives `{ index: moveSelection(...), handled: true, preventDefault: true }`; an arrow key with Ctrl, Alt or Meta held gives `{ index: unchanged, handled: false, preventDefault: false }`. Hard-code the modifier behaviour, with no `PREVENT_DEFAULT_WITH_MODIFIER` constant.
    - Covered by tests in 6.4.
    - _Requirements: 6.4, 6.5, 6.7, 6.8_
  - [x] 6.2 Implement overlay/grave-label.ts and overlay/GraveButtons.tsx, and add overlay styles
    - `graveLabel(pkg)`: "{name} {installedVersion}, {state}" plus ", 1 advisory" or ", N advisories" only for an available non-empty advisories signal. `GraveButtons`: one `<button type="button" data-grave-index aria-label tabIndex>` per package in triage order, positioned from the plan rectangle through `style`, `tabIndex` 0 only on the selected one, a keydown handler that calls `reduceSelection`, calls `event.preventDefault()` only when the outcome says so (never with Ctrl, Alt or Meta), moves focus to the new button, and leaves the drawer state alone; Enter, Space and click call `onOpen`; `onFocus` sets the selection; no button when there are no packages. Add the focus-visible rule of at least 2 px to styles.css.
    - Covered by tests in 6.5.
    - _Requirements: 6.1, 6.3, 6.7, 6.8, 6.10, 6.11, 10.1, 10.2, 10.5_
  - [x] 6.3 Add selection state to Cemetery.tsx
    - `selectedIndex` initially 0, or null for no packages (6.2); the ring from the plan; `GraveButtons` rendered over the plan; the column count change keeps the index (6.9); a click on the canvas outside any button changes nothing (6.11). A new response remounts Cemetery through `key`, which resets the selection (6.12).
    - Covered by tests in 6.5 and 8.5.
    - _Requirements: 6.2, 6.9, 6.11, 6.12_
  - [x] 6.4 Write tests in test/selection.test.ts including Properties 5 and 18
    - Property 5 (the selection index stays in range under any arrow-key sequence), numRuns 100, over any count from 0 to 300, columns 1 to 20 and any key sequence including arrows with Ctrl, Alt or Meta; with a modifier held the outcome index equals the normalised input, `handled` and `preventDefault` are false, and with no modifier an arrow gives `preventDefault` true. Property 18 (arrow-key round trips and column changes), numRuns 100: ArrowRight then ArrowLeft returns the start index, ArrowUp then ArrowDown returns it when the index is at most `count - 1 - columns`, and a column change keeps the index.
    - Examples: Ctrl, Alt and Meta each leave the index unchanged with `preventDefault` false (6.8); non-arrow keys unhandled; count 0.
    - Tags: `Feature: cemetery-ui, Property 5: The selection index stays in range under any arrow-key sequence`, `Property 18: Arrow-key round trips and column changes`.
    - _Requirements: 6.4, 6.5, 6.6, 6.7, 6.8, 6.9_
  - [x] 6.5 Write tests in test/grave-buttons.test.tsx including Properties 4 and 16
    - Property 4 (the focusable grave count equals the package count), numRuns 100, with counts drawn from 0, 1, 60, 61 and 300 plus a generated count: one button per package in triage order, exactly one at `tabindex` 0 (the selected one) and the rest at -1, none for zero packages, `aria-label` equal to `graveLabel`. Property 16 (the grave label has the stated form), numRuns 100: one advisory, several, none, and an unavailable signal give the stated suffixes.
    - Examples: an arrow key moves focus and does not open the drawer; Alt+ArrowLeft is not default-prevented (check `event.defaultPrevented`); Enter, Space and click open it; a click outside a button does nothing.
    - Tags: `Feature: cemetery-ui, Property 4: The focusable grave count equals the package count`, `Property 16: The grave label has the stated form`.
    - _Requirements: 6.1, 6.2, 6.3, 6.7, 6.8, 6.10, 6.11, 10.1_
- [x] 7. Drawer with the signal-coverage property
  - Adds the drawer model, the value formatter, the focus trap and the Drawer component, wired into Cemetery. Properties 6, 15 and 21 land here.
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8, 7.9, 7.10, 7.11, 7.12, 7.13, 7.14, 7.15_
  - [x] 7.1 Implement drawer/format-value.ts and drawer/drawer-model.ts
    - `formatSignalValue(value)`: `JSON.stringify(value, null, 2)` with a fixed fallback text when it throws or returns undefined. `drawerModel(response, pkg)`: the State and `stateReason`; all ten signals in `SIGNAL_NAMES` order, each with name, `source`, `fetchedAt` and either a formatted value or "unavailable" with its `reason`; `missingSignals` as names or "none"; the failing rules whose `failures` hold the package name (rule index, type, name when present, and the failure's `reason`, `source` and `fetchedAt`, with "not recorded" for an absent field) or "no failing policy rules for this package"; the remediation kind, title and `prBody` as text or "no remediation proposed yet".
    - Covered by tests in 7.4 and 7.5.
    - _Requirements: 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8, 7.9, 7.15_
  - [x] 7.2 Implement drawer/focus-trap.ts and drawer/Drawer.tsx, and add drawer styles
    - `trapStep` as the pure step of the focus trap (last to first on Tab, first to last on Shift+Tab). `Drawer`: `role="dialog"`, `aria-modal="true"`, accessible name with the package name and installed version, rendered outside the canvas, focus to the close button on open, the rest of the page `inert` while open, Escape, close button and backdrop click close it, no control that opens a pull request, `prBody` in a `pre` as text only. Add the drawer rules to styles.css.
    - Covered by tests in 7.5.
    - _Requirements: 7.1, 7.10, 7.11, 7.12, 7.13_
  - [x] 7.3 Add drawer state to Cemetery.tsx
    - `openIndex` (null or an index) set by `onOpen`; the Drawer rendered when it is non-null; on close clear `openIndex` and, in a layout effect, focus `[data-grave-index="i"]` for the package the drawer showed; the selection and the response stay unchanged.
    - Covered by tests in 7.5.
    - _Requirements: 6.10, 6.12, 7.11, 7.13, 7.14_
  - [x] 7.4 Write tests in test/drawer-model.test.ts including Properties 6 and 15 (model part)
    - Property 6 (the drawer content shows every signal of the selected package), numRuns 100: for any valid response and package, all ten signal names appear in order with `source` and `fetchedAt`, available or not; `missingSignals` or "none". Property 15 (the drawer shows exactly the failing rules that name the package), numRuns 100: exactly the rules whose `failures` hold that name, identified by rule index.
    - Examples: a package with all ten signals unavailable; a deep opaque value gives the fixed text; no remediation gives the exact text.
    - Tags: `Feature: cemetery-ui, Property 6: The drawer content shows every signal of the selected package`, `Property 15: The drawer shows exactly the failing rules that name the package`.
    - _Requirements: 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8, 7.9, 7.15_
  - [x] 7.5 Write tests in test/drawer.test.tsx including Property 21
    - Property 21 (the focus trap cycles over any number of key presses), numRuns 100: for any count of focusable elements, start position and sequence of Tab and Shift+Tab presses, focus stays inside the drawer and cycles; includes a component example driving the real Drawer.
    - Component examples (render parts of Properties 6 and 15 use one example each): role, `aria-modal`, accessible name; focus goes to the close button on open; Escape, backdrop and close button close it; focus returns to the same grave button and the selection is unchanged; no pull-request control; `prBody` is shown in a `pre`.
    - Tag: `Feature: cemetery-ui, Property 21: The focus trap cycles over any number of key presses`.
    - _Requirements: 7.1, 7.11, 7.12, 7.13, 7.14_
- [x] 8. Header, notices and legend
  - Adds the header model and components, the "demo fixture, recorded data" label, and the App that wires the loader, the header and the load states. Properties 14 and 22 land here, with the App part of Property 9.
  - _Requirements: 2.11, 2.12, 2.14, 2.15, 2.16, 2.21, 4.14, 6.12, 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8, 8.9, 8.10, 8.11, 8.12, 8.13_
  - [x] 8.1 Implement header/header-model.ts
    - `HeaderModel` and `headerModel(response, isDemo)`: `repoText` (the repo URL or "no scan metadata in this response"), `scanTime`, `unlockedNotice` iff `scan.unlocked` or a non-empty `unlockedPackages` (both texts contain "unlocked", up to 20 names then "and N more"), `cappedNotice` iff `scan.capped`, `policyStatus`, `policyLabel`, `failingRules`, and `demoLabel`, which is "demo fixture, recorded data" when `isDemo` is true and null otherwise. `demoLabel` never reads `repo.owner` or `repo.repo`.
    - Covered by tests in 8.4.
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8, 8.12_
  - [x] 8.2 Implement header/Header.tsx and header/Legend.tsx, and add header styles
    - `Header`: `<header>` with the `h1`, repo text and scan time as text nodes (no link), the `demoLabel` in a span next to the repo text, the notices, the policy status as the word "pass" or "fail" with the label and failing count, the Legend control and the repository form (labelled input and submit button, both `disabled` with the exact text "hosted scan arrives with release 0.1 infra" when no API base URL is set, and a `role="alert"` paragraph for a validation message). `Legend`: a button with `aria-expanded` false at load and a `hidden` panel while closed, listing the five States with shape and palette colour from the same definitions as the Scene, a Ghost entry for "one or more advisories", and the line "Triage order: Possessed first, then state from least healthy to most healthy (Dead, Haunted, Restless, Alive), then highest advisory severity, then transitive reach, then name."
    - Covered by tests in 8.4.
    - _Requirements: 8.1, 8.2, 8.9, 8.10, 8.11, 8.12, 2.14, 2.16_
  - [x] 8.3 Wire App.tsx and main.tsx
    - `App` owns the loader, the theme and the repository field. It renders the `Header`, then one of: a `role="status"` "loading scan" paragraph and no scene, the Load error panel (code, message, status, up to five Contract errors as path, code and message, and no scene, no Grave button and no Drawer), or `<Cemetery key={loadId}>`. The ready state passes `isDemo` to `headerModel`. `main.tsx` reads `import.meta.env.VITE_SEXTON_API` once through `parseApiBase` and passes `window.fetch`, `location.origin` and `location.search` to `useScanLoader`.
    - Covered by tests in 8.5.
    - _Requirements: 2.11, 2.12, 2.14, 2.15, 2.16, 6.12, 8.12_
  - [x] 8.4 Write tests in test/header.test.tsx including Properties 14 and 22
    - Property 14 (header values follow the response exactly), numRuns 100: the unlocked notice iff `unlocked` or non-empty `unlockedPackages`, at most 20 names and "and N more"; the capped notice iff `capped`, holding the package count and `totalDirect`; status "pass" iff `policy.pass`; label by source; failing count; absent `scan` text; and `demoLabel` equal to "demo fixture, recorded data" iff `isDemo`, whatever `scan.repo` holds, with `sexton-demo` and `fixture` forced into one branch in five. Property 22 (untrusted strings are rendered only as text), numRuns 100: a response with hostile strings (markup, script text, URLs, control characters) renders the same element tag names in the Header, the overlay and the open Drawer as the same response with plain strings.
    - Examples: exact texts for missing metadata, the disabled field and the legend contents; the closed legend has `hidden` and `aria-expanded="false"`; the demo label is absent for a non-demo load of a response naming `sexton-demo/fixture`.
    - Tags: `Feature: cemetery-ui, Property 14: Header values follow the response exactly`, `Property 22: Untrusted strings are rendered only as text`.
    - _Requirements: 2.14, 2.21, 7.10, 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8, 8.9, 8.10, 8.11, 8.12_
  - [x] 8.5 Write tests in test/app.test.tsx including Property 9 (App part)
    - Property 9 (rendering never throws for 0 to 300 packages), numRuns 100, App part: any valid response served through an injected `fetchFn` renders the whole App without throwing, including the 300-package case.
    - Examples: the `scan` parameter and the default path with an injected response; a load error shows no scene, no Grave button and no Drawer; the loading status; a new response resets the selection and closes the drawer (6.12); only the three allowed URLs are requested and no registry, deps.dev, OSV or GitHub host (2.18); the submit boundary at 200 and 201 characters; the disabled field text.
    - Tag: `Feature: cemetery-ui, Property 9: Rendering never throws for 0 to 300 packages`.
    - _Requirements: 2.11, 2.12, 2.14, 2.15, 2.16, 2.18, 4.14, 6.12, 8.13_
- [x] 9. Demo-scan generator and bundled demo data
  - Adds the offline generator in packages/api/scripts that scores the ten recorded fixtures plus the seeded Possessed package, evaluates the default policy and writes packages/web/public/demo/scan.json, which is generated and not committed.
  - _Requirements: 2.19, 2.20_
  - [x] 9.1 Create packages/api/scripts/lib/fixture-routes.mjs
    - Plain JavaScript copy of the engine's `routedTransport` and `fixtureRoutes` logic (about 50 lines), reading fixture data files by a path resolved from `import.meta.url`, importing no TypeScript and not `test/helpers.ts`. The routed transport throws on any unrouted URL, so the build fails rather than touching the network.
    - Covered by tests in 9.4.
    - _Requirements: 2.19_
  - [x] 9.2 Create packages/api/scripts/generate-demo-scan.mjs
    - Export `buildDemoScan({ fixturesDir, now })`: read `packages.json` (ten refs) and `seed-maintainer-change.json`, build routes for the ten plus the five `left-padder` 1.2.1 routes, fill an `InMemorySnapshotStore` from the seed, call `scorePackages` with the fixed clock `2026-11-12T00:00:00Z`, no retry sleep and the snapshot store, evaluate the default policy with source "default", and attach `report.scan` with `repo: { owner: "sexton-demo", repo: "fixture", url: "https://github.com/sexton-demo/fixture" }`, `unlocked: false`, `unlockedPackages: []`, `lockfileVersion: 3`, `capped: false`, `totalDirect: 11`, `skipped: { peer: 0, optional: 0, invalidName: 0 }` and `unresolved: []`. Return `{ report, policy }` with no `remediations` and no demo flag. When run as a script write `packages/web/public/demo/scan.json` as `JSON.stringify(scan, null, 2) + "\n"`, with no clock read other than the fixed one.
    - Covered by tests in 9.4.
    - _Requirements: 2.19, 2.20_
  - [x] 9.3 Wire the scripts and the .gitignore entries
    - packages/api/package.json: `predemo:generate` (`tsc -b`) and `demo:generate` (`node scripts/generate-demo-scan.mjs`). packages/web/package.json: `pretest` and `prebuild` both `npm run demo:generate -w @sexton/api`. `.gitignore`: add `packages/web/public/demo/scan.json`, `packages/web/dist-e2e`, `packages/web/dist-types`, `packages/web/test-results`, `packages/web/playwright-report` and `packages/web/e2e-artifacts`. A fresh clone then needs only install and test.
    - _Requirements: 2.19_
  - [x] 9.4 Write tests in packages/api/test/generate-demo-scan.test.ts
    - Examples only (no property): eleven packages; the ten states equal `packages/engine/test/fixtures/expected-states.json`, so the copied routing cannot drift; `left-padder` is Possessed with the reason "maintainer change in the last 90 days"; `policy.source` is "default" and `policy.pass` is false; `report.scan.repo` is `sexton-demo/fixture`; two runs give byte-identical output; an unrouted URL makes the build fail; the output has no `remediations` key.
    - _Requirements: 2.19, 2.20_
  - [x] 9.5 Add the web-side demo-scan support and examples
    - Create test/support/demo-scan.ts reading the generated `public/demo/scan.json` from disk (failing with a clear message if the generator has not run). Add examples: the Demo scan passes `validateScanResponse` (validate-scan-response.test.ts); its triage order is `left-padder` first, then the Dead packages, then `lodash` (triage.test.ts); the default load in app.test.tsx serves the Demo scan, shows eleven grave buttons and the text "demo fixture, recorded data" in the header, and a non-demo load of the same body shows no such text. Edits to existing test files are additive only.
    - _Requirements: 2.1, 2.20, 3.2, 8.12_
- [x] 10. Accessibility
  - Adds the axe-core check in jsdom, the palette contrast test, the ARIA and landmark checks, and the template of the R-UI-5 sign-off. No property test applies: these are fixed views and fixed palette pairs.
  - _Requirements: 4.4, 4.12, 5.6, 6.13, 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 10.8, 10.9_
  - [x] 10.1 Write the axe-core test in test/a11y.test.tsx
    - Run `axe.run` directly in jsdom with `runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] }` and `rules: { "color-contrast": { enabled: false } }`, and assert zero violations on five views: the loaded Demo scan, the open Drawer, the open Legend, a Load error and the disabled repository field. Do not use `vitest-axe`.
    - _Requirements: 10.4_
  - [x] 10.2 Add the palette contrast tests to test/shapes-palette.test.ts
    - Compute WCAG 2.1 relative luminance and contrast ratios from the palette, in both themes: every text and background pair at least 4.5; every State colour, Ghost, selection ring, focus indicator and control border at least 3 against its background; Alive against Restless at least 1.5; and the CSS pairs read from the custom properties that `styles.css` uses. Additive to the file from 5.7.
    - _Requirements: 4.4, 4.12, 5.6, 6.13, 10.3_
  - [x] 10.3 Add the ARIA, landmark and keyboard checks to test/a11y.test.tsx
    - Assert: the page `lang`, a title, one `h1`, a `header` and a `main` landmark, a labelled repository field (10.6); the canvas `aria-hidden="true"` and every grave button's aria-label (10.1, 10.2); every interactive element (Legend control, field, submit, Drawer controls, grave buttons through the roving tab stop) reachable by Tab, with no trap other than the Drawer that Escape leaves (10.5); a focus-visible rule of at least 2 px in `styles.css` (10.7); State, policy status and notices present as text (10.8).
    - _Requirements: 10.1, 10.2, 10.5, 10.6, 10.7, 10.8_
  - [x] 10.4 Create the R-UI-5 sign-off template at docs/ui-readability-sign-off.md
    - Mark it at the top as "manual, filled in by the user". Fields: reviewer name, date, commit SHA, the viewport (1280 by 800, Legend closed, no explanation), the reviewer's answer to "which grave to fix first", the reviewer's answer to "what does a ghost mean", and pass or fail. The agent leaves every field blank. Submission waits for a recorded pass.
    - _Requirements: 10.9_
- [x] 11. Playwright smoke test
  - Adds the e2e build mode, the production CSP, the bundle check, the Playwright config and the one smoke test with the screenshot and the 300-grave timing budget. Playwright is not part of the root `npm test`.
  - _Requirements: 2.22, 9.1, 9.6, 9.7_
  - [x] 11.1 Add the e2e mode, the CSP plugin and the scripts
    - `vite.config.ts`: the inline `cspPlugin` (`apply: "build"`, `transformIndexHtml` inserting the CSP meta with `connect-src 'self'` plus the API origin only when `VITE_SEXTON_API` parses as https with no credentials, query or fragment), applied to the e2e build too. `index.html` keeps a placeholder for it. packages/web/package.json: `postbuild` (`node scripts/check-bundle.mjs`), `test:e2e` (`playwright test`), `pretest:e2e` (demo generate, then `vite build --mode e2e --outDir dist-e2e`).
    - _Requirements: 2.22, 9.6_
  - [x] 11.2 Create packages/web/scripts/check-bundle.mjs
    - Scan every file in `dist` and exit non-zero when any contains `__sextonTiming` or the string `axe-core`, and print the offending file. It reads the production build only, not `dist-e2e`.
    - _Requirements: 9.6_
  - [x] 11.3 Create packages/web/playwright.config.ts
    - `testDir: "e2e"`, Chromium only, a `webServer` of `vite preview --outDir dist-e2e --port 4173 --strictPort`, base URL `http://localhost:4173`, and output under `test-results`.
    - _Requirements: 9.7_
  - [x] 11.4 Write e2e/smoke.spec.ts
    - Start with `test.skip(!existsSync(chromium.executablePath()), "chromium is not installed")`. Route every request and abort any whose origin is not the local server. At 1280 by 800 load `/`, assert the `header`, the text "demo fixture, recorded data", and eleven `button[data-grave-index]` elements, check the built HTML carries the CSP meta, and save a screenshot to `docs/cemetery.png`. Then fulfil `/test/scan-300.json` through `page.route` with a 300-package response built in the test (every package with a ghost, no file added to `public`), load `/?scan=/test/scan-300.json`, call `window.__sextonTiming.redraw(30)` and assert the median of the 30 times is at most 16 ms.
    - _Requirements: 9.1, 9.7, 2.22, 8.12_
  - [x] 11.5 Orchestrator runs the browser install and the e2e run
    - The orchestrator runs `npx playwright install chromium`, then `npm run test:e2e -w @sexton/web`, then `npm run build -w @sexton/web` (which runs `check-bundle.mjs`). The impl agent runs none of them. Report the median redraw time and whether the smoke test ran or skipped.
    - _Requirements: 9.1, 9.6, 9.7_
  - [x] 11.6 STOP: user reviews docs/cemetery.png before the final commit
    - Stop here. The user opens docs/cemetery.png, confirms it shows the cemetery at 1280 by 800, and only then is docs/cemetery.png committed. Nothing is committed by an agent. Do not continue to the root gates until the user confirms.
    - _Requirements: 9.7, 10.9_
- [x] 12. Root gates
  - Runs the repository-wide checks and adds the static check that web holds no runtime engine import.
  - _Requirements: 1.3, 1.16, 2.18, 2.21, 9.8_
  - [x] 12.1 Write the static checks in test/imports.test.ts
    - Read every file under `packages/web/src` and assert: each import from `contract` or from `@sexton/*` is an `import type` or `export type`, and none is a runtime import of `@sexton/engine` (1.3); no `dangerouslySetInnerHTML`, `innerHTML`, `insertAdjacentHTML` or `eval` (2.21); and read `packages/web/package.json` and assert every version is exact (no `^`, `~` or range), the runtime `dependencies` are exactly `react` and `react-dom`, and the pins equal the list in design.md (1.16).
    - _Requirements: 1.3, 1.16, 2.21_
  - [x] 12.2 Run typecheck, lint and test at the root
    - `npm run typecheck`, `npm run lint` and `npm test` at the repository root, each across every package. Lint allows zero warnings. If the agent's shell Node differs from Node 22 or lacks the platform rollup binary, the three commands are run in the user's own terminal and the results reported. Playwright is not part of this run.
    - _Requirements: 1.3, 9.8_
  - [x] 12.3 Review checks
    - Grep `packages/web/test`, `packages/api/test` and `packages/api/scripts` for `fetch(` and confirm every hit is an injected fake or a stub, so no test makes a network call and no script calls out. Confirm every dependency pin in the new package.json files is exact, that react and react-dom are the only new runtime dependencies, and that `git diff --name-only -- packages/engine/test` is still empty. List the one-line justification of each new dependency for the PR body.
    - _Requirements: 1.16, 2.18, 9.8_

## Notes

- Each sub-task names the requirements it implements. Every PR names this spec.
- Component order follows wiring: Cemetery.tsx is created in 5.5, extended in 6.3 and 7.3, and used by App.tsx in 8.3.
- Properties by task: 3 (7, 10, 11, 12, 13), 4 (1, 23), 5 (2, 3, 8, 9 Scene part, 17, 19, 20), 6 (4, 5, 16, 18), 7 (6, 15, 21), 8 (9 App part, 14, 22).

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "2.1"] },
    { "id": 1, "tasks": ["1.3", "1.4", "2.2", "9.1"] },
    { "id": 2, "tasks": ["1.5", "2.3", "2.4", "2.5", "2.6", "2.7", "9.2"] },
    { "id": 3, "tasks": ["1.6", "2.8"] },
    { "id": 4, "tasks": ["3.1", "3.2"] },
    { "id": 5, "tasks": ["3.3", "3.4", "3.5", "3.6", "4.1", "5.1", "5.4", "6.1", "7.1", "8.1"] },
    { "id": 6, "tasks": ["3.7", "3.8", "4.2", "5.2", "6.4", "7.2", "7.4", "9.3", "9.4"] },
    { "id": 7, "tasks": ["3.9", "4.3", "5.3", "5.6", "5.7", "6.2"] },
    { "id": 8, "tasks": ["3.10", "5.5", "5.8", "6.5", "10.4"] },
    { "id": 9, "tasks": ["5.9", "6.3", "8.2"] },
    { "id": 10, "tasks": ["7.3"] },
    { "id": 11, "tasks": ["7.5", "8.3", "8.4"] },
    { "id": 12, "tasks": ["8.5", "10.2"] },
    { "id": 13, "tasks": ["9.5"] },
    { "id": 14, "tasks": ["10.1", "11.1", "11.2", "11.3"] },
    { "id": 15, "tasks": ["10.3", "11.4", "12.1"] },
    { "id": 16, "tasks": ["11.5"] },
    { "id": 17, "tasks": ["11.6"] },
    { "id": 18, "tasks": ["12.2", "12.3"] }
  ]
}
```
