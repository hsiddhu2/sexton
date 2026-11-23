---
inclusion: fileMatch
fileMatchPattern: ["packages/web/**/*.ts", "packages/web/**/*.tsx", "packages/web/**/*.css"]
---
# Cemetery rules

- Grave form encodes state, nothing else: upright stone for Alive and Restless, cross for Haunted, cracked tilted stone for Dead, open grave for Possessed. Colour follows state.
- A ghost above a grave means one or more advisories. Nothing else is a ghost.
- No continuous visual encodings. No tombstone height, no opacity scales. Categorical only.
- Order graves by triage: Possessed first, then state from least healthy to most healthy (Dead, Haunted, Restless, Alive), then advisory severity, then transitive reach, then name.
- Readable without the legend. If a first-time viewer cannot tell which grave to fix first, the encoding is wrong.
- WCAG 2.1 AA contrast. Every grave reachable by keyboard. prefers-reduced-motion respected.
- 300 graves without visible lag. Canvas or WebGL for the scene, DOM for the drawer.
- The scene is a 2D canvas (scene/Scene.tsx). Grave buttons in overlay/GraveButtons.tsx give keyboard focus and aria-labels.
- Web imports only types from @sexton/api.
- Web fetches only addresses that pass checkScanUrl in load/use-scan-loader.ts: a scan file on the page's own origin (the demo is /demo/scan.json) or the API base from load/api-base.ts. The API base is a same-origin path such as /api or an https URL.
- The drawer opens a pull request with POST to the API base plus /remediate. The body is { repo, package }. Show the button only for a hosted scan whose response has actions.remediate true.
- The header links the evidence pack as JSON and Markdown downloads.
- ESLint bans dangerouslySetInnerHTML, innerHTML, outerHTML, insertAdjacentHTML and node: imports in packages/web/src. Render scan text as text only.
- Scenery is seeded (scene/scenery-seed.ts). No Math.random. Stars and grass depend on the scene width only, never on the scan.
- The Shadow under a grave and the Stone texture are decoration, the same for every grave of a State. They use fixed alpha bytes from scene/palette.ts. No opacity scales.
- The Evidence tooltip is DOM, not canvas: role="tooltip", shown on grave hover and on keyboard focus, dismissed by Escape. It has pointer-events none, sits inside its own Cell, and is not shown while the drawer is open.
- The PR preview parses with drawer/markdown.ts, which handles exactly what the engine's pr-body.ts emits. A link is made only for an https:// address, with target="_blank" and rel="noopener noreferrer". Output is React elements only.
- The Result area (the outcome of opening a pull request) sits outside the scrolling drawer body, so it stays in view.
- The header is not inert while the drawer is open. Only the scene is. A press on the Repository URL box closes the drawer and focuses the box.
- The scene is full-bleed: no horizontal padding on main.
- At 360 px there is no horizontal scroll, with the drawer closed, open or the legend open. Below 512 px the drawer is full width.
- Every colour is a token in scene/palette.ts. A new token joins the contrast tests. styles.css holds no colour literal. The palette is night-only.
- The scan time is shown in a <time> element with a machine-readable dateTime.
