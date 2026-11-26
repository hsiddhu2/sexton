# Design Document: clean-site

## Overview

The site shell is rebuilt to the prototype the owner approved on 26 November 2026. The live canvas Scene and its Characters stay.

Around them the Site adds:

- a one-row header;
- a Home view with a headline, state chips and a Graveyard / List switch;
- a fixed Panel (Inspector and Fix order) and a Footer bar;
- a tabbed Drawer;
- a Replay told step by step;
- a Guide page, a Legend pop-over and a three-step Tour;
- a Glossary, failed-scan cards and a Track slot for music.

The floating tooltip, speech bubbles, guide card, Fix-first line, Serious mode, Punchlines, the Home Play control and every generated sound go, with their code and tests.

The prototype was opened in a browser on 26 November 2026 and every flow was clicked through:

- At 1440 by 900 (the browser window measured 1512 by 783):
  - Home with hover and the Inspector.
  - A grave click into the Drawer, then its three tabs, Open pull request and Copy this as an issue.
  - The List with a chip filter.
  - The Legend, the Music pop-over and its dance mode.
  - The scrubber at 12 Aug.
  - The attack picker, and the axios Replay through all three Steps to "Back to the cemetery".
  - A Term.
  - The Guide page from top to bottom, and the Welcome bar.
  - The Tour's three steps.
  - The Scan field's examples, a failed scan, "Try the demo repo" and the scanning card.
- At 390 wide, in frames: Home, the Drawer and the keyv Replay.

### Decisions already made (26 Nov 2026)

1. The prototype wins over any other description of the look. Real data wins over the prototype; the layout stays.
2. The canvas Scene and Characters are not touched (the owner: "keep the characters, do not touch them").
3. From spec/calm-first-visit only the way back and the addresses carry over. Not the speech bubble timing, the guide card or the per-state sounds.
4. No GitHub sign-in. No audio file until the owner names the track and its licence; until then the Music button is not rendered.
5. Per-step replay text goes in the replay files and is written only from sources each replay already cites.
6. Every Guide page statement matches README.md; the page changes, not the README.
7. Nothing is pushed without the owner's `push`. The owner does a cold look before any push.

### Carry-over from spec/calm-first-visit: check out four files, redo the wiring

That branch's commit 7656c07 also changes the Header, the replay banner and the error cards, which this spec replaces. Cherry-picking it would bring code that is removed one task later. Instead task 1.1 checks out the pure parts as files:

- `packages/web/src/load/view-address.ts` and `test/view-address.test.ts`;
- `packages/web/src/load/page-history.ts`;
- `packages/web/src/load/scanned-pref.ts` (the session flag `sexton:scanned` behind 10.12).

They are then extended with `page` and `list` and the canonical form. The App wiring is rewritten against the new views: push, replace, popstate, the Drawer's Back step, and the `?repo=` prompt of that spec's owner change 2. It keeps that spec's rules and the regression cases of its `test/way-back.test.tsx` that still apply. The carried `rejected` Source stays and now shows the card of 10.10. This matches product.md: any other replay value loads nothing.

### Differences between the prototype and main's real data, known before the build

| Prototype | Built | Reason |
|---|---|---|
| State colours (Possessed #f0575c, Haunted violet, Alive green) | main's five State colours | The canvas draws the graves in main's colours, and the chips and badges must agree. main's colours pass the colour-vision tests. Chrome colours (backgrounds, panel, lines, text, accent) follow the prototype. |
| Inspector sentences such as "alice and bob became alice and mallory" | A plain sentence per Reason family plus three real signals | The engine's reason is the real data. Maintainer names show in the signals. |
| Fix order: left-padder, lodash, event-stream, node-sass | Triage order of Possessed, Dead and Haunted, up to 5 | The Fix order follows triage order. On the demo: left-padder, event-stream, uuid, request, left-pad (by severity, then reach, then name). lodash, the one Haunted package, ranks 7th, below the Dead packages, so it is not listed. |
| Four examples; the fourth, "acme/private-app", shows a failure | Three examples | No repository name can be promised to stay missing or private. Any bad input still shows a failure. |
| Separate cards for "private" and "not found" | One card for missing-package-json | GitHub answers 404 for both, so the API cannot tell them apart. |
| "No lockfile" as a failure | A note under the headline; the scan succeeds | The engine scans without a lockfile and marks the scan unlocked (R-IN-2). The partly-unlocked and capped notices of main's header move to the same place. |
| "Open pull request" on the Sample scan | Only on a Live scan whose response has actions.remediate true | The Sample scan has no `actions`, and steering shows the button only for a hosted scan with actions.remediate true. The Sample's note says where the button works. |
| No pull request body in the fix tab | A closed disclosure "Read the pull request text" | R-UI-4 requires a preview of the PR body. The visitor also sees what Copy puts on the clipboard. |
| No evidence links, scan time or policy result | One site-footer line with all three | README and R-UI keep them. They leave the header. |
| Legend: five States only | Five States plus the ghost, the pennant and the Not-published mound | R-UI-2 (a ghost means advisories) and steering's legend chips. |
| No "Back to now" | "Back to now" shows while an earlier date is chosen | A one-press way back to the scan date. The scrubber ticks alone are hard to hit by keyboard. |
| No too-large line | Kept | main's guard (timelinesOmitted) needs its explanation. |
| "Reconstructed from public reports. Not a live scan." not shown | Shown once, in the Why card | product.md's text, said once. |
| Music pop-over with "Choose a track" from disk and "Dance without sound" | Not rendered until the Track slot is set; then one on/off button | One recorded track; the button is hidden until the owner names it. |
| Graves drawn as SVG with plates; the Step title as a caption under the replay grave | Canvas graves with Inter name labels; the Step title in the Panel | The canvas stays. A DOM caption under the grave would sit in its Art box. |
| JetBrains Mono for versions and diffs | System monospace stack | One text face (Inter); no third font file. |
| Hash addresses (#pkg-lodash) | Query addresses (?grave=lodash) | README links use ?replay=axios; the carried address module uses the query. |
| Scrubber with four labelled month ticks | Native range with its start label and "Today, <date>" | Real Stops come from Segments and can be many at 300 packages. |
| Phone Scene in the prototype's order | Front Tier first in the Narrow layout | Worst first on a phone. |
| Tour step 3: "Paste any public GitHub repo. Sexton reads the lockfile and builds its cemetery." | "Paste a public GitHub repo with a package.json at the top. Sexton reads it and builds its cemetery." | main scans only repos with a package.json at the top and scans without a lockfile too. README "Limits" says public repositories and npm only. |
| The scanning card's progress bar | No bar | The Site cannot measure the steps of one GET. |
| left-padder's fix tab: "Review the maintainer change" | The plan's real title and summary ("no change proposed … bump data was not gathered") with the Possessed note | Real plan data. |
| No `?repo=` prompt | "Scan this repository" in the Scan field on a fresh repo= link | Carried owner decision from calm-first-visit (no scan without a press). |
| Scan tag "Sample scan" during a Replay | "Replay" | A Replay is not the Sample scan. |
| A Pop-over counted among the exclusive owners (an earlier draft of Property 1) | One View owner plus at most one Pop-over on top | The prototype opens Terms inside the Drawer and Replay; closing those to show a Term would lose the visitor's place. |
| Network error | Its own failure card | The prototype has none; an offline visitor would otherwise read "The scan failed on our side." |
| Drawer Evidence: signals only | Signals, then missing signals and failing policy rules | Real engine data on main's drawer. |
| Tour from the List view | Switches to Graveyard first | The Tour's first step points at the Scene. |
| Escape: Tour, then Drawer, then Replay home, else close pop-overs; no Escape on the Guide page | Pop-over first, then Tour, Drawer, then Replay or Guide page home (10.3) | Escape is a way home from every view, and a Term opened inside the Drawer must close before the Drawer does. |
| No failure card for a non-Live load | One card for a failed Sample or scan file load and a refused Replay (12.7) | main shows an error card for any failed load; the prototype never loads a file. |

Taken from the prototype as it is, with no difference:

- the phone order Scene, Footer bar, Panel, and a full-width Drawer under 700 px;
- "← Cemetery" in the Drawer closing the Drawer only, and the wordmark keeping the Graveyard or List choice;
- Terms marked in the Inspector and Drawer signal labels;
- the scan tag hidden under 1300 px;
- icon-only header buttons and one column under 1100 px;
- the help line hidden under 700 px;
- the Fix order's current-row mark;
- "Play all" restarting at Step 1 from the last Step;
- the Guide page's "Watch a real attack" opening the axios Replay;
- the Welcome bar text;
- the Replay sub-line.

The build adds every further difference to the report.

## Architecture

```
App.tsx
 ├─ useView (load/use-view.ts)          View address, history, View owner, Pop-over
 ├─ Header (header/Header.tsx)          wordmark, scan tag, ScanField + examples, four buttons, Legend
 ├─ WelcomeBar (guide/WelcomeBar.tsx)
 ├─ HomeView (home/HomeView.tsx)
 │   ├─ Hero: headline, notices, chips, view switch
 │   ├─ Scene card: Cemetery (canvas, grave buttons), help line, date badge, scanning or failure card
 │   │   or ListView (home/ListView.tsx)
 │   ├─ FooterBar: scrubber, Back to now, too-large line, attack picker
 │   └─ Panel: Inspector, FixOrder (panel/)
 ├─ ReplayView (replay/ReplayView.tsx)  stage, Step panel, Why card, Footer bar with Step cards
 ├─ GuidePage (guide/GuidePage.tsx)
 ├─ Drawer (drawer/Drawer.tsx)          tabs: Evidence, The fix, History
 ├─ Tour (tour/Tour.tsx)
 ├─ TermPopover (glossary/)
 └─ SiteFooter: scan time, policy line, evidence links, track credit
```

Pure modules carry every rule that can be tested without a browser. Components only render and route events. Every overlay (Drawer, Replay, Guide page, Tour, Pop-overs) renders from the single `ScreenState` of C1 and from nothing else, so the model's invariants are the page's.

## Components and Interfaces

### C1. Screen state (requirement 17)

`load/screen-state.ts`, pure:

```ts
export type ViewOwner = "none" | "drawer" | "replay" | "guide" | "tour";
export type Popover = "none" | "legend" | "attacks" | "examples" | "term";
export interface ScreenState {
  readonly view: View;
  readonly owner: ViewOwner;
  readonly popover: Popover;
  readonly filter: State | null;
  readonly homeSource: ViewSource;   // the last demo, repo or scan Source shown; demo at first
  readonly homeList: boolean;        // the Graveyard or List choice last made on Home
  readonly tourStep: 0 | 1 | 2 | null;
}
export type ScreenEvent =
  | { kind: "open-drawer"; grave: string } | { kind: "open-replay"; id: ReplayId } | { kind: "open-guide" }
  | { kind: "open-tour" } | { kind: "open-popover"; popover: Exclude<Popover, "none"> }
  | { kind: "close-popover" } | { kind: "close" } | { kind: "escape" } | { kind: "home" }
  | { kind: "list"; on: boolean } | { kind: "filter"; state: State | null } | { kind: "date"; at: string | null }
  | { kind: "tour-next" } | { kind: "source"; source: ViewSource } | { kind: "restore"; view: View };
export function reduce(s: ScreenState, e: ScreenEvent): ScreenState;
export function homeOf(s: ScreenState): View;   // homeSource, page home, list = homeList, no grave or at
```

The rules:

- Opening a View owner replaces the previous one and closes the Pop-over (17.2). Opening a Pop-over replaces the previous Pop-over and keeps the View owner (17.3).
- `escape` closes the Pop-over, else ends the Tour, else closes the Drawer (back to the view beneath), else turns a Replay or the Guide page into `home` (10.3).
- `close` on the Drawer drops `view.grave` and keeps the rest (10.14).
- `home` gives `{ view: homeOf(s), owner: "none", popover: "none", filter: null, tourStep: null }`, keeping `homeSource` (10.2, 17.4).
- `source` (a Live scan, an example, "Try the demo repo", "Back to the sample", "Scan this repository") loads a new Source: a demo, repo or scan Source sets `homeSource` and gives Home with no grave, `at` or filter. A replay Source opens the Replay. The `rejected` Source (a replay value outside the closed set) shows the card of 10.10 with `owner = "none"` and never sets `homeSource`, so its "Back to the cemetery" and the wordmark reach the Sample scan.
- `restore` (browser Back or Forward, or a page load) sets the View from the address and derives `owner` from it; a demo, repo or scan Source sets `homeSource`, and a Home View sets `homeList` from its list flag.
- "Back to the cemetery" on the `rejected` card dispatches `source` with the demo Source, like "Back to the sample" (10.10, 12.6).
- `list` sets `view.list` and `homeList`. `tour-next` advances `tourStep` and ends the Tour after step 3.
- Every event has a defined result under every owner. `open-drawer`, `list`, `filter` and `date` are ignored (the state is unchanged) while a Replay, the Guide page or the `rejected` card is shown, and while the Tour shows. `open-tour` takes the Home action (clearing the filter and date and closing the Drawer, Replay or Guide page, as the prototype's goHome does), then switches to the Graveyard view, then starts the Tour. `open-popover` is ignored while the Tour shows. An `open-drawer` for a grave the scan lacks is ignored.
- `owner` and `view` stay consistent: `owner = "drawer"` exactly when `view.grave` is set; `owner = "replay"` exactly when the Source is a replay; `owner = "guide"` exactly when `page = "guide"`; `owner = "tour"` exactly when `tourStep` is set.

`load/use-view.ts` holds a `ScreenState`, applies `reduce`, and maps each change to a push or a replace (C8).

### C2. The header and the Scan field (requirement 1)

- `header/Header.tsx` renders, in order:
  - the wordmark link, `<a href="/" aria-label="Sexton, back to the cemetery">`, which dispatches `home` on a plain primary press;
  - `ScanTag`;
  - `ScanField`;
  - the buttons. Music renders only when `TRACK !== null` (1.15).
- `header/repo-input.ts`, pure: `normaliseRepo(input: string): { ok: true; url: string; label: string } | { ok: false }`.
  - It accepts `owner/name`, or `https://github.com/owner/name` with an optional `www.`, trailing slash or `.git`.
  - GitHub's character rules apply. The owner is letters, digits and inner hyphens, up to 39 characters. The name is letters, digits, `-`, `_` and `.`, up to 100 characters, and not `.` or `..`.
  - The output is `https://github.com/owner/name` (1.11, 1.12).
- `header/examples.ts`: the three examples and their notes (1.9).
- The scanning card (1.14) is three fixed lines with no progress bar. The Site cannot measure the steps of one GET.

### C3. Home (requirements 2, 3)

- `home/headline.ts`, pure: `headline(counts, total, date | null)` gives the text parts of 2.1 to 2.3.
- `home/notices.ts`, pure: the notices of 2.13 to 2.15 from the scan metadata (moved from `header/header-model.ts`).
- Filter dimming: `Cemetery` passes `dimmed: ReadonlySet<string>` into `planScene`. `drawScene` sets the context's `globalAlpha` to a new fixed constant, `DIM_ALPHA_BYTE / 255` from palette.ts, around every per-grave draw of a dimmed grave, on both the sprite path and the direct path: the body, its Character, the ghost, the glow, the name label and the pennant. The Halo is a scene-wide layer; a dimmed Possessed grave is left out of the Halo's sources while the filter is set. No new sprite is made, so the sprite cache is unchanged. A draw test records the alpha at each call of a dimmed grave, and the 300-grave repaint check runs with half the graves dimmed. That grave's button gets `tabIndex -1` (2.7, 2.8). A Not-published mound has no State at the chosen date, so it is dimmed whenever a filter is set. The Not-published form is a separate mound shape on main and is not touched.
- Help line and date badge:
  - They are DOM elements in the Scene's sky band.
  - `scene/overlay-band.ts`, pure: `overlayRects(layout, size)` returns their rectangles.
  - `planScene` keeps at least `OVERLAY_BAND` px of sky above the highest Art box, so both rectangles clear every Art box (2.12).
- `panel/Inspector.tsx` shows `hover ?? focus ?? selected` (3.3 to 3.5).
- `panel/reason-family.ts`, pure: `reasonFamily(reason): Family | null` and `reasonSentence(reason): string`. Families are keyed by the fixed leading words of each engine reason:

  | Family | Leading words | Sentence |
  |---|---|---|
  | maintainer | "maintainer change" | "A maintainer of this package changed in the last 90 days." |
  | provenance | "provenance regression:" | "<v> was published without provenance, though <w> had it." |
  | install-script | "install script added in" | "<v> added an install script that earlier versions did not have." |
  | new-dependency | "new dependency in" | "<v> added a new dependency, <name>, that looks risky." |
  | publisher | "publisher changed in" | "<v> was published by a different account than before, <a> to <b>." |
  | deprecated | "installed version is deprecated" | "The authors have marked this version as deprecated." |
  | stale-advisory | "no release in" … "and an open advisory" | "No release in 24 months, and a known advisory is still open." |
  | high | "advisory of severity High or Critical" | "A High or Critical advisory is open." |
  | stale | "no release in" (without advisory) | "No release in 24 months." |
  | low | "advisory of severity Moderate or Low" | "A Moderate or Low advisory is open." |
  | unavailable | "all state signals unavailable" | "None of its health signals could be read." |
  | none | "no rule matched" | "No rule matched. Nothing to do." |

  The facts filled into the sentence (`<v>`, `<w>`, `<name>`, `<a>`, `<b>`) come only from the reason text, as plain text. Web may not import engine code (structure.md), so the drift check works in two halves:
  - `packages/web/test/fixtures/engine-reasons.json` lists one sample reason per engine branch, and a web test checks that each has a family.
  - An api test reads that file by path, produces every branch's reason through `@sexton/engine`'s `evaluateState`, and fails when the two lists differ.
- `panel/pick-signals.ts`, pure: `pickSignals(pkg): [Row, Row, Row]`, by signal key, chosen by State:
  - Possessed: the signal of its Reason family first (maintainer → `maintainerChange`, provenance → `provenanceRegression`, install-script → `newInstallScript`, new-dependency → `newDependency`, publisher → `publisherChange`), then the first two of `maintainers`, `provenance`, `hasInstallScript`;
  - Dead: `deprecated`, `lastPublish`, `advisories`;
  - Haunted and Restless: `advisories`, `deprecated`, `lastPublish`;
  - Alive: `advisories`, `deprecated`, `lastPublish`.

  Each row shows the plain label of C5's table.

  Each row's tone (bad, warn, ok) comes from the signal value alone.
- `panel/fix-order.ts`, pure: `fixOrder(packages, plans): FixRow[]` (3.18, 3.19, 3.22).
- Rings: the Scene draws the selection ring for the Selected grave as today. It draws the same ring in the `ringHover` token for the hovered grave when that is not the Selected one (3.13, 3.14). The Lantern glow stays.
- Keys (3.23, 3.24): one `keydown` listener on the document. It acts only when focus is on the body, a grave button or a Fix order row, and the screen state has `owner = "none"` and `popover = "none"`. So the scrubber, text fields and the Drawer's tabs keep their own arrow keys. Left and Right move the Selected grave in triage order with wrap, and move focus with it when focus was on a grave button; they leave `selection/selection.ts`'s `reduceSelection`, which keeps Up and Down as on main. A filtered-out grave is still reached by Left and Right (16.14).
- The Fix order line follows 3.19's order. Hosted plans never carry `remove`; the "remove it" line exists for a scan file made by the CLI.

### C4. The List (requirement 6)

- `home/list-rows.ts`, pure: `listRows(packages, { query, sort, filter, at }): ListRow[]`.
  - It takes each package's State at `at` and leaves out packages not published then (6.2).
  - The query is trimmed and compared lower-case.
  - Sort "state" is `triageOrder` at the scan date. Sort "name" is by name.
- `home/ListView.tsx` renders a native table. Each row's package cell holds a button, so Enter and a press both open the Drawer and axe passes.
- At 300 rows the DOM is about 1,500 cells, so no virtual list is needed.
- The Find text lives in component state, not in the address.

### C5. The Drawer (requirement 7)

`drawer/Drawer.tsx` is rebuilt:

- `role="dialog"` and `aria-modal`, using the existing `focus-trap.ts`;
- the breadcrumb;
- the tabs, `role="tablist"` with arrow keys between tabs.

The tabs:

- **Evidence:** the verdict box, then the signal table from `drawer-model.ts`, with its source and fetch time unchanged, then the missing signals and failing policy rules as on main (7.24). Each signal row shows a plain label from `drawer/signal-labels.ts`, a typed record over every name in SIGNAL_NAMES, so a new signal without a label fails typecheck: lastPublish "Last publish", deprecated "Deprecated", hasInstallScript "Install script", advisories "Advisories", maintainers "Maintainers", provenance "Provenance", transitiveReach "Transitive reach", maintainerChange "Maintainer change", provenanceRegression "Provenance lost", newInstallScript "New install script", publisherChange "Publisher change", newDependency "New dependency". Terms are marked in these labels (11.2). The signal key itself is no longer shown, so 5.5's monospace applies to versions and diffs.
- **The fix:** `drawer/fix-view.ts`, pure: `fixView(pkg, plan | undefined, scan: "sample" | "live-remediate" | "live")`. It returns:
  - the title and summary, and the diff lines from the PrIntent edits;
  - which of "Open pull request", "Copy pull request text" and "Copy this as an issue" show;
  - the note.

  Only one copy button ever shows (7.3 to 7.10, 7.13 to 7.15). `drawer/clipboard.ts` wraps `navigator.clipboard.writeText` and returns "ok" or "blocked" (7.11, 7.12). `drawer/issue-text.ts`, pure, builds the plain issue text (7.6). The remediate client, its result area outside the scrolling body, and `markdown.ts` stay (7.4, 7.16).
- **History:** `drawer/history-rows.ts`, pure, lists the Segments newest first (7.17, 7.18).

### C6. The Replay (requirement 8)

Contract change in `packages/api/src/contract.ts`:

```ts
export interface ReplayStep { readonly title: string; readonly happened: string; readonly shows: string }
export interface ReplayInfo {
  readonly id: "axios" | "keyv";
  readonly title: string;
  readonly summary: string;
  readonly sources: readonly { readonly label: string; readonly url: string }[];
  readonly steps: readonly ReplayStep[];   // one per Stop, in order (8.13, 8.15)
  readonly why: string;                    // the "Why attackers do this" text (8.12)
}
```

How the parts fit:

- `packages/api/scripts/lib/replay-facts.mjs` gains `steps` and `why` per replay. A code comment after each sentence names the `SOURCE_URLS` key it comes from (8.14). The generator copies them.
- `validate-scan-response.ts` checks the shapes, that the Step texts are distinct (8.13), and the count against `stopsFor` (8.15).
- `replay/ReplayView.tsx` renders the stage (the Scene in replay mode), the Step panel, the Why card and the Footer bar.
- `time/play.ts` keeps the Play model, with a 5,000 ms step for the Replay (8.9 to 8.11).
- `replay/replay-ids.ts` gains `REPLAY_CARD: Record<ReplayId, { package; date; steps }>` (axios, "31 March 2026", 3; keyv, "4 August 2026", 2) for the attack picker and the sub-line, which show before a file loads (8.1, 16.7). A test checks each entry against its fixture's ReplayInfo and `stopsFor`.
- The Burst caption text is no longer drawn. The animation stays (4.5).

Draft Step texts, to be checked against the sources during the build. Only text that a cited source gives survives:

- axios
  1. "A normal day" / "axios 1.14.0 is the current release. It was built by GitHub Actions and carries provenance." / "Nothing to flag. The grave is healthy."
  2. "A poisoned release appears" / "A compromised maintainer account publishes 1.14.1 by hand. It adds a new dependency, plain-crypto-js 4.2.1, whose install script runs the payload." / "The grave turns Possessed. 1.14.0 had provenance and 1.14.1 has none. That drop is the warning."
  3. "npm removes the bad release" / "About three hours later npm removes 1.14.1. A fresh install gets 1.14.0 again." / "The grave is healthy again. Anyone who installed in those hours got the bad release."
- keyv
  1. "A normal day" / "keyv 5.6.0 is the current release. It runs nothing when you install it." / "Nothing to flag. The grave is healthy."
  2. "A poisoned release appears" / "keyv 6.0.0 is published with a new preinstall script, node setup.mjs. It still carries valid provenance from GitHub Actions." / "The grave turns Possessed. An install script appeared that the earlier version did not have."

### C7. The Guide page and the Welcome bar (requirement 9)

- `copy/claims.ts` is the Claim registry: `Claim { id; text; readme }`, where `readme` is the README.md text the Claim rests on. Every Claim the Site shows is in it:
  - the Guide page steps and answers;
  - the fix-tab notes;
  - the Tour steps;
  - the scanning card's "Asking npm, OSV and deps.dev";
  - the failure cards' next steps that name a capability;
  - the example note "pull requests work here".
- Components import Claims by id. The check works on rendered text, not on source: a test renders Home, the List, the Drawer on each tab for each fix-tab case, the Guide page, the Legend, the Tour at each step, each failure card and the scanning card, and splits the visible text into sentences. Every sentence that holds a capability phrase ("pull request", "sign in", "sign-in", "GitHub Action", "sexton check", "scans", "deps.dev", "OSV", "opens", "reads", "read", "public repo", "package.json") must equal a Claim's text, or be one of a listed set of control labels and headings: "Open pull request", "Copy pull request text", "Read the pull request text", "Scan", "Sample scan", "Scan this repository", "What is a pull request?", "Do I have to sign in to GitHub?", "So how does the pull request get opened?", "Can it check my repo automatically?", "a pull request was opened", "Reading package.json and the lockfile", "Reading each headstone", "New here? Read the two-minute guide first.", the notices of 2.13 and 2.14, the unavailable-family sentence of 3.9, "Copied. Paste it into a pull request or an issue on your repo.", "Read the guide", "No pull request is proposed for a Restless package.", and the sentences (not the next steps) of every failure card of 12.2 and 12.7, which describe what happened rather than what Sexton can do. Replay Step and why texts are left out: they rest on the replay's cited sources (8.14), not on README. A new capability sentence outside the registry fails the test (17.5).
- `guide/guide-content.ts` holds the page's structure and takes its sentences from the registry (9.4).
- Each grave picture on the Guide page and in the Legend is drawn by the scene painter into a small canvas with the same grave-drawing call, so the pictures are the real graves.
- `guide/welcome-pref.ts`: `sexton:welcome`, every access in try/catch. Only the value "closed" is ever written or read (9.6 to 9.8).

### C8. The View address and history (requirement 10)

`load/view-address.ts` (carried) changes:

```ts
export interface View {
  readonly source: ViewSource;        // demo | replay | repo | scan | rejected, as carried
  readonly page: "home" | "guide";
  readonly list: boolean;             // view=list
  readonly grave: string | null;
  readonly at: string | null;
}
```

Rules:

- **Precedence:** replay > repo > scan > demo.
- **Canonical form:** a replay or `rejected` View holds only its Source. A Guide page View holds only its Source (demo, repo or scan) and `page`. Any other View holds a Source, `list`, `grave` and `at`. `parseView` drops parts a view does not take (10.9). The Step is not in the address: a Replay always opens at Step 1, as product.md says.
- **`formatView`:** writes the parts in the order replay, repo, scan, page, view, grave, at.
- **Push** on: a new Source, the Guide page, a Replay, the List switch, the Home action from a Replay or the Guide page, a Drawer open (10.7, 10.15).
- **Replace** on: the scrubber and a dropped bad part (10.8, 10.9). A Step or a tab changes nothing in the address (10.16).
- **The Drawer's Back step:** opening pushes an entry marked `drawerPushed`. A close that is not a popstate goes back one entry. When a close leads straight on to a new View, the Drawer's entry is replaced by that View instead. Both rules are as in calm-first-visit B3.
- **`?repo=`:** follows that spec's owner change 2 with `scanned-pref.ts` (10.11, 10.12).
- **Home:** the wordmark, the Replay and Guide breadcrumbs and Escape go to `homeOf(state)`, which keeps `repo=` after a Live scan (10.2). The Drawer's breadcrumb closes the Drawer (10.14). "Back to the sample" pushes "/" (12.6).

### C9. Glossary (requirement 11)

`glossary/glossary.ts`:

```ts
export const TERMS = ["provenance", "advisory", "maintainer", "deprecated", "install script", "transitive reach", "pull request", "last publish", "publisher"] as const;
export type Term = (typeof TERMS)[number];
export const MEANING: { readonly [K in Term]: string } = { … };   // a missing Term fails typecheck (11.8)
export const FORMS: Readonly<Record<string, Term>> = { advisories: "advisory", maintainers: "maintainer", "install scripts": "install script", "pull requests": "pull request", publishers: "publisher" };
export function markTerms(text: string): readonly ({ text: string } | { text: string; term: Term })[];
```

- `markTerms` splits on word boundaries, longest form first, ignoring case. Joining the parts' text gives back the input (11.7).
- `glossary/TermText.tsx` renders the parts with `<button type="button" class="term">`. It is used only for running text (11.2, 11.3).
- The meanings are the prototype's, cut to at most 25 words.

### C10. Failed scans (requirement 12)

- `packages/api/src/contract.ts` adds `export type { ApiErrorCode } from "./http/responses.js"`, a type only.
- `load/lists.ts` mirrors the list as `API_ERROR_CODES` with a drift test like the other lists. The WAF's `rate-limited` and the edge's `not-deployed` bodies are outside that list. They are reached through their status (429, 503).
- `load/load-scan.ts`, for a non-2xx response:
  - reads at most 4 KiB of the body;
  - parses it as JSON in try/catch;
  - keeps `code` only when it is in the list.
- `LoadError` gains `apiCode?: ApiErrorCode`.
- `load/scan-failure.ts`, pure: `failureCard(status | null, apiCode | null): FailureCard`, which returns a member of the fixed card table by the order of 12.2. A null status is a network error with no HTTP response.
- No body text is kept, shown or logged (12.3, 12.4).

### C11. Legend and Tour (requirement 13)

- `header/Legend.tsx` becomes a Pop-over: `position: absolute` under its button, outside the page flow (13.2). It holds the five States, the ghost, the pennant and the Not-published mound (13.1).
- `tour/tour-steps.ts`: the three steps, each a target id, a title and a sentence from the Claim registry (13.3, 13.4).
- `tour/place-card.ts`, pure: `placeCard(target: Rect, viewport: Size): { x; y; width }`.
  - The card is `min(320, viewport.width − 24)` wide.
  - It sits below the target, else above it, else beside it.
  - It always lies inside the viewport with a 12 px margin (13.6).
- `tour/Tour.tsx` draws a full-screen blocker, a spotlight box with the dimming shadow, and the card (13.5, 13.7).

### C12. Music (requirement 14)

`music/track.ts`:

```ts
export interface Track { readonly file: string; readonly title: string; readonly artist: string; readonly licence: string; readonly source: string; readonly bpm: number }
export const TRACK: Track | null = null;   // set only when the owner names the track and its licence
```

The parts:

- `music/use-music.ts` creates one `HTMLAudioElement` with `loop` on the first turn-on (14.7), and pauses it on turn-off.
- `scene/motion.ts` gains `poseClock(nowMs, beat: { beatMs } | null, reducedMotion)`:
  - with a beat, one Pose step per half beat;
  - without one, the 12 Poses a second of today;
  - under reduced motion, a still Pose (14.3 to 14.5).
- The CSP plugin in `vite.config.ts` adds `media-src 'self'` only when `TRACK` is set, with a vite-csp test (14.8).
- The candidate the owner has named (Ghost Party, The Piano Says, CC BY 3.0) is not shipped until he confirms it.

### C13. Layouts and phone (requirement 15)

- CSS breakpoints are 1300, 1100 and 700 px:
  - under 1300: the scan tag hides;
  - under 1100: one column and icon-only buttons;
  - under 700: the header wraps, the help line hides and the Drawer is full width.
- `planScene` gains `frontFirst: boolean`, true in the Narrow layout. It stacks the Tiers with Possessed and Dead on top. Grave rectangles still never overlap, and the keyboard order stays triage order (15.3).

### C14. Type and colour (requirement 5)

- Fonts: Inter (variable, latin) and Cormorant Garamond 600 (latin), woff2.
  - They are copied, with their OFL.txt, from the files of the `@fontsource-variable/inter` and `@fontsource/cormorant-garamond` packages at a pinned version. No package dependency is added.
  - The canvas label font becomes Inter 600.
  - Instrument Sans, Pirata One and both IM Fell faces are removed (5.3).
- Tokens: the prototype's chrome colours join palette.ts under new names with a `ui` prefix (`uiBg`, `uiBg2`, `uiPanel`, `uiPanel2`, `uiLine`, `uiLine2`, `uiText`, `uiMuted`, `uiFaint`, `uiAccent`, `uiAccentInk`), so the canvas tokens `bg`, `text` and `muted` stay as they are. `ringHover` joins the ring rules of web.md: it sits on the Ring casing, is at least 3:1 against ink and is not cut by the Halo.
  - Each text token is checked at 4.5:1 against every background it is used on (5.8).
  - Where the prototype's `faint` (#6f6a8a) fails, it is lightened until it passes. This is listed as a difference.
  - The accent is checked at least 10 apart in CIEDE2000 from Restless #e69f00 (5.10). If #e9a23b fails, the accent is moved, keeping its hue family, and the change is listed.

### C15. Site footer (requirement 16.12)

One line under the main area holds:

- the scan time, in a `<time>` element;
- main's policy line (status, label and failing rules);
- "Evidence JSON" and "Evidence Markdown", as main offers them;
- the track credit, when a track is set.

The Sample's evidence downloads keep the Fixture name inside the files. 1.7 covers the pages, not the downloaded files.

## Data Models

- `ReplayInfo` gains `steps` and `why` (C6). Both replay files are regenerated by `npm run demo:generate -w @sexton/api`.
- `contract.ts` exports the `ApiErrorCode` type (C10). `LoadError` gains `apiCode`.
- `View` gains `page` and `list` (C8). `ScreenState` holds the View, the View owner, the Pop-over, the filter, the home Source and the Tour step (C1).
- Stored values:
  - kept or added: `sexton:welcome` (localStorage, "closed") and `sexton:scanned` (sessionStorage, carried);
  - removed: `sexton:sound`, `sexton:serious` and `sexton:guide`.

## Error Handling

- Storage unavailable: the Welcome bar hides for the page load once closed (9.8). The `?repo=` reload rule falls back to the prompt.
- Clipboard refused: the blocked message shows, and the text stays readable in the disclosure (7.12, 7.16).
- A Replay file whose Step count differs from its Stops is refused as invalid-response (8.15).
- A replay outside the closed set loads nothing and shows its card (10.10). A bad grave or date, or a part the view does not take, is dropped with a replace (10.9).
- An API error body that is not JSON, is larger than 4 KiB, or carries an unknown code is matched by status, else gets the generic card (12.2, 12.3).
- No API base: the Scan field is disabled with its reason (1.13), and the third Tour step says so (13.4).

## Correctness Properties

### Property 1: One View owner, one Pop-over, and home in one action

For any start state made by `restore` from any canonical View, including the `rejected` Source, and any sequence of up to 50 ScreenEvents of every kind, `source` and `restore` included, every state `reduce` reaches satisfies all of the following:

- The View owner and the View agree:
  - `owner = "drawer"` exactly when `view.grave` is set;
  - `owner = "replay"` exactly when the Source is a replay;
  - `owner = "guide"` exactly when `page = "guide"`;
  - `owner = "tour"` exactly when `tourStep` is set.
- `homeSource` is never a replay or `rejected` Source.
- An `open-*` event of a View owner that is not ignored leaves `popover = "none"`; an ignored event leaves the state unchanged.
- An `open-popover` event keeps the View owner and the View.
- `escape` follows 10.3 in full: with a Pop-over open it closes only the Pop-over; else with the Tour it ends only the Tour; else with the Drawer it drops only `view.grave`; else from a Replay or the Guide page it gives the `home` result; else it changes nothing.
- `home` from any reached state gives `{ view: homeOf(s), owner: "none", popover: "none", filter: null, tourStep: null }` with `homeSource` unchanged, and `homeOf(s)` has `homeSource` as its Source, `page = "home"`, `list = homeList`, no grave and no `at`.

Because every overlay renders only from this state, the page shows at most one View owner and one Pop-over.

**Validates: Requirements 17.1, 17.2, 17.3, 17.4, 10.2, 10.3, 10.14**

### Property 2: The View address round-trips and never throws

For any canonical View `v`, `parseView(formatView(v), true)` equals `v`. A canonical View is one of:

- a replay Source and nothing else;
- the `rejected` Source and nothing else;
- a demo, repo or scan Source with `page = "guide"` and nothing else;
- a demo, repo or scan Source with `page = "home"`, any list flag, an optional grave of 1 to 214 characters and an optional ISO instant.

For any string, `parseView` returns a canonical View without throwing.

**Validates: Requirements 10.5, 10.6, and 10.9 for parts a view does not take.** Dropping a grave or date that the loaded scan lacks is checked by example tests after a load, with the replace.

### Property 3: Repository input normalises or is refused

For any owner and name built from GitHub's allowed characters:

- `normaliseRepo` gives `https://github.com/owner/name` for `owner/name`, for `https://github.com/owner/name`, and for either with a trailing slash or `.git`;
- normalising its own output gives the same output.

For any string outside those shapes, `normaliseRepo` gives `{ ok: false }`.

**Validates: Requirements 1.11, 1.12**

### Property 4: Fix order is the triage order of what needs fixing

For any list of 0 to 300 packages with plans:

- `fixOrder` returns at most 5 rows;
- every row is a Possessed, Dead or Haunted package;
- the rows are the first such packages in the order `triageOrder` gives, with none skipped;
- each row's line is the one 3.19 gives for its plan, State and Reason family.

**Validates: Requirements 3.18, 3.19, 3.22**

### Property 5: The List shows each matching package once, in order

For any list of 0 to 300 packages, query, sort, filter and date, `listRows` returns exactly the packages that meet all three conditions:

- published at that date;
- the name contains the trimmed query, ignoring case;
- the State at that date matches the filter.

Each appears once, sorted by name or by triage order.

**Validates: Requirements 6.2, 6.3, 6.4, 6.5, 6.7, 6.11**

### Property 6: Marking Terms keeps the text and finds every Term

For any text built from words and Term forms in any case:

- joining the parts of `markTerms` gives the text unchanged;
- every Term form in the text comes back as a marked part mapped to its Term;
- every Term has a meaning of 1 to 25 words.

**Validates: Requirements 11.1, 11.6, 11.7**

### Property 7: Every failed scan gets exactly one card from the fixed table

For any status (null, or an HTTP status from 400 to 599) and any `apiCode` (a known code or null):

- `failureCard` returns one member of the fixed card table;
- the card is the first match of 12.2's order;
- the result depends on those two inputs only.

`load-scan`'s code reader keeps a body code only when it is in `API_ERROR_CODES`, for any body string up to 8 KiB.

**Validates: Requirements 12.2, 12.3**

### Property 8: Overlays clear the graves, and the Tour card fits

For any scan of 1 to 300 packages, and for both replay fixtures at each Step, at any width from 320 to 1600 and with `frontFirst` true and false:

- the help line (Home only) and date badge rectangles from `overlayRects` intersect no grave's Art box.

For any target rectangle inside any viewport from 320 by 480 to 1600 by 1000:

- the card from `placeCard` lies inside the viewport with its 12 px margin.

**Validates: Requirements 2.12, 13.6**

### Property 9: Claims rest on README.md

For every Claim in the Claim registry, README.md contains its `readme` text. The rendered-text check of C7 finds no capability sentence outside the registry and the listed labels. This is a check over fixed lists, run once, not a generated property.

**Validates: Requirements 9.4, 17.5**

## Testing Strategy

- **Unit and property tests:** Vitest and Testing Library in jsdom for components. fast-check for Properties 1 to 8, each tagged `Feature: clean-site, Property N: <title>`, with numRuns 100, and 1000 for the security invariants: Property 3 (`normaliseRepo` builds the request URL from untrusted input) and the code-reader half of Property 7 (nothing kept from an untrusted error body).
- **Example tests:**
  - the header order, the scan tag, and the Fixture name never in the DOM;
  - the chips and the filter;
  - the Inspector on hover, focus and leave, and the keys of 3.23 and 3.24 with focus in the scrubber and with the Drawer open;
  - the fix tab for each case of 7.3 to 7.15, with one copy button at most;
  - clipboard ok and blocked, and the History tab;
  - the Replay Steps for both fixtures, with distinct texts and the Step count;
  - the Guide page sections and the Welcome bar with and without storage;
  - the Legend with its eight entries and the Tour, including with no API base;
  - the Music button absent while `TRACK` is null;
  - each failure card, including 429 with code `rate-limited`;
  - the three notices;
  - the reason-family drift check (web and api halves).
- **axe:** checks on Home, the List, the Drawer on each tab, a Replay and the Guide page.
- **Playwright e2e:** a new `e2e/clean.spec.ts`, with a fresh profile, at 1440 by 900 and 390 by 844. It checks:
  - every flow of the prototype;
  - one View owner and one Pop-over at most, sampled during each flow;
  - no DOM element over an Art box but the allowed ones;
  - the List of 300 packages, from a generated fixture, updating within 100 ms per key;
  - the repaint budget at 300 graves;
  - no request outside the origin and the API base;
  - no AudioContext and no audio element created.
- **Replay texts:** every Step and why sentence is checked by hand against its cited source during the build, with the source key beside it in replay-facts.mjs.

### Deliberate test changes

Removed with their features, in the same commit (4.6):

- `bubbles.test.tsx`, `sound.test.tsx`, `serious.test.tsx`, `tooltip.test.tsx`, `tooltip-place.test.ts`, `guide.test.tsx` and `fix-first.test.tsx`;
- the Punchline cases of `epitaph.test.ts`;
- the bell case of `priest.test.tsx`;
- the caption case of `burst-rise.test.tsx`;
- the Home Play cases of `play.test.ts`;
- the e2e cases for bubbles, sound, the tooltip, the guide card and the Fix-first line in `judge.spec.ts`, `undead2.spec.ts`, `fixes.spec.ts` and `polish.spec.ts`.

Expected to change:

- `header.test.tsx`, `a11y.test.tsx`, `fonts.test.ts`, `asset-names.test.ts`, `styles.test.ts`;
- `drawer.test.tsx`, `drawer-result.test.tsx`, `pr-preview.test.tsx`, `remediate.test.tsx`, `hosted-plans.test.tsx`;
- `replay.test.tsx`, `replay-header.test.tsx`, `scrubber.test.tsx`, `marker.test.tsx`;
- `app.test.tsx`, `smoke.test.tsx`, `readme.test.ts`, `fit.test.tsx`;
- `validate-scan-response.test.ts`, `load-scan.test.ts`, `lists.test.ts`;
- `selection.test.ts` (Left and Right leave `reduceSelection`), `scan-time.test.tsx`, `shapes-palette.test.ts`, `halo.test.ts`, `art-box.test.ts`, `grave-buttons.test.tsx`, `draw.test.ts`, `layout.test.ts`, `tiers.test.ts`, `motion.test.tsx`, `vite-csp.test.ts`;
- the e2e `smoke`, `time`, `judge` and `remediate` specs.

The build lists each changed test in "Decisions made during implementation" with its reason, as earlier specs did.

### Review protocol

- **Before every commit:** typecheck, lint and test at the root with zero warnings, then an independent review by a reviewer that has not seen the implementation. The reviewer gets this folder, the diff against main, docs/requirements.md and the steering files.
- **Before the report:** the built site, in a fresh profile at 1440 by 900 and 390 by 844, through every flow of the prototype. With the Music button absent, the review checks that no audio is created. The built site is placed next to the prototype, and every difference is listed with its reason.

## Calls made without a user decision

1. **Headline count.** The prototype counts only Possessed packages as "need you now", and this is kept. On the demo it reads "1 of 12 dependencies needs you now." while 5 are Dead. The Fix order lists the Dead ones.
2. **Fix order.** Up to 5 rows from Possessed, Dead and Haunted, in triage order. Restless and Alive never appear.
3. **Fix tab buttons.** One copy button at most. "Copy pull request text" shows for a Proposed plan. "Copy this as an issue" shows for a Possessed, Dead or Haunted package without one. Restless and Alive get a sentence and no button, as in the prototype.
4. **Pull request text.** It stays readable in a closed disclosure (R-UI-4).
5. **Footer line.** The evidence links, scan time and policy line move to one site-footer line.
6. **Failure cards.** One card covers private and not found. 429 gets its own card, because it comes from Sexton's WAF.
7. **Examples.** Three, not four.
8. **Phone.** The Tiers stack front first in the Narrow layout.
9. **Canvas labels.** The name labels change to Inter. Nothing else in the Characters changes.
10. **Fonts.** Copied from the @fontsource packages' published files. No package dependency is added.
11. **Faint text.** The faint colour is lightened where the prototype's value fails AA. The accent moves if it is closer than 10 to Restless.
12. **Step titles.** Step 1 titles may repeat across the two replays. The texts differ within a replay.
13. **Burst caption.** "The wind stops. A grave opens." goes. The Step title says it in words.
14. **Unknown replay.** A replay value outside the closed set shows "That replay does not exist." with "Back to the cemetery". It still loads nothing.
15. **Documents outside lane 1's README section.** Requirement 18 changes several things that LANES.md gives to other lanes:
    - README.md beyond "Try it in two minutes": the sound line, "What Sexton does", "Replay", "Pre-existing code" and the credit line;
    - CREDITS.md;
    - docs/JUDGES.md;
    - docs/requirements.md.

    - packages/api: `src/contract.ts`, `scripts/lib/replay-facts.mjs`, the demo generator and their tests (lane 2's package in LANES.md).

    Lanes 2 and 3 have merged their branches, and leaving these unchanged would make them false or leave the Replay story with no data. The owner is asked to confirm this at go. Three Claims need README text that README lacks today (18.7): "The hosted site needs no sign-in and never asks for a GitHub password.", "Sexton reads a repository's package.json and package-lock.json at its root." and "Sexton proposes a bump only to a version that passes its checks; otherwise it proposes no change." All three are true of main: the hosted scan takes only a URL, intake fetches the two files at the repository root, and a plan with no passing candidate has status no-safe-version with no change. They are added only if the owner approves; otherwise the Claims that rest on them (the fix-tab notes' "No sign-in needed." and "Sexton only proposes a version it can show is safe.", the Guide's sign-in answer and the Tour's step 3) are cut to what README states.
16. **product.md and structure.md.** Two always-included steering files will be out of date after the build. This lane may change only web.md, so the owner is asked at go to choose: let this lane update them, or hand them to lane 3 before the merge.
    - product.md names the old fonts, sound, speech bubbles and the replay "banner".
    - structure.md names src/sound, src/speech, the overlay tooltip and epitaph Serious mode.
17. **Gold button.** The Inspector's gold button opens the package the Inspector shows. Moving the pointer from a grave to the Panel returns the Inspector to the Selected grave, as in the prototype, so the button then acts on the Selected grave.
18. **Missing Term.** The check for a Term without a meaning is the typecheck gate, not a Vitest test. The typecheck runs before every commit like the tests.

## Decisions made during implementation

### Task 1: foundations

1. **Carried files.** `view-address.ts`, `page-history.ts`, `scanned-pref.ts` and `test/view-address.test.ts` were checked out as files from spec/calm-first-visit, not cherry-picked. `View` gains `page` and `list`. A new `canonicalView` gives the canonical form of C8; `parseView` returns it and `formatView` writes it, so a part a view does not take is never written. `isHome` now also needs `page = "home"` and no list flag, since "/" is the Graveyard view. `HomeSource` names the demo, repo and scan Sources.
2. **Screen state.** The reducer does not see the scan, so the caller dispatches `open-drawer` only for a grave the scan holds (C1's "ignored" rule moves to the caller). `close` acts on the Drawer and the Tour and changes nothing else. Opening a Replay or the Guide page clears the filter. `restore` keeps the filter only when it lands on Home. `initialScreen(view)` gives the state of a page load.
3. **Scan input.** `normaliseRepo` also takes `http://`, a host in any case and a link with no scheme (`github.com/owner/name`). Input over 300 characters is refused at once. An owner may not hold two hyphens in a row. A name that still ends in `.git` after the one suffix is stripped is refused, so the output is always a fixed point (Property 3).
4. **Reason families.** A reason is in a family only when it matches that branch's whole text, not just its leading words; otherwise 3.10 applies. The month count in the two "no release" sentences is taken from the reason (24 today). The api drift test also counts the `stateReason` returns in `evaluateState`, so a new engine branch fails it even before the fixture lists it.
5. **Inspector signals.** `drawer/signal-labels.ts` (C5) was added now, because `pick-signals.ts` shows its labels. A Possessed package whose reason has no family signal shows maintainers, provenance and install script. Values are short words ("yes", "none", "2 open, worst High", "alice, bob became alice, mallory"). Tones: deprecated, a High or Critical advisory, a recent maintainer change, a provenance regression, a new install script, a changed publisher and a new dependency with an install script or a fresh version are bad; an install script, missing provenance, a lesser advisory or another new dependency warn. Last publish is "ok" unless its date is unknown, because an age rule in web would copy a state rule. Signal values are only partly shape-checked at load, so every read is guarded.
6. **Fix order.** The first plan per package name is used. A proposed bump with no chosen version, or a migrate plan with no added dependency, falls through to the next line of 3.19.
7. **List rows.** `listRows` takes the scan response, not the package list, because it needs the timelines and the plans. A row's version is its Segment's version when the Segment has one. "Nothing to do" follows the scan-date State, like the plan it stands for. The ranges notice of 2.14 ends without a full stop, as the criterion writes it.
8. **Headline.** `headline` returns the Possessed count and the rest of the sentence as two parts, so the count can take the Possessed colour; `countsAt` gives the chip counts and the total at a date.
9. **Code reader.** The reader is its own pure file, `load/error-code.ts`. `load-scan` reads the code of every non-2xx response: a declared length over 4 KiB is not read, and the body read stops at 4 KiB. `LoadError` gains `apiCode`.
10. **Chrome tokens.** `uiFaint` is #8a85a6, not the prototype's #6f6a8a, which is 3.29:1 on `uiPanel2` (now 4.80:1). `uiAccent` is #f2c46b, not #e9a23b, which is 4.2 from Restless in CIEDE2000 (now 11.0, still gold). `ringHover` is #c9c2dc: the prototype draws white at 28 percent, and the palette has no opacity scales. The five State colours are also checked as text on the four chrome backgrounds. `uiAccentInk` on `uiAccent` is 11.4:1.
11. **Fonts.** Copied from the published tarballs of `@fontsource-variable/inter` 5.3.0 (`files/inter-latin-wght-normal.woff2` as `inter-variable.woff2`, `LICENSE` as `OFL-inter.txt`) and `@fontsource/cormorant-garamond` 5.3.0 (`files/cormorant-garamond-latin-600-normal.woff2` as `cormorant-garamond-600.woff2`, `LICENSE` as `OFL-cormorantgaramond.txt`). No dependency was added. The old fonts stay until task 2.3.
12. **Tests changed in task 1.**
    - `view-address.test.ts` (carried): now Property 2 of this spec over canonical Views; the rejected example gains `page` and `list`; new cases for `page`, `view`, the canonical form and the part order. Its generators moved to `test/support/views.ts` for the screen-state test.
    - `lists.test.ts`: adds the check that `API_ERROR_CODES` matches the list in `packages/api/src/http/responses.ts`.
    - `imports.test.ts`: the host-string check lets `github.com` (and nothing else) stand in `header/repo-input.ts`, which reads the link the visitor types, and `load/scan-failure.ts`, whose card asks for "a github.com link". Neither file calls fetch.
    - New: `screen-state`, `repo-input`, `reason-family`, `fix-order`, `home-models`, `glossary`, `scan-failure` and `chrome-palette` in web, and `reason-family-drift` in api. The CIEDE2000 and contrast helpers are in `test/support/colour.ts`; `colour-vision.test.ts` is unchanged.

### Task 2: remove the noise

1. **What went.** `src/sound` (engine, voices, the stored Sound choice), `src/speech` (Bubbles, schedule, placement, table), `src/guide` (the guide card, its steps and `sexton:guide`), `src/epitaph` (the Punchline table, its Reason family copy, `hereLies`, Serious mode and `sexton:serious`), `overlay/GraveTooltip.tsx`, `overlay/tooltip-model.ts`, `overlay/use-grave-tooltip.ts`, `header/fix-first.ts`, `BURST_CAPTION`, `bellKey` in `scene/characters/priest.ts` (a pure helper with no drawing; the Priest's drawing is unchanged) and every sound call (the burial bell, the Burst's sting and thud, the ghost call). `hereLies` had no caller left in src, so it went with the rest of `epitaph.ts`. Nothing reads or writes `sexton:sound`, `sexton:serious` or `sexton:guide` any more; the e2e storage state that set `sexton:guide` is removed from `playwright.config.ts`.
2. **Lantern glow without the tooltip.** The tooltip's state used to drive the Lantern glow. `GraveButtons` now lights the grave under the pointer, else the one holding key-driven focus, and nothing while the drawer is open. A focus moved there in code (the drawer's focus return) lights nothing, as before. Task 3.3 replaces this with the Inspector's hover and focus.
3. **Fonts.** Two faces ship: Inter (variable, `font-weight: 100 900`) and Cormorant Garamond 600. The font stacks are written out in styles.css, not as custom properties, because the style tests allow only the palette's variables. `h1` and `h2` (the wordmark, the drawer title, the load-error heading) are Cormorant Garamond 600; `h3` to `h5` and all other text are Inter; `code`, `pre`, `kbd` and `samp` use `ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace`. The drawer's "Here lies" and the wordmark's "cemetery" are Inter upright (no italic face ships). The canvas label font is `600 15px Inter, system-ui, sans-serif`; the small-Tier size swap in `draw.ts` now replaces only the pixel size, and `CANVAS_FONTS` waits for `600 15px Inter`. The CSP's `font-src 'self'` already matches.
4. **Home Play stays until task 3.4.** Requirement 4.1 also names the Play control on Home. Task 2's items do not, and the Footer bar is rebuilt in task 3.4, so the Play button stays there until then.
5. **Steering.** web.md, product.md and structure.md lose the lines that describe the removed parts, and their font lines name the two new faces. The full web.md rewrite stays in task 12.2.
6. **Left for task 12.** README.md still has the sound line and CREDITS.md still lists the four old fonts; README's "Try it in two minutes" still reads "Hover a grave" and its test is unchanged. `infra/test/cache-headers.test.ts` and `check-cache-headers.test.ts` use `/fonts/pirata-one-400.woff2` only as a sample path string; infra is outside this lane, so they stay.
7. **Tests removed in task 2** (4.6), as listed in "Deliberate test changes": `bubbles.test.tsx`, `sound.test.tsx`, `serious.test.tsx`, `tooltip.test.tsx`, `tooltip-place.test.ts`, `guide.test.tsx`, `fix-first.test.tsx` and `epitaph.test.ts` (every case was a Punchline case but `hereLies`, whose function went); the bell case of `priest.test.tsx`; the caption case and the "no Bubble while the caption shows" case of `burst-rise.test.tsx`; and in e2e the Guide and Fix-first cases of `judge.spec.ts` (its general axe run of the demo is kept as its own case, "requirement 7.7: axe finds no violation on the demo"), the Bubble case of `undead2.spec.ts`, the two tooltip cases of `fixes.spec.ts` and the tooltip case of `polish.spec.ts`. Web goes from 630 to 560 tests, with the new `lantern.test.tsx` (4 cases: hover, key-driven focus and not a pointer focus, hover over focus, none while the drawer is open).
8. **Tests changed in task 2.**
    - `burst-rise.test.tsx`: the caption case now checks that no caption shows at any Stop (4.5); the Reduced motion case checks the final pose with no caption.
    - `header.test.tsx`: the control order loses Sound and Serious mode, and checks that neither button exists.
    - `a11y.test.tsx`: the focused-grave axe case checks that no tooltip shows; the Tab walk is 10 presses with the grave at position 5; the focus-outline list loses the two toggles.
    - `scrubber.test.tsx`: the slider is 6 Tab presses away; the Segment version case keeps the button name and drawer title and checks that no tooltip shows.
    - `replay.test.tsx`: the per-Stop case keeps the grave name and drawer halves; the axios and keyv reason case reads the drawer's State line.
    - `styles.test.ts`: `.grave-tooltip` leaves the overflow-wrap list.
    - `fonts.test.ts`: the two new files; nothing else in public/fonts; two `@font-face` rules for Inter and Cormorant Garamond; no old face named in src; the body, heading, wordmark and code stacks; the canvas label font.
    - `test/setup.ts`: no longer turns the Guide off.
    - e2e (compiled by the typecheck, not run here): `undead2.spec.ts` turns the Sound case into "no AudioContext and no audio element after hover, focus, a key press and a replay" (4.3) and the Reduced motion Burst case into "no caption"; `smoke.spec.ts` drops the tooltip and Bubble waits before the README picture, checks no caption on the replay picture and checks Inter is loaded; `time.spec.ts` reads the replay reasons from the drawer and lines up the form with the Legend only; `fixes.spec.ts` bug 1 waits for the Possessed grave name instead of the caption.
9. **Left for later tasks.** The drawer title (name and version) is still the Cormorant `h2` and the signal keys are Inter `h4`s, so 5.5's monospace versions and keys wait for the Drawer and Panel rebuild (tasks 3.3 and 5). The drawer's "Here lies" keeps its old `--accent-bg` colour until the Drawer is rebuilt (5.6, task 5).

### Task 3: the shell

1. **One owner, in memory for now.** `load/use-view.ts` holds the `ScreenState` with `useReducer(reduce)`. The page loads the Source its address names (as the loader always did); the rest of the address (`grave`, `at`, `view`, `page`, `repo=`), push, replace and popstate join it in task 8, and every caller already dispatches through it. `App` loads the Source a `source`, `open-replay`, `home` or `open-tour` event leads to, unless that Source is the one already loaded, so the Home action from a Replay reloads the Home Source and from the Guide page reloads nothing.
2. **Replay through the new shell.** Until task 6, a Replay shows in the Home layout with its headline and sub-line (8.1), the old card over the scene, the Stop cards and Play in the Footer bar, and the Inspector (no gold button, no Fix order). Its grave still opens the Drawer, kept by the Cemetery itself as before (the reducer ignores `open-drawer` on a Replay, and 8.19 lands with task 6). Its date stays in the Play model; Home's date is `view.at`.
3. **Cemetery.** It takes the Selected grave, the open Drawer, the filter and a reserve from the page when they are given, and keeps its own state when they are not (the Cemetery-only tests use that). It tells the page the grave under the pointer and the grave whose button has focus. The List replaces the Scene inside it (`replaceScene`), so the Drawer, the burial and the focus return work from the List too; a List row carries its grave's `data-grave-index`.
4. **Dimming and the hover ring.** `planScene` takes `dimmed` (names) and `hover`; `GravePlan.dimmed` and `ScenePlan.hoverRing` are new. The painter wraps each dimmed grave's glow and grave draws in save, `globalAlpha = DIM_ALPHA_BYTE / 255` ("38", about 0.22, the prototype's dim) and restore, so the sprite cache is unchanged; a dimmed Possessed grave leaves the Halo's sources. The hover ring uses the selection ring's casing drawn by one `drawRing`, before the selection ring, which stays the last call. Nothing in `scene/characters` changed.
5. **Tab stop under a filter.** The one grave in the tab order is the Selected grave, or the first grave not dimmed while the Selected one is (2.8, 16.8). Left and Right reach every grave, dimmed ones too (16.14).
6. **Keys.** One document listener in Home handles Left, Right (wrapping, `selection.ts`'s new `stepWrap`) and Enter on the body. `reduceSelection` keeps Up and Down only. Escape is one document listener in `App` that dispatches `escape` unless the event was already handled (the Drawer handles its own Escape and marks it), so one press closes one thing.
7. **Pop-overs.** The examples list, the Legend, the attack picker and a Term meaning render from `popover`. A press outside the open one closes it (a `data-popover` wrapper marks its inside). The Legend keeps its eight entries as a Pop-over now; its headings and wording change with task 7.2. The Term Pop-over is a first version (task 5.2 refines it).
8. **Placeholders until their tasks.** "What is Sexton?" and "Read the guide" open a first Guide page (breadcrumb, eyebrow, headline, the sexton sentence, "Go to the cemetery" and "Watch a real attack"); task 7.1 fills it from the Claim registry. Tour runs the three steps in a card at the bottom centre with Skip, Next and Done (13.3, 13.4, 13.7, 13.9, 13.10); the spotlight, dimming, blocker and `placeCard` land with task 7.3. The List is a plain table from `listRows` (worst first, filter, date); Find and the sort buttons land with task 4. No Music button: `TRACK` lands with task 10. Failed loads keep main's error card inside the Scene card until task 9.
9. **Header.** The wordmark is a link to "/" that takes the Home action on a plain primary press. The scan tag comes from the screen state's Source (`header/scan-tag.ts`). The refusal hint of 1.12 lives in `repo-input.ts`, the one file allowed to hold that host name. `HOSTED_UNAVAILABLE_TEXT` is now "Scanning is off in this build." The scanning card shows while a hosted load is pending (the loading state now carries its `source`).
10. **Dates.** The headline, the badge, the Inspector sentence and the scrubber's end labels write a day ("12 Nov 2026", `dayText`); the slider's aria-valuetext keeps the full time.
11. **Footer bar and site footer.** The Footer bar is `footer.night-footer.foot-bar` under the Scene, not sticky. Back to now sits beside the slider; the scrubber notes of main stay under it at an earlier date (web.md). The site footer reuses `headerModel` for the scan time, the policy line and the evidence links ("Evidence JSON", "Evidence Markdown"); the model's other fields are no longer shown. The Scene's height is the free viewport height less the measured Footer bar and site footer (`home/use-reserve.ts`), at least 420 px, so the graves stand at its bottom as in the prototype.
12. **The attack picker's cards.** `REPLAY_CARD` (design C6) is added now for the picker; a test checks each entry against its fixture and its Stops. The old Replay group (`ReplayButtons.tsx`, "axios, Mar 2026", "Replay an attack") is removed.
13. **Contrast check of the chrome.** The pair check in `shapes-palette.test.ts` now checks chrome text tokens against the four chrome backgrounds, and skips the chrome lines (`--ui-line`, `--ui-line2`), colour-mix tinted borders and an edge in its own fill colour: these are the prototype's decorative separators, and every control they edge is named by its text or fill. Text pairs are unchanged in strength.
14. **Help line and badge.** The help line hides while the date badge shows, so the two never overlap in a narrow Scene; both stay in the sky band. Focus on a grave button makes it the Selected grave, as on main (the roving tab stop follows it).
15. **Steering.** web.md and structure.md describe the shell, the site footer's evidence links, the attack picker, Play on a Replay only, and the new folders. The full web.md rewrite stays in task 12.2.
16. **Tests changed in task 3.**
    - `header.test.tsx`: rewritten for the new header (order, tag, wordmark, disabled field, scan and refusal, examples, Legend Pop-over); Property 14 and Property 22 now check the model through the site footer, and the tag of a hostile repository as text.
    - `app.test.tsx`: the demo label is the "Sample scan" tag, the field's name is "GitHub repository to scan", the 200-character case became the refusal of 1.12, evidence links are in the site footer, and the inert check names the scene, hero, Footer bar and Panel.
    - `a11y.test.tsx`: the Tab walk follows the new order; the focus list names the global `:focus-visible` rule; labels and texts follow the header.
    - `scrubber.test.tsx`: Home has no Play (4.1), so the Play cases run on the axios Replay and one new case checks Home has none; "as of" became the date badge and past headline; the Back-to-now part of the pause case went with Home Play.
    - `replay.test.tsx`, `replay-header.test.tsx`: the Replay group became the attack picker; the header's "Window ends" and "Showing" became the site footer's time and the card's date; the replay's title check became the headline check.
    - `selection.test.ts`, `grave-buttons.test.tsx`: Left and Right left `reduceSelection`; Up and Down cases and `stepWrap` cases instead.
    - `styles.test.ts`, `shapes-palette.test.ts`, `imports.test.ts` (the scanning card's "deps.dev" line), `layout.test.ts` (`dimmed` key), `art-box.test.ts` and `ghost-drift.test.ts` (`dimmed` in literals), `drawer.test.tsx` (the scene, not `main`, is inert), `smoke.test.tsx` (the wordmark link), `remediate.test.tsx` and `load-scan.test.ts` (texts).
    - New: `home.test.tsx` (Home, the Panel, the keys, the Footer bar, the site footer, the Welcome bar, Escape order and a Replay's Escape home, the Tour, the scanning card, the replay cards), `overlay-band.test.ts` (Property 8, first half) and `dim-hover.test.ts` (dimming at rest and during the Load moment, the Halo, the hover ring).
    - e2e (compiled, not run here): the field's name, the tag, the policy line, the picker and the date badge in `smoke`, `remediate`, `polish`, `undead2` and `time`. The canvas-top and Play cases of `time.spec.ts` wait for task 12.1.

### Task 4: the List view

1. **Sorting.** The Package and State headings are buttons; the sorted column's `th` carries `aria-sort="ascending"` (name order, or triage order with the worst first), and the other has none. The prototype's marks ("↑", "↑ worst first") follow the label, hidden from assistive technology, which reads `aria-sort`. A press on the sorted column's button keeps its order.
2. **Rows.** A press anywhere in a row opens its Drawer; the package cell's button gives the row its keyboard stop, so Enter opens it too, and it carries the grave's `data-grave-index` for the focus return. Opening a row also makes it the Selected grave, as a grave press does, so the Panel shows it after the Drawer closes (6.13).
3. **Find.** A native search field named "Find a package". Its text, and the sort, live in the List's own state, so they last while a Drawer opens over the List and reset when the List is left.
4. **The 300-package fixture.** `e2e/scan-300.ts` makes it at test time from the demo scan: package i is demo package i mod 12 named `<name>-<i>`, with its plan, and no timelines. `e2e/list.spec.ts` checks every package shows once and times each key of "left-pad-1" from its keydown to the frame after the last change of the table body it caused (6.12, 100 ms). A key that leaves the rows as they were changes nothing and counts as 0 ms.
5. **Tests.** New: `list-view.test.tsx` (7 cases). Changed: `home.test.tsx` reads the State heading as "State ↑ worst first".

### Task 5: the Drawer

1. **Frame.** The Drawer is 680 px wide (the prototype's `min(680px, 100%)`) and full width under 700 px. It slides in with a 240 ms CSS animation, off under Reduced motion; it is the only animation besides the loading spinner, so the style test allows these two. The scan date shows under the badge as "Scan of <time>" (7.19). The close button is "✕" named "Close". "← Cemetery" closes the Drawer (10.14). The tab is the Drawer's own state and starts at Evidence on each open, so a tab change leaves the address alone (10.16). Tabs follow the ARIA pattern with automatic activation: Left, Right, Home and End move and show; only the shown tab is in the Tab order; the tab panel is the scrolling body with a tab stop.
2. **Focus.** The trap skips elements with a negative tabIndex and anything inside a closed disclosure but its summary. The Cemetery now returns focus on every change from an open to a closed Drawer, not only on its own close calls, so a close by the screen state (Escape with focus in the header, later popstate) also returns focus to the grave button or List row; a close that moved focus to the Scan field is the one exception.
3. **Escape order.** The Drawer handles its own Escape only while no Pop-over is open (`popoverOpen`); with a Term or another Pop-over open it lets the key reach the page's listener, whose `escape` closes the Pop-over first (10.3).
4. **Evidence.** The verdict box is "<State>. <plain sentence>". A signal's source is a link, shown by its host, only for an https:// address (same rule as the PR preview); any other source is text. Labels come from `signal-labels.ts`, with Terms marked. Missing signals show their labels. The policy rules are main's.
5. **The fix tab.** `fixView` returns the box, the diff, which buttons show and the note. A Proposed plan wins over the State, so a Restless or Alive package with one shows the plan (as the List's Fix cell already does); without one they get 7.9 and 7.10. A set-range Edit gives one added line with its new range: the scan does not carry the range package.json had before, so no removed line is made up. A Proposed plan with an empty body shows "Copy this as an issue" in place of "Copy pull request text" for a Possessed, Dead or Haunted package, and no copy button otherwise (7.6). Open pull request needs the plan's intent, as on main. The kind of scan is "sample" for the Sample scan, "live-remediate" when the page has a remediate client (a hosted scan with actions.remediate true), else "live"; a scan file and a Replay count as "live". The buttons, the status lines and the note sit in the Result area outside the scrolling body, on the fix tab only; the outcome of a request and of a copy outlive a tab switch. "How does this work?" is a button that opens the Guide page; a Replay's Drawer has none. main's "Pull requests are opened only on the demo repository" is replaced by the notes of 7.13 to 7.15. The note texts live in `fix-view.ts` until the Claim registry of task 7.1.
6. **Issue text.** Package, version, State, the plain sentence and the engine reason, the plan's title and summary when there is one, then one line per signal with its value, source and fetch time, and the missing signals.
7. **History.** Newest first; each row's reason is the plain sentence. A package with no Segments in a response with timelines also reads "No history for this scan."
8. **Left for later.** On a Replay the Cemetery still keeps its own Drawer (task 6). The Claim registry check of the notes waits for task 7.1.
9. **Tests.** New: `drawer-tabs.test.tsx` (20 cases: every fix-tab case, a property that at most one copy button and the right Open pull request show, copy ok and blocked, the issue text, the History rows and tab, the tabs and their keys, and in the App the Term Escape order, a press outside the Term, the focus return after a close by the screen state, the breadcrumb and scrim closes, and the Guide link) and `test/support/drawer-props.ts`. Changed:
   - `drawer.test.tsx`: the trap walks every stop (crumb, close, the shown tab, the panel, the source links); the component case reads signal labels in a table, the verdict, https source links, and the plan and body on the fix tab; the unavailable case also checks the Alive fix tab; the close case adds the breadcrumb and Escape under a Pop-over.
   - `drawer-result.test.tsx`, `remediate.test.tsx`, `marker.test.tsx`, `hosted-plans.test.tsx`: open "The fix" first; the demo-only text became the Sample note of 7.13 and the hosted case also checks the note of 7.14; the hosted plan checks its diff line.
   - `a11y.test.tsx`: the PR-table axe case opens the fix tab and the disclosure, and also runs axe on the Evidence and History tabs; the State text is read from the badge and the verdict.
   - `header.test.tsx` (Property 22): the drawer's source links are left out of the element comparison and checked instead to be https, and never more than on the plain response.
   - `styles.test.ts`: the Drawer's animation and its Reduced motion rule; the width min(680px, 100%) and full width under 700 px; the remediate button uses the chrome accent tokens.
   - `replay.test.tsx`: the Drawer gets its fix and history props.
   - e2e: `remediate.spec.ts` and `polish.spec.ts` open the fix tab (and the disclosure) first. Run locally: these pass; seven cases in `time.spec.ts` and `polish.spec.ts` (the demo-label overlap at four widths, the axios replay's Stop readout, the canvas top at 1440 by 900 and the 360 px full-bleed check) fail the same way on the commit before this task and wait for task 12.1.

### Task 6: the Replay as a story

1. **Every Step and why sentence, and its source.** Each cited source was read on 26 November 2026 (the Trend Micro address now redirects to the same report on trendaisecurity.com; the CSA page was read through a fetch, since it refuses a plain request). A sentence stays only where its source says it. In `replay-facts.mjs` each sentence is followed by a comment naming its `SOURCE_URLS` key; a test checks that every sentence has one, and that each key it names is a source that replay cites.

   | Replay, Step | Sentence | Source and what it says |
   |---|---|---|
   | axios 1, happened | "axios 1.14.0 is the current release." | registryAxios: the time map has no 1.x version between 1.14.0 (27 March) and 1.14.1 |
   | | "It was published by GitHub Actions through npm's trusted publishing, so it carries provenance." | trendmicro: "Every legitimate Axios 1.x release is published via GitHub Actions with npm's OIDC Trusted Publisher mechanism"; npmTrusted: "npm automatically generates and publishes provenance attestations"; registryAxios: 1.14.0's publisher is GitHub Actions with an attestation |
   | axios 1, shows | "Nothing to flag. The grave is Alive." | registryAxios: the facts of 1.14.0; the Segment is Alive, "no rule matched" |
   | axios 2, happened | "An attacker publishes axios 1.14.1 by hand from the lead maintainer's npm account, with a stolen access token." | trendmicro: "hijacked the lead maintainer's npm account"; "published manually with a stolen npm access token" |
   | | "It adds a new dependency, plain-crypto-js 4.2.1, whose postinstall script installs a remote access trojan." | trendmicro: "plain-crypto-js@4.2.1, which executed a postinstall hook"; "a cross-platform remote access trojan (RAT)"; csa: "a malicious dependency designed to execute a post-install payload" |
   | axios 2, shows | "The grave turns Possessed. 1.14.0 had provenance and 1.14.1 has none. That drop is the warning." | the Segment's "provenance regression" reason; trendmicro: 1.14.1 "with no OIDC binding"; npmTrusted and registryAxios as above |
   | axios 3, happened | "About three hours after it appeared, npm removes 1.14.1." | trendmicro timeline: published "March 31, 2026 00:21 UTC", removed "~03:30 UTC" |
   | | "A fresh install gets 1.14.0 again." | registryAxios: 1.14.1 is gone and the next 1.x is 1.15.0 on 8 April; csa: "Downgrade to safe versions: axios@1.14.0" |
   | axios 3, shows | "The grave is Alive again." | the Segment's State at the removal |
   | | "A machine that installed 1.14.1 in those hours should still be treated as compromised." | csa: "Assume potential compromise: rotate all credentials"; trendmicro: "Rotate ALL credentials" |
   | axios, why | "axios is a JavaScript HTTP client with over 100 million downloads a week on npm." | trendmicro: "a widely used JavaScript HTTP client with over 100 million weekly npm downloads" |
   | | "An attacker who took over its lead maintainer's npm account published a version that exists only on npm, with no matching code on GitHub." | trendmicro: "There is no commit, tag, or release in the Axios GitHub repository that corresponds to 1.14.1"; "The releases exists only on npm." |
   | | "The new dependency's install script left a remote access trojan on macOS, Windows and Linux machines, then erased its own traces." | trendmicro: "deliver persistent malware on macOS, Windows, and Linux, and then erased evidence" |
   | | "Anyone who installed it is told to assume compromise and rotate every credential." | csa and trendmicro, as above |
   | keyv 1, happened | "keyv 5.6.0 is the latest stable release." | snyk: "keyv@5.6.0 is the latest clean stable 5.x version"; registryKeyv: only 6.0.0 prereleases follow it before 6.0.0 |
   | | "It has no install script, so installing it runs nothing." | registryKeyv: 5.6.0's scripts hold no preinstall, install or postinstall |
   | keyv 1, shows | "Nothing to flag. The grave is Alive." | registryKeyv: the facts of 5.6.0; the Segment is Alive |
   | keyv 2, happened | "keyv 6.0.0 is published at 09:35 UTC with a new preinstall script, node setup.mjs." | snyk: "keyv@6.0.0, published at 09:35:00 UTC"; "preinstall": "node setup.mjs"; ghIssue: "adds "preinstall": "node setup.mjs", absent from the version immediately preceding it" |
   | | "It still carries valid provenance from GitHub Actions, the trusted publisher." | snyk: "The npm manifest identifies GitHub Actions as the trusted publisher for keyv@6.0.0"; ghIssue: "carries a valid SLSA attestation from the real repository" |
   | keyv 2, shows | "The grave turns Possessed. An install script appeared that earlier versions did not have. Provenance alone would not have flagged it." | the Segment's "install script added in 6.0.0"; ghIssue: "The provenance is genuine and proves only that poisoned source was built by the real pipeline"; snyk: "provenance can faithfully attest a build whose source or workflow context has already been compromised" |
   | keyv, why | "npm recorded 619,682,667 downloads of keyv from 5 July to 3 August." | snyk, word for word |
   | | "npm runs a preinstall script by itself during install, so no one has to import keyv or start an app for the code to run." | snyk: "npm runs preinstall automatically during dependency installation. A developer does not need to import keyv, start an application, or call a vulnerable API." |
   | | "Reports say its hidden second stage goes after GitHub and npm tokens, cloud credentials and private keys." | snyk: "the encrypted second stage targets GitHub and npm tokens, cloud credentials, private keys", which Snyk takes from the incident reports, so the sentence says "Reports say" |
   | | "Developer laptops and CI runners are prized targets because they often hold those credentials." | snyk: "Developer laptops and CI runners are especially valuable targets because they often hold GitHub, npm, cloud, signing, and deployment credentials." |

   Changed from C6's drafts: axios 1.14.0 "was built by" became "was published by ... through npm's trusted publishing" (the sources say published, not built); "The grave is healthy" became "The grave is Alive" (a State name); "A compromised maintainer account publishes" names the lead maintainer's account and the stolen token, as Trend Micro does; "whose install script runs the payload" names the postinstall script and the trojan; "About three hours later" became "About three hours after it appeared" (00:21 to about 03:30 UTC). Cut: "Anyone who installed in those hours got the bad release." No source says it; the CSA advice to assume compromise replaces it. keyv 5.6.0 "is the current release" became "the latest stable release" (Snyk's words; 6.0.0 prereleases came after it), and "It runs nothing when you install it" now says why (no install script, from the registry). The prototype's general why text ("Millions of projects ... The victims did nothing wrong. They just updated.") is not given by any source, so each replay has its own why text from its sources. No new fact is added: the 100 million weekly downloads, the trojan, the 619,682,667 downloads and the stolen credentials are all in the cited reports.
2. **Validation.** `steps` (1 to 8) and `why` (non-empty, up to 800 characters) are required on a replay block. Each Step's title (up to 80), "What happened" and "What Sexton shows" (up to 400) are non-empty strings, and no two Steps of a Replay share a title, a "What happened" or a "What Sexton shows" (DUPLICATE at the later Step). The count is checked against `stopsFor` only on an otherwise valid response: fewer Steps than Stops is MISSING_FIELD at /replay/steps, more is TOO_MANY_ITEMS. No value is echoed. The demo scan has 24 Stops, so a replay block on it is refused.
3. **One View owner.** `App` renders `ReplayView` while the shown Source is a replay and the owner is "replay"; Home no longer has any replay branch (its ReplayHero, Stop cards and Play went). The view shows its breadcrumb, headline and sub-line from `REPLAY_CARD` at once and the waiting or error card until its own file has loaded; the error card is main's until task 9. A scan file (`?scan=`) that holds a replay block shows as Home with its one grave.
4. **Steps and Play all.** `replay/replay-story.ts` (pure) pairs each Stop with its Step text, version and State; a file whose Steps do not match its Stops gives no story. The Step index is the Play model's: `PLAY_STEP_MS` is now 5,000 (Play exists only on a Replay). A Step card, Back and "Next step" seek, which stops play; "Exit replay", "Back to the cemetery" and "← Cemetery" take the Home action, which unmounts the view and its timer. The Step time reads "31 Mar 2026, 00:21 UTC" in the panel and the date badge.
5. **The grave opens nothing (8.19).** The Replay passes the Cemetery `open={null}` with no-op requests, so no Drawer is kept on a Replay. The grave button stays for its accessible name ("axios 1.14.1, Possessed") and the Lantern. The Drawer's `replay` prop and its banner went with `ReplayBanner.tsx`; the Scrubber lost its Play button and Stop cards. The Replay's Footer bar has no attack picker, as in the prototype; a second Replay is picked from Home.
6. **What the page no longer shows.** The replay file's `title` and `summary` stay in the file but are not shown; the sub-line, the Steps and the Why card tell the story. The not-live line shows once, in the Why card. The Step badge reads "<package> <version> is <State>"; a Step with no State would read "Not published".
6a. **A file with no story.** The validator refuses a replay whose Steps do not match its Stops (8.15). Should such a response reach the view anyway, it shows an alert ("This replay file has no story for its steps.") under the Replay's heading, never a waiting card that waits for ever.
7. **Layout.** The Replay page uses Home's grid, Scene card, Footer bar and Panel classes. Its left column keeps its own height (`align-items: start`), so the Footer bar sits under the stage however tall the Panel is. Under 700 px the Footer bar wraps and each Step card takes a row, as in the prototype.
8. **Steering.** web.md, product.md and structure.md describe the Replay story, "Play all" at 5,000 ms and the Why card in place of the banner.
9. **Tests changed in task 6.**
   - api `replay-facts.test.ts`: the replay block now equals the facts' `steps` and `why`; new cases: one Step per Stop with every text different within a replay; a source comment after every sentence naming a key the replay cites; no URL and no not-live line in the texts.
   - `validate-scan-response.test.ts`: "checks replay" uses the axios file as its base (the demo has more Stops than a Replay may have Steps); new case for the Step texts, the why text and the count, including a shipped file with one Step removed.
   - New `replay-view.test.tsx` (20 cases): the view and its parts, every Step's texts for both fixtures, Back and Next step, the Step cards, Exit replay and the breadcrumb, the grave opening nothing, the Why card, Terms and Escape, the waiting and error cards, the story model, axe at every Step, and "Play all" (never by itself, its name and live line, Enter and Space, 5,000 ms steps, restart from the last Step, stopping on Pause, a Step card, Back, Next step and Exit replay, Reduced motion, axe while playing).
   - `scrubber.test.tsx`: the seven Play cases moved to `replay-view.test.tsx` as "Play all" cases ("pauses on a slider move" became the Step card, Back and Next step case); "not on Home" and "not rendered with one Stop" stay.
   - `replay.test.tsx`: the second Replay is picked after Exit replay; the first Step is read from the Step panel; a grave press opens no Drawer; the banner cases became the Why card cases; the scrubber cases read the Step cards, the drawer half became the Step badge and the reason case reads "What Sexton shows"; Property 21 runs on the Why card alone, at 1000 runs.
   - `replay-header.test.tsx`: the two-times cases read the date badge; the two one-line-sources cases went with the banner.
   - `fit.test.tsx`: the Stop cards case became the Step cards case. `burst-rise.test.tsx`: moves by Step cards. `a11y.test.tsx`: `.scrub-play` leaves the focus list. `styles.test.ts`: `.step-card` takes the old `.scrub-play` check. `header.test.tsx`: its replay literal gains `steps` and `why`.
   - e2e: `smoke`, `time`, `fixes`, `judge` and `undead2` move a Replay by "Next step" or its Step cards and read the Why card; the Play case is "Play all" at 5,000 ms. `fixes.spec.ts` bug 1 now measures 45 px in at a 305 px cell, scaled with the cell, which the breadcrumb makes a little smaller (the Halo map over the cell is the same as before). Run locally: these pass but for the five cases already failing before this task (the demo-label overlap at four widths and the canvas top at 1440 by 900) and two in `smoke.spec.ts` that also fail before it (the evidence link names and the README replay picture's canvas top), which wait for task 12.

### Task 7: the Guide page, the Legend and the Tour

1. **The Claim registry.** `copy/claims.ts` holds each Claim as an id, its text and the README.md texts it rests on (a list, since most Claims rest on two facts; design C7 names one). Components take a Claim's text by id through `claim(id)`. The registry holds every Guide page sentence (the lead, the problem, the three steps, the five answers and the five State meanings, which the Legend shares), the three Tour steps and the scanning-off sentence, every fix-tab note that names a capability or a Reason family (the plan notes of 7.13 to 7.15, the no-safe-version note and the six Possessed notes), the Evidence tab's source note, the scanning card's "Asking npm, OSV and deps.dev", the first example's "pull requests work here" and the next step of the missing-package-json card. `fix-view.ts`, `Drawer.tsx`, `ScanningCard.tsx`, `examples.ts` and `scan-failure.ts` keep their exported names, now read from the registry. "No action needed.", "Nothing urgent", "Healthy" and the other fix-tab lines say nothing Sexton does and stay in `fix-view.ts`.
2. **README.md.** The three sentences of 18.7, approved at go, are added as plain facts: the sign-in and safe-bump sentences at the end of the "Remediation pull requests" item of "What Sexton does", the package.json sentence in "Limits" beside the public-repository line. Nothing else in README changes in this task. Claims rest on text outside "Try it in two minutes" where they can, since task 12.2 rewrites that section.
3. **Guide page wording.** The prototype's text, with these changes so each sentence rests on README: the pull request answer reads "Someone on your team reads it and decides whether to accept it." (README says Sexton proposes the fix; it does not say who merges); the sign-in answer keeps "never asks for your GitHub password" (README now says so); "works on our demo repo only" became "works only on a live scan of the demo repo, hsiddhu2/sexton-demo" (README and 7.13); "It runs inside your own GitHub" became "It runs in your own GitHub workflow", and "run sexton check on your own computer" gains "from a clone of Sexton" (README: not published to npm yet); "Every claim shows where it came from ... the npm registry, the OSV advisory database, or deps.dev" became "Every signal shows where it came from and when it was read: the npm registry, OSV, deps.dev or GitHub." (README's signal envelope and its four sources). `sexton check` and the demo repository name are set in the monospace stack. Step 2 drops the prototype's "The worst stand in front.": README says nothing about the order of the graves.
4. **The rendered-text check.** `test/claims.test.tsx` renders Home (Graveyard and List, with and without an API base), the example list, the Legend, the attack picker, the Tour at each step, the Guide page, the Drawer of every demo grave on each tab, the fix tab of every case of 7.3 to 7.15 for each kind of scan, the failure cards' texts and the scanning card. It reads visible text block by block (a closed disclosure's body and hidden parts left out), splits it into sentences, and fails on any sentence with a capability phrase that is neither a sentence of a Claim nor a listed label. Besides the labels of C7 it lists "package.json" (the diff's file name), a bare host name (a signal source link, shown by its host) and the ranges notice by pattern; a signal's value (`.signal-value`) is scan data and is skipped. Phrases match as whole words, so "Scanning" and "Reading" are not "scans" and "read"; the listed "Reading package.json and the lockfile" and "Read the two-minute guide first." still hold one.
5. **Grave pictures.** `scene/picture.ts` plans one still grave at the origin (reduced motion, no label, ring or glow), and `scene/draw.ts` gains `drawPicture`, which calls the Scene's own `drawGrave`. `scene/GravePicture.tsx` draws it into a small canvas, `role="img"` with the Form in words as its name, so the Legend's form words of spec cemetery-undead 10.3 stay for assistive technology. The ghost entry draws a Haunted cross with its ghost, the pennant an Alive stone with the pennant, the mound the Not-published form. The Legend draws its pictures only while open. Nothing in `scene/characters` changed.
6. **Legend.** Heading "What each grave means", then the five States with their meanings (from the registry), then "Ghost", "Pennant" and "Mound" with the words of 13.1, then the fix order line. Each entry is its picture, its badge or name, and its meaning, as in the prototype's list. The old SVG chips and their styles went. The panel is `min(380px, 100vw − 24px)` wide.
7. **Tour.** `tour/tour-steps.ts` holds the steps (target, title, text from the registry) and the scanning-off text; the Scan field's wrapper is the third target (`data-tour="scan"`). `Tour.tsx` draws a full-screen blocker, four dimming panels around the spotlight (one token at one opacity, as the Drawer's scrim; styles.css holds no colour with alpha), the gold spotlight edge and the card at `placeCard`'s place, measured again on resize and scroll. The card is `role="dialog"` with `aria-modal`; its primary button takes focus at each step, in an effect that runs after the Drawer's layout-effect focus return, so a Tour opened over a Drawer holds focus; Tab and Shift+Tab stay inside the card; when the Tour ends, focus goes to the header's Tour button. `placeCard` takes the card's measured height (190 px, the prototype's, before the first measure) and lies inside the viewport with its 12 px margin whenever the viewport is at least that height plus 24 px tall. A press on the blocker is cancelled at mousedown, so focus stays in the card, and the Tab trap listens on the document, so Tab from anywhere comes back to the card. Each step scrolls its target into view first (the Panel sits under the Scene in one column).
8. **Tests changed in task 7.**
   - `header.test.tsx`: the Legend case counts eight grave canvases, not eight SVGs; the form-words case reads each entry's name and its picture's accessible name, now with the three marks.
   - `a11y.test.tsx`: the Legend's ghost entry reads "one or more advisories" beside the name "Ghost", not "Ghost: one or more advisories".
   - `imports.test.ts`: the scanning card's line moved to `copy/claims.ts`, so the host-string exception moves with it: the bare word deps.dev, and no fetch, in that file only.
   - New: `claims.test.tsx` (Property 9: the README texts, the three 18.7 sentences, the sentence splitter, and the rendered-text check over every view above) and `guide-tour.test.tsx` (the Guide page's sections, Terms and Watch a real attack, axe on the Guide page; the Legend's entries, toggle, page flow and outside press; Property 8's second half for `placeCard`, its order of places and the dimming panels; the Tour's blocker, dimming, spotlight, card, focus over a Drawer, Tab inside the card, focus back, no API base, and Skip).
9. **Open: the order of the graves in README.** Requirement 13.3 fixes the Tour's first step as "Its shape tells you its health. The worst ones stand in the front row." and 13.1 fixes the Legend's line "Fix order: Possessed first, then Dead, Haunted, Restless. Then by advisory severity and reach." Both are true of main (triage order, R-UI-3, and the front Tier), but README.md does not say how the graves are ordered, and only the three sentences of 18.7 were approved for README. The Tour's step rests for now on README's "Each grave is one dependency. Its shape and colour show its state.", and the Legend line, which names no capability phrase, stays in `header/Legend.tsx`. One README sentence on the order (for example "The cemetery puts the graves to fix first in front: Possessed, then Dead, Haunted and Restless, then by advisory severity and reach.") needs the owner's approval; with it, the Tour step points at it and the Legend line moves into the registry. Task 12.2 rewrites README and is the place for it.

### Task 9: failed scans

1. **Which card.** A failed load shows the card of a Live scan while the screen state's Source is a repository, else the load card of 12.7. `liveFailureCard(error)` in `load/scan-failure.ts` reads only the LoadError's code, status and API code: a fetch-failed error with no status had no HTTP response and takes the network card; a fetch-failed error with a status goes through `failureCard`; any other code (too large, not JSON, not the scan format) came on a 2xx response and takes the generic card. Nothing of an error body but its checked code is read, and no part of the error (code, message, contract paths) is shown any more: the old error panel showed the load error's code, message and contract paths, which 12.4 now rules out for the card's text.
2. **Buttons.** `home/FailureCard.tsx` renders the sentence as a heading, the next step and the buttons, in the Scene card as a `role="alert"` overlay, as the scanning card is. "Try the demo repo" starts a Live scan of hsiddhu2/sexton-demo through `normaliseRepo` (so no host string is written in App); "Back to the sample" dispatches the demo Source and loads it even when the demo was the load that failed; "Try again" loads the shown Source again. The Live card's first button and the load card's first button are the gold one.
3. **Replay.** A refused Replay file shows the load card under the Replay's heading, with "Try again" (the same Replay) and "Back to the sample". A loaded file with no story, which the validator refuses first, shows the same card; the separate "This replay file has no story for its steps." alert of task 6 went.
4. **Tests changed in task 9.**
   - `app.test.tsx`: the rejected address and invalid-response cases read the load card and check that no error code or path shows; the error panel case became the card's heading and no `code` element.
   - `replay.test.tsx` and `replay-view.test.tsx`: a rejected replay value and a refused or storyless file read the load card.
   - `claims.test.tsx`: each card is now rendered with its buttons for the phrase scan.
   - New: `failure-cards.test.tsx` (16 cases: `liveFailureCard` over status and code; the Live card for a network error, 429 with the WAF body, 429 before a body code missing-package-json, 503, 504 before a body code invalid-url, 502 with code fetch-failed, 404 missing-package-json, 413 manifest-too-large, 422 invalid-policy and a 500 body that is not JSON, each with its two buttons and no text of the body on the page or in the console; Try the demo repo; Back to the sample; the load card for a failed Sample scan with Try again, for a scan file, and for a refused Replay with Try again and Back to the sample).

### Task 10: the Music slot

1. **The slot.** `music/track.ts` holds `Track` (file, title, artist, licence, source, bpm) and `TRACK = null`, with `creditLine` ("Music: “<title>” by <artist>, <licence>.") and `beatMs` (60,000 / bpm, or none for a tempo that is not a positive number). No audio file ships and the candidate track is not touched; a test checks that public/ holds no audio file while the slot is empty.
2. **The switch.** `music/use-music.ts` starts off, makes one audio element on the first turn-on (through a `make` seam the tests replace), sets it to loop and plays it; off pauses it; a refused play turns Music off again; it pauses on unmount. Its `beat` is given only while on. App renders the Music button (between Legend and Tour, `aria-pressed`) only when `TRACK` is set, and passes the beat to the Scene on Home and on a Replay.
3. **The beat.** `scene/motion.ts` gains `poseStepMs(beat)`, `poseClock(nowMs, beat, reducedMotion)` (one step per half beat with a beat, one per FRAME_MS without, null under Reduced motion) and an optional beat on `poseAt`. `planScene` puts the beat on the plan only when one is given and motion is allowed, so plans without music are unchanged; `drawGrave`'s Pose and the Scene's repaint timer follow it. The bats keep their own flap. Nothing in `scene/characters` changed.
4. **The credit.** The site footer shows the credit line, with "Source" as a link only for an https address. README's credit line waits for the track; a test checks README holds the credit and source once `TRACK` is set, and no credit line while it is empty.
5. **The CSP.** `cspPlugin(raw, track = TRACK)` adds `media-src 'self'` only with a track. vite.config.ts imports the slot from src, so the build follows it.
6. **Tests changed in task 10.** `vite-csp.test.ts`: its helper takes the track, and one case is added. New: `music.test.tsx` (11 cases: the empty slot and no audio file, no Music button or audio element on the page, the README credit, the button with a track and its order and aria-pressed, the footer credit and its https rule, useMusic's first turn-on, loop, beat, off and reuse, a refused play, the tempo, the Pose clock property, the beat on the plan, and the repaint every half beat); `vite-csp.test.ts` gains the conditional media-src case.
