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
