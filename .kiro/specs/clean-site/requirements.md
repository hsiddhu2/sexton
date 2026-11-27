# Requirements Document

## Introduction

The owner walked the hosted site as a first visitor and then tried the calm-first-visit build on 26 November 2026. He rejected the overall design. His words: "A lot of noise. Tooltips all around. As a first visitor I was confused." "Hover boxes cover the graves and nothing says which one I am looking at." "Hard to read the cursive writing." "The scan is so small." "So much noise going on in the header." "When I click legend the whole thing comes down." "What is the point of serious mode?" "No action items." "I would like a minimalistic but neat and clean design." "The sound is third class. White noise." On a draft of the design: the replay "says the same stuff three times", two buttons "do the same thing", a help line he "had to read three times", and "we do not have a complete guide. A kid should get it."

On 26 November 2026 he approved a working design. It is the single source for look, layout, wording and flow, and it wins over any other description of them. Where the approved design and the engine's real data differ, the real data wins and the layout stays. The design's graves and backdrop are still drawings: the live canvas scene and its animated characters stay as they are on main.

This spec rebuilds the site shell around the canvas scene. It adds:

- a one-row header;
- a Home view with a headline, state chips and a Graveyard / List switch;
- a fixed Panel on the right and a List view;
- a tabbed Drawer;
- a Replay told step by step;
- a Guide page, a Legend pop-over and a three-step Tour;
- plain meanings for jargon and clear failed-scan cards;
- a slot for one music track;
- a little mischief that never gets in the way.

It removes the floating tooltip, speech bubbles, the guide card, the Fix-first line, Serious mode, Punchlines (other than the Inspector's Epitaph line of requirement 19) and every generated sound. From spec calm-first-visit (not merged) it carries over only the way back and the per-view addresses.

Out of scope: GitHub sign-in, any change to the engine's state rules, the canvas Characters and their art, private repositories.

## Glossary

- **Site**: the web app in packages/web.
- **Scene**: the live canvas cemetery (scene/Scene.tsx) with its grave buttons.
- **Wide layout**: a viewport at least 1100 px wide. **Middle layout**: 700 to 1099 px. **Narrow layout**: under 700 px.
- **Home**: the page of a loaded non-replay scan (the Sample scan, a Live scan or a scan file opened with ?scan=) with the Scene or the List, the Panel and the Footer bar. A filter, an earlier date, the Drawer, the Tour or a Pop-over may sit on Home; a Replay and the Guide page replace it.
- **Home action**: the move to Home of 10.2, taken by the "Cemetery" tab of the Top bar (spec home-page, 12.6), "← Cemetery" on a Replay or the Guide page, "Back to the cemetery", "Exit replay", "Go to the cemetery" and the last step of the Escape order. It lands on the **Home start**: Home of the scan shown before the Replay or Guide page opened (the Sample scan when none was), at its scan date, with no filter, Drawer, Tour or Pop-over, and with the Graveyard or List choice last made on Home.
- **Epitaph line**, **Dry line**, **Scanning line**, **Guide ghost**: the four kinds of mischief of requirement 19, with their texts in design C16.
- **Sample scan**: the demo scan at /demo/scan.json. Its repository name (sexton-demo/fixture) is the **Fixture name**.
- **Live scan**: a hosted scan of a repository through the API base, started by the visitor.
- **Panel**: the column with the Inspector card and the Fix order card.
- **Inspector**: the Panel card headed "You are looking at".
- **Selected grave**: the grave last chosen by a Fix order row, an arrow key or opening its Drawer; at load the first grave in triage order.
- **Looked-at grave**: the grave under the pointer, else the grave whose button has focus, else the Selected grave.
- **Fix order**: the Panel card "Fix in this order".
- **Proposed plan**: a remediation plan of the scan with status "proposed".
- **Reason family**: the kind of a state reason, found from its fixed leading words, for example "maintainer change" or "install script added".
- **List**: the table view of the packages.
- **Drawer**: the sheet from the right for one package, with the tabs Evidence, The fix and History.
- **Replay**: one of the fixtures /replay/axios.json and /replay/keyv.json, shown as a story.
- **Step**: one Stop of a Replay (time/stops.ts). **Step text**: a Step's title, "What happened" and "What Sexton shows", stored in the Replay file.
- **Guide page**: the page opened by "What is Sexton?".
- **Welcome bar**: the slim bar that points a first visitor at the Guide page.
- **Tour**: the three-step highlight of the Scene, the Inspector and the Scan field.
- **View owner**: whichever of the Drawer, a Replay, the Guide page and the Tour holds the screen, or none.
- **Pop-over**: the Legend, the attack picker, the Scan field's example list or a Term meaning. At most one is open, on top of the View owner.
- **Term**: a word from the Glossary file shown with a dotted underline in running text.
- **Glossary file**: web/src/glossary/glossary.ts.
- **View address**: the query part of the page address that names the current view.
- **Claim**: a sentence the Site shows that says what Sexton does or can do.
- **Claim registry**: web/src/copy/claims.ts, the one source of every Claim.
- **Track slot**: the constant that names one recorded music track, its beat and its credit.
- **Art box**: a grave's drawing box (scene/art-box.ts).

## Requirements

### Requirement 1: The header

**User Story:** As a first visitor, I want a quiet header with one clear way to scan, so that I know where to start.

#### Acceptance Criteria

1. THE Site SHALL show in the header, in order: the wordmark, the tabs "Overview" and "Cemetery" (spec home-page, 12.5), the scan tag, the Scan field with its Scan button, and the buttons "What is Sexton?", Legend, Music (only where a track is set, 1.15) and Tour.
2. WHILE the Site is in the Wide or Middle layout THE header SHALL be one row of at most 64 px.
3. WHILE the Site is in the Middle or Narrow layout THE Legend, Music and Tour buttons SHALL show their icons only, each with its accessible name. In the Middle layout "What is Sexton?" SHALL do the same (spec home-page, 12.10).
4. WHILE the viewport is under 1300 px wide THE scan tag SHALL be hidden.
5. WHILE the Sample scan is shown THE scan tag SHALL read "Sample scan".
6. WHILE a Live scan is shown THE scan tag SHALL show the scanned repository as owner/name.
7. THE Site SHALL never show the Fixture name on a page.
8. THE header SHALL use the gold accent only on the Scan button, the "What is Sexton?" button, the wordmark glyph, the scan tag, the Scan field's focus border, a pressed Music button and focus outlines.
9. WHEN the Scan field gains focus THE Site SHALL show the example list, headed "Try one", with three entries in order: hsiddhu2/sexton-demo marked "pull requests work here", expressjs/express "a popular web framework" and facebook/react "a large repo".
10. WHEN an example is pressed THE Site SHALL fill the Scan field with it and start a Live scan of it.
11. WHEN the Scan button is pressed with an input that is owner/name or a github.com repository link THE Site SHALL start a Live scan of https://github.com/owner/name.
12. IF the Scan input is not owner/name or a github.com repository link THEN THE Site SHALL mark the field, keep focus in it, send no request and show "Enter a repo as owner/name, or paste a github.com link."
13. WHILE no API base is configured THE Scan field and its button SHALL be disabled, described by "Scanning is off in this build."
14. WHILE a Live scan is loading THE Scene SHALL show the scanning card "Digging through <owner/name>", "This usually takes a few seconds." and the three lines "Reading package.json and the lockfile", "Asking npm, OSV and deps.dev" and "Reading each headstone", with no progress bar.
15. WHERE a track is set in the Track slot THE Music button SHALL be rendered.
16. WHILE a Replay is shown THE scan tag SHALL read "Replay".
17. WHILE a scan file opened with ?scan= is shown THE scan tag SHALL read "Scan file".

### Requirement 2: Home, the headline, chips and notices

**User Story:** As a first visitor, I want to see at once how many dependencies need me and to narrow the view by state, so that I know what to act on.

#### Acceptance Criteria

1. WHILE Home shows the scan date and <n>, the number of Possessed packages, is above 0 THE headline SHALL read "<n> of <total> dependencies need you now.", with "needs" for an <n> of 1 and <n> in the Possessed colour.
2. WHILE Home shows the scan date, no package is Possessed, Dead or Haunted, and the policy passes THE headline SHALL read "Nothing needs you now."; it SHALL never read so while a package is Possessed, Dead or Haunted or the policy fails.
3. WHILE Home shows an earlier date and <n>, the number of packages Possessed on that date, is above 0 THE headline SHALL read "On <date>, <n> of <total> dependencies needed you.", with <n> in the Possessed colour; WHILE no package is Possessed, Dead or Haunted on that date THE headline SHALL read "Nothing needed you on <date>." The States are those the graves show on that date, <total> counts only the packages published on that date, and <date> is written as the site writes a day ("12 Nov 2026"). No policy rule applies at an earlier date, as there is no policy result for it.
4. THE chip row SHALL show one chip per State in the order Possessed, Dead, Haunted, Restless, Alive, each with its colour dot and its count at the shown date.
5. WHEN a chip that is not pressed is pressed THE Site SHALL set the filter to its State and mark only that chip aria-pressed.
6. WHEN the pressed chip is pressed THE Site SHALL clear the filter.
7. WHILE a filter is set THE Scene SHALL draw every grave of another State at one fixed dim alpha.
8. WHILE a filter is set THE grave buttons of the dimmed graves SHALL leave the tab order.
9. THE chip row SHALL hold the switch "Graveyard" and "List", outside the Scene, with aria-pressed on the shown view.
10. WHILE Home is shown in the Graveyard view in the Wide or Middle layout THE Scene SHALL show the help line "Point at a grave to see its details on the right. Click it to open." at its top left.
11. WHILE Home shows an earlier date THE Scene SHALL show the date badge "Viewing <date>" at its top centre.
12. THE help line and the date badge SHALL lie outside every grave's Art box.
13. WHILE the scan has no lockfile THE Site SHALL show under the headline "No lockfile: versions were resolved from package.json ranges."
14. WHILE the scan has a lockfile and some packages were resolved from declared ranges THE Site SHALL show under the headline "<n> packages were resolved from package.json ranges: <names>" ("1 package was" for one), with at most 5 names and "and <k> more".
15. WHILE the scan is capped THE Site SHALL show under the headline "Showing <n> of <m> direct dependencies."
16. WHILE Home shows the scan date, no package is Possessed and <k>, the number of Dead and Haunted packages, is above 0 THE headline SHALL read "Nothing is possessed. <k> of <total> need fixing.", with "needs" for a <k> of 1.
17. WHILE Home shows the scan date, no package is Possessed, Dead or Haunted, and the policy fails on <r> rules THE headline SHALL read "Nothing is possessed. The policy fails on <r> rules.", with "rule" for an <r> of 1. On a Replay, whose policy result is not for the shown Step, the policy SHALL not change the headline.
18. WHILE Home shows an earlier date, no package is Possessed on that date and <k>, the number of Dead and Haunted packages on that date, is above 0 THE headline SHALL read "Nothing was possessed on <date>. <k> of <total> needed fixing.", for a <k> of 1 as for more.

### Requirement 3: The Panel, the Inspector and the Fix order

**User Story:** As a visitor, I want the details of the grave I am looking at in one fixed place and a numbered list of what to fix, so that nothing floats over the graves and I have action items.

#### Acceptance Criteria

1. WHILE the Site is in the Wide layout THE Panel SHALL sit right of the Scene at a fixed width of 372 px.
2. WHILE the Site is in the Middle or Narrow layout THE Panel SHALL sit under the Scene at full width.
3. THE Inspector SHALL show "You are looking at", the Looked-at grave's name, version and State badge, one plain sentence of its state reason, three signals with their values, and one gold button.
4. WHILE no grave is under the pointer and no grave button has focus THE Inspector SHALL show "Selected" beside its heading.
5. WHEN the Looked-at grave changes THE Inspector SHALL show the new Looked-at grave without moving the Panel.
6. WHILE the package has a Proposed plan THE gold button SHALL read "See the evidence and the fix".
7. WHILE the package has no Proposed plan THE gold button SHALL read "See the evidence".
8. WHEN the gold button is pressed THE Site SHALL open the Drawer for the package the Inspector shows at that moment.
9. THE plain sentence SHALL be chosen by the Reason family from the fixed table in design.md C3, filled with the facts the reason text carries.
10. IF a state reason belongs to no Reason family THEN THE Inspector SHALL show the reason text with its first letter capitalised.
11. THE three signals SHALL be chosen by State in the fixed order of design.md C3.
12. WHILE an earlier date is shown THE Inspector sentence SHALL read "On <date> this package was <State>.", or "The installed version did not exist yet." for a package not published on that date.
13. WHILE a grave other than the Selected grave is under the pointer THE Scene SHALL draw the hover ring on it.
14. THE Scene SHALL draw the selection ring on the Selected grave.
15. WHILE Home is shown THE Site SHALL place no visible DOM element over a grave's Art box other than: the grave's own transparent button and its focus outline, the cards of 1.14 and 12.1, the Drawer scrim, the Tour dimming, an open Pop-over, the Drawer, the Tour card and spotlight, and the sticky header when the page scrolls under it.
16. WHEN a grave is clicked on Home THE Site SHALL open its Drawer.
17. WHEN Enter is pressed on a grave button on Home THE Site SHALL open its Drawer.
18. THE Fix order SHALL list up to 5 packages, numbered from 1, the first Possessed, Dead and Haunted packages in triage order at the scan date.
19. THE Fix order line of a package SHALL be the first that applies of: for a Proposed plan, "bump to <version>", "migrate to <package>" or "remove it"; for a Possessed package, "review the maintainer change", "review the missing provenance", "review the new install script", "review the new dependency" or "review the publisher change" by Reason family; for a plan with status no-safe-version, "no safe version"; else "see the evidence".
20. WHILE the current Looked-at grave is in the Fix order THE row SHALL carry the current-row mark.
21. WHEN a Fix order row is pressed THE Site SHALL make its package the Selected grave and open nothing.
22. IF no package is Possessed, Dead or Haunted THEN THE Fix order SHALL read "Nothing to fix. Every dependency is Restless or Alive."
23. WHEN Left or Right is pressed with focus on the page body, a grave button or a Fix order row, and with no View owner or Pop-over open, THE Site SHALL move the Selected grave to the previous or next grave in triage order, wrapping at the ends, and SHALL move focus to that grave's button when focus was on a grave button.
24. WHEN Enter is pressed with focus on the page body and no View owner or Pop-over open THE Site SHALL open the Drawer of the Selected grave.
25. IF a chosen signal is unavailable THEN THE Inspector SHALL show its value as "not available".
26. WHEN the pointer moves onto or off any grave or List row, any grave or List row is pressed or selected, or a Replay moves to another Step, THE Site SHALL leave the position and size of every box on the page unchanged, other than what the Inspector and the Step panel hold, at every viewport width of 360 px and more.
27. IF a line is longer than its share of the Inspector, a Fix order row or the Step panel THEN THE Site SHALL end it in an ellipsis and keep its whole text for assistive technology and in the Drawer.
28. WHILE Home shows the Sample at 1440 by 900 THE page SHALL not scroll, with the Welcome bar open and after it is closed, and no text SHALL be made smaller to fit.
29. WHILE Home shows the Sample in the Wide layout at 1366 by 768 or 1280 by 800, with the Welcome bar open or closed, THE page SHALL not scroll, every grave SHALL lie wholly inside the Scene above the Footer bar, and THE Panel SHALL be no taller than the space under the header and SHALL scroll inside itself when its cards are taller, with the Inspector and Fix order keeping their fixed heights; graves MAY shrink to a fit scale of 0.4, name labels SHALL keep their minimum on-screen size, and no font size SHALL change. WHILE either Replay is shown at 1440 by 900, 1366 by 768 or 1280 by 800, with the Welcome bar open or closed, at every Step, THE page SHALL not scroll, its grave SHALL lie wholly inside the Scene, and its Panel SHALL scroll inside itself only when its cards are taller than its box, and its grave SHALL keep at least its full size (R-UI-1).

### Requirement 4: What is removed

**User Story:** As the owner, I want the noise gone, so that a first visit is calm.

#### Acceptance Criteria

1. THE Site SHALL show no floating grave tooltip, speech bubble, guide card, Fix-first line, Serious mode toggle, Punchline (other than the Inspector's Epitaph line of 19.1), Play control on Home or Sound toggle.
2. THE Site SHALL play no sound other than the Track slot's track.
3. THE Site SHALL create no AudioContext.
4. THE Site SHALL read and write none of the stored values sexton:sound, sexton:serious and sexton:guide.
5. THE replay Burst SHALL play on the canvas without its caption.
6. THE code, styles and tests of every removed feature SHALL be removed in the commit that removes the feature.

### Requirement 5: Type and colour

**User Story:** As a visitor, I want text I can read, so that I am not squinting at cursive.

#### Acceptance Criteria

1. THE Site SHALL set all interface text but that of 5.5, and the canvas grave name labels, in Inter.
2. THE Site SHALL set only the wordmark and headlines in Cormorant Garamond.
3. THE Site SHALL ship no font but Inter and Cormorant Garamond, and SHALL remove Pirata One, IM Fell English, IM Fell English SC and Instrument Sans with their OFL files.
4. THE Site SHALL load its fonts only as woff2 files under public/fonts, each with its OFL file, from the page origin.
5. THE Site SHALL set versions, signal keys and diffs in the system monospace stack.
6. THE Site SHALL never set body text in the gold accent.
7. THE Site SHALL define every colour as a token in scene/palette.ts, and styles.css SHALL hold no colour literal.
8. THE contrast tests SHALL check every text token at 4.5:1 or more against each background it is used on.
9. THE Site SHALL keep main's five State colours.
10. THE colour tests SHALL keep the gold accent at least 10 apart in CIEDE2000 from the Restless colour.

### Requirement 6: The List view

**User Story:** As a maintainer of a large repository, I want the packages as a table I can search and sort, so that I can work through 300 of them.

#### Acceptance Criteria

1. WHEN "List" is pressed THE Site SHALL show, in place of the Scene, a table with the columns Package, Version, State, Why and Fix.
2. THE List SHALL show the State at the shown date and leave out packages not published on that date.
3. WHEN text is typed in the "Find a package" box THE List SHALL show only the packages whose name contains the trimmed text, ignoring case.
4. WHEN the "Package" heading button is pressed THE List SHALL sort by name and set aria-sort on that column.
5. WHEN the "State" heading button is pressed THE List SHALL sort worst first in triage order and set aria-sort on that column.
6. THE List SHALL open sorted worst first.
7. WHILE a filter is set THE List SHALL show only packages of that State.
8. IF no package matches THEN THE List SHALL show one row "No package matches."
9. WHEN a row is pressed THE Site SHALL open its Drawer.
10. WHEN Enter is pressed on a row THE Site SHALL open its Drawer.
11. THE List SHALL show every matching package exactly once, for any scan of up to 300 packages.
12. WHEN a key is pressed in the Find box on a scan of 300 packages THE List SHALL show the new rows within 100 ms on the e2e machine.
13. WHILE the List is shown THE Panel SHALL show the Looked-at grave.
14. THE List's Why cell SHALL hold the package's plain sentence (3.9, 3.10), and its Fix cell the Fix order line of 3.19 with a capital first letter, or "Nothing to do" for a Restless or Alive package with no Proposed plan.
15. WHEN "Graveyard" is pressed THE Site SHALL show the Scene in place of the List.

### Requirement 7: The Drawer

**User Story:** As a visitor, I want one sheet with the evidence, the fix and the history, so that I can act on one package.

#### Acceptance Criteria

1. WHEN a Drawer opens THE Site SHALL slide it in from the right with the breadcrumb "← Cemetery / <name>", the name, version and State badge, the tabs Evidence, The fix and History, and one close button.
2. THE Evidence tab SHALL show the State with its plain sentence, then a table of every signal with its plain label from the fixed table in design.md C5, its value, source link and fetch time.
3. WHILE the package has a Proposed plan THE fix tab SHALL show the plan's title and summary, then its package.json change as a diff.
4. WHILE the scan is a Live scan whose response has actions.remediate true and the package has a Proposed plan THE fix tab SHALL show "Open pull request", which sends POST <API base>/remediate with { repo, package } and shows the result as main does.
5. WHILE the package has a Proposed plan THE fix tab SHALL show "Copy pull request text", which copies the plan's pull request body.
6. WHILE the package is Possessed, Dead or Haunted and has no Proposed plan THE fix tab SHALL show "Copy this as an issue", which copies a plain text of the package, version, State, reason and signals.
7. WHILE the package is Possessed and has no Proposed plan THE fix tab SHALL show the note for its Reason family: maintainer "Check who the new maintainer is before the next install."; provenance "Check why this version has no provenance before the next install."; install-script "Check what the new install script runs before the next install."; new-dependency "Check the new dependency before the next install."; publisher "Check who published this version before the next install."; any other "Check what changed before the next install."
8. WHILE the package is Dead or Haunted and its plan has status no-safe-version THE fix tab SHALL show the note "Sexton only proposes a version it can show is safe."
9. WHILE the package is Restless THE fix tab SHALL show "Nothing urgent" and "No pull request is proposed for a Restless package. Keep an eye on it." and the note "No action needed.", with no button.
10. WHILE the package is Alive THE fix tab SHALL show "Healthy", "Nothing to fix." and the note "No action needed.", with no button.
11. WHEN a copy succeeds THE Site SHALL show "Copied. Paste it into a pull request or an issue on your repo."
12. IF the clipboard refuses THEN THE Site SHALL show "Copy was blocked by the browser. Select the text and copy it by hand."
13. WHILE the Sample scan is shown and the package has a Proposed plan THE note under the buttons SHALL read "No sign-in needed. Open pull request works on a live scan of hsiddhu2/sexton-demo. For your own repo, Sexton shows this plan and the full pull request text." with the link "How does this work?" to the Guide page.
14. WHILE a Live scan with actions.remediate true is shown and the package has a Proposed plan THE note SHALL read "No sign-in needed. This button opens a real pull request on hsiddhu2/sexton-demo." with the same link.
15. WHILE a Live scan with actions.remediate not true is shown and the package has a Proposed plan THE note SHALL read "No sign-in needed. For this repo Sexton shows the plan and the full pull request text." with the same link.
16. WHILE the package has a Proposed plan with a pull request body THE fix tab SHALL show that body in a closed disclosure "Read the pull request text", rendered by drawer/markdown.ts.
17. THE History tab SHALL list the package's Segments newest first, each with its date, State and reason.
18. IF the response has no timelines THEN THE History tab SHALL read "No history for this scan."
19. THE Drawer SHALL show the scan date.
20. THE Site SHALL offer no GitHub sign-in.
21. WHEN the Drawer opens THE Site SHALL move focus to its close button and keep focus inside it.
22. WHEN the Drawer closes THE Site SHALL return focus to the grave button or List row that opened it.
23. WHEN the scrim is pressed THE Site SHALL close the Drawer.
24. THE Evidence tab SHALL list the package's missing signals and the policy rules it fails, as main's drawer does.
25. WHEN the close button is pressed THE Site SHALL close the Drawer.
26. WHILE the package is Possessed, Dead or Haunted and has a plan that is not proposed THE fix tab SHALL show that plan's title and summary.
27. WHILE the package is Possessed, Dead or Haunted and has no plan THE fix tab SHALL show "No automatic change is proposed."

### Requirement 8: The Replay as a story

**User Story:** As a reviewer, I want to step through a real attack in plain words, so that I understand what Sexton would have shown.

#### Acceptance Criteria

1. WHEN a Replay is chosen THE Site SHALL show it in place of Home with the breadcrumb "← Cemetery / Real attacks / <package>", the headline "Watch the <package> attack unfold" and the line "<date>. A real attack on one package, step by step. Watch the grave change."
2. WHEN a Replay opens THE Site SHALL show Step 1.
3. THE Replay SHALL start moving only on a visitor's press.
4. THE Panel SHALL show "Step <k> of <m>" with the Step time, the Step title, the badge "<package> <version> is <State>", "What happened", "What Sexton shows", and the buttons Back and "Next step".
5. WHILE the last Step is shown THE "Next step" button SHALL read "Back to the cemetery".
6. WHEN "Back to the cemetery" is pressed THE Site SHALL take the Home action.
7. WHILE Step 1 is shown THE Back button SHALL be disabled.
8. THE Footer bar SHALL show "Play all" ("Pause" while playing), one card per Step with its number and title, and "Exit replay".
9. WHEN "Play all" is pressed THE Site SHALL move one Step every 5 seconds and stop at the last Step.
10. WHEN "Play all" is pressed at the last Step THE Site SHALL start again at Step 1.
11. WHEN "Pause", a Step card, Back, "Next step" or "Exit replay" is pressed during play THE Site SHALL stop playing.
12. THE Panel SHALL show the card "Why attackers do this" with the Replay's why text, its sources as links made only for https addresses, and the line "Reconstructed from public reports. Not a live scan."
13. THE Replay file SHALL store a Step text per Step, each different from every other Step text of that Replay.
14. THE Replay file SHALL state in Step texts and the why text only facts that a source the Replay cites gives.
15. IF the number of Step texts in a Replay file differs from the number of Stops time/stops.ts finds THEN THE Site SHALL refuse the file as an invalid response.
16. THE Scene SHALL show the Replay's one grave at full size with the date badge of the Step time.
17. WHEN a Replay arrives at its first Possessed Step THE Scene SHALL play the Burst.
18. WHEN "Exit replay" is pressed THE Site SHALL take the Home action.
19. WHEN the Replay's grave is pressed THE Site SHALL open nothing.
20. WHEN "Next step" is pressed THE Site SHALL show the next Step.
21. WHEN Back is pressed THE Site SHALL show the previous Step.
22. WHEN a Step card is pressed THE Site SHALL show its Step.

### Requirement 9: The Guide page and the Welcome bar

**User Story:** As a first visitor, I want a two-minute guide in plain words that a kid could follow, so that I understand what Sexton is.

#### Acceptance Criteria

1. WHEN "What is Sexton?" is pressed THE Site SHALL show the Guide page in place of Home with the breadcrumb "← Cemetery / What is Sexton?".
2. THE Guide page SHALL hold, in order: "The two-minute guide", the headline "Sexton looks after the code your app borrows.", what a sexton is, "The problem, in plain words", "What Sexton does" in three steps, "What the five graves mean" with each State's grave and meaning, "Questions people ask" with five answers (what a pull request is, sign-in, how the pull request gets opened, automatic checks, where the proof comes from), and the buttons "Go to the cemetery" and "Watch a real attack".
3. WHEN "Watch a real attack" on the Guide page is pressed THE Site SHALL open the axios Replay.
4. THE Guide page SHALL take every Claim from the Claim registry.
5. WHEN the Site loads with no stored welcome choice THE Site SHALL show under the header the Welcome bar: "New here? Read the two-minute guide first. It explains what Sexton is and what the graves mean." with "Read the guide" and a close button.
6. WHEN the Guide page opens THE Site SHALL store sexton:welcome = "closed" and hide the Welcome bar.
7. WHEN the Welcome bar's close button is pressed THE Site SHALL store sexton:welcome = "closed" and hide the Welcome bar.
8. IF storage is unavailable THEN THE Welcome bar SHALL hide for the rest of the page load once closed, with no error shown.
9. WHILE the Welcome bar shows THE Site SHALL place it in the page flow so it covers nothing.
10. WHEN "Go to the cemetery" is pressed THE Site SHALL take the Home action.
11. WHEN "Read the guide" on the Welcome bar is pressed THE Site SHALL open the Guide page.

### Requirement 10: The way back and the addresses

**User Story:** As a visitor, I want every view to have its own address and one action home, so that I never get stuck.

#### Acceptance Criteria

1. THE Drawer, the Replay and the Guide page SHALL each show a breadcrumb that starts "← Cemetery".
2. WHEN the Home action is taken THE Site SHALL show the Home start without a reload.
3. WHEN Escape is pressed THE Site SHALL close an open Pop-over, else end the Tour, else close the Drawer, else leave a Replay or the Guide page for Home as in 10.2.
4. WHEN browser Back is pressed after a change that added a history entry THE Site SHALL show the previous view without a reload.
5. THE View address SHALL name each view: Home of the Sample scan is "/"; a Live scan adds repo=<url>; the List adds view=list; a Drawer adds grave=<name>; a Replay is replay=<id> alone; the Guide page is page=guide alone, with any repo= kept; a scan file is scan=<address>; a chosen date adds at=<ISO instant>.
6. WHEN a page loads with a View address THE Site SHALL show that view.
7. WHEN the visitor opens a Replay or the Guide page, switches between Graveyard and List, starts a Live scan, or takes the Home action of 10.2 from a Replay or the Guide page, THE Site SHALL add one history entry.
8. WHEN the visitor changes the scrubber date THE Site SHALL replace the current entry.
9. IF a View address names a grave or date that the loaded scan does not have, or a part that its view does not take, THEN THE Site SHALL drop that part with a replace and show the rest.
10. IF a View address names a replay outside axios and keyv THEN THE Site SHALL load nothing and show the card "That replay does not exist." with "Back to the cemetery", which loads the Sample scan as "Back to the sample" does (12.6).
11. WHEN an address with repo= is opened in a fresh tab THE Site SHALL fill the Scan field and show "Scan this repository" and send no request.
12. WHEN an address with repo= is reloaded in a tab where the visitor started that scan THE Site SHALL start the Live scan.
13. THE Site SHALL send a Live scan only to <API base>/scan?repo= through checkScanUrl.
14. WHEN "← Cemetery" in the Drawer is pressed THE Site SHALL close the Drawer and show the view beneath it.
15. WHEN the visitor opens a Drawer THE Site SHALL add one history entry.
16. WHEN the visitor changes the Step or the Drawer tab THE Site SHALL leave the address and the history unchanged.
17. WHEN the Drawer closes other than by browser Back THE Site SHALL go back over the entry its opening added.
18. WHEN "Scan this repository" is pressed THE Site SHALL start the Live scan of the repository in the Scan field.

### Requirement 11: Plain meanings for jargon

**User Story:** As a first visitor, I want one line of meaning for each technical word, so that I can follow the evidence.

#### Acceptance Criteria

1. THE Glossary file SHALL hold one plain meaning of at most 25 words for each of: provenance, advisory, maintainer, deprecated, install script, transitive reach, pull request, last publish and publisher.
2. THE Site SHALL show each Term in running text and signal labels of the Inspector, the Drawer, a Step text and the Guide page answers as a button with a dotted underline.
3. THE Site SHALL mark no Term inside a button, link, breadcrumb, heading or table column heading.
4. WHEN a Term is pressed THE Site SHALL open its meaning as a Pop-over beside it, inside the viewport.
5. WHEN anything outside a Term Pop-over is pressed THE Site SHALL close it.
6. THE Glossary file SHALL map each plural or capitalised form of a Term to that Term's meaning.
7. THE Term marking SHALL keep the visible text unchanged.
8. IF a Term in the term list has no meaning THEN THE typecheck, which is a gate like the tests, SHALL fail.

### Requirement 12: Failed scans

**User Story:** As a visitor who scanned the wrong repo, I want one clear sentence and one next step, so that I can recover.

#### Acceptance Criteria

1. WHEN a Live scan fails THE Scene SHALL show a failure card with one sentence (after the Dry line of 19.3), one next step, and the buttons "Try the demo repo" and "Back to the sample".
2. THE failure card SHALL be chosen from the HTTP status and the API error code only, by the first match in this order:
   - no HTTP response (network error): "We could not reach the scan service." Next step: "Check your connection and try again."
   - status 429: "Too many scans from your network right now." Next step: "Wait a few minutes and try again."
   - status 503 or 504, or code fetch-failed: "GitHub or npm is busy right now." Next step: "Wait a minute and try again."
   - code missing-package-json: "We could not read that repo." Next step: "Check the spelling. Sexton can only read public repos with a package.json at the top."
   - code invalid-url: "That is not a GitHub repo address." Next step: "Write it as owner/name, or paste a github.com link."
   - code invalid-package-json or invalid-lockfile: "This repo's package.json or lockfile could not be read." Next step: "Check that the file is valid JSON."
   - code manifest-too-large: "This repo's package.json or lockfile is larger than 5 MiB." Next step: "Try a smaller repo."
   - code invalid-policy: "This repo's sexton.policy.yml is not valid." Next step: "Fix the policy file, or try a repo without one."
   - anything else: "The scan failed on our side." Next step: "Try again, or try the demo repo."
3. THE Site SHALL read only the code field of an error body of at most 4 KiB, and SHALL keep it only when it is one of the API's error codes.
4. THE Site SHALL never show or log any other text of an error body.
5. WHEN "Try the demo repo" is pressed THE Site SHALL start a Live scan of hsiddhu2/sexton-demo.
6. WHEN "Back to the sample" is pressed THE Site SHALL show Home of the Sample scan.
7. IF the Sample scan or a scan file fails to load, or a Replay file is refused, THEN THE Site SHALL show a card "This scan could not be loaded." with the next step "Try again, or open the sample." and the buttons "Try again" and "Back to the sample".

### Requirement 13: The Legend and the Tour

**User Story:** As a visitor, I want the legend and a short tour when I ask for them, without the page jumping.

#### Acceptance Criteria

1. WHEN Legend is pressed while the Legend is closed THE Site SHALL open a Pop-over under it, headed "What each grave means", with the five States and their meanings, the ghost ("one or more advisories"), the pennant ("a pull request was opened") and the Not-published mound ("not published yet on the chosen date"), and the line "Fix order: Possessed first, then Dead, Haunted, Restless. Then by advisory severity and reach."
2. WHILE the Legend is open THE Site SHALL keep every other element where it was.
3. WHEN Tour is pressed THE Site SHALL take the Home action, switch to the Graveyard view (adding a history entry by 10.7 only when the view changes), and show the first of 3 steps: the Scene ("Every grave is one dependency", "Its shape tells you its health. The worst ones stand in the front row."), the Inspector ("One panel, always in the same place", "Hover a grave and its details show here. Nothing floats over the graves.") and the Scan field ("Scan your own repo", "Paste a public GitHub repo with a package.json at the top. Sexton reads it and builds its cemetery. No sign-in needed.").
4. WHILE no API base is configured THE third Tour step's sentence SHALL read "Scanning is off in this build. The hosted site scans public GitHub repos with a package.json at the top."
5. WHILE the Tour shows THE Site SHALL dim everything but the highlighted part and block presses outside the card.
6. WHILE the Tour shows THE Tour card SHALL lie inside the viewport.
7. WHILE the Tour shows THE card SHALL show "Step <k> of 3", Skip and Next, with Done in place of Next on step 3.
8. THE Site SHALL start the Tour only when Tour is pressed.
9. WHEN Next is pressed THE Site SHALL show the next Tour step.
10. WHEN Skip or Done is pressed THE Site SHALL end the Tour and leave Home as it was.
11. WHEN Legend is pressed while the Legend is open THE Site SHALL close it.
12. WHEN anything outside an open Legend, attack picker or example list is pressed THE Site SHALL close that Pop-over.

### Requirement 14: Music

**User Story:** As the owner, I want graveyard music the dependencies dance to, in place of generated sound.

#### Acceptance Criteria

1. WHILE the Track slot is empty THE Site SHALL ship no audio file.
2. WHERE a track is set THE Music button SHALL start off, with aria-pressed.
3. WHEN Music is turned on THE Site SHALL play the track in a loop and drive the Characters' Pose clock from the track's beat.
4. WHEN Music is turned off THE Site SHALL stop the track and return the Characters to their normal idle motion.
5. WHILE reduced motion is preferred THE Characters SHALL hold still whether Music is on or off.
6. WHERE a track is set THE site footer SHALL show one credit line, "Music: <title> by <artist>, <licence>", with the title and artist linked to the source and the licence linked to the licence's address, and README.md, CREDITS.md and the Guide page under the heading "Music" SHALL show the full credit word for word.
7. THE Site SHALL create no audio element before Music is first turned on.
8. WHERE a track is set THE Content Security Policy SHALL allow media from the page origin only.

### Requirement 15: Phone

**User Story:** As a visitor on a phone, I want one column with the worst graves first.

#### Acceptance Criteria

1. WHILE the Site is in the Narrow layout THE header SHALL wrap, with the tabs and the Scan field on the row under the wordmark (spec home-page, 12.11).
2. WHILE the Site is in the Middle or Narrow layout THE page SHALL be one column: the headline and chips, the Scene, the Footer bar, then the Panel.
3. WHILE the Site is in the Narrow layout THE Scene SHALL draw its Tiers front first, so the Possessed and Dead graves come first from the top.
4. WHILE the Site is in the Narrow layout THE Drawer SHALL be full width.
5. WHILE the viewport is 360 px wide THE page SHALL not scroll sideways with the Drawer, a Pop-over or the Tour open.

### Requirement 16: What stays

**User Story:** As the owner, I want everything that works today to keep working.

#### Acceptance Criteria

1. THE Scene SHALL keep main's Characters, Load moment, burial, pull request pennant, Burst, Lantern glow and Halo.
2. WHEN 300 graves are shown at 1440 by 900 THE Scene SHALL repaint within 16 ms locally and 50 ms on CI.
3. WHILE Home is shown and the response has timelines THE Footer bar SHALL show the History label, the native range scrubber with aria-valuetext, its start label and "Today, <scan date>", and the button "Watch a real attack".
4. WHILE Home shows an earlier date THE Footer bar SHALL show "Back to now".
5. WHILE Home is shown and the response has timelinesOmitted "too-large" THE Footer bar SHALL show "History is not shown for this scan because it is too large." in place of the scrubber.
6. WHILE Home is shown and the response has no timelines and no timelinesOmitted THE Footer bar SHALL show only "Watch a real attack".
7. WHEN "Watch a real attack" is pressed THE Site SHALL open the attack picker Pop-over headed "Two real npm attacks from 2026" with the line "A trusted package was taken over and a bad version was published. See how each one would have looked in your cemetery." and one button per Replay with its package, date and number of Steps.
8. WHILE no filter is set THE Site SHALL keep every grave reachable by Tab.
9. THE axe checks of Home, the List, the Drawer on each tab, a Replay and the Guide page SHALL report no violation.
10. THE Drawer SHALL keep every signal's source and fetch time.
11. THE Site SHALL keep the cache-header behaviour of spec fresh-site, with the one retry of a stale static scan.
12. THE site footer SHALL show the scan time in a time element, the policy line as main writes it, and the evidence links "Evidence JSON" and "Evidence Markdown" where main offers them.
13. THE Site SHALL fetch only addresses that pass checkScanUrl.
14. WHILE a filter is set THE Site SHALL keep every grave reachable by the arrow keys of 3.23.
15. WHEN "Back to now" is pressed THE Site SHALL show the scan date.
16. WHEN "Watch a real attack" is pressed while the attack picker is open THE Site SHALL close it.

### Requirement 17: One thing on screen, every way home

**User Story:** As a first visitor, I want one thing at a time and a way home from anywhere.

#### Acceptance Criteria

1. THE Site SHALL render at most one View owner and at most one Pop-over at any instant.
2. WHEN a View owner opens THE Site SHALL close the View owner before it and any open Pop-over.
3. WHEN a Pop-over opens THE Site SHALL close any other open Pop-over and keep the View owner.
4. WHEN the Home action is taken from any view THE Site SHALL reach the Home start without a reload.
5. THE Site SHALL take every Claim it shows from the Claim registry, each tied to the README.md text it rests on.

### Requirement 18: Pictures, steering, documents and review

**User Story:** As the owner, I want the documents to match the site and a review made on the built site.

#### Acceptance Criteria

1. THE build SHALL retake docs/cemetery.png and docs/replay-axios.png from the built site at 1440 by 900.
2. THE build SHALL update README.md where it describes the site: the sound line under the picture, "Try it in two minutes", the header download links in "What Sexton does", "Replay", and the font list in "Pre-existing code".
3. THE build SHALL update CREDITS.md and docs/JUDGES.md where they describe fonts, sound, the tooltip, Serious mode, the header or the replay controls.
4. THE build SHALL rewrite .kiro/steering/web.md for the new site and drop the rules of removed features.
5. THE build SHALL move docs/requirements.md to version 1.1, correct its header line, rewrite R-UI-4 and R-UI-8, and add a change-log line.
6. THE review SHALL use the built site in a fresh browser profile at 1440 by 900 and 390 by 844 through every flow of the approved design, and SHALL list every difference from the approved design with its reason.
7. WHEN the owner approves at go THE build SHALL add to README.md the three facts the Claim registry rests on that README lacks: "The hosted site needs no sign-in and never asks for a GitHub password.", "Sexton reads a repository's package.json and package-lock.json at its root." and "Sexton proposes a bump only to a version that passes its checks; otherwise it proposes no change."
8. THE build SHALL add to README.md the sentence "The cemetery puts the graves to fix first in front: Possessed, then Dead, Haunted and Restless, then by advisory severity and reach.", approved by the owner on 26 November 2026, and the Claim registry SHALL rest the Tour's first step (13.3) and the Legend's fix order line (13.1) on it.

### Requirement 19: A little mischief, never in the way

**User Story:** As a first visitor, I want the cemetery to make me smile once or twice, and still know what to tap next.

Added on 26 November 2026 by the owner after the build started, from the UX judge's published judging criteria: "Scare me, then make it easy. I want an interface with a little mischief in it, like a ghost that guides me or an error message that makes me laugh. If I smile and still know what to tap next, you've won me over." Every line is listed in design.md C16 so the owner can read it before the build ends.

#### Acceptance Criteria

1. WHILE the Inspector shows a package at the scan date THE Inspector SHALL show, in one paragraph under the package name, the Epitaph line of design C16 for that package's Reason family, as plain text with no Term marked, in Inter in the muted text colour, never in italics or a script face.
2. IF a package's reason has no Reason family, or an earlier date is chosen (3.12), THEN THE Inspector SHALL show no Epitaph line.
3. WHEN a failure card of 12.2, 12.7 or 10.10 shows THE card SHALL open with its Dry line of design C16, then its plain sentence, then its next step, if it has one, and its buttons, so the plain sentence and the next step keep their wording, order and buttons.
4. THE Dry line SHALL be one sentence of at most 10 words, SHALL name no capability, and SHALL sit inside the same card before the plain sentence, hidden from assistive technology, so the card's heading and announcement stay the plain sentence.
5. WHILE the Tour shows THE Tour card SHALL show the Guide ghost beside its step title.
6. WHILE the Welcome bar shows THE Welcome bar SHALL show the Guide ghost at its start, before its text.
7. THE Guide ghost SHALL be a still picture drawn by the Scene's own ghost drawing function into a small canvas inside the Tour card or the Welcome bar, SHALL be hidden from assistive technology, SHALL take no input, and SHALL never be drawn inside the Scene or beside a grave picture, so it never stands for an advisory.
8. WHILE a Live scan is loading THE scanning card SHALL show the Scanning line of design C16 under "This usually takes a few seconds.", as one more line in the same card.
9. THE mischief of this requirement SHALL add no new element outside the Panel, the failure cards of 12.2 and 12.7, the 10.10 card, the Tour card, the Welcome bar and the scanning card, SHALL add no speech bubble, floating element or tooltip, and SHALL add nothing that moves by itself; the Guide ghost is still under every motion setting.
10. THE Epitaph lines, Dry lines and the Scanning line SHALL be the exact texts of design C16, held in one file, with a test that fails when a shown line is not in that file.
