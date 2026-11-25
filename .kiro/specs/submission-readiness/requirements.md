# Requirements Document

## Introduction

The submission-readiness spec gets the repository ready to be read by judges when it goes public on 2 December 2026. It corrects two product claims, brings the README in line with main, adds a one-page guide for judges, closes ten cleanup items, sweeps every tracked file, adds the browser test suite to CI and checks the licence files.

Every factual line this spec writes is checked first against the code on main or against a linked source, and the check is recorded in design.md. Every date in a line this spec writes is given in full, with day, month and year.

This spec changes docs/requirements.md (section 2, the release 0.1 signal line and the change log), README.md (all but the sections "Try it in two minutes" and "Built with Kiro"), packages/web/test/readme.test.ts (the heading list and the replay links it pins), docs/threat-model.md, ROADMAP.md, CREDITS.md, a new docs/JUDGES.md, finished spec and review text, .gitignore, sexton.policy.yml, .github/workflows/ci.yml (one new job), and these code paths: packages/engine/src (the concurrency helper, the owner check, the publisher word), packages/engine/scripts/record-fixtures.mjs, the record scripts in packages/engine/package.json, and their tests.

It does not change packages/web/src, packages/web/e2e, the pictures in docs, the README sections "Try it in two minutes" and "Built with Kiro", .kiro/steering, .kiro/hooks, .kiro/agents, .kiro/settings or infra. It adds no dependency and deploys nothing. It changes no state rule, no state reason text, no API field and no evidence field name.

## Glossary

- **Claim A**: the statement that no API exposes maintainer or provenance history, in any wording.
- **Claim B**: the statement that no open-source tool combines Sexton's parts, in any wording.
- **Packument**: the npm registry document for one package at `https://registry.npmjs.org/<name>`, as defined in history-signals.
- **Partial overlap**: a tool that does part of what Sexton does. This spec names three: Socket, npq and Renovate.
- **Owned README**: README.md without the section "Try it in two minutes", which lane 1 owns, and without the section "Built with Kiro", which lane 3 owns.
- **Judge guide**: docs/JUDGES.md.
- **Hosted site**: https://de1giv8lj8sfh.cloudfront.net, the CloudFront distribution that serves the web app and the API.
- **Tracked file**: a file listed by `git ls-files` on the spec branch.
- **Sweep**: a search of every Tracked file for the five kinds of finding in Requirement 6.
- **First commit**: the root commit of main, 8bfc8cb.
- **Missing publisher word**: the word shown where a publish record has no publisher name.
- **e2e suite**: the Playwright tests in packages/web/e2e, run by `npm run test:e2e -w @sexton/web`.
- **Gates**: `npm run typecheck`, `npm run lint` and `npm test` at the root, with zero warnings.

## Requirements

### Requirement 1: Claim A corrected

**User Story:** As a judge, I want the problem statement to be true, so that I trust the rest of the repository.

#### Acceptance Criteria

1. THE spec SHALL search every Tracked file outside packages/web/src and packages/web/e2e for Claim A in any wording, and SHALL list each place found in design.md with its path, line and text before the change and after it.
2. WHERE Claim A appears in a path this spec may change, THE spec SHALL replace it with text that says the Packument lists, for each version, its maintainers, the account that published it (`_npmUser`) and its provenance attestations (`dist.attestations`), and that says what Sexton does with them.
3. THE replacement text SHALL say what the Packument does not give, only where that is checked against a recorded Packument or the registry documentation and the source is recorded in design.md.
4. WHERE Claim A appears in a path this spec may not change, or in a dated review record, THE spec SHALL leave it unchanged and SHALL record the path and the reason in design.md.

### Requirement 2: Claim B corrected

**User Story:** As a judge, I want the comparison with other tools to be fair, so that the claim of what is new holds up.

#### Acceptance Criteria

1. THE spec SHALL search every Tracked file outside packages/web/src and packages/web/e2e for Claim B in any wording, and SHALL list each place found in design.md with its path, line and text before and after.
2. WHERE Claim B appears in a path this spec may change, THE spec SHALL replace it with text that names Socket, npq and Renovate as Partial overlaps, each with a link to its own README or documentation and one line on what it does.
3. THE spec SHALL check each such line against the linked README or documentation on the day it is written, and SHALL record the link and the date in design.md.
4. THE replacement text SHALL say what Sexton adds and SHALL NOT say that no tool, or no open-source tool, does what Sexton does.
5. THE README comparison section SHALL match the replacement text, and each tool line already there SHALL be checked under criterion 3 or removed.

### Requirement 3: README

**User Story:** As a judge, I want the README to describe main as it is today, so that I can tell what is built from what is planned.

#### Acceptance Criteria

1. THE spec SHALL change only the Owned README and SHALL leave the sections "Try it in two minutes" and "Built with Kiro", where present, byte for byte as they are on main when main is merged in.
2. THE Owned README SHALL hold a section "Limits" that says, in short sentences: what Sexton cannot see; that the demo and the two replays are recorded data, not a live scan; that the demo leaves out per-version maintainer history and why; and that the new-dependency rule has no measurement on a real repository yet.
3. THE state table in the Owned README SHALL match the state rules and their order in packages/engine/src/state.ts.
4. THE signal list in the Owned README SHALL match the twelve signal names of packages/engine/src/types.ts and the seven product signals of docs/requirements.md.
5. WHEN the Owned README says a feature is on main, in progress or planned, THE label SHALL match main at the time of writing, and each label changed SHALL be listed in design.md with the check that supports it.
6. THE Owned README SHALL hold a section "Pre-existing code and tools" that gives the First commit date, 7 November 2026, says it is after the hackathon start of 30 October 2026, and lists every file in the repository not written for Sexton with its source and licence.
7. THE spec SHALL check the First commit date with `git log --reverse` and SHALL record the command output in design.md.
8. THE Owned README SHALL link the Judge guide from its Documentation section.

### Requirement 4: Judge guide

**User Story:** As a judge, I want one page that tells me what to open and what to click, so that I can assess Sexton in a few minutes.

#### Acceptance Criteria

1. THE spec SHALL add docs/JUDGES.md, at most one printed page of about 60 lines.
2. THE Judge guide SHALL say what to open (the Hosted site, the two replay links), what to click (a grave, its drawer, the pull request preview, the replay controls), and what each of the five states means, in the rule order of the engine.
3. THE Judge guide SHALL say how to run the CLI from a clone, with commands that run on main, and what the GitHub Action does on a pull request.
4. THE Judge guide SHALL give the paths of the specs, the steering files, the hooks and the agents.
5. THE Judge guide SHALL name only controls, commands, paths and links that exist on main or on the Hosted site, and each SHALL be checked before it is written.

### Requirement 5: Cleanup list

**User Story:** As a judge reading the code, I want no loose ends, so that the repository reads as finished work.

#### Acceptance Criteria

1. THE spec SHALL confirm that the committed .kiro/agents/impl.md has its two `effect: ask` shell rules, SHALL NOT edit that file, and SHALL record the check in design.md.
2. THE spec SHALL add `self-scan.out` to .gitignore, and `git check-ignore self-scan.out` SHALL then succeed, and `git ls-files` SHALL list no file of that name.
3. THE Glossary entry "Provenance regression" in .kiro/specs/history-signals/requirements.md SHALL use the Version order of that Glossary, as Requirement 7 and `evaluateProvenanceRegression` do, and SHALL NOT say "strictly earlier publish time".
4. THE function `mapWithConcurrency` and the constant `PACKAGE_CONCURRENCY` SHALL live in packages/engine/src/util/concurrency.ts, every import SHALL point there, and the public exports of `@sexton/engine` SHALL be unchanged.
5. THE fixture recorder SHALL take the npm packument, attestations and deps.dev URLs from the engine's URL builders (`packumentUrl`, `attestationsUrl`, `dependenciesUrl`) and SHALL NOT define its own copies.
6. THE policy file sexton.policy.yml SHALL forbid the state Haunted in its `forbid_state` rule, with the rule name updated to match, WHEN `npm run scan:self` passes with it. IF it does not pass and no fixed version is available without a new dependency, THEN THE spec SHALL leave Haunted out and SHALL record the advisory and the reason in design.md.
7. EVERY tasks.md in .kiro/specs on main a01fcce, and this spec's tasks.md, SHALL treat the section "Task Dependency Graph" the same way, as the owner decides at go, and design.md SHALL record the decision and its reason.
8. THE function `isValidOwner` SHALL reject the reserved name `orgs`, as `parseRepoUrl` does, so that FOR ANY owner string that holds no `/` and ANY repository string that `isValidRepo` accepts, `isValidOwner(owner)` is true if and only if `parseRepoUrl("https://github.com/" + owner + "/" + repo).ok` is true (agreement).
9. THE third line of build/reviews/05-remediation.md SHALL say "the project review rules" in place of the private file name.
10. WHERE a publish record has no publisher name, THE state reason, the evidence summary and the pull request body row SHALL all show the word "unknown".

### Requirement 6: Sweep

**User Story:** As the owner, I want every tracked file checked before the repository goes public, so that nothing private or broken is published.

#### Acceptance Criteria

1. THE spec SHALL search every Tracked file for: a tool or vendor name that does not belong to the product, its tests or its documented dependencies; a path under private/ or a path on the owner's machine; a secret or a string shaped like one; a TODO, FIXME or XXX with no owner; and a link that does not resolve.
2. THE spec SHALL list every finding in design.md with its path, line, kind and what was done.
3. WHERE a finding is in a path this spec may change, THE spec SHALL fix it, or SHALL record why it stays.
4. WHERE a finding is in a path this spec may not change, THE spec SHALL record it in the report for the lane that owns the path.
5. THE spec SHALL NOT remove a line from a guard that exists to detect one of these findings, such as .githooks, .gitignore, eslint.config.js, .kiro/hooks or a test that checks for a secret pattern.

### Requirement 7: Browser tests in CI

**User Story:** As the owner, I want the e2e suite to run on every push, so that a wrong browser result cannot reach main again.

#### Acceptance Criteria

1. THE CI workflow .github/workflows/ci.yml SHALL gain one job, `e2e`, that runs on `ubuntu-latest` after the `gates` job and runs the e2e suite.
2. THE `e2e` job SHALL cache the Playwright browsers, keyed on the installed Playwright version, and SHALL install the browser only when the cache misses and the system libraries in every run.
3. THE `e2e` job SHALL use only actions pinned to a full commit SHA with the tag in a comment, SHALL run with `permissions: contents: read` from the workflow, and SHALL use no secret and no AWS credential.
4. THE spec SHALL NOT change any other line of any file under .github.
5. WHEN the e2e suite fails, THE `e2e` job SHALL fail.

### Requirement 8: Licence and About

**User Story:** As a judge, I want the licence to be clear and correct, so that I know how the work may be used.

#### Acceptance Criteria

1. THE spec SHALL check that LICENSE is the unmodified Apache License 2.0 text and that NOTICE names the project and copyright holder.
2. THE spec SHALL check that every `license` field in the root and workspace package.json files says Apache-2.0, and SHALL fix any that does not.
3. CREDITS.md SHALL list every font file under packages/web/public/fonts and every vendored third-party file, with its source and licence.
4. THE spec SHALL check that /.kiro is tracked and that no .gitignore line ignores it.
5. THE report SHALL list what the owner must set by hand on GitHub: at least the About description, the website link, the topics, the visibility change on 2 December 2026, and whether GitHub detects the licence.

### Requirement 9: Process

**User Story:** As the owner, I want this spec built the same way as every other spec, so that it can be reviewed and merged safely.

#### Acceptance Criteria

1. THE spec SHALL change only the paths listed in the Introduction, plus private/PROGRESS-K6b.md and private/reports/K6b-submission-readiness.md, which git ignores.
2. THE Gates SHALL pass before every commit, and SHALL pass in a fresh clone installed with `npx npm@11 ci` before the report.
3. AN independent review that has not seen the work SHALL run before every commit, and its findings SHALL be recorded under "Review notes" in design.md.
4. THE change-log line of docs/requirements.md SHALL take the next free number when main is merged in.
5. THE spec SHALL push nothing, open no pull request and deploy nothing until the owner types push.
