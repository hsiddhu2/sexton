# Implementation Plan: home-page

## Overview

The product home page at `/`, the Cemetery view's new addresses with the old ones forwarded, the browser scan cache, Recent scans and one Top bar on every page with the tabs "Overview" and "Cemetery". Paths are relative to the repository root. No test touches the network.

Run-time notes:

- Change only `packages/web`, README.md, `docs/JUDGES.md` (its two replay links), `docs/cemetery.png`, `docs/replay-axios.png`, `docs/replay-keyv.png`, `docs/requirements.md`, `.kiro/steering/web.md`, `.kiro/steering/product.md`, `.kiro/steering/structure.md`, the glossary and requirements 1.1, 1.3 and 15.1 of `.kiro/specs/clean-site/requirements.md` and this folder. No engine, API or infra change. CloudFront already answers an unknown path with index.html (its 403 and 404 error responses), so `/cemetery` and `/scan` need nothing new.
- No new package dependency.
- `numRuns` is 100 for every new property, 1000 for Properties 1 and 5, tagged `Feature: home-page, Property N: <title>`.
- Gates before every commit: `npm run typecheck`, `npm run lint` and `npm test` at the root, zero warnings, the full Playwright suite in fresh profiles with the 300-grave repaint check, then an independent review. Check `git branch --show-current` before every commit. Commits carry no trailer.

## Tasks

- [x] 1. Routes and addresses
  - _Requirements: 1.1 to 1.10, 12.1 to 12.4, 15.1_
  - [x] 1.1 Add `site/route.ts` (`routeOf`) and `site/paths.ts` (`cemeteryPath`) with Property 1
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6_
  - [x] 1.2 Write a Live scan's `repo` as owner/name and read a github.com link as its owner/name in `load/view-address.ts`. Build history URLs on `cemeteryPath` in `load/page-history.ts`. Extend Property 2
    - _Requirements: 1.7, 1.8_
  - [x] 1.3 Add `site/Root.tsx`: the Route, forwarding with `replaceState`, `navigate` with `pushState`, popstate, the title, the palette. Mount it from `main.tsx`
    - _Requirements: 1.4, 1.5, 1.6, 1.9, 1.10, 15.1_
  - [x] 1.4 Point the wordmark at `/` through `navigate` in both Routes, named "Sexton, home page". Keep the Cemetery view's Home action for its breadcrumbs and Escape
    - _Requirements: 12.1, 12.2, 12.3, 12.4_

- [x] 2. The scan cache and Recent scans
  - _Requirements: 13.1 to 13.11, 14.1 to 14.5_
  - [x] 2.1 Add `cache/scan-cache.ts` (pure) with Properties 3, 4 and 5
    - _Requirements: 13.1, 13.6, 13.7, 13.8, 13.10, 13.11_
  - [x] 2.2 Add `cache/scan-store.ts` (guarded localStorage) with tests for a throwing and a missing store
    - _Requirements: 13.9, 14.4_
  - [x] 2.3 Wire the cache into the App: a Fresh Entry shown with no request, saving a finished Live scan, `CachedLine` with "Scanned N min ago" and Rescan
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5_
  - [x] 2.4 Add `RecentScans` to the header example list, with Clear
    - _Requirements: 14.2, 14.3, 14.4, 14.5_

- [x] 3. The Home page
  - _Requirements: 2.1 to 2.4, 3.1 to 3.7, 4.1 to 4.3, 5.1, 5.2, 6.1, 6.2, 7.1, 7.2, 8.1 to 8.3, 9.1 to 9.3, 10.1, 10.2, 11.1 to 11.3, 14.1, 14.3, 14.5, 16.1 to 16.8_
  - [x] 3.1 Add the `home.*` Claims with README and spec texts. Let a Claim rest on a spec file. Add `copy/home.ts` with the labels
    - _Requirements: 11.1, 11.2_
  - [x] 3.2 Add `home-page/HomePage.tsx`, its header, hero with the Scan box and Recent scans, and every section in order, with `home-page/home-page.css`
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 3.1 to 3.7, 4.1, 4.2, 4.3, 5.1, 5.2, 6.1, 6.2, 7.1, 7.2, 9.1, 9.2, 9.3, 10.1, 10.2, 14.1, 14.3, 14.5, 16.1, 16.5, 16.8_
  - [x] 3.3 Add `home-page/video.ts` with `DEMO_VIDEO_URL = null` and the section that renders only with a URL
    - _Requirements: 8.1, 8.2, 8.3_
  - [x] 3.4 Extend the Claim check to the Home page (Property 6)
    - _Requirements: 11.3_

- [x] 4. Build, tags and documents
  - _Requirements: 1.11, 15.2, 15.3, 16.2, 17.1 to 17.3_
  - [x] 4.1 Add the `siteImages` plugin and the title, description, Open Graph and Twitter tags in index.html. Check the CSP is unchanged
    - _Requirements: 15.2, 15.3, 16.2_
  - [x] 4.2 Update README.md's links and "Try it in two minutes", the steering files and the change log
    - _Requirements: 1.11, 17.1, 17.2, 17.3_

- [x] 5. End-to-end tests
  - _Requirements: 1.4, 1.5, 1.9, 2.2, 3.3, 3.4, 12.1, 12.4, 13.2, 13.3, 13.4, 13.9, 14.1 to 14.4, 16.3, 16.4, 16.6_
  - [x] 5.1 Move the existing suite's cemetery `goto("/")` to `/cemetery`, owner/name `repo` values and the wordmark cases to `/`
    - _Requirements: 1.2, 1.7, 12.1_
  - [x] 5.2 Add `e2e/home.spec.ts`: sections, links, the Scan box, forwarding, the wordmark, the Scan box clearing, the cache with counted requests, Rescan, Recent scans and Clear, blocked storage, axe, phone width, screenshots
    - _Requirements: 1.4, 1.5, 1.9, 2.2, 3.3, 3.4, 12.1, 12.4, 13.2, 13.3, 13.4, 13.9, 14.1, 14.2, 14.3, 14.4, 16.3, 16.4, 16.6_

- [x] 6. Off-site links, the step 1 wording and the keyv picture
  - _Requirements: 2.5, 4.2, 5.1, 9.2, 15.3_
  - [x] 6.1 Add `home-page/OffSiteLink.tsx` and make every Off-site link of the Home page one, with a unit test that fails on any Off-site link without `target="_blank"` and `rel="noopener noreferrer"`
    - _Requirements: 2.5_
  - [x] 6.2 Reword the Claim `home.how.1` to say how the twelve signals relate to the seven product signals, resting on README.md
    - _Requirements: 5.1, 11.2_
  - [x] 6.3 Take docs/replay-keyv.png in `e2e/smoke.spec.ts`, serve and emit it with `siteImages`, show it on the keyv card, and label the 0.1 headstone "Now"
    - _Requirements: 4.2, 9.2, 15.3_

- [x] 7. The Top bar and the tabs
  - _Requirements: 2.1 to 2.4, 3.8, 12.4 to 12.12_
  - [x] 7.1 Add `header/SiteTabs.tsx` and put it after the wordmark in the Cemetery view's header, with "Cemetery" taking the Home action. Amend spec clean-site, the glossary's Home action and 1.1, 1.3 and 15.1
    - _Requirements: 12.5, 12.6, 12.7_
  - [x] 7.2 Make the Home page header the same `site-header`, with the tabs, GitHub and Try the demo, and drop the section links. Scope the Home page's link and focus styles to its main content and footer
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 12.8_
  - [x] 7.3 Fit the bar in the Wide, Middle and Narrow layouts: the scan tag capped at 12rem, the Middle layout's book glyph, padding and gaps, and the Narrow second row of tabs and Scan field. Measure each layout
    - _Requirements: 12.9, 12.10, 12.11_
  - [x] 7.4 Unit tests for the tabs' place, current mark and presses on both pages, and Playwright cases for equal bars on both pages, the fit at the three Wide sizes, the Middle layout at 700, 900 and 1099 px and the Narrow layout at 390 and 360 px
    - _Requirements: 2.1, 2.2, 12.4 to 12.11_
  - [x] 7.5 Retake docs/cemetery.png, docs/replay-axios.png and docs/replay-keyv.png in one run, and update README.md and .kiro/steering/web.md
    - _Requirements: 17.1, 17.2_
  - [x] 7.6 Give "GitHub" the bar's 36 px height, and give both Scan boxes the short hint "owner/name" in the Narrow layout, with unit tests for the hint and Playwright checks that it fits at 360 and 390 px and that every control in the Home page's bar is 36 px high
    - _Requirements: 3.8, 12.8, 12.12_
  - [x] 7.7 Add the sixth "Built with Kiro" card, "Headless CLI", as the Claim `home.kiro.card.cli` resting on README.md's line about the headless Kiro CLI run, with a unit test for the six cards
    - _Requirements: 7.1, 7.3, 11.1, 11.2_
