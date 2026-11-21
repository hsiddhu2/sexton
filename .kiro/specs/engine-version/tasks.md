# Implementation Plan

Run the exploration and preservation tests on the UNFIXED `version.ts` before any fix. All paths are under packages/engine unless stated. No network in tests.

- [x] 1. Write bug condition exploration test
  - **Property 1: Bug Condition** - version.ts evaluates without package.json
  - **CRITICAL**: This test MUST FAIL on unfixed code. Failure confirms the bug exists.
  - **DO NOT attempt to fix the test or the code when it fails**
  - **GOAL**: Surface the counterexample that shows `version.ts` throws when `../package.json` is not resolvable
  - **Scoped PBT Approach**: The domain is two bundler-like transforms (T1 no manifest beside the module, T2 `createRequire` replaced by a throwing stub), so run them with `it.each`
  - _Bug_Condition: isBugCondition(X) where X.module = version.ts AND NOT resolvable("../package.json", X.environment)_
  - _Expected_Behavior: module evaluates, exports ENGINE_VERSION, REPO_URL and USER_AGENT, USER_AGENT matches the regex_
  - _Requirements: 1.1, 1.2, 2.1, 2.2_

  - [x] 1.1 Write the exploration test in test/version.test.ts
    - Read src/version.ts, transpile with `ts.transpileModule` (typescript 5.7.2, ES2022 module output), apply the transform, write to `<mkdtemp under os.tmpdir()>/a/version.js`, and `await import(pathToFileURL(file).href)`.
    - Assert `<tmp>/package.json` does not exist, the import resolves, the namespace keys equal `["ENGINE_VERSION", "REPO_URL", "USER_AGENT"]`, and `USER_AGENT` matches `/^sexton\/\d+\.\d+\.\d+ \(\+https:\/\/github\.com\/hsiddhu2\/sexton\)$/`.
    - Remove each temp folder in `afterEach`.
    - _Requirements: 1.1, 1.2, 2.1, 2.2_

  - [x] 1.2 Run on unfixed code and record the counterexample
    - Run `npm test -w @sexton/engine -- version`. **EXPECTED OUTCOME**: T1 and T2 FAIL with `Cannot find module '../package.json'`.
    - Record the error text and the failing transform names in the task notes.
    - _Requirements: 1.1, 1.2_

- [x] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** - USER_AGENT format, REPO_URL and export names
  - **IMPORTANT**: Follow observation-first methodology. Observe on unfixed code that `USER_AGENT` is `sexton/0.1.0 (+https://github.com/hsiddhu2/sexton)` and that `version.ts` exports exactly `ENGINE_VERSION`, `REPO_URL` and `USER_AGENT`.
  - _Preservation: USER_AGENT template, REPO_URL, export names, existing tests_
  - _Requirements: 3.1, 3.2, 3.3, 3.4_

  - [x] 2.1 Write the preservation tests in test/version.test.ts
    - Import `../src/version.js` and `../src/index.js` directly (manifest resolvable, so the bug condition does not hold).
    - Assert `USER_AGENT` equals `sexton/${ENGINE_VERSION} (+${REPO_URL})` and matches the regex, `REPO_URL` equals `https://github.com/hsiddhu2/sexton`, the `version.ts` namespace keys equal the recorded list, and the engine index provides the same three values.
    - Add a fast-check property over `fc.tuple(fc.nat(), fc.nat(), fc.nat())` joined with dots: the template with the module's `REPO_URL` matches the regex. `numRuns` 100.
    - _Requirements: 3.1, 3.2, 3.3_

  - [x] 2.2 Run on unfixed code
    - Run `npm test -w @sexton/engine`. **EXPECTED OUTCOME**: the preservation tests PASS, and `test/http.test.ts` and `test/index.test.ts` PASS unedited.
    - _Requirements: 3.3, 3.4_

- [x] 3. Fix for version.ts reading package.json at runtime

  - [x] 3.1 Implement the fix in src/version.ts
    - Delete the `createRequire` import and the `require` and `manifest` bindings. Declare `export const ENGINE_VERSION = "0.1.0";` with no annotation. Keep the `REPO_URL` and `USER_AGENT` lines unchanged. Update the header comment to name `test/version.test.ts` as the drift check.
    - The file has no imports and uses no `node:` module.
    - _Bug_Condition: isBugCondition(X) from design_
    - _Expected_Behavior: expectedBehavior(result) from design, Property 1_
    - _Preservation: Property 2 and Property 4 from design_
    - _Requirements: 2.1, 2.2, 3.1, 3.2, 3.3, 3.4_

- [x] 4. Add the drift test
  - **Property 3: Drift equality** - ENGINE_VERSION equals the version in package.json
  - _Requirements: 2.3_

  - [x] 4.1 Add the drift test to test/version.test.ts
    - Read `new URL("../package.json", import.meta.url)` with `node:fs`, parse it, and assert `ENGINE_VERSION` equals `version`. Tests may read files; src may not.
    - Confirm the test fails when `ENGINE_VERSION` is temporarily set to another value, then restore it.
    - _Requirements: 2.3_

- [x] 5. Ignore cdk.out at any depth in ESLint

  - [x] 5.1 Edit eslint.config.js at the repository root
    - Add `"**/cdk.out/**"` to the `ignores` array. Keep the existing `"cdk.out/**"` entry and every other entry.
    - No test file. The check is task 7.2.
    - _Requirements: 2.4, 3.5_

- [x] 6. Rerun the exploration test

  - [x] 6.1 Verify the bug condition exploration test now passes
    - **Property 1: Expected Behavior** - version.ts evaluates without package.json
    - **IMPORTANT**: Re-run the SAME exploration test from task 1 in test/version.test.ts. Do NOT write a new test.
    - Run `npm test -w @sexton/engine -- version`. **EXPECTED OUTCOME**: T1 and T2 PASS.
    - _Requirements: 2.1, 2.2_

  - [x] 6.2 Verify the preservation and drift tests still pass
    - **Property 2: Preservation**, **Property 3: Drift equality** and **Property 4: Preservation** - re-run the SAME tests from tasks 2 and 4 in test/version.test.ts. Do NOT write new tests.
    - **EXPECTED OUTCOME**: all PASS.
    - _Requirements: 2.3, 3.1, 3.2, 3.3, 3.4_

- [x] 7. Checkpoint - Ensure all gates pass

  - [x] 7.1 Run `npm run typecheck` at the repository root
    - Confirm the literal type of `ENGINE_VERSION` causes no error in any package.
    - _Requirements: 3.3, 3.4_

  - [x] 7.2 Run `npm run lint` at the repository root
    - Zero warnings allowed. Confirm the new test file and eslint.config.js pass.
    - _Requirements: 2.4, 3.5_

  - [x] 7.3 Run `npm test` at the repository root
    - Ensure all tests pass, ask the user if questions arise. Confirm `git status` shows no leftover temp files in the repository.
    - _Requirements: 3.4_
