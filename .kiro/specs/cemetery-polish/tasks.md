# Implementation Plan: cemetery-polish

## Overview

Makes packages/web read as a finished product: a seeded night scene with stars, grass, shadows and stone texture, a header bar with a wordmark and a readable scan time, a styled loading state, an evidence tooltip on every grave, a rendered preview of the pull request body, a result area that stays in view, a repository field that works while the drawer is open, and a page that fits 360 CSS pixels. It then updates the README (a Dependabot section and a new screenshot), the steering file and the readability sign-off. Pure modules come first in each part, then the components that use them, then the CSS, the end-to-end tests, the docs, the screenshot and the root gates. All paths are under packages/web unless stated. No test touches the network.

Run-time notes for the agents:

- The impl agent edits files and runs only the test and typecheck commands. The orchestrator runs the Playwright tests (10.x, 13.1, 15.4), records the sign-off as owed by the user (14.1) and runs the root gates (15.x). No task installs a dependency: this spec adds none and changes no pin and no package.json.
- Every test sub-task names its test file and the property numbers from design.md. `numRuns` is 100 by default and 1000 for Properties 6 and 10. Every property test carries the tag `Feature: cemetery-polish, Property N: <title>`.
- Tests change only where design.md lists a Deliberate test change (numbered 1 to 17 there). Any other existing test that fails is a regression: fix the source, not the test.
- Change only packages/web, README.md, docs/cemetery.png, docs/ui-readability-sign-off.md and .kiro/steering/web.md. Do not change anything under packages/engine, packages/api, packages/cli, packages/action or infra, and do not change src/triage, src/selection, src/load, src/drawer/drawer-model.ts or src/header/header-model.ts.
- Each top-level task ends with a security review. Invoke the security-reviewer agent with the list of files that the task changed, ask it to review those files against this spec's requirements and the security steering, record its findings in a "Review notes" line under that sub-task, and fix every finding of kind "defect" inside the same task before it is marked done.
- After 1.1 and before the later tasks land, some existing web tests may fail because they pin values that change. That is expected inside this plan. Task 15 is where the whole suite must be green.

## Tasks

- [ ] 1. Palette tokens and Backdrop stops
  - Adds the eight new tokens, the two alpha bytes and the ten Backdrop stops, and extends the contrast test.
  - _Requirements: 16.1, 16.2, 16.3, 16.4, 16.5, 16.6, 16.7, 16.8, 16.9_
  - [ ] 1.1 Update src/scene/palette.ts
    - Add `star` #f4f1de, `starFar` #aeb8dc, `grassDark` #24362b, `grassLight` #2f4a3a, `field` #0e1322, `accentBg` #3f64d8, `accentText` #ffffff and `wordmark` #efe6c4 to `PaletteTheme` and `NIGHT`. Export `SHADOW_ALPHA_BYTE` ("80") and `STONE_ALPHA_BYTE` ("40"). Add `--star`, `--star-far`, `--grass-dark`, `--grass-light`, `--field`, `--accent-bg`, `--accent-text` and `--wordmark` to `cssVariables`. `backdropStops` returns ten values: the existing seven, then `grassDark`, `grassLight` and `mix(groundTop, pit, 128)`.
    - _Requirements: 16.1, 16.4_
  - [ ] 1.2 Update test/shapes-palette.test.ts and add Property 1
    - Apply Deliberate test changes 9 and 10 (`fc.nat({ max: 9 })`, `toHaveLength(10)`, the decoration-token regex). Add the eight tokens to the six-digit-hex list.
    - Extend the cemetery-theme Property 1 test so it covers every item of design.md Property 1: text, muted and wordmark against surface, field and every stop at 4.5; the State colours, ghost, ring, focus and border against every stop at 3; focus and border against field at 3; accentText on accentBg at 4.5; accentBg on skyTop and skyMid at 3; star and starFar on skyTop, skyMid and skyHorizon at 3; the shadow stop no lighter than groundTop.
    - **Property 1: Palette contrast over every backdrop stop**
    - **Validates: Requirements 16.1, 16.4, 16.5, 16.6, 16.7, 16.8, 16.9**
    - Tag: `Feature: cemetery-polish, Property 1: Palette contrast over every backdrop stop`.
  - [ ] 1.3 Security review of task 1
    - Invoke the security-reviewer agent on src/scene/palette.ts and test/shapes-palette.test.ts. Record the findings in "Review notes".
    - _Requirements: 22.5_

- [ ] 2. Seeded scenery generator and plan
  - Adds the pure seeded generator and puts the star list and the grass list into the Scenery record, depending on the width only.
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 2.1, 2.2_
  - [ ] 2.1 Create src/scene/scenery-seed.ts
    - Export `SCENERY_SEED` (0x5e7701c3), `mulberry32`, `unitStars(count)` (stream seed XOR 0x1, two randoms per star) and `unitTufts(count)` (stream seed XOR 0x2, four randoms per tuft: u, v, height 4 to 10, tone). Pure. No `Math.random`.
    - _Requirements: 1.3, 1.4, 2.1_
  - [ ] 2.2 Update src/scene/layout.ts
    - Export `STAR_AREA` 800, `GRASS_STEP` 14, `GRASS_TILE_HEIGHT` 224, and the `Star` and `Tuft` types. `Scenery` gains `stars` and `grass`. `sceneryFor(width)` builds them as in design.md and keeps a one-entry cache for the last width. `GravePlan` and the other plan fields stay as they are.
    - _Requirements: 1.1, 1.2, 1.5, 2.1, 2.2_
  - [ ] 2.3 Write test/scenery-seed.test.ts
    - **Property 2: Seeded scenery is deterministic and bounded** (counts, bounds, sizes, tone values, determinism, prefix property of `unitStars` and `unitTufts`).
    - **Validates: Requirements 1.1, 1.2, 1.3, 1.4, 2.1, 2.2**
    - Add a static example that no file under src contains `Math.random`.
    - Tag: `Feature: cemetery-polish, Property 2: Seeded scenery is deterministic and bounded`.
    - _Requirements: 1.2, 1.3, 1.4, 2.1_
  - [ ] 2.4 Add Property 3 to test/draw.test.ts
    - **Property 3: Scenery depends on the width only** (equal scenery, stars and grass included, for any two package lists, phases, selections and Themes at one width).
    - **Validates: Requirements 1.5, 2.2**
    - Tag: `Feature: cemetery-polish, Property 3: Scenery depends on the width only`.
    - _Requirements: 1.5, 2.2_
  - [ ] 2.5 Security review of task 2
    - Invoke the security-reviewer agent on src/scene/scenery-seed.ts, src/scene/layout.ts, test/scenery-seed.test.ts and test/draw.test.ts. Record the findings in "Review notes".
    - _Requirements: 22.5_

- [ ] 3. Painter: stars, grass, shadow and stone texture
  - Draws the new Scenery and the per-grave decoration. Only `fillRect`, `arc` and `fill` join the Scenery, so the painter discipline test keeps its method set.
  - _Requirements: 1.6, 1.7, 2.3, 2.4, 2.5, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7_
  - [ ] 3.1 Update src/scene/shapes.ts
    - Add `SPECKS` and `SOLID_BOXES` with the values of the design.md table. Export both.
    - _Requirements: 3.2, 3.3_
  - [ ] 3.2 Update src/scene/draw.ts
    - `drawScenery`: after the sky gradient draw the far stars (`starFar`, 1 by 1) and the near stars (`star`, 2 by 2), then the moon, ground, horizon and fog as before, then the grass in every Tile that starts above the canvas bottom (2 pixels wide, `grassDark` and `grassLight`, skipping a tuft whose bottom is below the canvas). `drawGrave`: draw the Shadow first (`save`, `translate`, `scale(72, 8)`, `beginPath`, `arc`, `pit` plus `SHADOW_ALPHA_BYTE`, `fill()` with no argument, `restore`), and the Stone texture after the shape fill (one `stroke` of the shape path in `ink` plus `STONE_ALPHA_BYTE` at line width 0.5, then one 1 by 1 `fillRect` per speck). Call no `fill(path)` for either. Call `Math.random` nowhere.
    - _Requirements: 1.6, 1.7, 2.3, 2.4, 2.5, 3.1, 3.2, 3.5, 3.7_
  - [ ] 3.3 Update test/draw.test.ts: Property 4 and the shape examples
    - Apply Deliberate test change 11 (the allowed alpha bytes gain `SHADOW_ALPHA_BYTE`). Changes 12 and 13 need no edit, run them unmodified.
    - **Property 4: Painter call discipline for stars, grass, shadow and texture** (method set and order before the first `save`, star and tuft counts, sky limit, shadow and texture order and counts, equal decoration for two graves of one State relative to the Cell origin, alpha rule, `fill(path)` count).
    - **Validates: Requirements 1.6, 1.7, 2.3, 2.4, 2.5, 3.1, 3.2, 3.4, 3.5, 3.7**
    - Add four examples: each speck of each shape lies inside a solid box of that shape; the cracked specks keep 3 units from the crack; the 300-graves plan at width 1280 gives 4,641 grass rectangles at most (51 Tiles by 91 tufts).
    - Tag: `Feature: cemetery-polish, Property 4: Painter call discipline for stars, grass, shadow and texture`.
    - _Requirements: 1.6, 1.7, 2.3, 2.4, 2.5, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7_
  - [ ] 3.4 Security review of task 3
    - Invoke the security-reviewer agent on src/scene/shapes.ts, src/scene/draw.ts and test/draw.test.ts. Record the findings in "Review notes".
    - _Requirements: 22.5_

- [ ] 4. Readable scan time
  - Adds the pure formatter and the element that shows it.
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6_
  - [ ] 4.1 Create src/header/format-scan-time.ts and src/header/ScanTime.tsx
    - `scanTimeView(value)` returns `{ text, dateTime }` as in design.md (ISO pattern check, `Date.parse` finite, fixed English month table, UTC fields, no `Intl`). `ScanTime` renders `<time dateTime>` or `<span>`. `HeaderModel.scanTime` and header-model.ts stay unchanged.
    - _Requirements: 5.1, 5.2, 5.4, 5.6_
  - [ ] 4.2 Write test/scan-time.test.ts
    - **Property 5: The scan time formatter round-trips** (valid ISO strings from 1970 to 9999, also with an offset form; the unparseable case gives the input and null).
    - **Validates: Requirements 5.2, 5.3, 5.4**
    - Add examples: `2026-11-12T00:00:00.000Z` gives `12 Nov 2026, 00:00 UTC`; "not recorded" gives a `span`.
    - Tag: `Feature: cemetery-polish, Property 5: The scan time formatter round-trips`.
    - _Requirements: 5.2, 5.3, 5.4, 5.5_
  - [ ] 4.3 Security review of task 4
    - Invoke the security-reviewer agent on src/header/format-scan-time.ts, src/header/ScanTime.tsx and test/scan-time.test.ts. Record the findings in "Review notes".
    - _Requirements: 22.5_

- [ ] 5. Markdown parser and PR preview
  - Adds the pure Parser for exactly what pr-body.ts emits, and the component that turns its tree into React elements.
  - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8, 8.9, 8.10, 8.11, 8.12, 8.13, 8.14_
  - [ ] 5.1 Create src/drawer/markdown.ts
    - `parseMarkdown` and `plainText` with the Block and Inline types of design.md. Block starts: `# `, `## `, `- `, digits and `. `, `> `, table (header line, separator row `^\|(-+\|)+$`, body rows), exact `---`. Inline: code, bold (code inside), link. Table cells split on unescaped `|`, with `\|` turned into `|`. Link only when the address starts with `https://` and holds no white space, else the link text as text. Scanners remember a missing closing marker, so the cost is linear. No regular expression with nested quantifiers. No string from outside is used as HTML.
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.10_
  - [ ] 5.2 Write test/markdown.test.ts: Property 6
    - **Property 6: Markdown links are https only** (fragment-built strings with brackets, schemes, white space and control characters).
    - **Validates: Requirements 8.6, 8.7**
    - Security invariant: `numRuns` 1000.
    - Tag: `Feature: cemetery-polish, Property 6: Markdown links are https only`.
    - _Requirements: 8.6, 8.7_
  - [ ] 5.3 Add Property 7 to test/markdown.test.ts
    - **Property 7: Text without constructs is preserved**
    - **Validates: Requirements 8.8**
    - Tag: `Feature: cemetery-polish, Property 7: Text without constructs is preserved`.
    - _Requirements: 8.8_
  - [ ] 5.4 Add Property 8 and the boundary example to test/markdown.test.ts
    - **Property 8: Parsing is total and drops no word characters** (any string never throws; the restricted alphabet keeps its letters and digits).
    - **Validates: Requirements 8.1, 8.9**
    - Add the example: a body of 60,000 characters of unmatched `**`, backtick and `[` markers parses in under 1 second (requirement 8.10).
    - Tag: `Feature: cemetery-polish, Property 8: Parsing is total and drops no word characters`.
    - _Requirements: 8.1, 8.9, 8.10_
  - [ ] 5.5 Add Property 9 and the construct examples to test/markdown.test.ts
    - **Property 9: Escaped fields render as their literal characters** (a mirror of `escapeField` is written in the test, with a comment that names packages/engine/src/remediation/escape-field.ts; web must not import the engine).
    - **Validates: Requirements 8.4, 8.5**
    - Add examples: one per construct (heading 1 and 2, `###` stays text, table with its separator, ragged row, list, ordered list with start, quote, rule, bold, code, https link, `javascript:` link as text); every `prBody` of public/demo/scan.json (read through test/support/demo-scan.ts) parses, holds a table of 4 columns and 10 body rows, and holds no link node.
    - Tag: `Feature: cemetery-polish, Property 9: Escaped fields render as their literal characters`.
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6_
  - [ ] 5.6 Create src/drawer/PrPreview.tsx
    - Maps the Block tree to React elements inside `<div className="pr-preview">`: heading 1 as `h4`, heading 2 as `h5`, table as `div.pr-table-wrap` (role region, label "Table N" by order, tabIndex 0) with `table`, `thead`, `tbody`, lists as `ul` and `ol` (with `start`), quote as `blockquote`, bold as `strong`, code as `code`, rule as `hr`, paragraph as `p.pr-p`. A link is `<a href target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">`, no other element has an `href`. Text is always a React text child. No raw-HTML API.
    - _Requirements: 8.11, 8.12, 8.14_
  - [ ] 5.7 Write test/pr-preview.test.tsx: Property 10
    - **Property 10: The rendered preview holds only safe elements** (fragment-built strings plus `arbHostile`).
    - **Validates: Requirements 8.11, 8.12, 8.13**
    - Security invariant: `numRuns` 1000.
    - Add examples: the demo `prBody` of `lodash` renders `h4`, `h5`, one table of 11 rows with a `thead`, a `blockquote` for a Possessed body, an `hr`, and no `pre`.
    - Tag: `Feature: cemetery-polish, Property 10: The rendered preview holds only safe elements`.
    - _Requirements: 8.11, 8.12, 8.13_
  - [ ] 5.8 Security review of task 5
    - Invoke the security-reviewer agent on src/drawer/markdown.ts, src/drawer/PrPreview.tsx, test/markdown.test.ts and test/pr-preview.test.tsx. Ask it in particular to check that no link can have an address that does not start with `https://`, and that no raw-HTML API is used. Record the findings in "Review notes".
    - _Requirements: 8.7, 8.13, 8.14, 22.5_

- [ ] 6. Evidence tooltip
  - Adds the pure tooltip model and reducer, the hook, the element and the wiring into the grave buttons.
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8, 7.9, 7.10, 15.5_
  - [ ] 6.1 Create src/overlay/tooltip-model.ts
    - `tooltipContent`, `tooltipRect`, `tipReducer`, `TIP_START`, `GRACE_MS` (150) and the types, as in design.md. Pure.
    - _Requirements: 7.2, 7.4, 7.5, 7.6, 7.8, 7.9_
  - [ ] 6.2 Write test/tooltip.test.tsx: Properties 11 and 12
    - **Property 11: Tooltip content matches the package**
    - **Validates: Requirements 7.2, 7.8**
    - **Property 12: The tooltip state machine**
    - **Validates: Requirements 7.1, 7.4, 7.5, 7.6, 7.9**
    - Tags: `Feature: cemetery-polish, Property 11: Tooltip content matches the package` and `Feature: cemetery-polish, Property 12: The tooltip state machine`.
    - _Requirements: 7.1, 7.2, 7.4, 7.5, 7.6, 7.8, 7.9_
  - [ ] 6.3 Create the hook and the element and wire them
    - Create src/overlay/use-grave-tooltip.ts (`useReducer`, grace `setTimeout` cleared on unmount, a `document` keydown listener for Escape that is installed only while a tooltip is shown and calls neither `preventDefault` nor `stopPropagation`) and src/overlay/GraveTooltip.tsx (`role="tooltip"`, id `grave-tooltip`, position from `tooltipRect`, `pointer-events: auto` through its class). Update src/overlay/GraveButtons.tsx: pointer enter and leave, focus and blur events, `aria-describedby="grave-tooltip"` while shown, an optional `suppressTooltip` prop. Update src/Cemetery.tsx to pass `suppressTooltip` while the drawer is open. Keep the aria-label, the roving tab index and the arrow keys as they are.
    - _Requirements: 7.1, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8, 7.9, 15.5_
  - [ ] 6.4 Add the DOM examples to test/tooltip.test.tsx
    - Examples: focus on a grave shows the tooltip with the five facts, `role="tooltip"` and `aria-describedby`; pointer enter shows it, pointer leave then 150 ms hides it (fake timers), pointer enter on the tooltip in between keeps it; Escape hides it and a second focus shows it again; opening the drawer shows no tooltip; ArrowRight moves focus and the tooltip; only one `[role="tooltip"]` exists at a time.
    - _Requirements: 7.1, 7.3, 7.4, 7.5, 7.7, 7.9, 7.10, 15.5_
  - [ ] 6.5 Security review of task 6
    - Invoke the security-reviewer agent on src/overlay/tooltip-model.ts, src/overlay/use-grave-tooltip.ts, src/overlay/GraveTooltip.tsx, src/overlay/GraveButtons.tsx, src/Cemetery.tsx and test/tooltip.test.tsx. Record the findings in "Review notes".
    - _Requirements: 22.5_

- [ ] 7. Drawer: preview, Result area, readable values and the repository field
  - Puts the PR preview and the readable values in the drawer, moves the action into a Result area that stays in view, and lets a press on the Repository URL box close the drawer.
  - _Requirements: 5.5, 8.15, 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 11.1, 11.2, 11.3, 11.4_
  - [ ] 7.1 Update src/drawer/format-value.ts
    - Add `displayValue(valueText)` returning `{ kind: "inline", text }` for a JSON string (unquoted), number, boolean or null and for text that does not parse, and `{ kind: "block", text }` for an object or an array. `formatSignalValue` and `UNDISPLAYABLE_TEXT` stay. drawer-model.ts is not changed.
    - _Requirements: 11.1_
  - [ ] 7.2 Update src/drawer/Drawer.tsx
    - Replace `pre.drawer-prbody` with `<PrPreview>` under the Kind and Title lines. Show `fetchedAt` for signals and failing rule failures through `ScanTime`. Render single values as `code.signal-value` and objects and arrays as `pre`. Move `RemediateAction` into `div.drawer-result`, a child of the dialog after `.drawer-body`, rendered only for a proposed remediation with an intent. Keep `role="status"` in place before any request. Add the optional `onDismissToField(x, y)` prop and an `onMouseDown` handler on the backdrop that calls it when `event.target === event.currentTarget` and calls `preventDefault` when it returns true. Keep the focus trap, Escape, the Close button, the backdrop click and the exported texts.
    - _Requirements: 5.5, 8.15, 9.1, 9.2, 9.3, 9.4, 9.5, 9.7, 10.2, 10.6, 11.1, 11.3_
  - [ ] 7.3 Update src/Cemetery.tsx, src/App.tsx and the Header ref
    - Cemetery: add `repoFieldRef`, build `onDismissToField` (disabled or zero-width field gives false; otherwise `returnFocusTo.current = null`, `field.focus()`, close), pass it to the Drawer, remove `onDrawerOpenChange`, keep `<div inert>` around `main` only. App: create the ref, remove `drawerOpen` and the `inert` wrapper around the Header, pass the ref to `Cemetery` and to `Header`. Header.tsx: add the optional `fieldRef` prop and attach it to the input only (the full redesign is task 8).
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.7_
  - [ ] 7.4 Update the drawer, app, header and remediate tests
    - Apply Deliberate test changes 2 (app.test.tsx), 6 (header.test.tsx Property 22), 7 (drawer.test.tsx) and 8 (hosted-plans.test.tsx).
    - Add examples: the button, status and link are not inside `.drawer-body` and the status exists before the request (test/remediate.test.tsx); the Tab order is Close, body, then the Result area; `displayValue` for string, number, boolean, null, object and a broken text; `fetchedAt` shows `12 Nov 2026, 00:00 UTC` in a `time` element and "not recorded" stays text; a `mouseDown` on the backdrop at a point inside the stubbed field rectangle focuses the field, closes the drawer and leaves focus on the field; a press outside the rectangle returns focus to the grave; a disabled field gives the ordinary close; the header is not inside `[inert]` while the drawer is open.
    - _Requirements: 5.5, 8.15, 9.1, 9.3, 9.5, 9.7, 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 11.1, 11.3_
  - [ ] 7.5 Security review of task 7
    - Invoke the security-reviewer agent on src/drawer/Drawer.tsx, src/drawer/format-value.ts, src/Cemetery.tsx, src/App.tsx, src/header/Header.tsx and the tests changed in 7.4. Ask it to check that the pull request link rule and the `onRemediate` rules of spec remediate are intact. Record the findings in "Review notes".
    - _Requirements: 9.2, 22.5_

- [ ] 8. Header bar, loading card, error panel and empty state
  - Rebuilds the header markup, adds the loading card and restyles the error and empty states. The CSS comes in task 9.
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 5.1, 6.1, 6.3, 12.1, 12.2, 13.1, 13.2_
  - [ ] 8.1 Create src/header/Wordmark.tsx and update src/header/Header.tsx and src/header/Legend.tsx
    - Wordmark: an h1 holding an `aria-hidden` inline SVG gravestone mark, "Sexton", a space and "cemetery", so the text content is "Sexton cemetery". Header: `header.site-header` with `.header-top` (wordmark and `.header-summary` that is always rendered), the repository, demo label, `ScanTime`, notices and policy line inside the summary (keep the classes `header-repo`, `header-policy`, `notice`, `demo-label`, `repo-disabled` and the texts), a `div.header-evidence role="group" aria-label="Evidence pack"` with two `a.evidence-link` (same `href`, `download` and `aria-label`, visible texts "JSON" and "Markdown", an `aria-hidden` SVG glyph), then the Legend, then the form (pill: label "Repository URL", input with the placeholder "Paste a public repository URL", the Scan button with class `scan-button`) and the alert message. DOM order: summary, evidence links, Legend toggle, input, Scan. Legend: keep the toggle, ids and texts, lay the panel out as State chips, the Ghost chip and the triage text. No colour is written in markup.
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 5.1_
  - [ ] 8.2 Create src/LoadingCard.tsx and update src/App.tsx and src/Cemetery.tsx
    - LoadingCard: `<main className="panel-main"><div role="status" className="loading-card"><span className="loading-spinner" aria-hidden="true" /><p>Loading the scan</p></div></main>`. The error state keeps `role="alert"`, the heading "Scan could not be loaded" and the contract error list, with the code in a `code` element, inside `main.panel-main`. The empty state keeps the text "no direct dependencies in this scan" inside `div.cemetery-empty`. The scene `main` gets the class `scene-main`.
    - _Requirements: 6.1, 6.3, 12.1, 12.2, 13.1, 13.2_
  - [ ] 8.3 Update test/header.test.tsx
    - Apply Deliberate test changes 3, 4 and 5. Add examples: the h1 text content is "Sexton cemetery"; the tab order of the header controls is evidence JSON, evidence Markdown, Legend, input, Scan; the placeholder has no host name; the Legend panel holds one chip per State and the Ghost chip.
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 5.1_
  - [ ] 8.4 Update test/app.test.tsx and test/a11y.test.tsx
    - Apply Deliberate test change 1. Add examples: the loading card holds an `aria-hidden` spinner and the role is removed after the load; the error panel holds `role="alert"`, a `code` element with the error code and the heading; the empty state shows the text and no canvas; the header keeps its summary container while loading. Add axe scenarios (wcag2a, wcag2aa, wcag21a, wcag21aa, color-contrast off as in the file): a grave focused with the tooltip shown, and the drawer open on a package whose PR body holds a table.
    - _Requirements: 6.1, 6.3, 6.4, 12.1, 12.2, 15.6_
  - [ ] 8.5 Security review of task 8
    - Invoke the security-reviewer agent on src/header/Wordmark.tsx, src/header/Header.tsx, src/header/Legend.tsx, src/LoadingCard.tsx, src/App.tsx, src/Cemetery.tsx and the tests changed in 8.3 and 8.4. Record the findings in "Review notes".
    - _Requirements: 22.5_

- [ ] 9. Styles
  - Writes the look: every colour a variable, the small-screen rules, the motion rule and the focus rings.
  - _Requirements: 4.5, 4.6, 6.2, 6.4, 7.8, 9.6, 11.2, 11.4, 12.3, 13.1, 13.2, 14.2, 14.3, 14.4, 14.5, 15.2, 15.3, 15.4, 16.2, 16.3, 16.10_
  - [ ] 9.1 Rewrite src/styles.css
    - Selectors and rules as listed in design.md "styles.css". Every colour is `var(--token)` and only variables that `cssVariables` defines. No `url(`, no `outline: none` or `outline: 0`, no `prefers-color-scheme`, none of the decoration variables. `header` keeps its padding and `main` has none, `.panel-main` has 16 px. `.header-summary` has a `min-height`. The grave focus ring is `outline: 3px solid var(--focus); outline-offset: -9px`. `@media (max-width: 600px)` stacks the header parts. `overflow-wrap: anywhere` on the drawer title, text and `Source` lines and on `.repo-text`. `.loading-spinner` is the only animation, and `@media (prefers-reduced-motion: reduce)` sets `animation: none` on it. Keep every `:focus-visible` selector that test/a11y.test.tsx names, each at 3 px, and add `.evidence-link:focus-visible`, `.drawer a:focus-visible` and `.pr-table-wrap:focus-visible`.
    - _Requirements: 4.5, 4.6, 6.2, 6.4, 7.8, 9.6, 11.2, 11.4, 12.3, 13.1, 13.2, 14.2, 14.3, 14.4, 14.5, 15.2, 15.3, 15.4, 16.2, 16.3_
  - [ ] 9.2 Write test/styles.test.ts and extend the focus selector list
    - Static checks on src/styles.css: `overflow-wrap: anywhere` present; the reduced-motion block sets `animation: none` and `animation:` appears only on `.loading-spinner`; `.header-summary` has `min-height`; `main` has no horizontal padding and `.panel-main` has 16 px; the grave focus outline offset is -9 px; no `outline: none` or `outline: 0`; no `url(`; no colour literal; no decoration variable. Apply Deliberate test change 14 in test/a11y.test.tsx (add the three new selectors to the focus list). The existing pair test over `styles.css` must pass with the new rules.
    - _Requirements: 6.2, 6.4, 11.2, 13.1, 13.2, 15.2, 15.3, 15.4, 16.2, 16.3, 16.10_
  - [ ] 9.3 Security review of task 9
    - Invoke the security-reviewer agent on src/styles.css, test/styles.test.ts and test/a11y.test.tsx. Ask it to check the CSP stays compatible (no `url()`, no inline style in markup). Record the findings in "Review notes".
    - _Requirements: 17.6, 22.5_

- [ ] 10. End-to-end tests
  - Adds the browser checks that jsdom cannot make. The orchestrator runs them in 13.1 and 15.4.
  - _Requirements: 7.1, 7.5, 9.1, 10.2, 10.3, 13.1, 14.1, 14.2, 14.5, 17.5, 19.1, 19.3_
  - [ ] 10.1 Create e2e/polish.spec.ts
    - Same chromium skip as the other specs. Tests: at 360 by 800 the demo scan has `document.documentElement.scrollWidth` at most 360 with the drawer closed, with the drawer open and with the Legend open, and the drawer width equals the viewport; the canvas bounding box starts at x 0; hover on `left-padder` shows `[role="tooltip"]` with its name and reason, moving the pointer onto the tooltip keeps it, Escape hides it; keyboard focus shows it; with `/api` as the API base, open a drawer, click the Repository URL box and expect the dialog gone and the input focused; the PR table of `lodash` is visible in the drawer. Abort every request to another origin, as in the other specs.
    - _Requirements: 7.1, 7.4, 7.5, 10.2, 10.3, 13.1, 14.1, 14.2, 14.5_
  - [ ] 10.2 Update e2e/smoke.spec.ts and e2e/remediate.spec.ts
    - Apply Deliberate test changes 16 and 17. In smoke.spec.ts: set the viewport to 1440 by 900, wait for the first paint, take the screenshot to docs/cemetery.png with the drawer closed and Reduced motion on, then restore 1280 by 800 and `no-preference` before the 300-grave step. In remediate.spec.ts: add `toBeInViewport` for the link and the status text.
    - _Requirements: 9.1, 17.5, 19.1, 19.3_
  - [ ] 10.3 Security review of task 10
    - Invoke the security-reviewer agent on e2e/polish.spec.ts, e2e/smoke.spec.ts and e2e/remediate.spec.ts. Ask it to check that no test calls the network beyond the local server. Record the findings in "Review notes".
    - _Requirements: 22.5_

- [ ] 11. README
  - Adds the Dependabot section and the screenshot, and checks both with a test.
  - _Requirements: 18.1, 18.2, 18.3, 18.4, 19.2_
  - [ ] 11.1 Update README.md
    - Replace line 5 with the image line of design.md "README text". Add the section "Sexton and Dependabot" with the exact text of design.md, after "How Sexton is different" and before "Roadmap". Change nothing else.
    - _Requirements: 18.1, 18.2, 18.3, 18.4, 19.2_
  - [ ] 11.2 Write test/readme.test.ts
    - Reads ../../README.md. Checks: the heading "Sexton and Dependabot" exists once; the section holds the three URLs of design.md exactly; the section holds no `;` and no em dash; the image line for `docs/cemetery.png` with a non-empty alternative text exists and the placeholder line is gone; the other section headings are unchanged.
    - _Requirements: 18.1, 18.2, 18.4, 19.2_
  - [ ] 11.3 Security review of task 11
    - Invoke the security-reviewer agent on README.md and test/readme.test.ts. Record the findings in "Review notes".
    - _Requirements: 22.5_

- [ ] 12. Steering file
  - Brings .kiro/steering/web.md in line with the new behaviour.
  - _Requirements: 21.1, 21.2_
  - [ ] 12.1 Update .kiro/steering/web.md
    - Keep the front matter and every rule that this spec does not change. Add rules for: seeded scenery (no `Math.random`, stars and grass depend on the width only), the Shadow and Stone texture as same-per-State decoration, the Evidence tooltip (hover, focus, Escape, DOM, `role="tooltip"`), the PR preview (Parser module, the Link rule, React elements only), the Result area outside the scrolling body, the Repository field press that closes the drawer, the full-bleed scene, the 360 pixel rule, and that every new colour is a token in scene/palette.ts that joins the contrast test and that `styles.css` holds no colour literal.
    - _Requirements: 21.1, 21.2_
  - [ ] 12.2 Security review of task 12
    - Invoke the security-reviewer agent on .kiro/steering/web.md. Record the findings in "Review notes".
    - _Requirements: 22.5_

- [ ] 13. Screenshot
  - Retakes docs/cemetery.png from the demo scan after every visual change.
  - _Requirements: 19.1, 19.3_
  - [ ] 13.1 Orchestrator retakes docs/cemetery.png
    - Run `npm run test:e2e -w @sexton/web` (its `pretest:e2e` regenerates the demo scan and builds `dist-e2e`; if chromium is missing run `npx playwright install chromium` first). Confirm the smoke test ran and was not skipped, that docs/cemetery.png is 1440 by 900, that the drawer is closed and that the first grave shows its ring. Do not show the image to the user and do not wait. Confirm the image yourself against these checks (size 1440 by 900, drawer closed, first grave ring visible, smoke test ran and was not skipped) and record the result in the task notes.
    - _Requirements: 19.1, 19.3_
  - [ ] 13.2 Security review of task 13
    - Invoke the security-reviewer agent on docs/cemetery.png (metadata only: name and size) and the e2e files. Record the findings in "Review notes".
    - _Requirements: 22.5_

- [ ] 14. Readability sign-off
  - Updates the sign-off document for the finished scene and records that the outside viewer's result is owed by the user before submission.
  - _Requirements: 20.1, 20.2, 20.3_
  - [ ] 14.1 Update docs/ui-readability-sign-off.md
    - Update the setup text (viewport 1440 by 900, Legend closed, drawer closed, no explanation). Leave every record field blank. Do not ask the user and do not use the user_input tool. Write in the task notes that the outside viewer's sign-off is owed by the user before submission. Requirement 20.2 still holds: invent nothing (no name, no date, no commit, no answer, no pass).
    - _Requirements: 20.1, 20.2, 20.3_
  - [ ] 14.2 Security review of task 14
    - Invoke the security-reviewer agent on docs/ui-readability-sign-off.md. Record the findings in "Review notes".
    - _Requirements: 22.5_

- [ ] 15. Root gates
  - Runs every gate at the repository root and checks that nothing outside the scope changed.
  - _Requirements: 17.5, 17.6, 22.1, 22.2, 22.3, 22.4_
  - [ ] 15.1 Orchestrator runs typecheck
    - `npm run typecheck` at the root, zero errors.
    - _Requirements: 22.1_
  - [ ] 15.2 Orchestrator runs lint
    - `npm run lint` at the root, zero errors and zero warnings.
    - _Requirements: 8.14, 22.1_
  - [ ] 15.3 Orchestrator runs the test suites
    - `npm test` at the root, then `npm test -w @sexton/web` and `npm test -w @sexton/engine`. Every existing test is green apart from the Deliberate test changes, which pass in their new form. Confirm test/a11y.test.tsx has no axe violations and test/imports.test.ts passes.
    - _Requirements: 15.6, 17.6, 22.4_
  - [ ] 15.4 Orchestrator runs the end-to-end tests
    - `npm run test:e2e -w @sexton/web`. Confirm the specs ran and were not skipped, the 360 pixel checks pass, the median of 30 repaints of 300 graves is at most 16 ms (apply the performance fallback of design.md once if not, and stop and report if it is still above), and there is no CSP violation.
    - _Requirements: 14.1, 17.5, 22.1_
  - [ ] 15.5 Orchestrator checks the scope of the change
    - Run `git diff --name-only`. Confirm every changed path is under packages/web or is README.md, docs/cemetery.png, docs/ui-readability-sign-off.md, .kiro/steering/web.md or .kiro/specs/cemetery-polish; no file under packages/engine, packages/api, packages/cli, packages/action or infra changed; no package.json and no package-lock.json changed. Run `npm run build -w @sexton/web` and confirm its `postbuild` bundle check passes.
    - _Requirements: 17.6, 22.1, 22.2, 22.3_
  - [ ] 15.6 Security review of the whole change
    - Invoke the security-reviewer agent on the whole branch against this spec's requirements and the security steering. Record the findings in "Review notes". Fix every defect before the spec is closed.
    - _Requirements: 22.5_

## Notes

- Test sub-tasks are not optional in this plan, as in cemetery-theme.
- Each task references the requirements it implements. Requirement numbers are those of requirements.md in this spec.
- Orchestrator-run sub-tasks (10.x runs, 13.1, 14.1, 15.x) need a browser or the orchestrator and are not run by the impl agent. None of them asks the user or waits for the user.
- Deliberate test changes are numbered in design.md. Anything not listed there must pass unmodified.
- The two security invariants (Properties 6 and 10) run 1000 times. Everything else runs 100.
- Review notes: each security review sub-task records its findings here when it runs.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "2.1", "3.1", "4.1", "5.1", "6.1", "7.1"] },
    { "id": 1, "tasks": ["1.2", "2.2", "4.2", "5.2", "5.6", "6.2"] },
    { "id": 2, "tasks": ["1.3", "2.3", "2.4", "3.2", "4.3", "5.3", "5.7", "6.3", "7.2"] },
    { "id": 3, "tasks": ["2.5", "3.3", "5.4", "6.4", "7.3"] },
    { "id": 4, "tasks": ["3.4", "5.5", "6.5", "7.4", "8.1"] },
    { "id": 5, "tasks": ["5.8", "7.5", "8.2", "8.3"] },
    { "id": 6, "tasks": ["8.4", "9.1"] },
    { "id": 7, "tasks": ["8.5", "9.2"] },
    { "id": 8, "tasks": ["9.3", "10.1", "10.2"] },
    { "id": 9, "tasks": ["10.3", "11.1", "12.1"] },
    { "id": 10, "tasks": ["11.2", "12.2", "13.1"] },
    { "id": 11, "tasks": ["11.3", "13.2", "14.1"] },
    { "id": 12, "tasks": ["14.2", "15.1", "15.2"] },
    { "id": 13, "tasks": ["15.3"] },
    { "id": 14, "tasks": ["15.4"] },
    { "id": 15, "tasks": ["15.5"] },
    { "id": 16, "tasks": ["15.6"] }
  ]
}
```
