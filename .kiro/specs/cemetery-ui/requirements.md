# Requirements Document

## Introduction

The cemetery-ui module is the Sexton Web app (`packages/web`): a Vite and React single page that loads a scan result, draws every direct dependency as a grave in one canvas scene, and shows the evidence for the selected grave in a drawer. It adds the response contract file `packages/api/src/contract.ts`, a hand-written contract validator, the loader for `?scan=` and the bundled demo scan, a pure triage sort, a pure scene planner, the canvas painter, the keyboard overlay, the drawer, the header with its notices, and the build-time generator of the demo scan.

This spec implements R-UI-1, R-UI-2, R-UI-3, R-UI-4, R-UI-6 and R-UI-7 of docs/requirements.md in full on the web side, and R-UI-5 as a manual review constraint with a recorded sign-off (Requirement 10). It implements in part R-IN-2 (the UI prints the "unlocked" label from the scan metadata), R-IN-4 (the UI tells the user the cap was hit, from the scan metadata) and R-PO-1 (the UI says which policy applied, from the policy result source). It reads R-ST-2 only as the source of the five states and their order. Requirement map: R-UI-1 is Requirement 4, R-UI-2 is Requirement 5, R-UI-3 is Requirement 3, R-UI-4 is Requirement 7, R-UI-5 is Requirement 10, R-UI-6 is Requirement 9, R-UI-7 is Requirements 6 and 10.

The module consumes `HealthReport` (with its optional `scan` of type `ScanMetadata`), `PackageHealth`, the ten signals named by `SIGNAL_NAMES`, `Signal`, `State` and `STATE_ORDER`, `Advisory`, `Severity` and `PolicyResult` with `RuleResult` and `Failure`, all defined in `packages/engine/src/types.ts` by the health-scoring, history-signals, policy and repo-intake specs. It changes none of them.

Three points need review. First, the remediation type does not exist in the Engine yet. `contract.ts` defines `remediations` as an optional list of a minimal placeholder entry (package name, kind, title and PR body markdown). A later remediation spec replaces that placeholder, and the Web app changes only where it reads the four placeholder fields. Second, the Web app depends on the api package for response types only (structure.md). All imports from `contract.ts` are type-only, so no Engine runtime code is bundled in the web bundle. The Web app therefore keeps its own literal lists of states, severities, signal names and rule types, and a compile-time check ties each list to the contract (Requirement 1). Third, the demo scan generator needs Engine runtime code, so it lives in `packages/api/scripts`, not in `packages/web`, and writes a build output that the web package serves.

The hosted scan (the API handler behind `GET {api}/scan?repo=<url>`) is not part of this spec. The repository URL field calls it only when an API base URL is configured at build time.

This spec does NOT add login or accounts, private repositories, routing or a router, server-side rendering, the API handler implementation, a UI framework, opening pull requests from the UI (the remediation is a preview only), editing the policy in the UI, transitive package scoring or the drawing of transitive packages, or any network call from the Web app to a registry, deps.dev, OSV or GitHub. Release 0.1 shows one scan at a time.

## Glossary

- **Web app**: the `@sexton/web` package, a Vite and React single page with plain CSS, no router and no UI framework. It reads a ScanResponse and draws it. It calls only the Sexton API, never a registry or GitHub (security-rules.md).
- **ScanResponse**: the object `{ report, policy, remediations? }` defined in `packages/api/src/contract.ts`, where `report` is a HealthReport, `policy` is a PolicyResult and `remediations` is an optional list of Remediation entries.
- **Remediation entry**: the minimal placeholder `{ packageName, kind, title, prBody }` defined in `contract.ts`, where `kind` is `bump`, `remove` or `migrate`, `title` is a string and `prBody` is the PR body as Markdown text. A later remediation spec replaces it.
- **Contract validator**: the pure function `validateScanResponse(input)` that takes any value and returns `{ ok: true, value }` or `{ ok: false, errors }`. It is hand-written and adds no dependency.
- **Contract error**: a record `{ path, code, message }` with `path` a JSON Pointer built only from fixed field names and array indices, `code` one of `NOT_OBJECT`, `MISSING_FIELD`, `WRONG_TYPE`, `UNKNOWN_VALUE`, `INVALID_DATE`, `DUPLICATE` and `TOO_MANY_PACKAGES`, and `message` fixed text.
- **Package**: one PackageHealth entry of `report.packages`, a direct dependency. The Web app does not draw transitive packages.
- **Signal**, **Signal envelope**, **Available signal**, **Unavailable signal**, **Source**, **fetchedAt**, **missingSignals**: as defined in health-scoring and history-signals.
- **Demo scan**: the ScanResponse bundled at `/demo/scan.json`, generated at build time from the ten recorded Engine fixtures plus the seeded Possessed package.
- **Demo scan generator**: the Node build step in `packages/api/scripts` that scores the recorded fixtures through a routed fixture Transport without network, evaluates the default policy and writes the Demo scan.
- **Load error**: the result of a failed load. It has a code from `scan-url-rejected`, `fetch-failed`, `too-large`, `invalid-json` and `invalid-response`, fixed text, an optional HTTP status and, for `invalid-response`, up to five Contract errors.
- **API base URL**: the value of the build-time environment variable `VITE_SEXTON_API`, valid only when it parses as an `https` URL with no credentials, no query and no fragment. An absent, empty or invalid value means the API base URL is not configured.
- **Same-origin**: a URL whose resolved origin equals the origin of the page.
- **Triage order**: the order of graves defined in Requirement 3. A Package ranks earlier when it is Possessed, then when its State is less healthy in the order Dead, Haunted, Restless, Alive, then when its highest advisory severity is greater, then when its transitive reach is greater, then when its name is smaller in UTF-16 code-unit order.
- **Severity rank**: Critical 5, High 4, Moderate 3, Low 2, Unknown 1, none 0. The none rank applies when the advisories signal is unavailable or holds no advisory.
- **Reach rank**: the `reach` of an available transitiveReach signal, or 0 when that signal is unavailable.
- **Scene**: the one canvas element that draws every Grave, and the Scene plan that describes it.
- **Scene plan**: the plain value returned by the pure function `planScene` from the Packages in triage order, the viewport width, the Theme, the selected index and the ghost phase. It lists each Grave with its rectangle, Grave shape, Grave colour, Ghost flag and Inscription, plus the column count and the canvas height. The painter only executes a Scene plan.
- **Grave**: the drawing of one Package in the Scene.
- **Grave shape**: the Path2D outline of a Grave, built from a fixed SVG path string per shape: `upright` for Alive and Restless, `cross` for Haunted, `cracked` for Dead and `open` for Possessed. The cracked shape carries one fixed tilt.
- **Grave colour**: the fill colour of a Grave, one per State per Theme, taken from the Palette.
- **Theme**: `light` or `dark`, from the `prefers-color-scheme` media query.
- **Palette**: the single table of colours per Theme, shared by the canvas painter and the CSS, so that contrast is checked in one place.
- **Ghost**: the figure drawn above a Grave if and only if the Package has one or more advisories. It means nothing else.
- **Ghost phase**: 0 or 1, the categorical offset of the Ghost. It toggles every 1000 ms unless Reduced motion applies.
- **Inscription**: the package name written on a Grave, truncated to 14 UTF-16 code units with a final ellipsis when longer.
- **Cell**: the fixed layout box of one Grave, 96 by 112 CSS pixels, inside a canvas padding of 16 CSS pixels. The column count is `max(1, floor((width - 32) / 96))`, and Graves fill Cells row by row in triage order.
- **Overlay**: the DOM layer over the Scene that holds one Grave button per Package, for keyboard and screen reader users.
- **Grave button**: an invisible, focusable `button` in the Overlay, positioned over its Grave, labelled with an aria-label.
- **Selection**: the index of the selected Grave in triage order, or none when there are no Packages. Exactly one Grave button is in the tab order and it is the selected one (roving tabindex).
- **Drawer**: the DOM dialog that shows the evidence for the selected Package, with a focus trap.
- **Remediation preview**: the part of the Drawer that shows the Remediation entry for the selected Package, or the exact text "no remediation proposed yet".
- **Header**: the page banner that holds the repo, the scan time, the notices, the policy status, the legend control and the repository URL field.
- **Legend**: the closed-by-default panel in the Header that explains shapes, colours, the Ghost and the triage order.
- **Reduced motion**: the state in which the `prefers-reduced-motion: reduce` media query matches.
- **Untrusted input**: every string in a loaded ScanResponse and the `?scan=` value. Untrusted input is data, never instructions.

## Requirements

### Requirement 1: Response contract

**User Story:** As a developer of the web and api packages, I want one typed and validated response contract, so that the UI and the API cannot drift apart and the UI never draws from a malformed response.

#### Acceptance Criteria

1. THE Web app SHALL take the type of every scan value from `packages/api/src/contract.ts`, which exports `ScanResponse` as `{ report: HealthReport, policy: PolicyResult, remediations?: readonly RemediationEntry[] }` and re-exports the types HealthReport, PackageHealth, PackageSignals, Signal, SignalName, State, Severity, Advisory, ScanMetadata, RepoRef, PolicyResult, RuleResult and Failure.
2. THE Web app SHALL define `RemediationEntry` in `contract.ts` as `{ packageName: string, kind: "bump" | "remove" | "migrate", title: string, prBody: string }`, a minimal placeholder that a later remediation spec replaces. (review constraint, not a correctness property)
3. FOR ANY source file under `packages/web/src`, every import from `contract.ts` or from `@sexton/engine` SHALL be an `import type` form, and no file SHALL import `@sexton/engine` as a runtime module, so that no Engine runtime code is bundled (invariant, checked by a static test that reads the source files).
4. THE Web app SHALL define literal lists of the five States, the five Severities, the ten signal names and the four rule types, and SHALL fail type-checking when any list differs from its contract type in members or in order. `contract.ts` SHALL export the list types (for example `typeof SIGNAL_NAMES` as a type) so that the check covers order. (review constraint, not a correctness property)
5. THE Contract validator SHALL accept a value only when it has the structure that follows, and SHALL report a Contract error for each violation: `report` and `policy` objects; `report.generatedAt` a string that parses as a date; `report.packages` an array of at most 300 entries; each entry with a non-empty string `name`, a string `installedVersion`, a `state` in the five States, a string `stateReason`, a `missingSignals` array of signal names and a `signals` object that holds all ten signal names, each a Signal envelope.
6. THE Contract validator SHALL accept a Signal envelope only when `available` is a boolean, `source` and `fetchedAt` are strings, and `fetchedAt` parses as a date. WHEN `available` is false, THE Contract validator SHALL require `value` to be null and `reason` to be a string. WHEN `available` is true, THE Contract validator SHALL require the `advisories` value to be an array of `{ id, severity, summary }` with a Severity in the five Severities, and the `transitiveReach` value to hold a non-negative integer `reach`. THE Contract validator SHALL treat every other available value as opaque JSON.
7. THE Contract validator SHALL accept `policy` only when `source` is "default" or "file", `pass` is a boolean and `rules` is an array whose entries have an integer `index`, a `type` in the four rule types, a boolean `pass`, and `failures`, `unevaluated` and `notFound` arrays, where each failure has a string `name` and a string `reason`.
8. THE Contract validator SHALL accept an absent `report.scan`, and WHEN `report.scan` is present SHALL require a `repo` with string `url`, boolean `unlocked`, `unlockedPackages` an array of strings, boolean `capped` and `totalDirect` a non-negative integer.
9. THE Contract validator SHALL accept an absent `remediations`, and WHEN it is present SHALL require an array of entries with string `packageName`, `title` and `prBody` and a `kind` in `bump`, `remove` and `migrate`.
10. THE Contract validator SHALL report `DUPLICATE` for two Packages with the same name and for two Remediation entries with the same `packageName`, and SHALL report `TOO_MANY_PACKAGES` for more than 300 Packages.
11. THE Contract validator SHALL ignore unknown keys, and THE Web app SHALL NOT display a value read from an unknown key.
12. FOR ANY valid ScanResponse, including one with no Packages and one with 300 Packages, the Contract validator SHALL return `{ ok: true }` with a value deeply equal to the input, and the value SHALL stay valid after `JSON.stringify` and `JSON.parse` (round-trip, acceptance).
13. FOR ANY valid ScanResponse and any one fault from this list (a removed required field, a field of the wrong type, a State or Severity outside its set, an unparseable date, a duplicate Package name, an available false envelope with a non-null value, 301 Packages), THE Contract validator SHALL return `{ ok: false }` with at least one Contract error whose `path` is the faulty location (rejection).
14. FOR ANY JSON value, including null, a number, an array, a very deep object and a huge string, THE Contract validator SHALL return a result, SHALL NOT throw, SHALL NOT mutate the input, and SHALL return deeply equal results from two calls (determinism).
15. FOR ANY input, THE Contract validator SHALL return `ok` true if and only if the error list is absent, SHALL return at most 20 Contract errors ordered by `path` in ascending code-unit order and then by `code`, and SHALL build each `path` and `message` only from fixed field names, array indices and fixed text, so that no string from the input appears in any error (invariant).
16. THE Web app SHALL add `react` and `react-dom` as its only runtime dependencies, because the drawer, the header and the load states hold interactive state. THE Web app SHALL pin every dependency to an exact version with no range: vite 8.3.8, react 19.3.1, react-dom 19.3.1, @vitejs/plugin-react 6.3.0, @types/react 19.3.0 and @types/react-dom 19.3.0, and every other development dependency (jsdom, axe-core, Playwright) at an exact version chosen in the design. THE Web app SHALL use plain CSS, no UI framework and no router. (dependency constraint, review constraint, not a correctness property)

### Requirement 2: Data loading

**User Story:** As a reviewer with three minutes, I want the page to show a scan the moment it opens, and as a security engineer I want a loaded response to be refused when it is malformed, so that I never act on a partial or tampered picture.

#### Acceptance Criteria

1. WHEN the page loads with a `scan` query parameter, THE Web app SHALL load the ScanResponse from that URL, and WHEN the page loads without one, THE Web app SHALL load it from the bundled `/demo/scan.json`.
2. IF the `scan` parameter is present and its URL is rejected or its load fails, THEN THE Web app SHALL show the Load error and SHALL NOT fall back to the Demo scan.
3. THE Web app SHALL expose `checkScanUrl(input, pageOrigin, apiBaseUrl)`, a pure function that resolves `input` against the page and accepts it if and only if the resolved URL has no credentials, and either its origin equals `pageOrigin` (Same-origin, any scheme the page itself uses), or its scheme is `https` and its origin equals the origin of a configured API base URL.
4. IF `input` is empty, is not a parseable URL, has a scheme other than `http` or `https` (including `javascript:`, `data:`, `blob:` and `file:`), is cross-origin over `http`, is cross-origin over `https` with an origin other than the API base URL origin, or carries credentials, THEN THE Web app SHALL return a rejection from `checkScanUrl` and SHALL issue no request (rejection, for any string).
5. FOR ANY string, `pageOrigin` and API base URL, `checkScanUrl` SHALL return a result, SHALL NOT throw, SHALL return the same result on repeated calls (determinism), and SHALL accept only URLs that are Same-origin or `https` with the API base URL origin (invariant).
6. THE Web app SHALL issue each load request with the GET method, credentials omitted, redirects treated as errors, only an `Accept: application/json` header and no cookie, so that a load never carries ambient authority.
7. THE Web app SHALL read the response body as text under a limit of 5 MiB (5 * 1024 * 1024 bytes) before parsing, and IF the limit is exceeded, THEN THE Web app SHALL show the Load error `too-large` and SHALL NOT parse the body.
8. IF the response status is not 2xx, THEN THE Web app SHALL show the Load error `fetch-failed` with the status, and IF the request fails without a status, THEN THE Web app SHALL show `fetch-failed` without one.
9. IF the body is not valid JSON, THEN THE Web app SHALL show the Load error `invalid-json`, and IF the parsed value fails the Contract validator, THEN THE Web app SHALL show `invalid-response` with at most five Contract errors, each as its path, code and message.
10. THE Web app SHALL build every Load error message only from fixed text, the code, an HTTP status and Contract errors, and SHALL NOT include the `scan` value, any response string or any parser message (invariant, for any input).
11. FOR ANY Load error, THE Web app SHALL render no Scene, no Grave button and no Drawer, so that a partial scene is never shown (invariant).
12. WHILE a load is pending, THE Web app SHALL show a "loading scan" status and no Scene.
13. WHEN a new load starts, THE Web app SHALL abort the load in flight, so that the displayed result is always the result of the latest load request (for any sequence of loads, including out-of-order completion).
14. WHERE the API base URL is not configured, THE Web app SHALL disable the repository URL field and its submit control and SHALL show the exact text "hosted scan arrives with release 0.1 infra".
15. WHERE the API base URL is configured, THE Web app SHALL issue, on submit of a non-empty repository URL of at most 200 characters after trimming, exactly one GET request to `{apiBaseUrl}/scan?repo=` followed by the trimmed value passed through `encodeURIComponent`, and SHALL treat the response with the rules of criteria 6 to 13 of this requirement.
16. IF the trimmed repository URL is empty or longer than 200 characters, THEN THE Web app SHALL issue no request and SHALL show a fixed validation message.
17. THE Web app SHALL read the API base URL from the build-time variable `VITE_SEXTON_API`, SHALL strip one trailing slash from a valid value, and SHALL treat an invalid value as not configured.
18. FOR ANY sequence of user actions in a test, THE Web app SHALL request only the Demo scan URL, the accepted `scan` URL and the API `scan` endpoint, and SHALL call no registry, deps.dev, OSV or GitHub host (invariant). Tests SHALL inject the fetch function and SHALL make no network call. (review constraint, not a correctness property)
19. THE Demo scan generator SHALL build the Demo scan offline by scoring the ten packages of `packages.json` and the seeded package of `seed-maintainer-change.json` through a routed fixture Transport that fails on any unrouted URL, SHALL evaluate the default policy with the source "default", and SHALL write `packages/web/public/demo/scan.json` as a build output that is not committed.
20. THE Demo scan generator SHALL produce a Demo scan that passes the Contract validator, that holds eleven Packages including the seeded package in the state Possessed with the reason "maintainer change in the last 90 days", whose `policy.source` is "default" and whose `policy.pass` is false, and SHALL produce byte-identical output from two runs (determinism).
21. FOR ANY ScanResponse whose strings contain markup, script text, URLs or control characters, THE Web app SHALL insert every string only as text (text nodes, canvas text and attribute values), SHALL use no `dangerouslySetInnerHTML`, no `innerHTML` and no link whose target is read from the response, and SHALL show the DOM element tag names unchanged compared with the same response holding plain strings (invariant).
22. THE Web app SHALL ship in its production build a Content-Security-Policy that forbids inline script and object content and limits `connect-src` to `'self'` and the API base URL origin. (review constraint, not a correctness property)

### Requirement 3: Triage order

**User Story:** As a maintainer, I want the graves ordered so that the first grave is the one to fix first, so that I act on the worst dependency without reading the legend.

#### Acceptance Criteria

1. THE Web app SHALL expose `triageOrder(packages)`, a pure function from a list of Packages to a new list, that does not mutate its input.
2. THE Web app SHALL rank a Package by this key, compared in this order: Possessed before every other State; then the State from least healthy to most healthy in the order Dead, Haunted, Restless, Alive; then greater Severity rank first; then greater Reach rank first; then smaller name first in UTF-16 code-unit order.
3. THE Web app SHALL use the Severity rank of the highest Severity among the advisories of an available advisories signal, and SHALL use the none rank for an unavailable advisories signal and for an available empty one.
4. THE Web app SHALL use the Reach rank 0 for an unavailable transitiveReach signal.
5. THE Web app SHALL apply the key to every Package, so that Packages of the same State are ordered among themselves by severity, reach and name.
6. FOR ANY list of Packages, THE Web app SHALL return a list that is a permutation of the input, with the same length and the same members (invariant).
7. FOR ANY list of Packages with distinct names, THE Web app SHALL return a list ordered by a total order: the comparison of any two Packages is antisymmetric and transitive, and exactly one of two distinct Packages ranks earlier (total order).
8. FOR ANY list of Packages, including entries with equal keys, THE Web app SHALL keep equal-key entries in their input order (stable).
9. FOR ANY list of Packages, THE Web app SHALL return deeply equal results from two calls (determinism), and SHALL return a list unchanged by a second application (idempotence).
10. FOR ANY list of Packages with distinct names and any reordering of it, THE Web app SHALL return the same list (metamorphic, order independence).
11. FOR ANY list of Packages, every Possessed Package SHALL come before every Package that is not Possessed, and the Packages SHALL appear grouped by State in the order Possessed, Dead, Haunted, Restless, Alive, with no Package of an earlier State after a Package of a later State (invariant).
12. FOR ANY Package in any list, raising only its Reach rank SHALL NOT move it later in the result, and adding an advisory of a greater Severity than all its present advisories SHALL NOT move it later, when all else is equal (monotonic).
13. WHEN the Scene is laid out, THE Web app SHALL place the first Package of the triage order in the top-left Cell and SHALL fill Cells row by row from left to right in triage order.
14. FOR ANY list of 0 to 300 Packages, THE Web app SHALL return a result and SHALL NOT throw.

### Requirement 4: Grave rendering

**User Story:** As a maintainer, I want each dependency drawn as a grave whose form and colour tell me its state, so that I can read the scene at a glance.

#### Acceptance Criteria

1. THE Web app SHALL draw every Grave on one `canvas` element with `Path2D` shapes, and SHALL compute what to draw with the pure function `planScene`, so that the painter executes the Scene plan and holds no layout logic.
2. THE Web app SHALL define the Grave shape as a function of State only: `upright` for Alive and Restless, `cross` for Haunted, `cracked` for Dead and `open` for Possessed, with four distinct SVG path strings.
3. THE Web app SHALL define the Grave colour as a function of State and Theme only, taken from the Palette, with the five State colours pairwise distinct in each Theme.
4. THE Web app SHALL give Alive and Restless a Grave colour pair whose contrast ratio is at least 1.5 to 1 in each Theme, and SHALL name the State in the aria-label, the Drawer and the Legend, so that the two States are not told apart by shape or colour alone.
5. FOR ANY two Packages with the same State and any other differences in name, version, signals, advisories, reach and missing signals, THE Web app SHALL produce Scene plan entries with the same Grave shape and the same Grave colour (invariant).
6. FOR ANY Scene plan, THE Web app SHALL give every Grave the same width and height, the same fill opacity of 1 and the same fixed tilt for the `cracked` shape, and SHALL carry no per-Package numeric style value, so that no continuous encoding exists (invariant).
7. WHERE the number of Packages is 60 or fewer, THE Web app SHALL give every Grave an Inscription equal to the package name, truncated to 14 UTF-16 code units with a final ellipsis when longer.
8. WHERE the number of Packages is greater than 60, THE Web app SHALL give no Grave an Inscription (boundary: 60 Packages give 60 Inscriptions, 61 Packages give none).
9. THE Web app SHALL lay Graves out in Cells of 96 by 112 CSS pixels with a padding of 16 CSS pixels, SHALL use a layout width of at least 128 CSS pixels, and SHALL derive the column count and the canvas height from the width and the number of Packages.
10. FOR ANY width and any number of Packages from 0 to 300, THE Web app SHALL return a Scene plan in which every Grave rectangle lies inside the canvas and no two Grave rectangles overlap (invariant).
11. FOR ANY Scene plan, THE Web app SHALL list exactly one Grave per Package, in triage order (invariant).
12. WHEN the Theme changes, THE Web app SHALL redraw with the Palette of the new Theme, and SHALL keep every State colour at a contrast ratio of at least 3 to 1 against the canvas background in each Theme.
13. THE Web app SHALL size the canvas backing store to the CSS size multiplied by the device pixel ratio, with the ratio capped at 2 and no dimension above 16384 device pixels.
14. FOR ANY valid ScanResponse, including one with no Packages and one with 300 Packages, THE Web app SHALL render without throwing (for any valid input).
15. WHEN the ScanResponse holds no Packages, THE Web app SHALL render no Grave and no Grave button and SHALL show the text "no direct dependencies in this scan".

### Requirement 5: Ghost rule

**User Story:** As a maintainer, I want a ghost to mean advisories and nothing else, so that I can count known vulnerabilities by eye.

#### Acceptance Criteria

1. FOR ANY Package, THE Web app SHALL give its Grave a Ghost if and only if its advisories signal is available and its value holds one or more advisories (if and only if).
2. WHEN the advisories signal of a Package is unavailable, THE Web app SHALL draw no Ghost for it and SHALL show the signal as unavailable with its reason in the Drawer.
3. FOR ANY Package whose advisories signal is unavailable or empty, THE Web app SHALL draw no Ghost whatever its State, its other signals or its missing signals (invariant).
4. FOR ANY Scene plan, THE Web app SHALL have a number of Ghosts equal to the number of Packages with a non-empty available advisories signal (invariant).
5. THE Web app SHALL draw every Ghost above its Grave inside its Cell, in one colour, one size and one shape that do not depend on the State or on the number or severity of the advisories.
6. THE Web app SHALL keep the Ghost colour at a contrast ratio of at least 3 to 1 against the canvas background in each Theme.
7. WHILE Reduced motion does not apply and the Scene plan holds at least one Ghost, THE Web app SHALL toggle the Ghost phase between 0 and 1 every 1000 ms, which moves each Ghost between two fixed positions 4 CSS pixels apart.
8. WHILE Reduced motion applies, THE Web app SHALL keep the Ghost phase at 0 and SHALL run no animation timer.
9. WHEN Reduced motion starts or stops applying, THE Web app SHALL stop or start the timer without a page reload.
10. FOR ANY Ghost phase, THE Web app SHALL leave every Grave rectangle, shape, colour and Inscription unchanged (invariant).

### Requirement 6: Selection and keyboard

**User Story:** As a keyboard or screen reader user, I want to move between graves and open one, so that I can use the cemetery without a pointer.

#### Acceptance Criteria

1. THE Web app SHALL render, in the Overlay, one Grave button per Package, in triage order, each positioned over its Grave, so that the number of focusable Grave buttons equals the number of Packages (invariant, for any ScanResponse including 0 and 300 Packages).
2. THE Web app SHALL set the Selection to the first Grave when a ScanResponse with at least one Package loads, and to none when it has no Package.
3. THE Web app SHALL keep exactly one Grave button with `tabindex` 0, the selected one, and `tabindex` -1 on every other, so that one Tab enters the Overlay and one Tab leaves it.
4. THE Web app SHALL expose `moveSelection(index, key, columns, count)`, a pure function that returns the index for ArrowLeft as `index - 1`, ArrowRight as `index + 1`, ArrowUp as `index - columns`, ArrowDown as `index + columns`, each clamped to the range 0 to `count - 1`, and the same index for any other key.
5. FOR ANY count from 1 to 300, any column count of at least 1, any start index in range and any sequence of keys, THE Web app SHALL keep the Selection in the range 0 to `count - 1` (invariant).
6. FOR ANY index from 0 to `count - 2` and any column count, ArrowRight followed by ArrowLeft SHALL return the start index, and FOR ANY index from `columns` to `count - 1`, ArrowUp followed by ArrowDown SHALL return the start index when the index is at most `count - 1 - columns` (metamorphic).
7. WHEN an arrow key is pressed on a Grave button with no modifier key, THE Web app SHALL set the Selection by `moveSelection`, SHALL move keyboard focus to the new Grave button, SHALL prevent the default scroll, and SHALL leave the Drawer open state unchanged.
8. WHEN an arrow key is pressed with the Ctrl, Alt or Meta key held, THE Web app SHALL leave the Selection unchanged and SHALL NOT call `preventDefault`, so that browser and operating system shortcuts such as Alt+ArrowLeft keep working.
9. WHEN the column count changes because the width changes, THE Web app SHALL keep the Selection index and SHALL use the new column count for the next ArrowUp and ArrowDown.
10. WHEN a Grave button is activated by Enter, by Space or by a click, THE Web app SHALL set the Selection to it and SHALL open the Drawer for its Package.
11. WHEN a click lands on the Scene outside any Grave button, THE Web app SHALL leave the Selection and the Drawer unchanged.
12. WHEN a new ScanResponse replaces the current one, THE Web app SHALL reset the Selection to the first Grave, or to none when there are no Packages, and SHALL close the Drawer.
13. THE Web app SHALL draw a selection ring around the selected Grave at all times, with a contrast ratio of at least 3 to 1 against the canvas background in each Theme, so that the keyboard position is visible whenever the Overlay holds focus.

### Requirement 7: Drawer

**User Story:** As a security engineer, I want to open a grave and see exactly why it has its state, with every signal and its source, so that I can verify the claim and see the proposed fix.

#### Acceptance Criteria

1. WHEN the Drawer is open, THE Web app SHALL render it as a DOM element with `role="dialog"`, `aria-modal="true"` and an accessible name that holds the package name and the installed version, and SHALL render it outside the canvas.
2. THE Web app SHALL show in the Drawer the State and the `stateReason` of the selected Package.
3. THE Web app SHALL show in the Drawer all ten signals of the selected Package in the order of the ten signal names, each with its name, its `source` and its `fetchedAt`.
4. WHEN a signal is available, THE Web app SHALL show its value as preformatted text from `JSON.stringify(value, null, 2)`, and WHEN a signal is unavailable, THE Web app SHALL show the word "unavailable" and its `reason` and no value.
5. FOR ANY valid ScanResponse and any selected Package, THE Web app SHALL show in the Drawer the name of every one of the ten signals, in order, each with its `source` and `fetchedAt`, whether the signal is available or not (invariant).
6. THE Web app SHALL show in the Drawer the `missingSignals` of the selected Package as a list of names, or the text "none" when the list is empty.
7. THE Web app SHALL show in the Drawer each failing policy rule that names the selected Package, as the rule index, the rule type, the rule name when present and, for the failure of that Package, its `reason`, `source` and `fetchedAt`, and SHALL show the text "no failing policy rules for this package" when there is none.
8. FOR ANY valid ScanResponse and any selected Package, THE Web app SHALL show exactly the rules whose `failures` list holds a failure with the name of that Package, identified by rule index (invariant).
9. WHEN the ScanResponse has a Remediation entry whose `packageName` equals the selected Package name, THE Web app SHALL show its kind, its title and its `prBody` as preformatted text in the Remediation preview, and WHEN there is none, THE Web app SHALL show the exact text "no remediation proposed yet".
10. THE Web app SHALL render the `prBody` as text and SHALL NOT render it as Markdown or HTML, and SHALL provide no control in the Drawer that opens a pull request or creates a branch.
11. WHEN the Drawer opens, THE Web app SHALL move keyboard focus to the close button of the Drawer and SHALL mark the rest of the page inert.
12. WHILE the Drawer is open, THE Web app SHALL keep Tab and Shift+Tab focus inside the Drawer by cycling from its last focusable element to its first and back (focus trap, for any number of key presses).
13. WHEN Escape is pressed or the close button is activated while the Drawer is open, THE Web app SHALL close the Drawer, and WHEN the backdrop is clicked, THE Web app SHALL close it too.
14. WHEN the Drawer closes, THE Web app SHALL return keyboard focus to the Grave button of the Package the Drawer showed, and SHALL leave the Selection and the ScanResponse unchanged (round-trip: open then close restores focus and Selection).
15. FOR ANY valid ScanResponse and any Package, THE Web app SHALL open the Drawer without throwing (for any valid input, including a Package with all ten signals unavailable).

### Requirement 8: Header and notices

**User Story:** As a reviewer and as a security engineer, I want the header to say what was scanned, when, under which policy and with which caveats, so that I never mistake a partial or default-policy scan for a full one.

#### Acceptance Criteria

1. THE Web app SHALL show in the Header the repository URL from `report.scan.repo.url` as text, and the scan time as the `report.generatedAt` string.
2. WHEN `report.scan` is absent, THE Web app SHALL show the text "no scan metadata in this response" in place of the repository and SHALL still show `generatedAt`.
3. THE Web app SHALL show the unlocked notice if and only if `report.scan.unlocked` is true or `report.scan.unlockedPackages` is non-empty, and the notice SHALL hold the word "unlocked" (if and only if, for any valid ScanResponse).
4. WHEN `report.scan.unlocked` is true, THE Web app SHALL state in the unlocked notice that no lockfile exists and that versions were resolved from declared ranges, and WHEN only `unlockedPackages` is non-empty, THE Web app SHALL state the number of unlocked Packages and list up to 20 names followed by "and N more" for the rest.
5. THE Web app SHALL show the capped notice if and only if `report.scan.capped` is true, and the notice SHALL state the number of Packages shown and `report.scan.totalDirect` (if and only if, for any valid ScanResponse).
6. THE Web app SHALL show the policy status as the word "pass" or "fail" taken from `policy.pass`, and the word SHALL be present as text, not as colour alone (invariant, for any valid ScanResponse).
7. THE Web app SHALL show which policy applied: "default policy" when `policy.source` is "default" and "policy file" when it is "file".
8. THE Web app SHALL show the number of failing rules of the policy result next to the policy status.
9. THE Web app SHALL render the Legend control as a button with `aria-expanded` false at page load, and WHILE the Legend is closed, THE Web app SHALL keep its content out of the tab order and out of the accessibility tree.
10. WHEN the Legend control is activated, THE Web app SHALL toggle the Legend, and WHILE it is open the Legend SHALL list the five States, each with the Grave shape and Grave colour from the same definitions the Scene uses, a Ghost entry that says it means one or more advisories, and a line that states the triage order.
11. THE Web app SHALL render notices and Header values only as text nodes, and SHALL render the repository URL as text and not as a link.
12. WHEN the ScanResponse was loaded from the bundled `/demo/scan.json`, THE Web app SHALL show the text "demo fixture, recorded data" next to the repository in the Header. The Web app SHALL decide this from the load source, which is the bundled demo address, and SHALL NOT decide it from the repository name, so that a real repository named `sexton-demo/fixture` loaded from any other address is not labelled as the demo.
13. FOR ANY valid ScanResponse, THE Web app SHALL render the Header without throwing.

### Requirement 9: Performance

**User Story:** As a reviewer on an ordinary laptop, I want 300 graves to draw without lag and the page to stay idle when nothing changes, so that the demo feels instant.

#### Acceptance Criteria

1. THE Web app SHALL complete a full redraw of a Scene with 300 Graves at a viewport of 1280 by 800 CSS pixels and a device pixel ratio of 1 in a median of at most 16 ms over 30 consecutive redraws, measured with `performance.now` in Chromium by the Playwright smoke test, on a Scene that holds a Ghost on every Grave.
2. THE Web app SHALL redraw the Scene if and only if the data, the Selection, the canvas size, the Theme or the Ghost phase changed, and SHALL perform no redraw for focus, blur, pointer movement, opening or closing the Drawer, toggling the Legend or typing in the repository URL field (for any sequence of such events, the paint count equals the number of changes).
3. WHEN several changes occur before the next animation frame, THE Web app SHALL perform one redraw for them.
4. THE Web app SHALL recompute the Scene plan only when its inputs change.
5. WHEN the viewport width changes, THE Web app SHALL coalesce resize notifications into at most one redraw per animation frame.
6. THE Web app SHALL include in the production bundle no test hook, and SHALL expose the redraw timing hook to the Playwright test only in a build made for tests. (review constraint, not a correctness property)
7. THE Web app SHALL include one Playwright smoke test, run against the built Demo scan with every request to a host other than the local server aborted, that loads the Demo scan at 1280 by 800, asserts that the Header and eleven Grave buttons are present, saves a screenshot of the page, and then loads a generated 300-Package scan from a same-origin test fixture and checks the budget of criterion 1.
8. THE Web app SHALL run its Vitest tests with jsdom and without network, SHALL replace the canvas context with a recording stub, and SHALL test `planScene`, `triageOrder`, `moveSelection`, `checkScanUrl` and the Contract validator as pure functions with fast-check at 100 runs. (review constraint, not a correctness property)

### Requirement 10: Accessibility

**User Story:** As a user of assistive technology, I want every grave, control and notice to be perceivable and operable, so that the cemetery is usable without sight of the canvas.

#### Acceptance Criteria

1. THE Web app SHALL give each Grave button an aria-label of the form "{name} {installedVersion}, {state}" followed by ", {n} advisory" for one advisory or ", {n} advisories" for more than one, and no suffix when the advisories signal is unavailable or empty (for any Package).
2. THE Web app SHALL mark the canvas `aria-hidden="true"`, so that the Overlay is the only accessible description of the Scene.
3. THE Web app SHALL keep every text and background colour pair in the Palette and in the CSS at a contrast ratio of at least 4.5 to 1, and every Grave shape, Ghost, selection ring, focus indicator and control boundary at least 3 to 1 against its background, in each Theme, and a test SHALL compute the ratios from the Palette with the WCAG 2.1 relative luminance formula (for every pair in the Palette).
4. THE Web app SHALL pass an axe-core check with the `wcag2a`, `wcag2aa`, `wcag21a` and `wcag21aa` rule sets and zero violations in jsdom for these views: the loaded Demo scan, the open Drawer, the open Legend, a Load error and the disabled repository field. The check SHALL leave the `color-contrast` rule off, because jsdom cannot compute it and criterion 3 covers it.
5. THE Web app SHALL make every Grave reachable by keyboard through the Overlay, and SHALL make every other interactive element (Legend control, repository URL field and its submit control, Drawer controls) reachable by Tab, with no keyboard trap other than the Drawer, which Escape leaves.
6. THE Web app SHALL give the page a `lang` attribute, a title, one `h1`, a `header` landmark, a `main` landmark, and an accessible label on the repository URL field.
7. THE Web app SHALL show a visible focus indicator of at least 2 CSS pixels on every DOM control.
8. THE Web app SHALL convey every State in text (aria-label, Drawer and Legend), and the policy status and every notice in text, so that no information depends on colour alone.
9. A person outside the project SHALL view the Demo scan at 1280 by 800 with the Legend closed and no explanation, and SHALL state which grave to fix first and what a Ghost means, before submission; the result, the reviewer name, the date and the commit SHA SHALL be recorded in `docs/ui-readability-sign-off.md`, and submission SHALL wait for a recorded pass. (review constraint, not a correctness property; R-UI-5 is a manual check)
