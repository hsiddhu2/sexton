# Implementation Plan: remediation-remove-scope

## Overview

Exploration tests first, seen to fail on the unfixed code. Preservation tests next, passing before and after. Then the fix. Gates: `tsc -b`, `eslint . --max-warnings=0`, every package's tests and `npm run scan:self`. `.kiro/agents/impl.md` unchanged against origin/main.

- [x] 1. Exploration tests (fail on the unfixed code)
  - [x] 1.1 `packages/engine/test/remediation/apply-edits.test.ts`: a remove keeps `peerDependencies` and `optionalDependencies`; a name only in `peerDependencies` gives `name-absent`; a non-object `peerDependencies` does not refuse the Edit. Property 1.
    - _Requirements: bugfix 1.1, 1.2, 2.1, 2.2, 2.3_
  - [x] 1.2 `packages/cli/test/commands.test.ts`: with `build/webpack.config.js` requiring `left-pad`, no remove is proposed for it.
    - _Requirements: bugfix 1.3, 2.4_
  - [x] 1.3 `packages/cli/test/ports.test.ts`: walking a real temporary directory with a `build/` folder reports `unread` of 1.
    - _Requirements: bugfix 1.4, 2.5_
- [x] 2. Preservation tests (pass before and after)
  - [x] 2.1 A remove from `dependencies` and `devDependencies` (existing test) and Property 1's positive half.
    - _Requirements: bugfix 3.1_
  - [x] 2.2 `left-pad` is still proposed for removal with `node_modules/` and `.git/` paths in the listing.
    - _Requirements: bugfix 3.3_
  - [x] 2.3 The existing devDependencies, repository-target and migration tests, unchanged.
    - _Requirements: bugfix 3.2, 3.4, 3.5, 3.6_
- [x] 3. The fix
  - [x] 3.1 `apply-edits.ts`: `REMOVE_SECTIONS` for `remove-dependency`.
    - _Requirements: bugfix 2.1, 2.2, 2.3_
  - [x] 3.2 `count-references.ts`: `UNREAD_SOURCE_DIRECTORIES` and `isUnreadSourcePath`, exported from the engine index. Property 3.
    - _Requirements: bugfix 2.4_
  - [x] 3.3 `cli/src/compose.ts` and `cli/src/working-tree.ts`: unread paths and walked folders count as skipped for import sites; `TreeCounts.unread`.
    - _Requirements: bugfix 2.4, 2.5, 3.5_
- [x] 4. Gates and the six review notes
  - [x] 4.1 Root gates and `npm run scan:self`.
    - _Requirements: bugfix 3.6_
  - [x] 4.2 Record the outcome of the six other notes in design.md.
    - _Requirements: bugfix 2.1, 2.4_
