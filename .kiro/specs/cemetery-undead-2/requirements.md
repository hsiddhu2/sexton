# Requirements Document

## Introduction

cemetery-undead-2 is Phase 2 of the "Night of the Living Deps" art pass. Phase 1 (cemetery-undead) merged to main at b513514 on 25 Nov 2026. The visual target is still the cemetery and the replay as cemetery-undead set them.

It has two parts:

- **Part A** carries over the owner's review of Phase 1 (25 Nov 2026):
  - A1. Name labels stay readable.
  - A2. The replay header labels its two times.
  - A3. The Possessed glow reads strong, and the contrast check still passes.
  - A4. The pit edge colour stands apart from the selection ring.
  - A5. The middle and back rows spread wider.
  - A6. The replay story card puts its sources on one line.
  - A7. The fresh-clone run that the cemetery-undead fix round skipped.
  - A8. The footer height hook watches every footer node.
- **Part B** is Phase 2:
  - B1. Sound, made in code, off by default.
  - B2. Speech bubbles.
  - B3. The replay burst.
  - B4. The burial priest.
  - B5. The rise clip and the load moment.

This spec traces to R-UI-1 to R-UI-8 of docs/requirements.md section 5.8, to N-7 and N-9 of section 6, and to the cemetery-time, cemetery-time-fixes and cemetery-undead specs. It changes no state rule, no policy rule, no API field and no evidence field. The demo evidence digest stays c8fb6cab465d46ca92cf83dbc10022b6a662c8fad68ec8f64d827ef16f43344d.

Sound and speech bubbles were not in docs/requirements.md. The owner approved R-UI-8 on 25 Nov 2026 (design.md "The owner's decisions").

Paths: this spec changes `packages/web`, `README.md`, `CREDITS.md`, `docs/cemetery.png`, `docs/replay-axios.png`, `.kiro/steering/web.md`, `docs/requirements.md` and `.kiro/specs/cemetery-undead-2`. It changes nothing under `packages/engine`, `packages/api`, `packages/cli`, `packages/action`, `infra` or `.github`, and no `package.json` or `package-lock.json`. It adds no runtime dependency, no audio file and no request to another origin at run time. Every date this spec writes is 25 Nov 2026 (UTC) unless it is a fact from a source.

## Glossary

- **Web app**: the `@sexton/web` package.
- **Scene**: the 2D canvas of the cemetery (`scene/Scene.tsx`, `scene/draw.ts`).
- **State**, **Form**, **Character**, **Costume**, **Clip**, **Pose**, **Tier**, **Ghost**, **Lantern glow**, **Glow stops**, **Punchline**, **Reason family**, **Serious mode**, **Footer bar**, **Canvas top**, **Reduced motion**, **Visual critic**, **Deliberate test change**: as in the cemetery-undead glossary.
- **Name label**: the tag under a grave that holds its name: the plinth rectangle of the cell geometry, scaled to the grave's cell.
- **Art box**: the rectangle, in cell units, that holds everything one grave draws except its glow: the stone, the lid, the mound, the Character, the Costume, the Ghost with its drift, the pennant, the priest and the burst particles.
- **Form box**: the smaller rectangle, in cell units, that holds everything one Form draws, measured from the drawing. Every Form box lies inside the Art box.
- **Halo**: the strong part of the Possessed glow, drawn only where nothing a contrast check covers can sit on it (requirement 3).
- **Sound**: the audio of the Web app, made at run time with the Web Audio API.
- **Voice**: one named sound: the wind bed, the sting, the thud, the bell or the ghost call.
- **Master gain**: the one gain node every Voice passes through.
- **Bubble**: a speech bubble over the Scene with one line from the Bubble table.
- **Bubble table**: the fixed table of lines in design.md, keyed by State and Reason family.
- **Bubble slot**: one 6,000 ms period of the Bubble schedule.
- **Burst**: the one-time animation of a replay's grave when the replay reaches its Possessed Stop.
- **Burst Stop**: the first Stop of a replay at which its grave's Form is Possessed.
- **Rise clip**: the shared animation of a grave or a Character rising out of the ground.
- **Load moment**: the rise of every grave on the first scan shown after a page load.
- **Priest**: original vector art of a priest in the blocky style, drawn during a burial.
- **Vigil**: under Reduced motion, the burial's duration with the Priest standing still and no stone motion.

## Requirements

### Requirement 1: Name labels stay readable

**User Story:** As a viewer, I want to read every grave's name, so that I know which package each grave is.

**Traces to:** A1; R-UI-5; R-UI-7

#### Acceptance Criteria

1. FOR ALL package lists of up to 300 packages, ALL widths, ALL fit heights and ALL Forms at a chosen date, THE Art box of one grave, scaled to its cell, SHALL not intersect the Name label of any other grave.
2. THE Art box of every Form SHALL lie inside the vertical band of its own cell, and SHALL reach at most 40 cell units past either side of its cell.
3. THE Bubbles SHALL not intersect any Name label (requirement 7.4).
4. WHEN the demo is shown at 1440 by 900 and at 390 by 844, THE drawn pixels of each Ghost SHALL not overlap any Name label rectangle on screen.

### Requirement 2: The replay header labels its two times

**User Story:** As a reviewer watching a replay, I want to know which time is which, so that I do not mistake the window end for the moment shown.

**Traces to:** A2; R-UI-4

#### Acceptance Criteria

1. WHILE a replay is shown, THE header SHALL show the scan time as "Window ends <scan time>".
2. WHILE a replay is shown and the chosen date is before the scan time, THE header SHALL show the chosen date as "Showing <chosen date>" in place of "as of <chosen date>", followed by Back to now.
3. THE header SHALL keep both times in `<time>` elements with a machine-readable `dateTime`, taken from the replay response and its Stops, not from fixed text.
4. WHILE a scan that is not a replay is shown, THE header SHALL keep its existing time and "as of" text.

### Requirement 3: A strong Possessed glow that keeps the contrast check

**User Story:** As a viewer, I want the Possessed grave to glow strong and pink, so that the most urgent grave draws the eye.

**Traces to:** A3; R-UI-7; cemetery-undead requirement 1.4

#### Acceptance Criteria

1. THE Scene SHALL draw a Halo around each Possessed grave, stronger than the existing Possessed glow, in the Possessed state colour, except on a grave that holds the Lantern glow: a grave has at most one glow, and the Halo counts as part of the Possessed glow.
2. THE Halo SHALL be drawn only outside every grave's Form box (the part of its Art box its shown Form uses) and Name label, outside the cells of the selected grave and of the hovered or focused grave, and outside the Art box of a grave whose burial, Vigil or Burst plays, so that no state colour, Name label, stone, Character, selection ring, focus outline or canvas text sits on it. The Bubbles and the burst caption are DOM with an opaque token background, so their text never sits on it either.
3. THE existing glow contrast check SHALL pass unedited, and THE Possessed glow inside the Art box SHALL keep GLOW_ALPHA_BYTE.
4. FOR ALL plans, THE region the Halo paints SHALL not intersect any of the regions of 3.2.
5. THE design document SHALL record the method.

### Requirement 4: The pit edge stands apart from the selection ring

**User Story:** As a keyboard user, I want the selection ring to be the only gold outline near a grave, so that I can tell which grave is selected.

**Traces to:** A4; R-UI-7

#### Acceptance Criteria

1. THE pit edge SHALL be drawn in an existing palette token, named in design.md with the reason.
2. THE CIEDE2000 difference between the pit edge colour and the ring colour SHALL be at least 20.

### Requirement 5: Wider middle and back rows

**User Story:** As a viewer, I want the rows to fill the cemetery, so that the scene looks full.

**Traces to:** A5; R-UI-1

#### Acceptance Criteria

1. THE middle and back Tier rows SHALL spread up to the front Tier pitch: PITCH_CAP middle 1.334 and back 1.667, so that floor(cell width × cap) is 205 px in every Tier, and a middle or back row with no more graves than a full front row lines up with the front columns.
2. THE layout SHALL keep cemetery-undead Property 1 (`test/tiers.test.ts`) and Property 7 (`test/fit.test.tsx`) passing unedited, and requirement 1.1 of this spec. The independent Tier model in `test/layout.test.ts` changes under Deliberate test change 5. (The decisions say "Properties 6 and 7"; Property 6 of cemetery-undead is the contrast property, so the layout pair is 1 and 7.)

### Requirement 6: The replay story card

**User Story:** As a reviewer, I want the sources in one tidy line, so that the card reads cleanly.

**Traces to:** A6; cemetery-undead requirement 9.8

#### Acceptance Criteria

1. THE replay story card SHALL show its sources on one line as "Sources:" followed by every source, separated by commas, wrapping only when the card is too narrow.
2. THE banner text, the title, the summary, the date and the scrubber captions SHALL stay.
3. THE replay story card SHALL make a source a link only for an https:// address, with `target="_blank"` and `rel="noopener noreferrer"`, and SHALL show any other source as text, as before.

### Requirement 7: Speech bubbles

**User Story:** As a viewer, I want the undead to say something now and then, so that the cemetery has character, and as a security engineer, I want them gone in Serious mode.

**Traces to:** B2; R-UI-5; R-UI-8

#### Acceptance Criteria

1. THE Bubble line SHALL be chosen from the Bubble table of design.md by the State and the Reason family of the Form shown at the chosen date. Every line SHALL be true of its reason, and no line SHALL name or mock a real person or project.
2. IF the Reason family is not in the Bubble table, or the Form is the Not-published form, THEN THE grave SHALL get no Bubble.
3. FOR ALL lists of eligible graves and ALL instants, THE Bubble schedule SHALL show at most two Bubbles, chosen by a pure function of the eligible graves and the Bubble slot, with no `Math.random`.
4. THE Bubble placement SHALL be a pure function of the plan. A Bubble SHALL lie inside the Scene and SHALL not intersect any Name label or the other Bubble. IF no candidate place is clear, THEN that Bubble SHALL not be shown.
5. WHILE Serious mode is on, THE Web app SHALL show no Bubble.
6. THE Bubbles SHALL be `aria-hidden="true"` and SHALL have `pointer-events: none`.
7. WHILE Reduced motion applies, THE Bubbles SHALL appear at the start of a Bubble slot and disappear at its show boundary with no transition. Otherwise they SHALL fade in and out.
8. WHILE the drawer is open, THE Web app SHALL show no Bubble.

### Requirement 8: Sound

**User Story:** As a viewer, I want to hear the cemetery when I ask for it, and never before.

**Traces to:** B1; R-UI-8; N-7

#### Acceptance Criteria

1. THE header SHALL hold a native toggle button with `aria-pressed`, named "Sound off" while off and "Sound on" while on, off by default. THE "Sound arrives in the next release" description SHALL be removed.
2. THE Web app SHALL create no AudioContext before the Sound toggle is on and a user gesture has happened on the page.
3. THE Web app SHALL remember the choice per browser in `localStorage` under `sexton:sound` with the value "on" or "off". IF reading or writing throws, or the value is anything else, THEN Sound SHALL be off and the page SHALL keep working.
4. WHEN the remembered value is "on", THE toggle SHALL show "Sound on", and THE AudioContext SHALL be created only at the first pointer or key press on the page.
5. THE Sound SHALL be made in code with the Web Audio API, from oscillators and from noise generated from a fixed seed, with no audio file and no request.
6. THE Voices SHALL be the wind bed, the sting, the thud, the bell and the ghost call of the Sound list in design.md, each with the synthesis and peak level that list sets.
7. THE Web app SHALL pass every Voice through one Master gain whose value never exceeds MASTER_CAP, and SHALL end every Voice but the wind bed within 2,500 ms.
8. WHILE Serious mode is on, THE Web app SHALL play no Voice but the bell.
9. WHILE Reduced motion applies, THE Web app SHALL play the same Voices for the same triggers as without it.
10. WHEN the toggle turns off or the page is hidden, THE Web app SHALL silence every Voice within 100 ms. WHEN the page is visible again with Sound on and Serious mode off, THE wind bed SHALL resume.
11. IF the AudioContext cannot be created or resumed, THEN THE Web app SHALL keep working silently and the toggle SHALL keep its state.

### Requirement 9: The replay burst

**User Story:** As a viewer of the demo video, I want the compromise to burst out of the ground, so that the moment of the attack is unmistakable.

**Traces to:** B3; R-UI-1; R-UI-6

#### Acceptance Criteria

1. WHEN a replay arrives at its Burst Stop, THE Scene SHALL play the Burst once: the lid is flung aside, dirt and shards fly, and the zombie rises out of the pit with the Rise clip.
2. WHEN the Burst starts, THE Web app SHALL show the caption "The wind stops. A grave opens." above the grave, and SHALL keep it while the Burst Stop is shown. IF sound is on, THEN the sting and the thud SHALL play.
3. WHEN the replay leaves the Burst Stop and arrives at it again, THE Burst SHALL play again.
4. THE axios replay's Burst Stop SHALL be 31 Mar 2026, 00:21 UTC and the keyv replay's SHALL be its Possessed Stop, both found from the replay's Segments, not fixed in code.
5. WHILE Reduced motion applies, THE Scene SHALL show the Burst's final pose at once, with the caption.
6. THE Burst particles SHALL follow fixed seeded paths, with no `Math.random`, and SHALL stay inside the grave's Art box.
7. WHEN the Scene repaints 300 graves during a Burst, THE median of 30 repaints SHALL stay at or below 16 ms.
8. THE Burst SHALL never change the grave's State, Tier, rectangle or accessible name.

### Requirement 10: The burial priest

**User Story:** As a maintainer, I want the burial of a fixed dependency to look like a small funeral, so that opening the pull request feels like closing a case.

**Traces to:** B4; cemetery-time burial rules

#### Acceptance Criteria

1. WHILE a burial plays, THE Scene SHALL draw the Priest, original vector art in the blocky style, walking to the grave and then reading, inside the grave's Art box.
2. WHEN the Priest starts reading, IF sound is on, THEN THE bell SHALL play once.
3. WHILE Reduced motion applies, THE Scene SHALL draw the Priest standing still beside the grave for BURIAL_MS (the Vigil), with no stone motion, and THE pennant SHALL show at once as before.
4. WHEN a burial is queued while the drawer is open, THE burial SHALL start when the drawer closes, as before.
5. THE Priest SHALL never change the grave's State, Form, fill or accessible name.

### Requirement 11: The rise clip and the load moment

**User Story:** As a first-time viewer, I want the graves to rise when the page opens, so that the cemetery greets me.

**Traces to:** B5; R-UI-6

#### Acceptance Criteria

1. THE Rise clip SHALL be one pure function of the elapsed time, used by the Burst and by the Load moment.
2. WHEN the first scan after a page load is shown, THE Scene SHALL raise every grave out of the ground in triage order, and the whole Load moment SHALL end within 1,000 ms of its start.
3. THE Load moment SHALL play once per page load: a second scan, a replay or a scrubber move SHALL not replay it.
4. WHILE Reduced motion applies, THE Scene SHALL skip the Load moment.
5. WHILE the Load moment plays, THE grave buttons SHALL stay in place and work, and every grave's rectangle SHALL be its planned rectangle.

### Requirement 12: Everything that works today keeps working

**User Story:** As a maintainer, I want Phase 2 to add, not break.

**Traces to:** R-UI-2 to R-UI-7; cemetery-undead requirement 10

#### Acceptance Criteria

1. THE keyboard overlay, the tooltip, the drawer, the focus trap, the scrubber, Play, the replays, the burial, the pull request marker, the remediate button, the evidence links and Serious mode SHALL keep their behaviour and their accessible names, except the changes that design.md "Deliberate test changes" lists.
2. THE keyboard order SHALL follow the DOM: Back to now when shown, the evidence links, Repository URL, Scan, Sound, Serious mode, Legend, the banner links of a replay, the roving grave, Play, History date, then the two Replay buttons.
3. THE axe check SHALL report no violation on the demo, with the drawer open, with the legend open, while playing and with Sound on.
4. WHEN the Scene repaints 300 graves, THE median of 30 repaints SHALL stay at or below 16 ms, idle and after a scrubber move.

### Requirement 13: The product requirement for sound and speech

**User Story:** As the owner, I want the product requirements to name sound and speech, so that the write-up and the code agree.

**Traces to:** docs/requirements.md change policy

#### Acceptance Criteria

1. THE build SHALL not start until the owner has decided R-UI-8 in design.md "The owner's decisions", the Bubble table and the Sound list.
2. WHERE the owner approves R-UI-8, THE spec tasks SHALL add it to docs/requirements.md section 5.8.
3. THE spec tasks SHALL bump the docs/requirements.md header to Version 0.7 and add the change log line "0.7, 25 Nov 2026" naming every requirement change of this spec, whatever the owner decides on R-UI-8.

### Requirement 14: Screenshots, README and steering

**User Story:** As a reviewer reading the README, I want the pictures and the words to match what I open.

**Traces to:** N-9

#### Acceptance Criteria

1. THE end-to-end smoke test SHALL rewrite `docs/cemetery.png` at 1440 by 900 with two Bubbles visible, and `docs/replay-axios.png` at the Burst's final pose with the caption showing.
2. THE README SHALL say in one line that sound is off by default.
3. THE `.kiro/steering/web.md` file SHALL describe Sound, the Bubbles, the Burst, the Priest, the Rise clip and the Load moment, the Halo, the pit edge colour, the new pitch caps, the replay header labels and the label rule. It SHALL rewrite the rules this spec changes (the disabled Sound button, "Under prefers-reduced-motion there is no burial animation", the pitch caps, and "a grave has at most one glow", which now counts the Halo as part of the Possessed glow) and keep every other rule and the front matter.
4. THE file CREDITS.md SHALL state that every sound is generated in code.

### Requirement 15: The screenshot loop

**User Story:** As the owner, I want the result to match the look this spec sets, so that the chosen art direction is what ships.

**Traces to:** A1 to A6, B2, B3; cemetery-undead requirement 14

#### Acceptance Criteria

1. AFTER every visual change, THE Orchestrator SHALL take screenshots of the demo and of the axios replay at 1440 by 900 and at 390 by 844, with the Burst captured mid-animation and at its final pose, and check them against the Visual critic checklist in design.md.
2. THE Visual critic SHALL answer READY or list what is off. THE Orchestrator SHALL fix and repeat until the Visual critic answers READY at both sizes.
3. THE Orchestrator SHALL record the findings of each round in tasks.md notes in plain words.

### Requirement 16: Invariants and scope

**User Story:** As a maintainer, I want Phase 2 to change nothing else, so that the review stays about Phase 2.

**Traces to:** tech.md rules; decisions of earlier specs

#### Acceptance Criteria

1. THE spec tasks SHALL change only the paths listed in the Introduction.
2. THE spec tasks SHALL add no runtime dependency, no audio file and no request to another origin at run time.
3. THE spec tasks SHALL keep the 16 ms budget, skip no test, lower no `numRuns` and weaken no check, and SHALL change an existing test only as design.md "Deliberate test changes" lists.
4. WHEN the gates run on the final tree, THE root `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:e2e -w @sexton/web` and the fresh-clone run SHALL exit with code 0.
5. THE last sub-task of each top-level task SHALL run an independent code review on that task's changed files and SHALL fix every defect it reports in the same task.
6. THE footer height hook SHALL measure every `.night-footer` node in the document and SHALL re-measure when any of them changes size (A8).
