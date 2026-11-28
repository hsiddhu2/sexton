# Requirements Document

## Introduction

Until now the address `/` opened the cemetery itself. A first visitor met a canvas full of graves with no word on what Sexton is, where it runs or how it was built. This spec gives `/` a product home page. Its sections, their order and every sentence on it are set by the requirements below. Every sentence rests on README.md or a named repository file (requirement 11).

This spec adds:

- A product home page at `/`, with the sections of requirements 2 to 10 in that order.
- New addresses for the cemetery (`/cemetery`), a Live scan (`/scan?repo=<owner/name>`) and a Replay (`/cemetery?replay=<name>`). Every old address is forwarded.
- A scan cache in the browser. A refresh or a revisit within 15 minutes shows the saved scan with no request.
- Recent scans on the home page and in the header's Scan field.
- One Top bar on every page, with the tabs "Overview" and "Cemetery" right after the wordmark.

The cemetery view, its canvas Scene and its animated Characters stay as they are on main.

Out of scope: any change to the engine, the API or infra. Also out of scope: a server-side cache, sign-in, private repositories and a demo video file.

## Glossary

- **Site**: the web app in packages/web.
- **Home page**: the product page at `/` (home-page/HomePage.tsx). Not to be confused with **Home**, the cemetery's own view of a loaded scan (spec clean-site).
- **Cemetery view**: the site shell of spec clean-site: the header, Home or a Replay or the Guide page, the site footer.
- **Route**: what the path of the page address names: the Home page, the Cemetery view, or a forward to another address.
- **Old address**: an address of the Cemetery view before this spec: `/` with any of the query keys `replay`, `repo`, `scan`, `page`, `view`, `grave` or `at`.
- **Live scan**: a hosted scan of a public GitHub repository through the API base.
- **Repo key**: the owner/name of a repository from header/repo-input.ts, in lower case.
- **Scan cache**: the store of finished Live scans in the browser's localStorage under `sexton:scans` (cache/scan-cache.ts).
- **Entry**: one record of the Scan cache: its Repo key, the owner/name label, the time it was saved and the scan response, or none.
- **Fresh**: an Entry with a response saved less than 15 minutes ago and not in the future.
- **Recent scans**: the Entries of the Scan cache, newest first, at most 10.
- **Claim registry**: web/src/copy/claims.ts, the one source of every sentence the Site shows that says what Sexton does or can do.
- **Status label**: the pill on a "Where it runs" card that says how far that part is: "Live", "On main", or "On npm".
- **Off-site link**: a link whose address is on another site, an absolute URL with a scheme.
- **Top bar**: the sticky header of every page, the Home page's and the Cemetery view's, built from the same parts (requirement 12).
- **Tabs**: the two links "Overview" and "Cemetery" right after the wordmark in the Top bar (12.5). "Overview" names the Home page. "Cemetery" names the Cemetery view, not spec clean-site's **Home**, the cemetery's own view of a loaded scan.

## Requirements

### Requirement 1: Routes and old addresses

**User Story:** As a visitor, I want `/` to tell me what Sexton is, and every link I already have to keep working.

#### Acceptance Criteria

1. WHEN the path is `/` and the query holds none of the keys `replay`, `repo`, `scan`, `page`, `view`, `grave` and `at`, THE Site SHALL show the Home page.
2. WHEN the path is `/cemetery`, THE Site SHALL show the Cemetery view of the View the query names (spec clean-site, 10.6), the Sample scan when the query names none.
3. WHEN the path is `/scan` and the query holds `repo`, THE Site SHALL show the Cemetery view of a Live scan of that repository.
4. WHEN the path is `/` and the query holds `repo` and no `replay`, THE Site SHALL replace the address with `/scan` and the same query through `history.replaceState`, adding no history entry, and show the Cemetery view.
5. WHEN the path is `/` and the query holds any other key of 1.1, THE Site SHALL replace the address with `/cemetery` and the same query through `history.replaceState` and show the Cemetery view.
6. WHEN the path is none of `/`, `/index.html`, `/cemetery` and `/scan` (a trailing slash allowed), THE Site SHALL replace the address with `/` and show the Home page.
7. WHILE the Cemetery view is shown, THE Site SHALL write the View address on the path `/scan` for a Live scan and `/cemetery` for every other View, and a Live scan's `repo` value SHALL be its owner/name.
8. WHEN `repo` holds a github.com link that header/repo-input.ts accepts, THE Site SHALL read it as that repository's owner/name, so old shared links land on the same scan.
9. WHEN Back or Forward moves between the Home page and the Cemetery view, THE Site SHALL show the Route of the entry it lands on.
10. IF the history API is refused, THEN THE Site SHALL still show the Route and leave the address as it is.
11. README.md SHALL link the cemetery as `/cemetery` and each Replay as `/cemetery?replay=<name>`.

### Requirement 2: The Home page header

**User Story:** As a visitor, I want to jump to a section, the code or the demo from the top of the page.

#### Acceptance Criteria

1. THE Home page header SHALL be the Top bar, holding in order: the wordmark, the Tabs, then at its right end a "GitHub" link to https://github.com/hsiddhu2/sexton (2.5) and a "Try the demo" link to `/cemetery`.
2. WHEN the page address ends in a section's id (`#attacks`, `#how`, `#where`, `#kiro`, `#roadmap` or `#open`), THE Home page SHALL scroll to that section, and the section's heading SHALL sit below the sticky Top bar.
3. THE header SHALL stay at the top of the viewport while the page scrolls.
4. WHILE the viewport is under 700 px wide, THE Top bar SHALL wrap as 12.11 says, with GitHub and Try the demo on the first row beside the wordmark.
5. THE Home page SHALL open every Off-site link in a new tab, with `target="_blank"` and `rel="noopener noreferrer"`. This covers "GitHub" in the header, "Star on GitHub", "Install the Kiro Power", the demo video link and the track credit links. Links inside the Site SHALL open in the same tab.

### Requirement 3: The hero

#### Acceptance Criteria

1. THE hero SHALL show the eyebrow "Open source · npm supply chain · Release 0.1", the headline "Find the dependencies that will hurt you. Prove it. Open the fix." and the one-line pitch of the Claim `home.hero.pitch`.
2. THE hero SHALL hold a Scan box: a field named "GitHub repository" and a button "Scan your repo".
3. WHEN the Scan box is sent with input that header/repo-input.ts accepts, THE Site SHALL go to `/scan?repo=<owner/name>` with a new history entry and start the Live scan, unless a Fresh Entry exists for its Repo key (requirement 13).
4. IF the input is refused, THEN THE Scan box SHALL keep focus, show "Enter a repo as owner/name, or paste a github.com link." and go nowhere.
5. WHILE the Site has no API base, THE Scan box field and button SHALL be disabled and described by "Scanning is off in this build."
6. THE hero SHALL hold a "Walk the sample cemetery" link to `/cemetery` and the line "Public repos only. No sign-in. Apache-2.0."
7. THE hero SHALL show the cemetery picture of docs/cemetery.png, with a text alternative and the caption of the Claim `home.hero.caption`.
8. WHILE the Site is in the Narrow layout, THE Scan box's hint SHALL read "owner/name" and SHALL fit whole inside the field at 360 and 390 px. In the other layouts it reads "owner/name, for example expressjs/express".

### Requirement 4: The attacks are real

#### Acceptance Criteria

1. THE section "The attacks are real" SHALL show two cards, axios (31 March 2026) and keyv (4 August 2026), each with a title, what happened and the state Sexton gives, from the Claim registry.
2. THE axios card SHALL show the axios Replay picture of docs/replay-axios.png, and THE keyv card SHALL show the keyv Replay picture of docs/replay-keyv.png. Each picture SHALL be the built site at 1440 by 900 with Reduced motion on and the Welcome bar closed, at the Step where the grave turns Possessed, and SHALL have a text alternative.
3. THE axios card SHALL link "Watch the axios replay" to `/cemetery?replay=axios`, and THE keyv card SHALL link "Watch the keyv replay" to `/cemetery?replay=keyv`.

### Requirement 5: How it works and the five states

#### Acceptance Criteria

1. THE section "How it works" SHALL show four numbered steps in order: "Read the signals", "Give each a state", "Enforce your policy", "Open the fix, with proof", each with its Claim text.
2. THE section SHALL then show the five states in the order Possessed, Dead, Haunted, Restless, Alive, each name in its canvas state colour from scene/palette.ts, each with its Claim text.

### Requirement 6: Where it runs

#### Acceptance Criteria

1. THE section "Where it runs" SHALL show five cards in order: the cemetery, the CLI, the GitHub Action, the Kiro Power and the evidence pack, each with its Claim text and a Status label.
2. THE Status labels SHALL be "Live" for the cemetery, "On npm" for the CLI, since release 0.1.0 put it on npm on 28 November 2026, and "On main" for the GitHub Action, the Kiro Power and the evidence pack, each resting on README.md.

### Requirement 7: Built with Kiro

#### Acceptance Criteria

1. THE section "Built with Kiro" SHALL show the heading "Every feature began as a spec", two lines on specs and on the gravedigger review, and six cards: Specs, Steering, Hooks, Custom agents, A Power and Headless CLI.
3. THE "Headless CLI" card SHALL say only that the gravedigger agent was also run headless from the Kiro CLI, as the Claim `home.kiro.card.cli`, resting on README.md's line about that run.
2. EVERY sentence of the section SHALL rest on README.md or a spec in .kiro/specs (requirement 11).

### Requirement 8: The demo video

#### Acceptance Criteria

1. THE demo video section SHALL render only WHILE the constant `DEMO_VIDEO_URL` in home-page/video.ts holds an https URL.
2. WHILE `DEMO_VIDEO_URL` is null, THE Home page SHALL render no part of the section and no placeholder text.
3. WHILE `DEMO_VIDEO_URL` is set, THE section SHALL show the heading "The demo" and a link "Watch the demo video" to that URL, with no embedded frame, so the content security policy is unchanged.

### Requirement 9: Roadmap

#### Acceptance Criteria

1. THE section "Roadmap" SHALL show the line "Releases are sequenced, not promised by date." and four headstones on a dashed path, in order 0.1, 0.2, 0.3 and 1.0, each with its label and its items from README.md's Roadmap.
2. THE 0.1 headstone SHALL be lit: an accent border and accent figures, with the label "Now". The other three SHALL be unlit, labelled "Next", "Later" and "The far field".
3. THE path SHALL be hidden from assistive technology, and the headstones SHALL be an ordered list.

### Requirement 10: Open source, and the footer

#### Acceptance Criteria

1. THE section "Open source. Scans itself." SHALL show its Claim text and three links: "Star on GitHub" (https://github.com/hsiddhu2/sexton), "Try the demo" (`/cemetery`) and "Install the Kiro Power" (https://github.com/hsiddhu2/sexton/tree/main/powers/sexton).
2. THE Home page footer SHALL show "Sexton · Harpreet Singh Siddhu · Apache-2.0 · Characters and ghost are original art." and the Track slot's one-line credit, its title and licence linked, as the Cemetery view's site footer shows it.

### Requirement 11: Claims

#### Acceptance Criteria

1. EVERY sentence the Home page shows SHALL be a Claim of the Claim registry or a listed label (a heading, a link or button text, an eyebrow, a Status label, a Roadmap label or a date line).
2. EVERY Claim SHALL rest on texts found as written in README.md, or in a named tracked repository file (a spec under .kiro/specs, a steering file, NOTICE or CREDITS.md), or both.
3. A test SHALL render the Home page and fail on any sentence that is neither a Claim sentence nor a listed label, and on any Claim whose resting text is not found.

### Requirement 12: The wordmark and the Scan boxes

#### Acceptance Criteria

1. WHEN the wordmark is pressed in the Cemetery view or on the Home page, THE Site SHALL go to `/` and show the Home page at its top.
2. THE wordmark's accessible name SHALL be "Sexton, home page".
3. THE breadcrumbs and buttons inside the Cemetery view ("← Cemetery", "Exit replay", "Back to the cemetery", "Go to the cemetery", Escape) SHALL keep the Home action of spec clean-site, 10.2.
4. WHEN the Site goes to `/`, by the wordmark, the "Overview" tab, another link or Back, THE Home page Scan box SHALL be empty and the header Scan field SHALL hold nothing on the next visit to the Cemetery view, unless that visit's address names a repository waiting for a press.
5. THE Top bar of the Home page and of the Cemetery view SHALL show the Tabs directly after the wordmark, in the order "Overview", "Cemetery". Each SHALL be a real link, "Overview" to `/` and "Cemetery" to `/cemetery`, and a modified press SHALL follow the link.
6. WHEN "Overview" is pressed with a plain primary press, THE Site SHALL do what 12.1 says the wordmark does, 12.4 included. WHEN "Cemetery" is pressed so on the Home page, THE Site SHALL go to `/cemetery` with a new history entry. WHEN it is pressed so in the Cemetery view, THE Site SHALL take the Home action of spec clean-site, 10.2, as "← Cemetery" does.
7. THE Tab of the page on screen SHALL carry `aria-current="page"` and show in the text colour with an underline, and the other Tab SHALL show in the muted text colour with no underline. "Overview" is current on the Home page. "Cemetery" is current on every screen of the Cemetery view: the Sample scan, a Live scan, a scan file, a Replay and the Guide page. Neither Tab SHALL use the gold accent (spec clean-site, 1.8), and both SHALL keep one font weight, so neither moves when the page changes.
8. WHILE the Site is in the Wide or Middle layout, THE Top bar SHALL be the same on both pages at any one viewport width: one height, at most 64 px (spec clean-site, 1.2), the same side padding, the wordmark at 26 px with its glyph at the same place, and the Tabs at the same place. Its links and buttons SHALL share one height (36 px) and one text size (13 px). Moving between `/` and `/cemetery` SHALL move or resize neither the wordmark nor the Tabs. At every width the wordmark SHALL keep its size and place on both pages. The gold accent rule of spec clean-site, 1.8 covers the Cemetery view's bar. On the Home page's bar the gold marks only the wordmark glyph, "Try the demo" (16.5) and focus outlines.
9. WHILE the Site is in the Wide layout, at 1440 by 900, 1366 by 768 and 1280 by 800, THE Cemetery view's Top bar SHALL be one row of at most 64 px and the page SHALL not scroll, with the Welcome bar open and closed, the Music button shown and the longest scan tag (spec clean-site, 3.28 and 3.29). The Scan field SHALL keep at least 300 px, so wider font rendering still fits. The scan tag SHALL be at most 12rem wide, its text cut with an ellipsis.
10. WHILE the Site is in the Middle layout (700 to 1099 px), THE Top bar SHALL stay one row of at most 64 px with both Tabs showing their words. "What is Sexton?" SHALL show its book glyph alone, named by its words, as Legend, Music and Tour do (spec clean-site, 1.3). The bar's side padding SHALL be 20 px and its gaps 12 px.
11. WHILE the Site is in the Narrow layout (under 700 px), THE Top bar SHALL wrap. Its first row keeps the wordmark and the buttons (GitHub and Try the demo on the Home page). Its second row starts with the Tabs, followed in the Cemetery view by the Scan field. Both Tabs SHALL show their words, be reachable by their names, and cause no sideways scroll at 360 and 390 px. In this layout the Tabs take the Scan field's height (42 px), and at 390 px the bar is 111 px high on both pages with the Tabs at the same place. Under that width the Cemetery view's buttons may wrap to a row of their own, as they did before this spec.
12. WHILE the Site is in the Narrow layout, THE Cemetery view's Scan field SHALL show the hint "owner/name", which SHALL fit whole inside the field at 360 and 390 px. To make room, the field's decorative search glyph SHALL hide and the field, its Scan button and the Tabs SHALL take less padding. In the other layouts the hint stays "Scan a GitHub repo, for example  facebook/react".

### Requirement 13: The scan cache

**User Story:** As a visitor, I want a refresh not to spend another scan, and I want to choose when to scan again.

#### Acceptance Criteria

1. WHEN a Live scan finishes with a scan response, THE Site SHALL save an Entry under its Repo key with the time saved, replacing any Entry with that key.
2. WHEN the Cemetery view is to show a Live scan and a Fresh Entry exists for its Repo key, THE Site SHALL show the saved response and send no request to the API.
3. WHILE a saved response is shown, THE Site SHALL show the line "Scanned N min ago" (or "Scanned just now" under one minute) and a "Rescan" button, and the line SHALL update at least once a minute.
4. WHEN Rescan is pressed, THE Site SHALL send exactly one request for that repository, ignoring the cache, and save its result.
5. WHEN no Fresh Entry exists, THE Site SHALL behave as spec clean-site, 10.11 and 10.12 say: a press starts the scan, a reload after the visitor's own scan starts it again, and an address alone waits for a press.
6. THE Scan cache SHALL hold at most 10 Entries, newest first, and at most 2,000,000 characters of stored text. To meet the size limit it SHALL drop saved responses from the oldest Entries first. It SHALL NOT save a response that alone exceeds the limit.
7. THE Scan cache SHALL drop the saved response of an Entry that is no longer Fresh when it next writes, and keep its Repo key, label and time for Recent scans.
8. WHEN the stored text is missing, not JSON, of another version, or holds an Entry or response that fails validation (load/validate-scan-response.ts), THE Site SHALL ignore that part and treat it as absent.
9. EVERY read and write of localStorage SHALL be wrapped in try/catch. IF storage is blocked or full, THEN THE Site SHALL work as it would with an empty cache and show no error.
10. THE Scan cache SHALL store only the Repo key, the owner/name label, the time saved and the public scan response the API returned, and SHALL send none of it anywhere.
11. A saved time in the future SHALL count as not Fresh.

### Requirement 14: Recent scans

#### Acceptance Criteria

1. WHILE the Scan cache holds at least one Entry, THE Home page SHALL show "Recent scans" under the Scan box: each Entry's owner/name with its age ("just now", "N min ago", "N h ago" or "N d ago"), newest first, and a "Clear" button.
2. WHILE the Scan cache holds at least one Entry and the header Scan field's example list is open, THE list SHALL show "Recent scans" above "Try one", with the same rows and a "Clear" button.
3. WHEN a Recent scans row is pressed, THE Site SHALL do what sending that owner/name in the Scan box does (3.3).
4. WHEN Clear is pressed, THE Site SHALL remove the `sexton:scans` item, and every Recent scans list SHALL disappear.
5. WHILE the Scan cache is empty or storage is blocked, THE Site SHALL show no Recent scans heading and no Clear button.

### Requirement 15: Page title and preview tags

#### Acceptance Criteria

1. THE page SHALL have the title "Sexton: find the dependencies that will hurt you" on the Home page and "Sexton cemetery" in the Cemetery view.
2. index.html SHALL hold a meta description, Open Graph tags (`og:type`, `og:title`, `og:description`, `og:url`, `og:image`) and Twitter card tags (`twitter:card` of `summary_large_image`, `twitter:title`, `twitter:description`, `twitter:image`), with the cemetery picture at `/cemetery.png` of the hosted site as the image.
3. THE production build SHALL hold `cemetery.png`, `replay-axios.png` and `replay-keyv.png` at its root, copied unchanged from docs/.

### Requirement 16: Look, layout and safety

#### Acceptance Criteria

1. THE Home page SHALL use the Site's colour tokens and its self-hosted Inter and Cormorant Garamond, with the system monospace stack for dates. It SHALL load no external font, script, style or image.
2. THE content security policy of the build SHALL be unchanged.
3. THE Home page SHALL scroll as a normal page. THE Cemetery view SHALL keep its no-page-scroll rules at 1440 by 900, 1366 by 768 and 1280 by 800 (spec clean-site, 3.29).
4. AT 360 and 390 px wide, THE Home page SHALL have no horizontal scroll.
5. THE Home page SHALL show no speech bubble, no cursive face and no body text in the accent colour. The accent marks only the gold button, the eyebrows of the hero, How it works and the demo, the step numbers, the lit headstone, links and focus outlines.
6. THE Home page SHALL pass axe with no violation at 1440 by 900 and 390 by 844.
7. THE live canvas Characters and the Scene SHALL be unchanged.
8. Each section SHALL be a landmark region named by its heading, and the page SHALL have one h1.

### Requirement 17: Documents

#### Acceptance Criteria

1. README.md's "Try it in two minutes" SHALL start from the Home page and name `/cemetery`, `/scan?repo=<owner/name>`, the scan cache and Recent scans.
2. .kiro/steering/web.md, product.md and structure.md SHALL describe the Home page, the Routes and the Scan cache.
3. docs/requirements.md SHALL carry one change-log line for this spec.
