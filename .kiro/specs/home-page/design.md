# Design Document: home-page

## Overview

A product home page at `/`, in front of the unchanged Cemetery view. The Cemetery view moves to `/cemetery` (the Sample scan, a Replay, the Guide page, a scan file) and `/scan?repo=<owner/name>` (a Live scan). A small top-level Route decides which of the two renders. Old addresses are forwarded in place with `history.replaceState`, so README links and shared links keep working.

A finished Live scan is kept in localStorage for 15 minutes, keyed by its owner/name. A refresh or a revisit within that window shows the saved scan with no request, a "Scanned N min ago" line and a Rescan button. The same store gives Recent scans, on the Home page and in the header's example list, with a Clear button.

### Decisions (27 Nov 2026)

- The Home page sections, in this order: header, hero, The attacks are real, How it works with the five states, Where it runs, Built with Kiro, the demo video, Roadmap, Open source, footer.
- Addresses: `/` is the Home page, `/cemetery` the Sample scan, `/scan?repo=<owner/name>` a Live scan and `/cemetery?replay=<name>` a Replay. `/?repo=` and `/?replay=` forward with `history.replaceState`.
- One Top bar on every page: the wordmark, then the tabs "Overview" and "Cemetery", then each page's own controls. The wordmark and "Overview" go to `/`. "Cemetery" goes to `/cemetery` from the Home page and takes the Home action inside the Cemetery view. Breadcrumbs inside the cemetery keep the Home action. Going to `/` clears the Scan box.
- The scan cache lives in localStorage for 15 minutes, keyed by the normalised owner/name. It is capped, every access is in try/catch, and it holds public scan data only.
- Recent scans are the last 10 scans in this browser. They show on the Home page under the Scan box and in the header Scan box, each with its age, and with a Clear button. Nothing leaves the browser.
- The demo video section is hidden until a URL is set in one constant. No placeholder text ships.
- The Home page sets a title, a meta description and Open Graph and Twitter card tags with the cemetery picture.
- Links to another site open in a new tab with `rel="noopener noreferrer"`. Links inside the site stay in the tab.
- The page uses the Site's self-hosted Inter and Cormorant Garamond and the system monospace stack. It loads no external font (16.1), since the CSP has `font-src 'self'`.
- Links to the Site use paths (`/cemetery`, `/cemetery?replay=axios`), as the page is served from the hosted site.

### Wording and the lines it rests on

Every sentence on the Home page is a Claim of copy/claims.ts, and each Claim lists the README.md or spec texts it rests on (requirement 11). These sentences are recorded here because each one reads two texts together.

| Shipped sentence | Rests on |
|---|---|
| "Twelve signals per package measure the seven product signals in the roadmap, from last publish and advisories to maintainer change, provenance and publisher." | README.md: "on twelve signals" and "These twelve measure the seven product signals in the roadmap" |
| Possessed: "A maintainer changed, provenance regressed, an install script or a risky new dependency appeared, or the publisher changed. Fix first." | README.md's state table |
| Alive: "None of the rules above matched." | README.md's state table: "None of the above" |
| "… for a reviewer to check" | README.md: "lets a reviewer check it" |
| "Property tests check the rules on 100 to 1,000 random cases each." | .kiro/steering/tech.md: numRuns 100 by default, 1000 for security invariants |
| The 0.1 headstone's items | README.md's 0.1 list |
| The hero caption "The purple one is Possessed." | The Possessed colour is the canvas token `#cc79a7`, a purple |

## Architecture

```
main.tsx
  └─ Root (site/Root.tsx)              path → Route (site/route.ts), title, palette, popstate
       ├─ HomePage (home-page/)        Route "home"
       │    └─ uses cache/scan-cache   Recent scans, Clear
       └─ App (App.tsx, unchanged shell) Route "cemetery"
            ├─ load/page-history.ts    writes /cemetery or /scan (site/paths.ts)
            ├─ load/view-address.ts    repo values as owner/name
            └─ cache/scan-cache.ts     Fresh Entry, save, Rescan
```

Root owns the Route. It reads `window.location` once at mount, forwards an Old address with `replaceState`, and listens to `popstate` to switch between the Home page and the Cemetery view. A move from one to the other is a `pushState` through `navigate(path, intent)`. The App mounts fresh on each entry into the Cemetery view, with the `initialSearch` of that address. The App's own history code (spec clean-site, C8) is unchanged apart from the path it writes.

## Components and Interfaces

### C1. Routes (site/route.ts, site/paths.ts, requirement 1)

```ts
type Route = { kind: "home" } | { kind: "cemetery"; search: string } | { kind: "forward"; to: string };
function routeOf(pathname: string, search: string): Route; // pure, never throws
function cemeteryPath(view: View): "/cemetery" | "/scan";  // "/scan" for a repo Source
```

- `/` and `/index.html` with a Cemetery key (`replay`, `repo`, `scan`, `page`, `view`, `grave`, `at`) forward. They go to `/scan<search>` when `repo` is present and `replay` absent, else to `/cemetery<search>`. Without a Cemetery key they give the Home page.
- `/cemetery` and `/scan`, each with or without a trailing slash, give the Cemetery view with the search as it is.
- Any other path forwards to `/` with no search.
- A forward keeps the query string byte for byte, so the App's own parse (clean-site, 10.9) decides what is dropped. Its first `replaceState` then writes the canonical address on the right path.

`load/page-history.ts` builds each entry's URL as `cemeteryPath(view) + formatView(view)`. `view-address.ts` reads a `repo` value through `normaliseRepo` when it is accepted (an old github.com link becomes owner/name) and writes a Live scan's `repo` as its owner/name label.

### C2. Root (site/Root.tsx, requirements 1, 12 and 15)

- Applies the palette to `document.documentElement` once, for both Routes.
- Sets `document.title`: "Sexton: find the dependencies that will hurt you" on the Home page, "Sexton cemetery" in the Cemetery view.
- `navigate(to, intent?)` calls `pushState` (guarded), sets the Route and scrolls to the top for the Home page. `intent: "scan"` tells the next App mount that a press started this Live scan (3.3, 14.3).
- On `popstate` it reads the Route again from `window.location`. A forward Route on popstate is applied with `replaceState`.
- Each entry into the Cemetery view gets a new React key, so the App and its Scan field start empty (12.4).

### C3. The Home page (home-page/, requirements 2 to 10 and 16)

`HomePage.tsx` renders the sections in the order of requirements 2 to 10, each a `<section aria-labelledby>` with an `id` for the header links: `top`, `attacks`, `how`, `where`, `kiro`, `video` (only with a URL), `roadmap`, `open`. Text comes from `copy/home.ts` (labels) and the Claim registry (sentences). Styles are in `home-page/home-page.css` under the `.hp` root, built only from the palette's custom properties.

- **Top bar**: the shared `site-header` of C9 with the wordmark, the tabs ("Overview" current), and at its right end "GitHub" (an `OffSiteLink`) and "Try the demo". The section links are gone, and the section ids stay, so an address ending in `#roadmap` still lands on its section. Section `scroll-margin-top` is 84 px so a heading sits below the 64 px bar (2.2).
- **Hero**: `HomeScan` (the Scan box, the hint, the off note and Recent scans) and the picture `/cemetery.png`.
- **Attacks**: two `article` cards, axios with `/replay-axios.png` and keyv with `/replay-keyv.png`.
- **How it works**: an ordered list of four steps, then the five state cards with `border-color` and name colour `var(--state-<name>)`.
- **Where it runs**: five cards with Status labels. "Live" and "On main" are in the Alive colour and the CLI's label is in the accent colour.
- **Built with Kiro**: two lines and five cards.
- **Demo video**: renders only when `DEMO_VIDEO_URL` (home-page/video.ts) is an https URL (8.1 to 8.3).
- **Roadmap**: an ordered list of four headstones over a dashed line marked `aria-hidden`, with 0.1 lit and labelled "Now".
- **Open source**, then the **footer** with the owner line and the Track slot's `creditParts`.

Every in-site link is a real `<a href>` (`SiteLink`). A plain primary press calls `navigate` instead of loading the page again. Every Off-site link is an `OffSiteLink`: `<a href target="_blank" rel="noopener noreferrer">` (2.5).

### C4. The scan cache (cache/scan-cache.ts, requirement 13)

Pure core:

```ts
const CACHE_KEY = "sexton:scans"; const TTL_MS = 900_000; const MAX_ENTRIES = 10; const MAX_CHARS = 2_000_000;
interface Entry { key: string; label: string; savedAt: number; response: ScanResponse | null }
function parseStore(text: string | null): Entry[];                       // never throws; drops bad parts
function serialise(entries: readonly Entry[]): string;
function isFresh(entry: Entry, now: number): boolean;                    // 0 <= now - savedAt < TTL_MS
function addScan(entries, label, response, now): Entry[];                // C4 rules below
function freshResponse(entries, key, now): { response; savedAt } | null;
function repoKey(label: string): string;                                 // lower case owner/name
function ageText(ms: number): string;                                    // "just now", "N min ago", "N h ago", "N d ago"
```

`addScan` puts the new Entry first, removes any other with its key and keeps the first 10. It sets `response: null` on every Entry that is not Fresh at `now`. Then, while `serialise(entries).length > MAX_CHARS`, it sets `response: null` on the oldest Entry that still has one. A new response that alone is over the limit is never kept.

`parseStore` reads `{ v: 1, entries: [...] }`. An Entry needs a Repo key that `normaliseRepo` accepts and that equals `repoKey(label)`, a finite `savedAt` and a response that is null or passes `validateScanResponse`. Anything else is skipped. At most 10 are read.

I/O edge (`cache/scan-store.ts`): `readCache()`, `saveScan(label, response)` and `clearCache()`, each with `localStorage` inside try/catch. A blocked store reads as empty and writes nothing. A `sexton:scans` change event from another tab is not followed. A later read sees it.

### C5. The Cemetery view with the cache (App.tsx, home/CachedLine.tsx, requirement 13)

- At mount with a Live scan Source, a Fresh Entry is shown through the loader's `show(response, "hosted")`, with `cachedAt` set. Without one, `intent: "scan"` or the clean-site resume rule starts the scan. Otherwise the prompt waits (13.5).
- The header Scan field and Recent scans rows go through the same `scan(url)`. A Fresh Entry is shown, else the scan starts.
- When a hosted load becomes ready, the App saves it with `saveScan` and clears `cachedAt`.
- `CachedLine` renders "Scanned N min ago" and a Rescan button under the headline while `cachedAt` is set. A 30 s interval renders it again. Rescan calls `loadSource(source)` with the cache skipped.

### C6. Recent scans (home-page/RecentScans.tsx, requirement 14)

One component serves both places: a heading "Recent scans", one button per Entry (`<label>` and `<age>`), and a "Clear" button. It renders nothing for an empty list. In the header it sits at the top of the example Pop-over. Pressing Clear there keeps the Pop-over open and focus on the field.

### C7. Claims (copy/claims.ts, requirement 11)

A Claim gains an optional `files` list of `[path, text]` pairs. The check reads each file under the repository and finds the text as written. `readme` may then be empty, but every Claim rests on at least one text. The Home page's sentences are Claims with ids `home.*`. The Home page check is stricter than the capability check of clean-site. Every sentence the Home page renders must be a Claim sentence or one of `HOME_LABELS` (copy/home.ts).

### C8. Build (vite.config.ts, requirement 15)

A plugin `siteImages` serves `/cemetery.png`, `/replay-axios.png` and `/replay-keyv.png` from docs/ in the dev server and emits them into the build root, unchanged. The CSP plugin is unchanged. index.html carries the title, description and card tags with absolute URLs on https://de1giv8lj8sfh.cloudfront.net, the hosted site of README.md.

docs/replay-keyv.png is taken by `e2e/smoke.spec.ts` as docs/replay-axios.png is: the built site at 1440 by 900, Reduced motion on, the Welcome bar closed, at the keyv Replay's Possessed Step, with nothing hovered or focused.

The smoke tests also take docs/cemetery.png and docs/replay-axios.png. All three are taken in the same run, so they show the same Top bar.

### C9. The Top bar and the tabs (header/SiteTabs.tsx, header/Header.tsx, home-page/HomePage.tsx, requirement 12)

Both pages render `<header class="site-header">` from the same styles in styles.css: the `Wordmark`, then `SiteTabs`, then each page's own parts. The Cemetery view adds the scan tag, the Scan field and the four buttons (spec clean-site, 1.1). The Home page adds `<div class="header-buttons bar-end">` with "GitHub" as an `.ib` link and "Try the demo" as `.bar-cta`, the Scan button's gold at the buttons' 36 px height and 13 px text. The Home page's own link colour and focus outline are scoped to its main content and footer (`.hp-main a`, `.hp-footer a`), so nothing on the Home page restyles the bar.

`SiteTabs` is `<nav aria-label="Site">` with two links, "Overview" (`href="/"`) and "Cemetery" (`href="/cemetery"`). Both use the wordmark's press rule (`homeClick`, `isPlainPress`): a plain primary press calls the tab's move, and any other press follows the link. The current tab has `aria-current="page"`, the text colour and a 2 px underline 6 px under the text. The other is in `--ui-muted`. Both keep weight 500, so the second tab never shifts when the current tab changes. On the Home page "Overview" scrolls to the top like the wordmark and "Cemetery" calls `navigate("/cemetery")`. In the Cemetery view "Overview" takes `onWordmark` and "Cemetery" takes the App's `goHome`, the Home action.

Layouts, measured in Chromium with the built site:

- **Wide (1100 px and up).** Side padding 28 px, gaps 20 px. The wordmark's left edge is at 28 px and the tabs start at 150 px and 231 px on both pages. The scan tag is capped at 12rem (it was 16rem) so the Scan field keeps at least 300 px. The tightest case is 1366 by 768 with a 139-character tag, where the field keeps 322 px.
- **Middle (700 to 1099 px).** Side padding 20 px, gaps 12 px, icon buttons and tabs 2 px narrower each side, the Scan button 14 px in. "What is Sexton?" shows its book glyph alone. The Scan field is 198 px wide at 700 px, 398 px at 900 px and 597 px at 1099 px.
- **Narrow (under 700 px).** The bar wraps. The first row keeps the wordmark and the buttons. An empty `::before` line with `flex-basis: 100%` forces the break, and the tabs and the Scan field open the second row by `order`, with a `-10px` top margin that takes back the empty line's extra row gap. The tabs take the field's 42 px height, so their row sits at the same place on both pages. At 390 px the bar is 111 px high on both pages. At 360 px the Cemetery view's buttons wrap to a row of their own, as they did before, and its bar is 157 px high. The example list and the field's notes keep the field's right edge and open to the page's width less its gutters, since the field shares its row with the tabs (spec clean-site, 15.5).

## Data Models

```json
{ "v": 1, "entries": [ { "key": "expressjs/express", "label": "expressjs/express", "savedAt": 1795800000000, "response": { "...": "ScanResponse" } } ] }
```

`savedAt` is milliseconds since the epoch from `Date.now()` at save. Entries are newest first.

## Error Handling

- Storage blocked, full or throwing on any call: the cache reads as empty and writes nothing. No message shows (13.9).
- A stored value that is not JSON, of another `v`, or with a bad Entry: the bad part is skipped (13.8).
- A response that fails validation on read: its Entry keeps no response and counts as not Fresh.
- History refused: the Route still changes and the address stays (1.10).
- An unknown path: forwarded to `/` (1.6).

## Correctness Properties

### Property 1: Routes forward old addresses and never throw

FOR ANY path and query, `routeOf` returns without throwing. FOR ANY query holding a Cemetery key on `/`, the forward keeps the query unchanged and goes to `/scan` exactly when `repo` is present and `replay` absent, else to `/cemetery`. FOR ANY query with no Cemetery key, `/` gives the Home page. `/cemetery` and `/scan` never forward. Proves 1.1 to 1.6.

### Property 2: The View address keeps its path and round-trips

FOR ANY View, `parseView(formatView(v))` gives the canonical View, `cemeteryPath(v)` is `/scan` exactly for a repo Source, and a repo value written is an owner/name that `normaliseRepo` accepts as itself. FOR ANY accepted github.com link in `repo`, the parsed repository equals the one parsed from its owner/name. Proves 1.7 and 1.8.

### Property 3: The cache keeps at most 10 Entries within the size limit

FOR ANY sequence of `addScan` calls with any labels, response sizes and clock values, the result holds at most 10 Entries, no two with one key, newest first. Its serialised text is at most `MAX_CHARS` long, and the newest Entry keeps its response whenever that response alone fits. Proves 13.1 and 13.6.

### Property 4: Only Fresh Entries are served

FOR ANY Entry and `now`, `freshResponse` returns its response exactly when the response is not null and `0 <= now - savedAt < 900,000`. After `addScan` at `now`, no Entry that is not Fresh at `now` keeps a response. Proves 13.2, 13.7 and 13.11.

### Property 5: The store reads back what it wrote, and nothing it cannot trust

FOR ANY Entries made by `addScan`, `parseStore(serialise(e))` equals `e`. FOR ANY string, `parseStore` returns at most 10 Entries without throwing, each with an accepted Repo key. Proves 13.8.

### Property 6: Every Home page sentence is claimed

The rendered Home page, with and without an API base and with Recent scans, holds no sentence outside the Claim sentences and `HOME_LABELS`, and every Claim's README and file texts are found. Proves 11.1 to 11.3.

## Testing Strategy

- Unit and property tests (Vitest, fast-check, numRuns 100, and 1000 for Property 1 and Property 5, which guard untrusted input): `route.test.ts`, `scan-cache.test.ts`, `scan-store.test.ts` (a throwing Storage and a missing one), `view-address.test.ts` (extended), `home-page.test.tsx` (sections, the Top bar, Off-site links, pictures, video constant, Scan box, Recent scans, Clear), `claims.test.tsx` (Property 6), `root.test.tsx` (forwarding, popstate, the wordmark, the tabs, title) and `header.test.tsx` (the tabs' place, current mark and presses).
- End-to-end (Playwright, fresh profiles, `e2e/home.spec.ts`): every section and its links, the three pictures, a section address and its scroll, the Scan box with its hint and the move to `/scan`, and forwarding of `/?repo=` and `/?replay=` with no extra history entry. It also covers the wordmark from the Sample scan, a Replay and the Guide page, and the Scan box empty after a return to `/`. The cache cases cover a reload inside 15 minutes with no API request (every request to the API path is intercepted and counted, and nothing reaches a real API), Rescan making exactly one, Recent scans and Clear on the Home page and in the header, and storage blocked by an init script that makes `localStorage` throw. The layout cases cover axe at 1440 by 900 and 390 by 844, no horizontal scroll at 360 and 390 px, and screenshots at 1440 by 900 and 390 by 844.
- The Top bar (12.5 to 12.11): at 1440 by 900, 1366 by 768 and 1280 by 800, the wordmark's left edge, its type size, the bar's height and both tabs' places are equal on the Home page and in the Cemetery view. On the Sample scan and on a Live scan of the longest repository GitHub allows (39 and 100 characters), each with the Welcome bar open and then closed, the bar is one row of at most 64 px, the Scan field keeps at least 300 px, the Music button shows and the page does not scroll. At 700, 900 and 1099 px the bar is one row of at most 64 px with both tabs' words shown. The tabs' current mark holds on the Sample scan, a Live scan, a Replay and the Guide page. "Overview" goes to `/` at its top with both Scan boxes empty, and "Cemetery" goes to `/cemetery` from the Home page and takes the Home action from a Replay and the Guide page. At 390 and 360 px both tabs are visible and reachable by their names, with no sideways scroll. An address ending in `#roadmap` scrolls to that section.
- `e2e/smoke.spec.ts` takes docs/replay-keyv.png (C8).
- The existing suite moves its `page.goto("/")` to `/cemetery`, and the wordmark cases expect `/`. Every other case is unchanged.
- The 300-grave repaint check runs as before.

### Deliberate test changes

- e2e: `goto("/")` for the cemetery becomes `goto("/cemetery")`. Old `/?…` addresses stay, since they forward.
- e2e and unit: a Live scan's `repo` value is owner/name, not the github.com link.
- e2e and unit: the wordmark goes to `/` and is named "Sexton, home page".
- `test/header.test.tsx`: the header's order holds the tabs right after the wordmark (spec clean-site, 1.1 as amended).
- `test/home-page.test.tsx`: the header test checks the Top bar (wordmark, tabs, GitHub, Try the demo) in place of the five section links, which are gone. The section ids are still checked.
- `test/styles.test.ts`: under 700 px the Scan field shares its row with the tabs (12.11). The check for `.scan-wrap { flex-basis: 100% }` becomes a check for the forced break (`.site-header::before`), the tabs' `order: 3` and the field's `flex: 1 1 0` with `order: 4`.
- `test/imports.test.ts`: copy/home.ts may hold exactly the two github.com link constants of 2.1 and 10.1, and calls no fetch.
- `test/readme.test.ts`: README.md links the cemetery and both replays on their new addresses.
- `test/support/views.ts`: a repository Source the Scan field accepts is generated as its canonical URL, as `canonicalView` now holds it (1.8).
- `test/setup.ts`: every unit case starts with an empty scan cache, so one case's scan is not served to the next.
- `test/way-back.test.tsx`, `test/replay.test.tsx`, `test/header.test.tsx`: the wordmark cases now expect a move to `/`. The Home-action cases that used the wordmark use the breadcrumb "← Cemetery".

## Decisions made during implementation

### Task 1: routes

- **Unknown paths forward to `/`.** This is the smallest surface: nothing but `/`, `/cemetery` and `/scan` is a page. CloudFront already answers an unknown path with index.html (its 403 and 404 error responses map to `/index.html` with status 200), so no infra change is needed. A hosted build that lags main ignores the path and still shows the cemetery.
- **Every Cemetery key on `/` forwards, not only `repo` and `replay`.** `page=guide`, `view=list`, `grave=`, `at=` and `scan=` links from before this spec keep working the same way (1.5).
- **The `repo` value keeps its slash.** `/scan?repo=owner/name` is written with a literal `/`, legal in a query, so the address reads as the owner asked. Other values keep URLSearchParams encoding.
- **The wordmark on the Home page** scrolls to the top and replaces the address with `/`, so it adds no entry.
- **The cemetery shell mounts afresh on each entry from the Home page.** That is what empties its Scan field (12.4). Live scans held in memory for Back and Forward are lost across that move, and the scan cache covers them.
- **The tabs share the wordmark's press rule** (`homeClick`), so the wordmark and both tabs behave the same for every kind of press.
- **The scan tag is capped at 12rem, not hidden at a wider width.** With the tabs in the bar, the longest tag left the Scan field 257 px at 1366 px. A 12rem cap gives back 64 px and keeps the tag on screen at 1366 px, so clean-site 1.4 stays as it is.
- **A section address is scrolled to at mount.** The Home page renders after the browser's own fragment scroll, so `HomePage` scrolls to `#<id>` once, and again when fonts and pictures have loaded unless the visitor has scrolled since. The replay pictures carry their 1440 by 900 size so nothing moves when they arrive. Under 700 px the section's `scroll-margin-top` is 131 px, as the bar wraps to 111 px there.
- **A short hint on phones.** The Scan boxes' long hints were cut mid-word under 700 px. `site/use-narrow.ts` reads the Narrow layout through a guarded `matchMedia("(max-width: 699px)")`, and both Scan boxes show "owner/name" while it matches (3.8, 12.12). In the Cemetery view's bar the search glyph hides and the paddings shrink, so at 360 px the 83 px hint has a 94 px text box.
- **GitHub at the bar's height.** "GitHub" on the Home page is an `.ib` link, and a link's box grew by its 1 px border to 38 px. `.ib` now uses `box-sizing: border-box`, so it is 36 px like every other control in the bar.
- **One font weight for both tabs.** A bolder current tab moved the second tab by 1 px between the pages.

### Task 2: the scan cache

- **The header Scan field and a Recent scans row use the cache too**, not only a reload. A Fresh Entry is shown with no request. Rescan is the one way to force a request.
- **The cached line shows only while a saved response is on screen.** Right after a fresh scan it does not show. On Back or Forward to a scan saved in this page it shows with that scan's age.
- **"Scanned just now"** shows under one minute, since "Scanned 0 min ago" reads badly. Ages above an hour read "N h ago" and above a day "N d ago".
- **A scan is saved only when its response arrived from a request** (a ref set when the request starts), so a response shown from memory or from the cache is never saved again with a new time.
- **Storage events from other tabs are not followed.** A later read sees their writes.

### Task 3: the Home page

- **Claims may rest on repository files.** A Claim gains `files: [path, text][]`. The check reads each tracked file it names. The axios and keyv card texts rest on the cemetery-time, cemetery-time-fixes and clean-site specs, the gravedigger line on the remediation-safety spec and the owner line on NOTICE.
- **The Haunted card reuses the Claim `state.Haunted`**, since its text is the same and the registry keeps one Claim per text.
- **The Home page check is strict.** Every sentence must be a Claim sentence or a label of copy/home.ts, with Recent scans rows and the track credit as data. Links outside running text count as blocks of their own.
- **The video slot renders a link, not an embed**, so the CSP needs no frame-src (8.3).
- **One component makes every Off-site link** (`OffSiteLink`), so no link to another site can miss its `target` and `rel`.

### Task 4: build

- **The pictures are emitted from docs/ at build time** (`siteImages` in vite.config.ts) and served from docs/ by the dev server, so the README pictures and the site's pictures are one file each.
- **The preview tags use the hosted site's address**, https://de1giv8lj8sfh.cloudfront.net, as README.md names it.

## Review notes

An independent review of the change before the first commit found one defect, fixed before the commit:

- **Defect, fixed.** A saved response shown while a Rescan was in flight (from the header Scan field, a Recent scans row, or Back and Forward) aborted that request but left its save pending. The old response was then saved again with a new time and stayed Fresh. Showing a held or saved response now clears the pending save. `test/app-cache.test.tsx` holds the case, and it fails without the fix.

Notes, with what was done:

- A new response over the size limit used to strip every older response first. It is now refused alone and the older Entries keep theirs (`addScan`, with a test).
- A stored response is not checked against the repository its key names. Such a check was tried and dropped. The API may name a renamed repository by its new name, which would make the cache miss for every scan of the old name. The store is same-origin and its responses are validated, so a hand-edited value can only mislead its own browser.
- Under StrictMode in the dev server, a press on the Home page sends two requests and aborts the first, as the clean-site reload path already did. Production builds are not affected.
- `page-history.ts` no longer keeps the address hash in the Cemetery view, which uses none.
- `navigate` is only given final paths. An Old address passed to it would not forward. No caller does.
- The slash of `repo=owner/name` is restored only when `repo` is the first part of the query, which `formatView` always writes first.
- The preview tags name the hosted site's address and must change with it.
