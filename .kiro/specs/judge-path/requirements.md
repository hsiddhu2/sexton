# Requirements Document

## Introduction

judge-path makes the core of Sexton obvious to a first-time viewer in two minutes: a judge who has watched the video opens the hosted demo and must see at once which grave to fix first and why, and be shown, step by step, the controls that prove it. It also closes three notes from the reviews of 25 Nov 2026 on the cemetery (the replay halo round the ring, a slow Halo repaint, and a dark column during a burial).

It has two parts:

- **Part A, try it in two minutes:**
  - A1. A first-visit Guide on the demo, four steps, each pointing at the real control.
  - A2. A "Fix first" line: the top grave in triage order with its state and reason, as a button that selects it.
  - A3. A README section "Try it in two minutes" with the same steps and absolute links to the hosted site.
- **Part B, notes carried from the reviews of 25 Nov:**
  - B4. The replay halo reads as one even glow behind the grave, with no dark patch along the ring.
  - B5. A Halo repaint after a scrubber move that changes which graves are Possessed stays inside 16 ms on the 300 front-row scene.
  - B6. The soft dark column above a sinking stone during a burial is removed within the budget, or the reason is recorded with a measurement.

This spec traces to R-UI-5 ("readable without the legend by a first-time viewer"), R-UI-6 and R-UI-7 of docs/requirements.md section 5.8, and to the cemetery-undead, cemetery-undead-2 and cemetery-undead-fixes specs. It changes no state rule, no API field, no evidence field and no product requirement.

Paths: this spec changes `packages/web`, the README section "Try it in two minutes" only (lane 2 owns the rest of the README, lane 3 the section "Built with Kiro"), `docs/cemetery.png`, `docs/replay-axios.png`, `.kiro/steering/web.md` and `.kiro/specs/judge-path`. It adds no dependency. Every date it writes is 25 Nov 2026 (UTC) unless it is a fact from a source.

## Glossary

- **Web app, Scene, Grave, State, Form, Tier, Halo, Lantern glow, Name label, Part boxes, Bubble, Burst, Vigil, Serious mode, Reduced motion, Visual critic, Deliberate test change**: as in the cemetery-undead-2 and cemetery-undead-fixes glossaries.
- **Demo**: the scan served from the page origin as `/demo/scan.json` with the "demo fixture, recorded data" label.
- **Guide**: the first-visit walkthrough of four Guide steps over the demo.
- **Guide step**: one card of the Guide with a title, one or two sentences, and an Anchor.
- **Anchor**: the real control a Guide step points at: a grave button, or the "axios, Mar 2026" Replay button.
- **Fix-first grave**: the first grave in triage order (R-UI-3) of the scan shown.
- **Fix-first line**: the line that names the Fix-first grave, its State and its reason.
- **Ring casing**: a dark line on each side of the selection ring and of a grave button's focus outline, so the gold sits on its casing and never on the Halo.
- **Cold Halo repaint**: a Halo layer repaint in which the Halo's sources change too (a scrubber move that changes which graves are Possessed), as opposed to one in which only the cuts change (a hover or a selection).
- **Hosted site**: https://de1giv8lj8sfh.cloudfront.net, the deployed web app.

## Requirements

### Requirement 1: The first-visit Guide

**User Story:** As a judge opening the demo for the first time, I want to be shown the four things to try, so that I reach the core feature in two minutes.

**Traces to:** A1; R-UI-5; R-UI-7

#### Acceptance Criteria

1. WHEN the Demo is first shown in a browser whose stored Guide value is not "closed" THE Web app SHALL show the Guide at its first step.
2. WHEN a scan that is not the Demo, or a replay, is shown THE Web app SHALL NOT open the Guide by itself.
3. WHEN the Guide opens by itself THE Web app SHALL leave keyboard focus where it is.
4. THE Guide SHALL have four steps, in this order, each pointing at its Anchor: hover a grave (the Fix-first grave); open its drawer (the same grave); read the evidence and the pull request preview (the same grave, whose drawer holds them); press "Replay an attack" (the "axios, Mar 2026" button).
5. THE Guide SHALL offer, as native buttons, Back from step 2, Next until step 4, Done on step 4, and Close on every step.
6. WHEN Escape is pressed while focus is inside the Guide THE Web app SHALL close the Guide.
7. WHEN the Guide is closed by Close, Done or Escape THE Web app SHALL store "closed" in `localStorage` under `sexton:guide`.
8. IF reading or writing `sexton:guide` throws, or the stored value is anything but "closed", THEN THE Web app SHALL treat the Guide as not closed and keep working.
9. THE header SHALL hold a native button named "Guide" while a scan is shown.
10. WHEN the Guide button is pressed THE Web app SHALL open the Guide at its first step and move focus to the Guide's heading.
11. WHEN the Guide closes while focus is inside it THE Web app SHALL return focus to the Guide button.
12. THE Guide's controls SHALL be reachable by Tab at every step, in the order Back, Next or Done, Close.
13. WHEN a step is shown THE Web app SHALL scroll its Anchor into view.
14. THE Guide card SHALL, for any plan of up to 60 packages at any width from 360 to 1920, any Anchor and any card height from 120 to 260, take a place beside, above or below the Anchor, on the first of those sides that has one inside the viewport and clear of every Name label.
15. IF no place of 1.14 qualifies THEN THE Guide card SHALL dock to the lowest band of the viewport, from just above a pinned Footer bar up to just below a pinned header, that is clear of every Name label and of its Anchor.
16. IF no band of 1.15 is clear THEN THE Guide card SHALL dock to the bottom band, and THE design document SHALL record this as the one case in which the card may cover a name.
17. WHILE Reduced motion applies, THE Guide SHALL show and change steps with no transition or animation.
18. WHILE the drawer is open, THE Web app SHALL hide the Guide.
19. WHEN the drawer opens while the Guide is at step 1 or 2 THE Web app SHALL move the Guide to step 3.
20. WHEN the drawer closes THE Web app SHALL show the Guide again at its step, if it was open.

### Requirement 2: The Fix-first line

**User Story:** As a judge, I want the first screen to say which grave to fix first and why, so that I get the point in five seconds.

**Traces to:** A2; R-UI-3; R-UI-5

#### Acceptance Criteria

1. WHILE a scan that is not a replay is shown and its Fix-first grave is not Alive, THE header SHALL show the Fix-first line as a native button whose text is "Fix first:" followed by the grave's name and version, its State and its state reason.
2. WHEN the Fix-first button is pressed THE Web app SHALL select the Fix-first grave.
3. WHEN the Fix-first button is pressed THE Web app SHALL move keyboard focus to the Fix-first grave's button, so its tooltip shows.
4. WHILE every grave of the scan is Alive, THE header SHALL show the text "Nothing to fix first: every dependency is Alive." in place of the button.
5. WHILE Serious mode is on, THE header SHALL still show the Fix-first line, with no Punchline.
6. WHILE a replay is shown, THE header SHALL NOT show the Fix-first line.
7. THE Fix-first grave SHALL be, for any scan response, the first package of `triageOrder`, with its scan-date State and reason.

### Requirement 3: The README section

**User Story:** As a judge reading the README, I want the same four steps with links I can click, so that I can try them without searching.

**Traces to:** A3; N-9

#### Acceptance Criteria

1. THE README SHALL hold one section headed "## Try it in two minutes", before "## The problem", with the four steps of the Guide in the same order.
2. THE section SHALL link `https://de1giv8lj8sfh.cloudfront.net`, `https://de1giv8lj8sfh.cloudfront.net/?replay=axios` and `https://de1giv8lj8sfh.cloudfront.net/?replay=keyv` as absolute https URLs.
3. THE spec tasks SHALL change no other part of the README.

### Requirement 4: The replay halo round the ring

**User Story:** As a viewer of the video's main shot, I want the replay grave's halo to read as one even glow behind it, with no dark patch along its ring.

**Traces to:** B4; cemetery-undead-fixes requirement 2.1

#### Acceptance Criteria

1. THE Scene SHALL draw the selection ring with a Ring casing.
2. THE Web app SHALL draw every grave button's focus outline with a Ring casing.
3. THE Halo SHALL NOT be cut along the selection ring or the focus outline.
4. THE Halo SHALL be zero, for any plan of up to 60 packages, inside every Part, Ghost and pennant box, every Name label, the Art box of a grave whose Burst plays, and the burial regions of a grave whose burial or Vigil plays.
5. THE existing contrast tests and the glow contrast check SHALL pass unedited.
6. THE ring colour and the focus colour SHALL each have a contrast of at least 3:1 against the Ring casing colour.
7. WHEN the axios replay is shown at its Burst Stop at 1440 by 900 with nothing hovered and its Burst has ended THE Halo alpha SHALL be at least half the uncut Halo at every sampled point 8 px inside or 8 px outside the ring that lies outside every Part, Ghost and pennant box and every Name label.

### Requirement 5: A cold Halo repaint inside the budget

**User Story:** As a maintainer, I want every repaint inside 16 ms, so that moving the scrubber never stutters.

**Traces to:** B5; R-UI-6

#### Acceptance Criteria

1. WHEN the Scene repaints 300 front-row graves (Possessed and Dead in turn) with the Halo layer and its sources both painted afresh THE median of 30 repaints SHALL be at or below 16 ms.
2. THE 300-grave speed tests SHALL keep every existing case: idle, after a scrubber move, all in the front row, during a Burst, and a Halo layer repaint after a hover or selection.
3. IF 5.1 cannot be met with the steps of design.md B5, THEN THE design document SHALL record each step tried and its measured median, and the case SHALL be left at its measured value.

### Requirement 6: The burial column

**User Story:** As a viewer, I want a burial to look clean, with no dark column where the stone used to be.

**Traces to:** B6; cemetery-undead-fixes decision 10

#### Acceptance Criteria

1. THE Halo's cut for a grave whose burial plays SHALL lie, for any Form and burial phase, inside the burial regions at that phase, which follow the sinking stone.
2. THE burial SHALL draw, for any Form and burial phase, only inside the burial regions at that phase.
3. WHEN 300 front-row graves repaint during a burial THE median of 30 repaints SHALL be at or below 16 ms.
4. IF 6.1 cannot be met within 6.3, THEN THE design document SHALL record why, with the measurement, and the column SHALL be left as it is.

### Requirement 7: Everything that works today keeps working

**User Story:** As a maintainer, I want the judge path to add, not break.

**Traces to:** R-UI-2 to R-UI-8

#### Acceptance Criteria

1. THE Web app SHALL keep every existing accessible name, except the changes that design.md "Deliberate test changes" lists.
2. THE keyboard order SHALL follow the DOM: Back to now when shown, the evidence links, Repository URL, Scan, Sound, Serious mode, Legend, Guide, the Guide's controls when it is open, the Fix-first button when shown, the banner links of a replay, the roving grave, Play, History date, then the two Replay buttons.
3. THE contrast tests and the colour-vision test SHALL pass unedited.
4. EVERY 300-grave speed case SHALL keep its median at or below 16 ms.
5. THE Web app SHALL keep Sound off by default and make no AudioContext before Sound is on and a gesture has happened.
6. WHILE the Guide is open on the Demo, THE axe check SHALL report no violation.
7. WHILE the Guide is closed on the Demo, THE axe check SHALL report no violation.
8. WHILE the Demo is shown at 1440 by 900, THE canvas top SHALL be at most 190 px.

### Requirement 8: Pictures, steering and checks

**User Story:** As the owner, I want the pictures and the rules to match what ships.

**Traces to:** N-9

#### Acceptance Criteria

1. THE smoke test SHALL retake `docs/cemetery.png` and `docs/replay-axios.png`.
2. THE `.kiro/steering/web.md` file SHALL describe the Guide, the Fix-first line and the Ring casing, and SHALL rewrite the Halo rule this spec changes (no cut along the ring and the focus outline).
3. THE Visual critic SHALL answer READY at 1440 by 900 and 390 by 844, with the Guide open and closed, before the work is handed over.
4. THE root typecheck, lint, tests and `npm run test:e2e -w @sexton/web` SHALL exit 0.
5. THE independent review SHALL report no open defect before the work is handed over.
