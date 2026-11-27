# Implementation Plan: migration-node-sass

## Overview

Fills the `migrate` kind with the node-sass to sass recipe: Recipe and Edit types, the File source port with caps in the runner, the review-site scanner, migration data and version choice, the recipe, the default registry, the planner, intent, body and attach changes, two corrections to the remediation spec, recorded fixtures with a sample repository, and the demo. All paths are under packages/engine unless stated.

- [x] 1. Spec
  - Verify the sass-loader minimum against the sass-loader changelog and source, record the URLs, write requirements.md, design.md and tasks.md, and commit.
  - _Requirements: 3.3, 4.2_

- [x] 2. Types and contract
  - Recipe, RecipeInput, RecipeOutcome, RecipeResult, ReviewSite, ReviewComment, ScanCounts, PackageJsonView, MigrationData, MigrationDetail, FileSource; the add-dependency op; `PrIntent.files` one or more and `reviewComments`; `RemediationPlan.edits` and `migration`.
  - _Requirements: 5.4, 5.5, 7.1_

  - [x] 2.1 src/types.ts additions and the remediation test arbitraries updated to the new Recipe shape
    - _Requirements: 5.4, 7.1_

  - [x] 2.2 API contract re-exports and type tests; web validator requires `reviewComments`; web arbitraries and validator tests
    - _Requirements: 7.1, 7.2_

  - [x] 2.3 src/intake/scripts.ts `readPackageScripts` with tests
    - _Requirements: 8.1, 8.2_

- [x] 3. File source and caps
  - _Requirements: 1.1 to 1.9_

  - [x] 3.1 src/remediation/file-source.ts `InMemoryFileSource` and safe-path.ts, and a test that no file under src/remediation imports node:fs or calls fetch
    - _Requirements: 1.1, 1.2, 1.4_

  - [x] 3.2 src/remediation/capped-source.ts with property 24 (caps part)
    - _Requirements: 1.3 to 1.9_

- [x] 4. Review sites
  - _Requirements: 2.1 to 2.7, 5.7_

  - [x] 4.1 src/remediation/review-sites.ts and review-comments.ts with examples
    - _Requirements: 2.1 to 2.6, 5.7_

  - [x] 4.2 Properties 23 and 27
    - _Requirements: 2.7, 5.7_

- [x] 5. Migration data and version choice
  - _Requirements: 3.1 to 3.6, 9.2_

  - [x] 5.1 src/remediation/version-data.ts extracted from gather-bump-data.ts, behaviour unchanged
    - _Requirements: 3.5, 3.6_

  - [x] 5.2 src/remediation/migration-candidates.ts and gather-migration-data.ts with properties 28 and 29
    - _Requirements: 3.1 to 3.6_

- [x] 6. Recipe, registry, planner, intent, body and attach
  - _Requirements: 1.3, 1.9, 3.7, 4.1 to 4.11, 5.1 to 5.8, 6.1 to 6.5, 7.1, 9.3_

  - [x] 6.1 src/remediation/recipe-notes.ts and node-sass-recipe.ts with properties 21 and 22
    - _Requirements: 3.7, 4.1 to 4.10_

  - [x] 6.2 recipes.ts DEFAULT_RECIPE_REGISTRY, choose-kind.ts default, run-migrations.ts
    - _Requirements: 1.3, 1.9, 4.1, 5.1, 5.2_

  - [x] 6.3 plan.ts migrate branch, pr-intent.ts, pr-body.ts sections, attach.ts summary, with properties 25 and 26; remediation tests updated (fixture test passes EMPTY, property 16 accepts migrate)
    - _Requirements: 5.2 to 5.8, 6.1 to 6.5, 9.3_

  - [x] 6.4 src/index.ts exports and the index test
    - _Requirements: 5.1, 7.1_

- [x] 7. Corrections to the remediation spec
  - escape-field.ts neutralises U+200E, U+200F, U+061C (remediation property 11 and examples); version-data.ts caps distinct advisory IDs at 200 with "too many advisories"; Correction section in .kiro/specs/remediation/design.md; requirements 2.20, 2.21, 2.22, 5.2, 5.6, 5.9 and 5.14 of the remediation spec edited (spec commit); its tasks.md untouched.
  - _Requirements: 9.1, 9.2, 9.3_

- [x] 8. Fixtures
  - _Requirements: 2.1 to 2.3, 3.1, 4.2, 4.5, 4.7, 4.11, 6.2_

  - [x] 8.1 scripts/record-fixtures.mjs --migration records sass and sass-loader into test/fixtures/migration/packages; run once with network
    - _Requirements: 3.1_

  - [x] 8.2 Sample repository test/fixtures/migration/node-sass-app, expected-migration.md checked by hand, and the recorded test: 3 edits, 4 review sites, filesChanged ["package.json"]
    - _Requirements: 2.1 to 2.3, 4.2, 4.5, 4.7, 4.11, 6.2_

- [x] 9. Demo
  - packages/api/scripts/generate-demo-scan.mjs runs the migration for node-sass with the sample repository; remediation-routes.mjs answers from the migration fixtures; regenerate packages/web/public/demo/scan.json; demo generator test.
  - _Requirements: 7.3_

- [x] 10. Close
  - Root gates, independent reviews before each commit in build/reviews/06-migration-node-sass.md, merge to main with --no-ff, gates on main.
  - _Requirements: 1.2_
