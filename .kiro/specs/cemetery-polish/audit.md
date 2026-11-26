# Design Audit: cemetery-polish

## Method

Written before the requirements. Every file under `packages/web/src` was read, including `src/styles.css`. The same pass covered `docs/cemetery.png` (1280 by 800, drawer open on `left-padder`), `.kiro/steering/web.md`, the specs `cemetery-ui` and `cemetery-theme`, R-UI-1 to R-UI-7 in `docs/requirements.md` section 5.8, `docs/ui-readability-sign-off.md`, and the tests under `packages/web/test` and `packages/web/e2e`. Line numbers were read from the files on 21 Nov 2026. The audit follows the code, not a list: items 1 to 9 come from the live test of 21 Nov 2026, items 10 to 16 are candidates that the code confirmed, and items 17 to 19 are marked "Added by audit".

Nothing was run. No browser was opened, so every statement about layout comes from the CSS and the screenshot, not from a measurement. The tasks add the measurements (a 360 pixel end-to-end check).

Paths are under `packages/web` unless stated.

## Items

### 1. The remediation preview shows the PR body as raw Markdown

- File: `src/drawer/Drawer.tsx` line 165, `<pre className="drawer-prbody">{model.remediation.prBody}</pre>`. Styled by `src/styles.css` lines 121 to 126.
- What is wrong: the PR body that the engine writes (`packages/engine/src/remediation/pr-body.ts`) is Markdown. It holds `#` and `##` headings, a pipe table with a `|---|` separator row, bold labels such as `**Package:**`, inline code in backticks, `\|` escapes inside table cells, a `-` list, a numbered list, a `>` warning and a `---` rule. The drawer prints all of it as characters in one monospace block. The demo scan carries bodies of 1,654 to 2,278 characters.
- Why it hurts a first-time viewer: R-UI-4 asks for "a preview of the PR body". A table drawn as `| \`lastPublish\` | \`2026-04-01...\` | ... |` cannot be read as a table, and the reviewer cannot judge what the pull request will look like on GitHub.

### 2. After "Open pull request" the result sits below the visible part of the drawer

- File: `src/drawer/Drawer.tsx` lines 18 to 49 (`RemediateAction`) and line 166. The action is the last child of `.drawer-body`, which scrolls (`src/styles.css` lines 116 to 119).
- What is wrong: the button comes after the whole PR body. The status paragraph (line 36, `role="status"`) and the link (lines 40 to 44) come after the button. A user who clicked the button with the body scrolled to the top sees nothing change. The status text is announced to a screen reader, but a sighted user must scroll to find it.
- Why it hurts: the one action that changes the world (a real pull request on GitHub) gives no visible answer. The user clicks again, which the server treats as an existing pull request.

### 3. The header shows the scan time as a raw ISO timestamp

- File: `src/header/Header.tsx` line 33, `<p className="header-time">{model.scanTime}</p>`. The value is `report.generatedAt`, set in `src/header/header-model.ts` line 56. In the screenshot it reads `2026-11-12T00:00:00.000Z`.
- What is wrong: the string is a machine format with milliseconds and a `T` and a `Z`. It has no label, so a viewer does not know it is the scan time.
- Why it hurts: it reads as noise on the first line of the page that a reviewer sees.

### 4. Loading is the plain text "loading scan"

- File: `src/App.tsx` lines 43 to 46, `<main><p role="status">loading scan</p></main>`. No CSS rule exists for it.
- What is wrong: lower-case bare text on a dark page, with no motion and no frame. A hosted scan can take up to 60 seconds cold (N-3), so a viewer stares at this line.
- Why it hurts: it looks like a hang, not like work in progress.

### 5. The header is a plain h1 with plain paragraphs

- File: `src/header/Header.tsx` lines 25 to 73 and `src/styles.css` lines 58 to 69, 139 to 150, 152 to 199.
- What is wrong: the h1 is the words "Sexton cemetery" in the default heading size. The repository, demo label, time, notices, policy line and evidence line are six stacked `<p>` elements with a margin of 4 px. The Legend toggle and the Scan button have a border and no shape. The URL field is a default text input at its default width. `.demo-label`, `.notice-unlocked` and `.notice-capped` have no rule at all. The evidence links are two underlined words (`.header-evidence a`, line 148) in a sentence "evidence pack: JSON, Markdown". The validation message at line 72 is a bare `<p role="alert">`.
- Why it hurts: the header is the first thing a reviewer sees and it reads as an unfinished form. The product name has no mark. The two downloads, which the security persona needs most, do not look like downloads.

### 6. While the drawer is open the header is inert, so the URL box cannot be used

- File: `src/App.tsx` lines 39 to 42, `<div inert={drawerOpen}>` around `<Header>`. `src/Cemetery.tsx` lines 17 and 44 to 50 report the drawer state to the App for this purpose. The backdrop (`src/styles.css` lines 77 to 84) covers the whole viewport.
- What is wrong: the header is visible to the left of the drawer on a wide screen, so it looks usable. A click in the Repository URL box lands on the backdrop and closes the drawer. The user must click again to reach the box. `inert` also removes the box from the accessibility tree while the dialog is open.
- Why it hurts: "scan another repo" is the second thing a reviewer tries after opening a grave. The first click appears to do nothing useful.

### 7. A grave shows nothing on hover or focus

- File: `src/overlay/GraveButtons.tsx` lines 37 to 52. The buttons carry `aria-label` only. `src/styles.css` lines 42 to 56 give `.grave-button` a pointer cursor and a focus outline, and no hover rule. `src/scene/layout.ts` line 13 and `inscriptionFor` give no inscription when a scan holds more than 60 packages.
- What is wrong: to learn why a package has its state, the user must click, open the drawer, and read the "Reason" line. With more than 60 packages the graves carry no name at all, so a viewer cannot tell which grave is which without opening it.
- Why it hurts: R-UI-4 and the persona "Reviewer Rita" depend on quick answers. Opening a drawer for each grave costs a click and a screen of reading for a one-line fact.

### 8. The scene is a flat sky with no stars, no grass, and graves with no shadow or texture

- File: `src/scene/draw.ts` lines 52 to 85 (`drawScenery`) and 87 to 138 (`drawGrave`). The sky is one linear gradient, a moon with a halo, a ground gradient, a horizon line and a fog band. A grave is one flat fill, a plinth, an optional crack and the inscription. In the screenshot the stones are solid colour blocks on a flat green-black ground.
- What is wrong: nothing separates a stone from the ground. The ground band has no ground cover. The sky has no depth.
- Why it hurts: the owner's instructions for the product ask for a churchyard at night. The scene reads as a diagram, not as a place.

### 9. Small screens, keyboard path and contrast have not been checked since the theme

- File: `src/styles.css` has no `@media` rule (a search for `@media` finds none in the 199 lines) and no width rule for small screens. `e2e/smoke.spec.ts` and `playwright.config.ts` run one viewport, 1280 by 800. `docs/ui-readability-sign-off.md` has every field empty. `test/shapes-palette.test.ts` checks token pairs, and `test/a11y.test.tsx` checks the tab order in jsdom, which has no layout.
- What is wrong, by reading the code: at 360 CSS px the header repository text (a long URL with no break opportunity, `.header-repo` line 140, no `overflow-wrap`) can push the page wider than the viewport. The `<label>` plus input plus button row (`.repo-form`, lines 162 to 169 and 187 to 189) can exceed 328 px (360 minus the 2 by 16 px padding of `header`). The R-UI-5 sign-off was never recorded for the night scene. No real-browser keyboard run exists.
- Why it hurts: a reviewer on a phone sees a page that scrolls sideways. R-UI-7 (keyboard and contrast) is claimed and has no end-to-end evidence.

### 10. Signal and rule `fetchedAt` values show as raw ISO strings in the drawer (candidate, confirmed)

- File: `src/drawer/Drawer.tsx` line 112 (`<p>Fetched at: {s.fetchedAt}</p>`) and line 149 (`<p>Fetched at: {f.fetchedAt}</p>`). `src/drawer/drawer-model.ts` lines 55 to 58 pass the string through. The screenshot shows `2026-11-12T00:00:00.000Z` ten times in one drawer.
- What is wrong: the same machine format as item 3, repeated for every signal.
- Why it hurts: it buries the facts a reviewer wants (the source and the value) in noise.

### 11. Signal values show as JSON in a `pre` block (candidate, confirmed)

- File: `src/drawer/Drawer.tsx` line 114, `<pre>{s.valueText}</pre>`. `src/drawer/format-value.ts` returns `JSON.stringify(value, null, 2)`. In the screenshot `lastPublish` shows `"2026-09-20T10:00:00.000Z"` with quotes and `deprecated` shows `false` in a small monospace block.
- What is wrong: a single boolean or string sits in a code block with JSON quotes. Arrays and objects are pretty printed, which is right for them.
- Why it hurts: the value is the answer to the signal, and it is the smallest, least readable text in the section.

### 12. The load error panel has almost no styling (candidate, confirmed)

- File: `src/App.tsx` lines 47 to 63 and `src/styles.css` lines 196 to 199 (`.load-error`: a border and 16 px padding). The panel is an unframed `<section role="alert">` with a default h2, then `code: message` text and a bare list of contract errors.
- What is wrong: it sits in `main` with the header's padding. It has no icon, no spacing between the code and the message, and no hint what to do next. The `code` such as `scan-url-rejected` is shown as plain text.
- Why it hurts: the most likely first failure (a mistyped repository or an unreachable API) looks like a broken page.

### 13. The empty scan state is a bare line (candidate, confirmed)

- File: `src/Cemetery.tsx` line 64, `<p className="cemetery-empty">no direct dependencies in this scan</p>`. `src/styles.css` lines 28 to 31 set margin 0 and the muted colour.
- What is wrong: lower-case text flush against the top left of an empty dark box with no sky or ground.
- Why it hurts: a repository with no dependencies is a valid good result, and it looks like an error.

### 14. Long package names and long URLs are clipped in the drawer (candidate, confirmed)

- File: `src/styles.css` lines 86 to 98 (`.drawer` has `overflow: hidden`) and 116 to 119 (`.drawer-body` has `overflow: auto`). `src/drawer/Drawer.tsx` line 99 renders the name in an `h2`, and lines 111 and 148 render `Source:` text in `<p>`. Only `.drawer pre` (lines 121 to 126) has `overflow-wrap: anywhere`.
- What is wrong: a scoped name such as `@scope/a-very-long-package-name 1.2.3` has no break opportunity, so the h2 is clipped by the drawer. A source URL such as the deps.dev dependencies address (about 85 characters) makes `.drawer-body` scroll sideways.
- Why it hurts: the title of the dialog is cut off, and the body scrolls in two directions, which is hard on a phone.

### 15. The canvas selection ring and the DOM focus ring are the same colour in the same place (candidate, confirmed)

- File: `src/Cemetery.tsx` line 26 (the first grave is selected at load), `src/scene/draw.ts` lines 44 and 145 to 148 (the ring is drawn with `ring`, 3 px, inset 2 px by `src/scene/layout.ts`), and `src/styles.css` lines 53 to 56 (`.grave-button:focus-visible`: `outline: 3px solid var(--focus)` with `outline-offset: -3px`). `ring` and `focus` are both `#7aa2ff`.
- What is wrong: at load, grave 1 shows a blue ring although no element has focus. When it does have focus the DOM outline lands on the canvas ring. The viewer cannot tell "selected" from "focused".
- Why it hurts: R-UI-7 asks for a visible keyboard focus. A ring that is already there before the first key press does not show where the keyboard is.

### 16. The Theme type is now night-only (candidate, confirmed, left alone)

- File: `src/scene/palette.ts` line 3 (`type Theme = "light" | "dark"`) and line 54 (`PALETTE = { light: NIGHT, dark: NIGHT }`). `src/App.tsx` line 20 passes `"dark"`. About 40 tests import `Theme`.
- What is wrong: two keys point to one table. Nothing a viewer sees depends on it.
- Decision: not changed in this spec. The product decision is night only, no theme switch. Removing the alias would rewrite many tests for no visible gain. No requirement traces to this item.

### 17. The scene is inset from the page edges by the page padding (Added by audit)

- File: `src/styles.css` lines 58 to 62, `header, main { box-sizing: border-box; padding: 16px; }`, and lines 17 to 21 (`.scene-container` has the page background). In the screenshot a dark 16 px strip runs along the left of the sky and the scene looks like a card pasted below the header.
- What is wrong: the canvas width is the container width, and the container is inside the 16 px of `main`. The sky does not meet the header's bottom border or the page edges. The gap shows the page colour.
- Why it hurts: the sky band should touch the header, as one continuous night.

### 18. The "Open pull request" button, its status and the link have no styles (Added by audit)

- File: `src/drawer/Drawer.tsx` lines 31 to 46. The classes `drawer-remediate`, `drawer-remediate-button`, `drawer-remediate-status` and `drawer-remediate-note` have no rule in `src/styles.css`. The only matching rule is `.drawer button:focus-visible` (line 110).
- What is wrong: the most important button in the product is a default grey browser button on a dark panel, and the pull request link is the default link colour.
- Why it hurts: the primary action does not look like the primary action. The default link blue on the `surface` token has not been checked against 4.5 to 1.

### 19. The header loses its content while a scan loads, so the page jumps (Added by audit)

- File: `src/App.tsx` lines 26 to 29. `model` is null unless the state is `ready`, and `src/header/Header.tsx` lines 28 to 52 render nothing for a null model.
- What is wrong: submitting a repository removes the repository line, time, policy and evidence links, so the header shrinks by about 100 px, then grows back when the scan arrives. The scene below moves with it.
- Why it hurts: the page jumps twice for one action, and the Scan button the user just pressed moves away from the pointer.

## Checked and fine

- Heading order. The page has one h1 (`Header.tsx` line 26). The drawer has h2 for the title, h3 for the sections and h4 for each signal (`Drawer.tsx` lines 99, 106, 110, 124, 133 and 158). No level is skipped. The rendered PR preview adds headings below h3, so the order stays valid (design, "Rendered PR preview").
- Colour literals. `src/styles.css` holds none, and `test/shapes-palette.test.ts` enforces it ("styles.css holds no colour literal and uses only known variables"). No `Math.random` call exists under `src`.
- Close button. `.drawer-close` (lines 100 to 108) has a border, padding of 8 by 12 px and a pointer cursor. It is a plain text button, which is acceptable. It is restyled with the other drawer buttons for consistency only.
- Reduced motion. `src/hooks/use-ghost-phase.ts` stops the ghost timer under Reduced motion. No CSS animation exists today, so none needs a guard yet. The new loading motion needs one.
- Content Security Policy. `vite.config.ts` sets `style-src 'self'` with no inline style attribute allowance. Styles set from script (React `style` props write through the CSSOM) are not blocked. The polish adds no `<style>` tag, no `style=""` in markup and no `url()`.

## What the tests pin

Each existing test that pins a value this audit changes is named in design.md under "Deliberate test changes". The main ones: the text "loading scan" (item 4), the `pre.drawer-prbody` (item 1), the header `inert` check (item 6), the raw ISO text in the header (item 3), the backdrop stop count of seven (item 8) and the h4 count in the drawer (item 1).
