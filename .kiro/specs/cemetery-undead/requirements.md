# Requirements Document

## Introduction

cemetery-undead is Phase 1 of the "Night of the Living Deps" art pass, approved by the owner on 24 Nov 2026 at 03:41 from the mockups `private/design/mockup-night.html` (the cemetery) and `private/design/mockup-nightreplay.html` (the axios replay moment). It changes how the cemetery looks. It does not change what any grave means.

- **U1.** A Halloween night palette, with state colours chosen to stay apart for viewers with colour vision deficiency.
- **U2.** Self-hosted display and interface fonts.
- **U3.** Characters that act out each State: a dancing devil-costumed zombie for Possessed, a lounging skeleton for Dead, a clawing hand for Restless, a party-hat stone for Alive. The cross stays for Haunted, and a new original ghost marks advisories.
- **U4.** A deeper scene: graves recede in three depth tiers by urgency, with church and fence silhouettes, bats, fog, a lantern glow, a vignette and grain.
- **U5.** Epitaphs: "Here lies" and a short punchline that is true of the State's reason.
- **U6.** Serious mode, which hides the punchlines.
- **U7.** A header and a footer bar in the mockup's layout.

Phase 2 (sound, speech bubbles, the replay burst choreography and the burial priest) is a separate spec. The mockups show some Phase 2 items (speech bubbles, the replay stop cards). This spec does not build them.

This spec traces to R-UI-1 to R-UI-7 of docs/requirements.md section 5.8, to N-7 and N-9 of section 6, and to the cemetery-polish, cemetery-time and cemetery-time-fixes specs. It changes no state rule, no policy rule, no API field and no evidence field. The demo evidence digest stays c8fb6cab465d46ca92cf83dbc10022b6a662c8fad68ec8f64d827ef16f43344d.

R-UI-1 today says "upright stone for Alive and Restless". This spec gives Alive and Restless different forms. Requirement 13 asks the owner to amend R-UI-1 before the build starts (design.md "Open question for the owner").

Paths: this spec changes `packages/web`, the root `package-lock.json` (dev-only additions to `packages/web` devDependencies), `README.md`, `CREDITS.md` (new, repository root), `docs/cemetery.png`, `docs/replay-axios.png`, `.kiro/steering/web.md` and `.kiro/specs/cemetery-undead`, plus `docs/requirements.md` for the R-UI-1 amendment if the owner approves it. It changes nothing under `packages/engine`, `packages/api`, `packages/cli`, `packages/action`, `infra` or `.github`. It adds no runtime dependency and no request to another origin at run time. Every date this spec writes is 24 Nov 2026 (UTC) unless it is a fact from a source.

## Glossary

- **Web app**: the `@sexton/web` package.
- **Scene**: the 2D canvas of the cemetery (`scene/Scene.tsx`, `scene/draw.ts`).
- **State**: one of Possessed, Dead, Haunted, Restless, Alive, as computed by the Engine.
- **Form**: what a grave looks like for its State: the stone or cross, its Character and its Costume.
- **Character**: an animated figure that belongs to a Form: the Possessed zombie, the Dead skeleton, the Restless hand. Haunted and Alive have no Character.
- **Costume**: a drawn layer over a Character or a stone: the devil horns and cape, the onesie, the party hat and flowers.
- **Clip**: one named animation of a Character: dance, lounge, twitch.
- **Pose**: one frame of a Clip.
- **Atlas**: a PNG image under `packages/web/public/sprites` that holds the Poses of one Clip, with a JSON frame table.
- **Bake**: the dev-only script `packages/web/scripts/bake-sprites.mjs`, which renders CC0 models into Atlases.
- **Vector fallback**: Characters drawn as blocky vector shapes on the canvas in the mockup's style, used when the Bake does not work within its budget.
- **Frame rate**: 12 Poses a second for every Character.
- **Dancer**: a Dead grave whose skeleton breaks into the dance Clip on a seeded schedule.
- **Tier**: a depth band of the Scene. Front holds Possessed and Dead, middle holds Haunted and Restless, back holds Alive.
- **Tier scale**: the fixed size factor of a Tier: front 1, middle 0.8, back 0.64.
- **Ghost**: the original ghost art (rounded body, oval eyes, blush) drawn above a grave that has one or more advisories.
- **Lantern glow**: a warm radial light under the hovered or focused grave.
- **Backdrop**: the sky, moon, church, fence, fog, ground, vignette and grain.
- **Backdrop stops**: the list of colours a grave can sit on, as returned by `backdropStops`.
- **Glow stops**: the Lantern glow and the Possessed glow composited over the tokens under a grave, as returned by `glowStops`.
- **Epitaph**: the line "Here lies <name> <version>" and its Punchline.
- **Punchline**: one short sentence from the Epitaph table in design.md, chosen by State and by the family of the state reason.
- **Reason family**: the state reason with its version numbers and month counts removed, for example "provenance regression" or "install script added".
- **Serious mode**: a header toggle that hides every Punchline.
- **Footer bar**: the bar at the bottom of the page that holds Play, the History date slider and "Replay an attack".
- **Canvas top**: the y of the top edge of the scene canvas in CSS pixels, from the top of the viewport.
- **Reduced motion**: the `prefers-reduced-motion: reduce` media query.
- **Visual critic**: a review subagent that sees only screenshots, the mockup screenshots and the design guidance, never the code.
- **Deliberate test change**: a change to an existing test that design.md lists because the test pins a value this spec changes on purpose.

## Requirements

### Requirement 1: The night palette

**User Story:** As a viewer, I want a Halloween night with state colours that stand apart, so that I can tell the states apart at a glance, with or without colour vision deficiency.

**Traces to:** U1; R-UI-1; R-UI-7

#### Acceptance Criteria

1. THE Web app SHALL use the state colours Alive #8fe3d0, Restless #e69f00, Haunted #56b4e9, Dead #bfb8ad and Possessed #cc79a7. A shade SHALL change, within its hue family, only when a check of this requirement fails, and design.md SHALL record the failing check.
2. THE Web app SHALL draw a sky from #0e0b1a through purple to the horizon, an orange harvest moon, and ground in deep violet, all from tokens in `scene/palette.ts`.
3. THE Web app SHALL keep every colour as a token in `scene/palette.ts`, and `styles.css` SHALL hold no colour literal.
4. FOR ALL State colours and ALL Backdrop stops and Glow stops, THE contrast ratio SHALL be at least 3:1. The Glow stops are the Lantern glow and the Possessed glow composited over the ground, fog, grass and page tokens they can sit on (`glowStops` in `scene/palette.ts`). A grave SHALL have at most one glow at a time.
5. FOR ALL State colours, THE contrast ratio of the ink token on the State colour SHALL be at least 4.5:1.
6. THE text token on the surface token and on the field token SHALL have a contrast ratio of at least 4.5:1, and so SHALL the muted token.
7. FOR each of protanopia, deuteranopia and tritanopia, simulated with the fixed matrices of design.md "Colour vision check", THE CIEDE2000 difference between every pair of the five State colours SHALL be at least 8.

### Requirement 2: Self-hosted fonts

**User Story:** As a viewer, I want the cemetery lettering to look carved, so that the scene reads as a churchyard, with no request to another origin.

**Traces to:** U2; N-7; security-rules.md "The web app calls only our own API"

#### Acceptance Criteria

1. THE Web app SHALL serve Pirata One, IM Fell English SC, IM Fell English italic and Instrument Sans as WOFF2 files under `packages/web/public/fonts`, each family with its SIL Open Font License file beside it.
2. THE Web app SHALL use Pirata One for the Sexton wordmark, IM Fell English SC for grave names and the "Here lies" names, IM Fell English italic for Punchlines, and Instrument Sans for every other interface text.
3. THE built page SHALL make no request to another origin for a font, and the Content Security Policy SHALL keep `font-src 'self'`.
4. WHEN a font has not loaded, THE Web app SHALL draw with the fallback family of design.md "Type" and SHALL repaint the Scene once the fonts have loaded.

### Requirement 3: Each State acts out its meaning

**User Story:** As a first-time viewer, I want each grave to show what its State means, so that I can read the cemetery without the legend.

**Traces to:** U3; R-UI-1; R-UI-5

#### Acceptance Criteria

1. THE Possessed Form SHALL be an open grave with its lid flung aside, a pink glow, and a zombie in a devil costume (horns, cape, red eyes) dancing out of it.
2. THE Dead Form SHALL be a cracked tilted stone with a skeleton in a onesie lounging on it.
3. THE Restless Form SHALL be a tilted stone with a zombie hand clawing out of the dirt in front of it, twitching.
4. THE Haunted Form SHALL be the cross.
5. THE Alive Form SHALL be a rounded stone with a party hat and flowers, with no Character and no motion.
6. THE Ghost SHALL be drawn above a grave if and only if the grave has one or more advisories, as before. THE Ghost SHALL be original art, and THE Web app SHALL never draw or embed the Kiro logo.
7. THE Form SHALL depend on the State only. Two graves of the same State SHALL have the same Form, Character and Costume. Only the Dancer schedule and the animation phase differ between them.
8. THE Not-published form (an unmarked mound) and the pull request marker (a pennant) SHALL stay as defined by cemetery-time, with no Character and no Costume on the mound.
9. THE Character source SHALL be either the Atlases made by the Bake from the CC0 models named in design.md "Characters", or the Vector fallback. design.md records which one was used and why.

### Requirement 4: Character motion

**User Story:** As a viewer, I want the characters to move a little, so that the cemetery feels alive, and as a viewer who prefers less motion, I want them still.

**Traces to:** U3, U4; R-UI-6; web.md "prefers-reduced-motion respected"

#### Acceptance Criteria

1. WHILE Reduced motion does not apply, THE Web app SHALL advance every Character's Pose at the Frame rate of 12 Poses a second.
2. WHILE Reduced motion applies, THE Web app SHALL draw every Character in one fixed still Pose and SHALL not advance any Pose.
3. FOR ALL Dead graves, THE Web app SHALL choose the Dancers and their dance windows from a seed derived from the package name only, with no `Math.random`, so that the same name gives the same schedule on every load.
4. THE Dancer share SHALL be one Dead grave in five, rounded down, with at least one Dancer when at least one Dead grave exists. Each Dancer SHALL dance for 2 seconds in every 12 seconds, at an offset taken from its seed.
5. THE Possessed Character SHALL play its dance Clip, the Restless hand its twitch Clip, the Dead skeleton its lounge Clip outside a dance window, and the dance Clip inside it.
6. WHEN the page is hidden, THE Web app SHALL stop advancing Poses until it is visible again.

### Requirement 5: Depth tiers by urgency

**User Story:** As a reviewer, I want the most urgent graves at the front, so that I see what to fix first.

**Traces to:** U4; R-UI-3; R-UI-5

#### Acceptance Criteria

1. THE Scene SHALL place the graves in three Tiers by their State at the scan date: Possessed and Dead in the front Tier, Haunted and Restless in the middle Tier, Alive in the back Tier.
2. THE back Tier SHALL be drawn highest on the screen and first, the middle Tier below it, and the front Tier lowest and last.
3. THE Tier scale SHALL be 1 for the front Tier, 0.8 for the middle Tier and 0.64 for the back Tier. These are three fixed values, not a continuous encoding.
4. WITHIN a Tier, THE graves SHALL keep triage order from left to right and then row by row.
5. THE grave buttons SHALL keep triage order in the DOM and in the keyboard order, and their accessible names SHALL not change.
6. FOR ALL package lists of up to 300 packages and ALL widths (a width below the minimum Scene width of 224 is laid out at 224), THE grave rectangles SHALL not overlap, SHALL lie inside the Scene, and SHALL keep the Tier of their scan-date State whatever date the scrubber shows.
7. THE Not-published form SHALL keep the position of the package's scan-date Tier.

### Requirement 6: The night backdrop

**User Story:** As a viewer, I want a churchyard at night, so that the scene feels like the mockup.

**Traces to:** U4; web.md scenery rules

#### Acceptance Criteria

1. THE Backdrop SHALL hold a church silhouette, a fence silhouette, bats, fog, a vignette and a grain tile, and SHALL keep the moon and the stars.
2. THE positions of the church, the fence, the bats, the stars and the grass SHALL depend on the Scene width only, from the seeded generator in `scene/scenery-seed.ts`, never on the scan.
3. THE grain tile SHALL be generated once from a fixed seed, and no part of the Backdrop SHALL use `Math.random`.
4. WHEN a grave is hovered or holds keyboard focus, THE Scene SHALL draw the Lantern glow under it. Only one grave SHALL have the Lantern glow at a time.
5. WHILE Reduced motion applies, THE bats SHALL hold still.
6. WHEN the Scene repaints 300 graves, THE median of 30 repaints SHALL stay at or below 16 ms, before and after a scrubber move.

### Requirement 7: Epitaphs

**User Story:** As a viewer, I want each grave to have a short epitaph, so that the cemetery is fun to explore and still tells the truth.

**Traces to:** U5; R-UI-4

#### Acceptance Criteria

1. THE grave tooltip and the drawer SHALL show the line "Here lies <name> <version>", where the version is the one shown at the chosen date. THE tooltip SHALL be 240 CSS pixels wide, anchored at its grave's cell and kept inside the Scene. It MAY extend past a scaled cell, and it keeps `pointer-events: none`.
2. WHERE Serious mode is off, THE tooltip and the drawer SHALL show the state reason and one Punchline below it.
3. THE Punchline SHALL be chosen from the Epitaph table of design.md by the State and the Reason family. Every Punchline in the table SHALL be true of its reason.
4. IF the Reason family is not in the Epitaph table, THEN THE Web app SHALL show the state reason with no Punchline.
5. THE Not-published form SHALL show "Not yet published on this date" and no Punchline.
6. FOR ALL packages, THE Punchline SHALL depend on the State and the Reason family only: the function that chooses it SHALL take no package name. No Punchline SHALL name a person or a project.
7. THE Punchline SHALL be rendered as text only.

### Requirement 8: Serious mode

**User Story:** As a security engineer showing this to my team, I want to turn off the jokes, so that the screen reads as a report.

**Traces to:** U6; R-UI-7

#### Acceptance Criteria

1. THE header SHALL hold a native toggle button named "Serious mode" with `aria-pressed`, off by default.
2. WHEN Serious mode is on, THE Web app SHALL hide every Punchline and SHALL keep the state reason, the Characters and the Forms.
3. THE Web app SHALL remember the choice per browser in `localStorage` under the key `sexton:serious` with the value "on" or "off".
4. IF reading or writing `localStorage` throws, or the stored value is anything other than "on" or "off", THEN THE Web app SHALL treat Serious mode as off and SHALL keep working.

### Requirement 9: Header and footer bar

**User Story:** As a reviewer, I want the controls out of the way, so that the cemetery fills the screen.

**Traces to:** U7; R-UI-7; cemetery-time-fixes requirement 7

#### Acceptance Criteria

1. THE header SHALL hold, in this DOM order: the wordmark, the repository and scan line with the as-of line and Back to now when shown, the evidence links, the Repository URL form, the Sound button, the Serious mode toggle, and the Legend.
2. THE Sound button SHALL be a native button named "Sound off", disabled, with the description "Sound arrives in the next release" reachable by assistive technology.
3. THE Footer bar SHALL hold, in this DOM order: Play, the History date label, the date text and slider, and the "Replay an attack" group. THE Footer bar SHALL come after the Scene in the DOM.
4. THE Footer bar SHALL stay in view at the bottom of the viewport, and THE Scene's free height SHALL leave room for it so that the ground still reaches the Footer bar.
5. WHEN the demo scan is shown at the Scan date at a viewport of 1440 by 900, THE Canvas top SHALL be at 190 or less.
6. WHILE the viewport is 390 CSS pixels wide, and also at 360, THE Web app SHALL cause no horizontal scroll with the demo and with the axios replay.
7. THE keyboard order SHALL follow the DOM: Back to now when shown, the evidence links, Repository URL, Scan, Serious mode, Legend, the banner links of a replay, the roving grave, Play, History date, then the two Replay buttons.
8. THE replay banner, the omitted history line and the scrubber captions of cemetery-time and cemetery-time-fixes SHALL keep working in the new layout.

### Requirement 10: Everything that works today keeps working

**User Story:** As a maintainer, I want the art pass to change only the look, so that no feature breaks.

**Traces to:** R-UI-2, R-UI-3, R-UI-4, R-UI-6, R-UI-7

#### Acceptance Criteria

1. THE keyboard overlay, the tooltip, the drawer, the focus trap, the scrubber, Play, the replays, the burial animation, the pull request marker, the remediate button and the evidence links SHALL keep their behaviour and their accessible names, except the changes that design.md "Deliberate test changes" lists.
2. THE burial animation SHALL move the Character with its stone, and SHALL play no burial under Reduced motion, as before.
3. THE Legend SHALL describe each Form in words and SHALL show one chip per Form, per Ghost, per Not-published mound and per pennant.
4. THE axe check SHALL report no violation on the demo, with the drawer open, with the legend open and while playing.

### Requirement 11: Assets and credits

**User Story:** As a maintainer, I want every asset's licence on record, so that the project can ship them.

**Traces to:** N-7; N-9

#### Acceptance Criteria

1. THE repository SHALL hold `CREDITS.md` at the root, naming each model pack with its link and its CC0 licence, and each font family with its link and the SIL Open Font License 1.1.
2. THE repository SHALL commit the Atlases and their frame tables, and SHALL commit a source model only when its licence page says CC0.
3. THE Bake SHALL be a dev-only script. Any package it needs SHALL be a devDependency of `@sexton/web`, and THE Web app SHALL add no runtime dependency.
4. THE built bundle SHALL hold no model file and no bake code.

### Requirement 12: Screenshots, README and steering

**User Story:** As a reviewer reading the README, I want the pictures to show the new cemetery, so that what I read matches what I open.

**Traces to:** N-9

#### Acceptance Criteria

1. THE end-to-end smoke test SHALL rewrite `docs/cemetery.png` and `docs/replay-axios.png` at 1440 by 900 with Reduced motion on, as defined by cemetery-time-fixes requirement 9.
2. THE README SHALL hold, on the line under the cemetery screenshot, "Characters: CC0 models by Quaternius, see CREDITS.md. The ghost is original art." When the Vector fallback is used, the line SHALL instead read "Characters are original vector art. The ghost is original art.", and CREDITS.md SHALL list the fonts only.
3. THE `.kiro/steering/web.md` file SHALL describe the new Forms (following the R-UI-1 decision of requirement 13), the Tiers, the palette, the fonts, the motion rules, the Epitaphs and Serious mode. It SHALL rewrite these rules, which this spec changes: "upright stone for Alive and Restless" (grave forms), the Evidence tooltip "sits inside its own Cell", the replay "header buttons", the Play control "after the date text and before the slider", and "At 960 px and wider the form and the Replay group share one row". It SHALL keep every other rule and the front matter.

### Requirement 13: The product requirement for grave forms

**User Story:** As the owner, I want the product requirements to match the cemetery, so that the write-up and the code agree.

**Traces to:** R-UI-1; docs/requirements.md change policy

#### Acceptance Criteria

1. THE build SHALL not start until the owner has decided the R-UI-1 amendment in design.md "Open question for the owner".
2. WHERE the owner approves the amendment, THE spec tasks SHALL change R-UI-1 to the text in design.md and SHALL add a change log line "0.5, 24 Nov 2026" to docs/requirements.md.

### Requirement 14: The screenshot loop

**User Story:** As the owner, I want the result to match the mockup, so that the approved art direction is what ships.

**Traces to:** U1 to U7; the handoff "How to build it: the screenshot loop"

#### Acceptance Criteria

1. AFTER every visual change, THE Orchestrator SHALL take screenshots of the demo and of the axios replay at 1440 by 900 and at 390 by 844, and compare them with the mockup screenshots in `private/design/shots`.
2. THE Visual critic SHALL answer READY or list what is off. THE Orchestrator SHALL fix and repeat until the Visual critic answers READY at both sizes.
3. THE Orchestrator SHALL record the findings of each round in tasks.md notes in plain words.

### Requirement 15: Invariants and scope

**User Story:** As a maintainer, I want the art pass to change nothing else, so that the review stays about the look.

**Traces to:** tech.md rules; decisions of earlier specs

#### Acceptance Criteria

1. THE spec tasks SHALL change only the paths listed in the Introduction.
2. THE spec tasks SHALL add no runtime dependency and no request to another origin at run time.
3. THE spec tasks SHALL keep the 16 ms budget, skip no test, lower no `numRuns` and weaken no check, and SHALL change an existing test only as design.md "Deliberate test changes" lists.
4. WHEN the gates run on the final tree, THE root `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:e2e -w @sexton/web` and the fresh-clone run SHALL exit with code 0.
5. THE last sub-task of each top-level task SHALL run an independent code review on that task's changed files and SHALL fix every defect it reports in the same task.
