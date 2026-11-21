# ADR 0001: Licences of development-only dependencies

Status: Accepted, 20 Nov 2026.
Decided by: Harpreet S. Siddhu.
Amends: N-7 in docs/requirements.md.

## Context

N-7 in version 0.1 of the product requirements said "All dependencies permissively licensed". That line did not separate what Sexton ships from the tools we use to build and test it.

The cemetery UI spec needs an accessibility checker in its tests. Requirement 10.4 of that spec runs the axe-core rules against the rendered page in jsdom. axe-core 4.14.1 is licensed MPL-2.0. MPL-2.0 is a weak copyleft licence. Its conditions apply to the MPL-licensed files themselves when you distribute them, and they do not spread to the rest of the code.

Sexton never distributes axe-core. The cemetery UI design makes it a dev dependency of `packages/web`. Only the tests import it, so the built web app does not include it. We also use it as published, with no changes.

So the old N-7 wording blocked a tool that, used this way, puts no duty on Sexton or its users. The two other options were worse. Dropping axe-core would mean a hand-written check set with far fewer rules. Ignoring the requirement would make N-7 a rule we do not follow.

## Decision

N-7 now reads:

> N-7. Licensing. Apache-2.0. All runtime dependencies permissively licensed. Development-only tools may carry a weak copyleft licence such as MPL-2.0 when used unmodified and never shipped, each recorded in docs/adr. Sexton scans itself in CI and must pass its own default policy.

A development-only dependency with a weak copyleft licence is allowed when all four of these hold.

1. It is in `devDependencies`, never in `dependencies`.
2. It is used as published, with no changes to its files.
3. It is never part of anything Sexton ships, such as the web bundle, the CLI package, the GitHub Action or a Lambda bundle.
4. It is recorded in docs/adr, with its exact version and licence. The table below is the place for it unless a later ADR takes over.

This ADR adds one rule that N-7 does not state. Strong copyleft licences such as GPL and AGPL stay out, even for development tools. Every runtime dependency stays permissively licensed.

## Recorded exceptions

| Package | Version | Licence | Where | Why | Since |
|---|---|---|---|---|---|
| axe-core | 4.14.1 | MPL-2.0 | `packages/web`, devDependencies | Accessibility rule check in jsdom tests, cemetery UI requirement 10.4 | 20 Nov 2026 |

axe-core is the first recorded exception.

## Consequences

Good:

1. The cemetery UI tests keep the full axe-core rule set.
2. N-7 now says what it means. Users get only permissively licensed code in what Sexton ships.

To watch:

1. Each new exception needs a row in the table above, in the same pull request that adds the package.
2. A change that moves an exception into `dependencies`, or bundles it, breaks this decision. A reviewer should check the dependency type and the build output when a recorded package changes version.
3. The amended N-7 wording has to be committed to docs/requirements.md with a version bump and a date, as that document asks for every change.
