# Requirements Document

## Introduction

The cemetery-polish module makes the Sexton Web app (`packages/web`) read as a finished product. It fixes the nine problems found in the live test of 21 Nov 2026 and the further problems recorded in `audit.md` (19 items, written before this document). Every requirement names the audit items it fixes in a line "Traces to".

The work has four parts. The scene gains a layered night sky with stars, grass, and a shadow and stone texture on every grave. The header becomes a bar with a wordmark, a readable scan time, a styled legend, a pill-shaped repository field and two clear download controls. The drawer gains a rendered preview of the pull request body, a result area that is always in view, readable times and values, and a repository field that works while the drawer is open. A grave shows an evidence tooltip on hover and on keyboard focus. The loading, error and empty states are styled. The page works at 360 CSS pixels wide. The README gains a section on Dependabot and a new screenshot.

This spec builds on cemetery-ui and cemetery-theme. It changes no logic of triage, contract validation, loading, selection or policy. It amends these cemetery-theme values and no other: the paint order of the Scenery (stars and grass join it), the number of Backdrop stops (seven becomes ten), the tag list of the cemetery-theme token tests, and the header inert behaviour of cemetery-ui requirement 2. Every deliberate change to an existing test is listed in design.md under "Deliberate test changes".

This spec traces to R-UI-1 to R-UI-7 of docs/requirements.md section 5.8 and keeps R-UI-1, R-UI-2, R-UI-3 and R-UI-6 intact. R-UI-4 is served by the tooltip and the rendered preview. R-UI-5 (readability by a first-time viewer) was never recorded for the night scene, so requirement 20 records the sign-off as owed by the user.

Out of scope, each going to the next spec: the history scrubber, the pull request burial animation and the incident replay.

This spec does NOT add a runtime dependency, a Markdown library, a web font, an image file, an audio file, an external request, a light theme, a theme switch, a change to the API contract, or any change under `packages/engine`, `packages/api`, `packages/cli`, `packages/action` or `infra`. It changes only `packages/web`, `README.md`, `docs/cemetery.png`, `docs/ui-readability-sign-off.md` and `.kiro/steering/web.md`.

## Glossary

- **Web app**: the `@sexton/web` package.
- **Night palette**: the one colour table in `packages/web/src/scene/palette.ts`. The Theme keys `light` and `dark` both point to it. It is the single colour source for the canvas painter, the CSS custom properties and the contrast tests.
- **Token**: one named colour of the Night palette, always a six-digit lower-case hex string.
- **Backdrop stops**: the colours that can lie behind a grave, a Ghost, the header text or the focus ring. Cemetery-theme defined seven. This spec adds three: the `grassDark` token, the `grassLight` token and the `shadow` composite (the `pit` token at alpha byte `80` over `groundTop`). The result is ten.
- **Scenery**: the canvas decoration drawn before the graves. It carries no meaning and depends on the layout width only.
- **Seed**: the constant `SCENERY_SEED`, `0x5e7701c3`, from which every scenery position is generated.
- **Seeded generator**: the pure function `mulberry32(seed)` in `scene/scenery-seed.ts`. It returns a function that yields the same sequence of numbers in [0, 1) for the same seed.
- **Star field**: the stars of the sky. For layout width `w` the count is `floor(w * 80 / 800)`. Star `i` with `i mod 3 = 0` is a near star (2 by 2 CSS pixels, token `star`). Every other star is a far star (1 by 1 CSS pixel, token `starFar`).
- **Tile**: a band of the ground, 224 CSS pixels high, that starts at the horizon (y = 80) and repeats downward. Tile `t` covers y from `80 + 224 * t` to `80 + 224 * (t + 1)`.
- **Grass field**: `floor(w / 14)` tufts for layout width `w`. A tuft is a 2 pixel wide vertical blade, 4 to 10 pixels high, in `grassDark` or `grassLight`, placed inside a Tile. The painter repeats the field in every Tile.
- **Shadow**: an ellipse under a grave, centre (96, 210) of the Cell, radii 72 and 8 CSS pixels, in the `pit` token with alpha byte `80`.
- **Stone texture**: the edge and the specks of a stone. The edge is the stroke of the shape path in `ink` with alpha byte `40`. The specks are 2 by 2 CSS pixel squares at fixed points of the shape, in `ink` with alpha byte `40`. The points are a constant of each shape.
- **Header bar**: the page header laid out as one bar with the Wordmark, the scan summary, the evidence downloads, the Legend and the Repository field.
- **Wordmark**: the product name drawn as text in a serif stack beside an inline SVG gravestone mark, both coloured by the `wordmark` token. The h1 text content is "Sexton cemetery".
- **Repository field**: the text input labelled "Repository URL" and its "Scan" button, drawn as one pill.
- **Evidence downloads**: the two links that download the evidence pack, with the accessible names "Download evidence pack as JSON" and "Download evidence pack as Markdown".
- **Scan time view**: the pair `{ text, dateTime }` that the formatter `scanTimeView` returns for an ISO string. The text has the form `D Mon YYYY, HH:MM UTC`, for example `12 Nov 2026, 00:00 UTC`. The `dateTime` is the ISO string itself, or null when the string cannot be parsed.
- **Loading card**: the styled block inside the `role="status"` element that the App shows while a scan loads.
- **Evidence tooltip**: the DOM element with `role="tooltip"` that shows the package name, the installed version, the State, the state reason and the advisory count of one grave.
- **Grace period**: 150 ms. The time the tooltip stays after the pointer leaves a grave, so that the pointer can move onto the tooltip.
- **PR preview**: the rendered view of the pull request body in the drawer.
- **Parser**: the pure function `parseMarkdown` in `drawer/markdown.ts`. It turns a string into a Block tree.
- **Block tree**: the typed result of the Parser: headings, paragraphs, tables, lists, block quotes and rules, each holding Inline nodes (text, code, bold, link).
- **Supported construct**: exactly one of the constructs that `packages/engine/src/remediation/pr-body.ts` emits: the headings `#` and `##`, a pipe table with a header row and a `|---|` separator row, an unordered list (`- `), an ordered list (`1. `), a block quote (`> `), bold (`**x**`), inline code (backticks), a link (`[text](url)`), a horizontal rule (`---`) and a paragraph.
- **Link rule**: a link renders as an anchor only when its address starts with `https://`. Every other link renders as its text, with no anchor.
- **Result area**: the part of the drawer, outside the scrolling body, that holds the "Open pull request" button, its status text and the pull request link. It is always inside the visible part of the drawer.
- **Reduced motion**: the state in which the `prefers-reduced-motion: reduce` media query matches.
- **Small screen**: a viewport 360 CSS pixels wide.
- **Ghost phase**, **Cell**, **Plinth**, **Ink**, **Inscription**, **Overlay**: as defined in cemetery-ui and cemetery-theme.
- **Deliberate test change**: a change to an existing test that is listed in design.md under "Deliberate test changes" because the test pins a value this spec changes on purpose.

## Requirements

### Requirement 1: A layered night sky with stars

**User Story:** As a reviewer with three minutes, I want a sky with depth and stars, so that the page reads as a churchyard at night.

**Traces to:** audit 8; R-UI-1

#### Acceptance Criteria

1. THE Web app SHALL include in the Scenery a star list computed from the layout width and the Seed only, holding `floor(width * 80 / 800)` stars, where star `i` with `i mod 3 = 0` is a near star and every other star is a far star.
2. FOR ANY layout width of at least 224, THE Web app SHALL place every star at x from 0 to `width - 2` and y from 4 to 72 CSS pixels (invariant, so that no star lies below the horizon or beside a grave).
3. THE Web app SHALL generate every scenery position with the Seeded generator started from the Seed, and SHALL call `Math.random` nowhere in `packages/web/src`.
4. FOR ANY layout width, THE Web app SHALL return deeply equal star lists from two calls, so that two renders of one scan are identical (invariant, determinism).
5. FOR ANY two Ghost phases and any two lists of Packages at the same width, THE Web app SHALL produce equal star lists, so that stars do not move with the Ghost phase and stay still under Reduced motion (invariant).
6. WHEN the painter draws a Scene plan, THE Web app SHALL draw in this order: clear, sky gradient, far stars, near stars, moon halo and moon disc, ground gradient, horizon line, fog band, grass, every Grave, and the selection ring last.
7. THE Web app SHALL draw each star with one `fillRect` call in the token colour, and SHALL use before the first Grave only the painter methods `setTransform`, `clearRect`, `createLinearGradient`, `createRadialGradient`, `beginPath`, `arc`, `fill` and `fillRect` (invariant, checked on a recording context).

### Requirement 2: Grass on the ground band

**User Story:** As a viewer, I want grass on the ground, so that the stones stand in a place and not on a flat colour.

**Traces to:** audit 8; R-UI-1

#### Acceptance Criteria

1. THE Web app SHALL include in the Scenery a grass list of `floor(width / 14)` tufts computed from the layout width and the Seed only, each with a Tile-relative x from 0 to `width - 2`, a height from 4 to 10 pixels, a Tile-relative y such that the tuft ends inside its Tile, and a tone of `dark` or `light`.
2. FOR ANY layout width, THE Web app SHALL return deeply equal grass lists from two calls, and SHALL return the same list for any two lists of Packages and any two Ghost phases (invariant, determinism).
3. WHEN the painter draws a Scene plan, THE Web app SHALL draw each tuft of the grass list in every Tile that starts above the canvas bottom, with one `fillRect` call 2 pixels wide in `grassDark` for tone `dark` and in `grassLight` for tone `light`, and SHALL skip a tuft whose bottom lies below the canvas height.
4. THE Web app SHALL draw grass after the fog band and before every Grave, so that grass lies behind stones and never over them.
5. THE Web app SHALL NOT draw grass in the sky band above y = 80.

### Requirement 3: A shadow and a stone texture on every grave

**User Story:** As a viewer, I want each stone to cast a shadow and show a surface, so that stones look like stone.

**Traces to:** audit 8; R-UI-1, R-UI-2

#### Acceptance Criteria

1. WHEN the painter draws a Grave, THE Web app SHALL draw its Shadow before its stone, using `beginPath`, `arc` and a `fill` call with no path argument inside a `save` and `restore` pair.
2. WHEN the painter draws a Grave, THE Web app SHALL draw its Stone texture after the stone fill: one `stroke` call of the shape path in `ink` with alpha byte `40` at a line width of 1, and one `fillRect` call of 2 by 2 pixels in `ink` with alpha byte `40` for each speck of the shape.
3. THE Web app SHALL keep each speck of a shape inside the solid area of that shape (invariant, checked against the solid boxes in design.md for the four shapes).
4. FOR ANY two Graves with the same State, THE Web app SHALL issue the same sequence of Shadow and Stone texture calls when each coordinate is taken relative to the Cell origin (invariant, so that decoration carries no per-package meaning).
5. THE Web app SHALL keep the Grave fill, the Plinth, the Ghost and the Inscription as opaque Night palette colours, SHALL assign `globalAlpha` nowhere, and SHALL form transparency only by appending one of the alpha bytes `34`, `00`, `40` or `80` to a token (invariant).
6. THE Web app SHALL keep the Grave shape a function of the State only and the Grave colour a function of the State only, and SHALL give a Grave a Ghost if and only if its advisories signal is available and non-empty (invariant, unchanged from cemetery-ui requirements 4 and 5).
7. THE Web app SHALL issue no `fill` call with a path argument for the Shadow or the Stone texture, so that the count of `fill` calls with a path stays two per Grave plus one per Ghost.

### Requirement 4: The header as a bar with a wordmark

**User Story:** As a reviewer, I want a header that looks designed, so that the product looks finished from the first second.

**Traces to:** audit 5; R-UI-5, R-UI-7

#### Acceptance Criteria

1. THE Web app SHALL render the Wordmark inside the single h1, as an inline SVG gravestone mark with `aria-hidden="true"` followed by the text "Sexton" and the text "cemetery", so that the h1 text content is exactly "Sexton cemetery".
2. WHERE the model is not null, THE Web app SHALL lay out the repository text, the demo label, the Scan time view, the unlocked and capped notices and the policy line as one Header bar summary, each part in its own element, and SHALL keep the texts that cemetery-ui requires (the repository text, the demo label, the policy status, the policy label and the failing rule count).
3. THE Web app SHALL render the Evidence downloads as two link elements with the accessible names "Download evidence pack as JSON" and "Download evidence pack as Markdown", the `download` attribute, the same `href` values as before, and the visible texts "JSON" and "Markdown", each with an inline SVG download glyph that has `aria-hidden="true"`.
4. THE Web app SHALL keep the document order of the interactive header controls as: the two Evidence downloads, the Legend toggle, the Repository field input, the Scan button.
5. THE Web app SHALL render the Legend toggle as a styled button that keeps its accessible name "Legend", its `aria-expanded` and `aria-controls` attributes and its closed state at load, and SHALL lay the legend panel out as a wrapping row of State chips, each with the State shape in the State colour and the State name, followed by the Ghost chip and the triage order text.
6. THE Web app SHALL render the Repository field as a pill: an input with a fully rounded border and a Scan button joined to it, with the visible label "Repository URL" kept as the accessible name of the input, and SHALL set the input placeholder to a text that holds no host name.
7. THE Web app SHALL style the validation message that the Repository field returns as a block inside the Header bar that keeps `role="alert"`.
8. THE Web app SHALL keep the disabled Repository field and the text "hosted scan arrives with release 0.1 infra" when no API base is configured.

### Requirement 5: A readable scan time

**User Story:** As a security engineer, I want the scan time written as a date I can read, so that I can tell at once how fresh the scan is.

**Traces to:** audit 3, 10

#### Acceptance Criteria

1. WHEN the Header bar shows the scan time, THE Web app SHALL render the Scan time view text inside a `time` element whose `dateTime` attribute is the ISO value of `report.generatedAt`.
2. THE Web app SHALL write the text of a Scan time view as the day without a leading zero, a space, the English three-letter month, a space, the four-digit year, a comma, a space, the hour and minute in 24-hour form with two digits each separated by a colon, a space and "UTC", all in UTC.
3. FOR ANY valid ISO string, THE Web app SHALL return a `dateTime` that parses to the same epoch milliseconds as the input, and a text whose date and time, read back as UTC, equal the input truncated to the minute (round trip).
4. IF the string cannot be parsed as a date, THEN THE Web app SHALL render the string unchanged in a `span`, with no `time` element.
5. WHEN the drawer shows a `fetchedAt` value for a signal or for a failing policy rule, THE Web app SHALL render it through the same Scan time view, and SHALL render the text "not recorded" unchanged.
6. THE Web app SHALL keep `HeaderModel.scanTime` equal to `report.generatedAt` as an ISO string.

### Requirement 6: A styled loading state

**User Story:** As a user who started a hosted scan, I want to see that work is in progress, so that I do not think the page hung.

**Traces to:** audit 4, 19

#### Acceptance Criteria

1. WHILE a scan loads, THE Web app SHALL render the Loading card inside an element with `role="status"` that holds the text "Loading the scan" and a decorative spinner with `aria-hidden="true"`.
2. WHILE Reduced motion applies, THE Web app SHALL show the spinner without animation, so that the Loading card carries no motion (static check on `styles.css`: the animation is declared only outside a `prefers-reduced-motion: reduce` block, and that block sets `animation: none`).
3. WHEN the load ends, THE Web app SHALL remove the element with `role="status"` that belongs to the Loading card.
4. WHILE a scan loads, THE Web app SHALL keep the Header bar summary region at its minimum height, so that the Header bar does not change height when the model changes from null to a value (static check on `styles.css`).

### Requirement 7: An evidence tooltip on every grave

**User Story:** As a reviewer, I want to see why a package has its state without opening the drawer, so that I can read the cemetery quickly.

**Traces to:** audit 7; R-UI-4, R-UI-7

#### Acceptance Criteria

1. WHEN the pointer enters a grave button, THE Web app SHALL show the Evidence tooltip for that grave, and WHEN a grave button receives keyboard focus, THE Web app SHALL show the Evidence tooltip for that grave.
2. THE Web app SHALL fill the Evidence tooltip with the package name, the installed version, the State, the state reason and the advisory count, where the advisory count reads "1 advisory", "N advisories" or "no advisories" for an available signal and "advisories unavailable" for an unavailable signal (invariant, for any package).
3. THE Web app SHALL render the Evidence tooltip as a DOM element with `role="tooltip"` and the id `grave-tooltip`, and SHALL set `aria-describedby="grave-tooltip"` on the grave button it describes while it is shown.
4. WHILE the pointer is over the Evidence tooltip, THE Web app SHALL keep the tooltip shown, and WHEN the pointer leaves both the grave button and the tooltip, THE Web app SHALL hide the tooltip after the Grace period.
5. WHEN the user presses Escape while the Evidence tooltip is shown, THE Web app SHALL hide the tooltip, and THE Web app SHALL keep it hidden until the pointer enters a grave button again or a grave button receives focus again.
6. WHEN a grave button loses focus and the tooltip was shown for keyboard focus, THE Web app SHALL hide the tooltip.
7. WHILE the drawer is open, THE Web app SHALL show no Evidence tooltip.
8. THE Web app SHALL position the Evidence tooltip inside its own Cell at offset (8, 4) with a width of 176 CSS pixels, and SHALL wrap long names and reasons inside it with no horizontal overflow.
9. THE Web app SHALL show at most one Evidence tooltip at a time (invariant).
10. THE Web app SHALL never require hover to learn the same facts: the keyboard focus path and the drawer give the same information (WCAG 1.4.13: dismissible, hoverable, persistent).

### Requirement 8: A rendered preview of the pull request body

**User Story:** As a maintainer, I want to see the pull request body as formatted content, so that I can judge the pull request before I open it.

**Traces to:** audit 1; R-UI-4

#### Acceptance Criteria

1. THE Parser SHALL turn a string into a Block tree and SHALL support exactly the Supported constructs: the headings `#` and `##`, a pipe table, an unordered list, an ordered list, a block quote, bold, inline code, a link, a horizontal rule and a paragraph.
2. WHEN the Parser reads a line that begins with `# ` or `## `, THE Parser SHALL produce a heading of level 1 or 2, and THE Parser SHALL treat a line that begins with three or more `#` characters as paragraph text.
3. WHEN the Parser reads a line that begins with `|` followed by a line that is a separator row (a `|` and then one or more groups of one or more `-` each followed by `|`), THE Parser SHALL produce a table with that line as the header row and every following line that begins with `|` as a body row.
4. WHEN the Parser splits a table row into cells, THE Parser SHALL treat `\|` as a literal pipe character and every other `|` as a cell boundary, so that a value escaped by `escapeField` renders as its literal characters.
5. WHEN the Parser reads inline code, THE Parser SHALL show the text between two backticks as code text with no further interpretation, so that `**`, `[x](y)` and `|` inside a code span render as the literal characters.
6. WHEN the Parser reads a link of the form `[text](address)`, THE Parser SHALL produce a link node only when the address starts with `https://` and holds no white space, and in every other case THE Parser SHALL produce the link text as plain text.
7. FOR ANY input string, THE Parser SHALL produce a Block tree that holds no link node whose address does not start with `https://` (invariant, security, 1000 runs).
8. FOR ANY input that holds no Supported construct, THE Parser SHALL produce text whose plain-text form equals the input (invariant).
9. FOR ANY input string, THE Parser SHALL return without throwing, and FOR ANY input without link brackets or a number followed by a full stop at the start of a line, the letters and digits of the plain-text form SHALL be the letters and digits of the input (no word characters are dropped).
10. THE Parser SHALL read a body of 60,000 characters that consists of unmatched markers in under 1 second (boundary, linear time).
11. THE Web app SHALL render the Block tree as React elements only, with a heading `#` as an h4, a heading `##` as an h5, a table inside a focusable scroll region, a list as `ul` or `ol`, a block quote as `blockquote`, bold as `strong`, code as `code`, a rule as `hr` and a paragraph as `p`, inside one container with the class `pr-preview`.
12. THE Web app SHALL render a link as an `a` element with `target="_blank"`, `rel="noopener noreferrer"` and an `href` that starts with `https://`, and SHALL render no other element with an `href`.
13. FOR ANY input string, THE Web app SHALL render a PR preview that holds no element named `script`, `img`, `iframe`, `svg`, `style` or `object`, and holds only `a` elements that satisfy criterion 12 (invariant, security, 1000 runs).
14. THE Web app SHALL keep the ESLint rule that bans `dangerouslySetInnerHTML`, `innerHTML`, `outerHTML` and `insertAdjacentHTML`, and SHALL use none of them.
15. WHEN a pull request body is rendered, THE Web app SHALL keep the Kind and the Title lines above the PR preview.

### Requirement 9: The remediation result stays in view

**User Story:** As a maintainer who clicked "Open pull request", I want to see the result at once, so that I know whether a pull request exists.

**Traces to:** audit 2, 18

#### Acceptance Criteria

1. WHEN a remediation is proposed and carries an intent, THE Web app SHALL render the "Open pull request" button, its status element and the pull request link inside the Result area, outside the scrolling drawer body, so that they are visible without scrolling at any scroll position of the body.
2. WHEN the user activates "Open pull request" and the request ends, THE Web app SHALL show the status text and, when the address starts with the demo pull request prefix, the link "View the pull request on GitHub" in the Result area.
3. THE Web app SHALL keep the status element as an element with `role="status"` that exists before the request starts, so that a screen reader announces the text when it changes.
4. WHILE a request is in flight, THE Web app SHALL keep focus on the button and SHALL set `aria-disabled="true"` on it (unchanged from spec remediate).
5. WHERE no `onRemediate` function is present, THE Web app SHALL show the text "Pull requests are opened only on the demo repository" in the Result area and no button.
6. THE Web app SHALL style the button, the status text and the link with tokens that meet 4.5 to 1 for text and 3 to 1 for the button boundary and the focus outline.
7. THE Web app SHALL keep the Tab order inside the drawer as: the Close button, the scrolling body, the interactive elements of the body in document order, then the Result area.

### Requirement 10: The repository field works while the drawer is open

**User Story:** As a reviewer, I want to click the Repository URL box while a drawer is open and type at once, so that I can scan another repository without two clicks.

**Traces to:** audit 6; R-UI-7

#### Acceptance Criteria

1. WHILE the drawer is open, THE Web app SHALL NOT make the Header bar inert, and SHALL keep the scene region inert.
2. WHEN a pointer press lands on the drawer backdrop at a point inside the bounding rectangle of the enabled Repository field input, THE Web app SHALL focus that input and close the drawer in the same press.
3. WHEN the drawer closes through criterion 2, THE Web app SHALL leave focus on the Repository field input and SHALL NOT move focus to a grave.
4. WHEN the drawer closes through Escape, the Close button or a press on the backdrop outside the Repository field, THE Web app SHALL return focus to the grave that opened it (unchanged from cemetery-ui).
5. WHERE the Repository field is disabled, THE Web app SHALL treat a press at its position as an ordinary backdrop press that closes the drawer and returns focus to the grave.
6. WHILE the drawer is open, THE Web app SHALL keep the Tab trap, the Escape close and the focus return unchanged: Tab and Shift+Tab cycle over the focusable elements of the dialog only.
7. WHEN a new response loads, THE Web app SHALL close the drawer and make no element inert (unchanged from cemetery-ui).

### Requirement 11: A readable drawer

**User Story:** As a security engineer, I want the drawer to show facts in a form I can read, so that I do not have to decode timestamps and JSON.

**Traces to:** audit 10, 11, 14, 18

#### Acceptance Criteria

1. THE Web app SHALL render a signal value that is a string, a number, a boolean or null as inline code text without JSON quotes for a string, and SHALL render an array or an object as a `pre` block of its JSON text.
2. THE Web app SHALL break long words in the drawer title, in `Source` text and in reason text, so that no text is clipped by the drawer and the drawer body never scrolls sideways (static check: the rules set `overflow-wrap: anywhere`).
3. THE Web app SHALL keep every text that cemetery-ui requires in the drawer: "State: " and the State, "Reason: " and the state reason, the ten signal names as h4 headings in order, the missing signals list, the failing rules by index, the texts "no failing policy rules for this package" and "no remediation proposed yet".
4. THE Web app SHALL style the drawer headings, the signal list, the Close button and the Result area with Night palette tokens only.

### Requirement 12: Styled error and empty states

**User Story:** As a user who mistyped a repository, I want a clear error panel, and as a user of a repository with no dependencies I want a calm empty state.

**Traces to:** audit 12, 13

#### Acceptance Criteria

1. WHEN a scan fails to load, THE Web app SHALL show the error as a framed panel with `role="alert"`, the heading "Scan could not be loaded", the error code in a `code` element and the fixed message text, and SHALL keep the list of contract errors.
2. WHEN a scan holds no direct dependencies, THE Web app SHALL render the text "no direct dependencies in this scan" inside a framed empty state on the night sky and ground, with no canvas and no grave button (unchanged from cemetery-theme 3.10, restyled).
3. THE Web app SHALL keep the error panel and the empty state readable at 360 CSS pixels with no horizontal scroll.

### Requirement 13: A scene that meets the header

**User Story:** As a viewer, I want the sky to touch the header and the page edges, so that the night is one piece.

**Traces to:** audit 17

#### Acceptance Criteria

1. THE Web app SHALL draw the scene container full-bleed: the container SHALL have no horizontal padding from `main`, and the canvas SHALL start at the left edge of the page and at the bottom border of the header.
2. WHERE the page shows the Loading card, the error panel or the empty state, THE Web app SHALL keep a padding of 16 CSS pixels around that panel.
3. THE Web app SHALL keep the layout formulas of cemetery-theme requirement 2 unchanged (columns, rows, height and Cell positions).

### Requirement 14: Small screens

**User Story:** As a reviewer on a phone, I want the page to fit the screen, so that I never scroll sideways.

**Traces to:** audit 9, 14

#### Acceptance Criteria

1. WHILE the viewport is 360 CSS pixels wide, THE Web app SHALL fit the page, so that `document.documentElement.scrollWidth` is at most the viewport width, for the demo scan with the drawer closed, with the drawer open and with the Legend open (checked in a real browser).
2. WHILE the viewport is narrower than 512 CSS pixels, THE Web app SHALL give the drawer the full viewport width.
3. THE Web app SHALL let the Header bar wrap: the Wordmark, the summary, the Evidence downloads, the Legend and the Repository field stack in that order, and the Repository field input SHALL shrink to fit.
4. THE Web app SHALL break the repository address in the Header bar at any character when it is longer than the line.
5. THE Web app SHALL let a table of the PR preview scroll sideways inside its own region and SHALL NOT widen the drawer.

### Requirement 15: Keyboard path and focus rings

**User Story:** As a keyboard user, I want to reach every control and see where I am, so that I can use Sexton without a mouse.

**Traces to:** audit 9, 15; R-UI-7

#### Acceptance Criteria

1. THE Web app SHALL make every control in the Header bar, the scene and the drawer reachable by keyboard, with the tab order of cemetery-ui (the two Evidence downloads, the Legend toggle, the Repository field input, the Scan button, then one grave at a time through the roving tab stop).
2. THE Web app SHALL give every control of the Header bar, the Evidence downloads, the grave buttons, the drawer buttons, the drawer links and the focusable scroll regions a `:focus-visible` rule with an outline of at least 2 pixels in solid style in the `focus` token, and SHALL remove no outline without replacing it.
3. THE Web app SHALL keep the existing `:focus-visible` selectors that `test/a11y.test.tsx` names, each with an outline of at least 2 pixels.
4. THE Web app SHALL draw the DOM focus ring of a grave button 9 CSS pixels inside its Cell edge and the canvas selection ring at its current place, so that a focused grave shows two rings and a selected grave that has no focus shows one.
5. WHEN the user presses an arrow key on a grave button, THE Web app SHALL move focus as before and show the Evidence tooltip of the new grave.
6. THE Web app SHALL pass the axe-core scenarios of `test/a11y.test.tsx` (wcag2a, wcag2aa, wcag21a, wcag21aa) with the new markup: the loaded demo scan, the drawer open, the Legend open, a load error and the disabled field, and SHALL add scenarios for the tooltip shown and for the PR preview with a table.

### Requirement 16: Tokens and contrast

**User Story:** As a user with low vision, I want every colour checked, so that text and controls stay readable.

**Traces to:** audit 9; R-UI-7

#### Acceptance Criteria

1. THE Night palette SHALL gain the tokens `star`, `starFar`, `grassDark`, `grassLight`, `field`, `accentBg`, `accentText` and `wordmark`, each a six-digit lower-case hex string, and THE Web app SHALL write each as a CSS custom property through `applyPalette`.
2. THE Web app SHALL define every new colour as a token in `scene/palette.ts` and SHALL hold no colour literal in `styles.css`, `draw.ts` or any component.
3. THE Web app SHALL use `star`, `starFar`, `grassDark` and `grassLight` only for Scenery drawn on the canvas, and SHALL use none of them in `styles.css`.
4. THE `backdropStops` function SHALL return ten colours: the seven of cemetery-theme, `grassDark`, `grassLight` and the `shadow` composite.
5. FOR EACH of `text`, `muted` and `wordmark`, THE Night palette SHALL give a contrast ratio of at least 4.5 to 1 against `surface`, `field` and every Backdrop stop (exhaustive over the table).
6. FOR EACH of the five State colours, `ghost`, `ring`, `focus` and `border`, THE Night palette SHALL give a contrast ratio of at least 3 to 1 against every Backdrop stop, including `grassDark`, `grassLight` and the `shadow` composite (exhaustive over the table).
7. THE Night palette SHALL give `accentText` a contrast ratio of at least 4.5 to 1 against `accentBg`, and `accentBg` a contrast ratio of at least 3 to 1 against `skyTop` and `skyMid`.
8. FOR EACH of `focus` and `border`, THE Night palette SHALL give a contrast ratio of at least 3 to 1 against `field`.
9. FOR EACH of `star` and `starFar`, THE Night palette SHALL give a contrast ratio of at least 3 to 1 against `skyTop`, `skyMid` and `skyHorizon`.
10. FOR EACH text, border and outline pair that `styles.css` builds from custom properties, THE Web app SHALL meet 4.5 to 1 for text and 3 to 1 for borders and outlines, against the background that the rule names, or against `bg` and `surface` when it names none.

### Requirement 17: Invariants kept

**User Story:** As the owner of the cemetery rules, I want every encoding rule to stay true after the polish.

**Traces to:** R-UI-1, R-UI-2, R-UI-3, R-UI-6

#### Acceptance Criteria

1. THE Web app SHALL keep grave shape and grave colour a function of the State only, and a Ghost if and only if the advisories signal is available and non-empty.
2. THE Web app SHALL add no continuous visual encoding: no height, size or opacity of a stone, a shadow or a texture varies with any package value.
3. THE Web app SHALL keep the triage order of cemetery-ui.
4. THE Web app SHALL keep one grave button per package, positioned over its Cell in the Overlay, with the same accessible name `<name> <version>, <State>` and the advisory count suffix.
5. FOR 300 Packages at a viewport of 1280 by 800 in the end-to-end build, THE Web app SHALL repaint the full scene with a median of 30 timed repaints of at most 16 ms (performance, unchanged from cemetery-theme 3.9).
6. THE Web app SHALL add no runtime dependency, no web font, no image file, no audio file and no external request, and SHALL keep the production Content-Security-Policy unchanged.

### Requirement 18: The README explains Sexton and Dependabot

**User Story:** As a reviewer, I want to know how Sexton relates to Dependabot, so that I see the two as partners and not as rivals.

**Traces to:** the live test of 21 Nov 2026 (README request, no audit item); R-UI-5

#### Acceptance Criteria

1. THE README SHALL contain a section titled "Sexton and Dependabot" with the exact text given in design.md, and SHALL link the three sources named there.
2. THE README section SHALL use short sentences, no semicolons and no dash chains.
3. THE README section SHALL state that Dependabot reports packages that are known to be bad and that Sexton reports packages that are likely to go bad, with evidence, and that the two run side by side.
4. THE README SHALL keep every other section unchanged apart from the screenshot line named in requirement 19.

### Requirement 19: A new screenshot

**User Story:** As a reviewer, I want the README to show the finished scene, so that I see the product before I run it.

**Traces to:** audit 5, 8

#### Acceptance Criteria

1. WHEN every visual change of this spec has landed, THE screenshot task SHALL retake `docs/cemetery.png` from the demo scan at a viewport of 1440 by 900 with the drawer closed and Reduced motion on.
2. THE README SHALL show `docs/cemetery.png` in place of the line "Screenshot placeholder: the cemetery view, `docs/cemetery.png`, arrives with the cemetery UI." and SHALL give the image a text alternative.
3. THE screenshot step SHALL wait for the first canvas paint before it takes the image, and SHALL restore the viewport of 1280 by 800 before the timing step of the end-to-end test.

### Requirement 20: The readability sign-off is repeated

**User Story:** As the product owner, I want R-UI-5 checked by a person outside the project on the finished scene.

**Traces to:** audit 9; R-UI-5

#### Acceptance Criteria

1. WHEN the screenshot is retaken, THE sign-off task SHALL update `docs/ui-readability-sign-off.md` with the new setup (viewport 1440 by 900, Legend closed, drawer closed, no explanation) and leave every record field blank.
2. THE sign-off task SHALL record in its task notes that the outside viewer's sign-off (name, date, commit, the two answers and the result) is owed by the user before submission, and SHALL NOT invent any of them.
3. THE sign-off SHALL pass only when the viewer names the first grave in triage order and says that a ghost means one or more advisories.

### Requirement 21: The steering file matches

**User Story:** As a future agent, I want `.kiro/steering/web.md` to describe the finished behaviour, so that I do not undo it.

**Traces to:** audit 1, 6, 7, 15

#### Acceptance Criteria

1. THE steering task SHALL update `.kiro/steering/web.md` to state the new behaviour: the seeded scenery, the Evidence tooltip, the PR preview with its Link rule, the Result area, the repository field that closes the drawer, the full-bleed scene, the small-screen rule and the token rule for every new colour.
2. THE steering task SHALL keep every existing rule of the file that this spec does not change, and SHALL keep the front matter.

### Requirement 22: Scope

**User Story:** As the owner of the other packages, I want this spec to touch nothing outside the Web app.

**Traces to:** audit (all)

#### Acceptance Criteria

1. THE spec tasks SHALL change only `packages/web`, `README.md`, `docs/cemetery.png`, `docs/ui-readability-sign-off.md` and `.kiro/steering/web.md`.
2. THE spec tasks SHALL change no file under `packages/engine`, `packages/api`, `packages/cli`, `packages/action`, `infra`, and no field of the API contract in `packages/api/src/contract.ts`.
3. THE spec tasks SHALL change no `package.json` and no `package-lock.json`.
4. THE spec tasks SHALL change no existing test except those listed in design.md under "Deliberate test changes".
5. THE spec tasks SHALL end each top-level task with a review by the security-reviewer agent of that task's changes, and SHALL record its findings in the task notes.

## Correction, 23 Nov 2026 (spec cemetery-time)

Criterion 7.4 above stated that the Evidence tooltip stays shown while the pointer is over it. The build does not do that. Spec `.kiro/specs/cemetery-time` (requirement 5) replaces it. The original text is left as written.

Old criterion 7.4, verbatim:

> 4. WHILE the pointer is over the Evidence tooltip, THE Web app SHALL keep the tooltip shown, and WHEN the pointer leaves both the grave button and the tooltip, THE Web app SHALL hide the tooltip after the Grace period.

New 7.4: The Evidence tooltip has `pointer-events: none` and lies inside its own Cell. It stays shown while the pointer is over the grave button under it, so the pointer is over the tooltip area without the tooltip taking the pointer. The tooltip never receives a pointer event itself.

The Grace period still applies when the pointer leaves the grave button: the tooltip hides after it. Escape still hides the tooltip, and it stays hidden until the pointer enters a grave button again or a grave button receives focus again (criterion 7.5 is unchanged).
