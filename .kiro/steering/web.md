---
inclusion: fileMatch
fileMatchPattern: ["packages/web/**/*.ts", "packages/web/**/*.tsx", "packages/web/**/*.css"]
---
# Cemetery rules

- Grave form encodes state, nothing else: upright stone for Alive and Restless, cross for Haunted, cracked tilted stone for Dead, open grave for Possessed. Colour follows state.
- A ghost above a grave means one or more advisories. Nothing else is a ghost.
- No continuous visual encodings. No tombstone height, no opacity scales. Categorical only.
- Order graves by triage: Possessed first, then advisory severity, then transitive reach.
- Readable without the legend. If a first-time viewer cannot tell which grave to fix first, the encoding is wrong.
- WCAG 2.1 AA contrast. Every grave reachable by keyboard. prefers-reduced-motion respected.
- 300 graves without visible lag. Canvas or WebGL for the scene, DOM for the drawer.
