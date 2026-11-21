# engine-version Bugfix Design

## Overview

`packages/engine/src/version.ts` computes `ENGINE_VERSION` by calling `createRequire(import.meta.url)` and requiring `../package.json`. Source runs and Vitest runs find the file. A Lambda bundle built with esbuild does not contain `packages/engine/package.json` next to the bundled code, so module evaluation throws and the API crashes on every cold start.

The fix replaces the runtime read with a string literal, `export const ENGINE_VERSION = "0.1.0"`. `version.ts` then has no imports and is pure. A new test reads `package.json` with `node:fs` and asserts equality, which keeps the literal and the manifest from drifting. The same change adds `**/cdk.out/**` to the ESLint ignores.

This is the only runtime file read in `packages/engine/src`. The engine rule "no filesystem" is violated today by this read and is satisfied after the fix. Tests may read files; the engine may not.

## Glossary

- **Bug_Condition (C)**: Module evaluation of `version.ts` in an environment where `../package.json` is not resolvable at runtime, such as an esbuild bundle
- **Property (P)**: In that environment the module still evaluates, and `USER_AGENT` matches `/^sexton\/\d+\.\d+\.\d+ \(\+https:\/\/github\.com\/hsiddhu2\/sexton\)$/`
- **Preservation**: The `USER_AGENT` format, `REPO_URL`, every export name and every existing test stay as they are
- **ENGINE_VERSION**: The engine version string exported from `packages/engine/src/version.ts`
- **USER_AGENT**: `sexton/<ENGINE_VERSION> (+<REPO_URL>)`, sent on every outbound request (R-SG-8)
- **Bundler-like transform**: A rewrite of the module source or its environment that removes `createRequire` or makes `require("../package.json")` throw
- **Drift**: `ENGINE_VERSION` and the `version` in `packages/engine/package.json` holding different values

## Bug Details

### Bug Condition

The bug manifests when `version.ts` is evaluated without `../package.json` being resolvable. The top-level statement `require("../package.json")` then throws before any export is bound.

**Formal Specification:**
```
FUNCTION isBugCondition(X)
  INPUT: X of type ModuleEvaluation (source of version.ts, evaluation environment)
  OUTPUT: boolean

  RETURN X.module = "packages/engine/src/version.ts"
         AND NOT resolvable("../package.json", X.environment)
END FUNCTION
```

### Examples

- esbuild bundles `packages/api` into one file. `version.ts` is inlined, `createRequire(import.meta.url)` points at the bundle, `../package.json` does not exist beside it. Expected: `USER_AGENT` is `sexton/0.1.0 (+https://github.com/hsiddhu2/sexton)`. Actual: `Error: Cannot find module '../package.json'` at cold start.
- The source is transpiled and written to a temporary folder with no `package.json` one level up. Expected: it imports and exports the three names. Actual: the import rejects.
- A transform replaces `createRequire` with a function that throws. Expected: no effect, because no call remains. Actual: the import rejects.
- Edge case, not a bug: Vitest imports `../src/version.js` from the repository. `../package.json` resolves, so the module evaluates as expected before and after the fix.

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- `USER_AGENT` is `sexton/${ENGINE_VERSION} (+${REPO_URL})`
- `REPO_URL` is `https://github.com/hsiddhu2/sexton`
- `version.ts` exports `ENGINE_VERSION`, `REPO_URL` and `USER_AGENT`, and `src/index.ts` re-exports them unchanged
- Every other export name of `src/index.ts` is unchanged
- `test/http.test.ts` and `test/index.test.ts` pass without edits
- ESLint rules and the existing ignores are unchanged

**Scope:**
All evaluations where `../package.json` is resolvable are unaffected, which includes source runs, Vitest runs and `tsc -b` output run from `packages/engine/dist`. Files outside any `cdk.out` folder are linted as before.

## Hypothesized Root Cause

1. **Runtime manifest read**: `version.ts` obtains the version through `createRequire` and a relative path. esbuild does not follow `createRequire(import.meta.url)` calls with a relative path, so `package.json` is not inlined. This is the confirmed cause, since the file is the only place that reads the manifest and the error text names it.
2. **Path relative to the module, not the bundle**: Even if the call were resolved, `../package.json` is relative to `src/` in the source tree and has no meaning relative to a bundle output file.
3. **No drift check, so a literal was avoided**: Reading the manifest was a way to avoid keeping two copies of the version. Nothing replaced that guarantee, which is why the literal needs the drift test.
4. **ESLint ignore too narrow (separate defect)**: `cdk.out/**` in a flat config is anchored at the repository root, so `infra/cdk.out` is not matched.

## Correctness Properties

Property 1: Bug Condition - version.ts evaluates without package.json

_For any_ bundler-like transform T in {no `package.json` beside the module, `createRequire` replaced by a function that throws} where the bug condition holds (isBugCondition returns true), the fixed `version.ts` SHALL evaluate without throwing, SHALL export `ENGINE_VERSION`, `REPO_URL` and `USER_AGENT`, and `USER_AGENT` SHALL match `/^sexton\/\d+\.\d+\.\d+ \(\+https:\/\/github\.com\/hsiddhu2\/sexton\)$/`.

**Validates: Requirements 2.1, 2.2**

Property 2: Preservation - USER_AGENT format

_For any_ semver-shaped `ENGINE_VERSION` (major, minor and patch each a non-negative integer), the string `sexton/${ENGINE_VERSION} (+${REPO_URL})` SHALL match `/^sexton\/\d+\.\d+\.\d+ \(\+https:\/\/github\.com\/hsiddhu2\/sexton\)$/`, and the module's own `USER_AGENT` SHALL equal that template for the module's own `ENGINE_VERSION` and `REPO_URL`, as it did before the fix.

**Validates: Requirements 2.2, 3.1, 3.2, 3.4**

Property 3: Drift equality

_For any_ state of the repository, `ENGINE_VERSION` SHALL equal the `version` field of `packages/engine/package.json`.

**Validates: Requirements 2.3**

Property 4: Preservation - export names

_For any_ consumer import of `version.ts` or the engine index, the export names of `version.ts` SHALL be exactly `ENGINE_VERSION`, `REPO_URL` and `USER_AGENT`, and the engine index SHALL still provide those three names with the same values.

**Validates: Requirements 3.3, 3.4**

## Fix Implementation

### Changes Required

**File**: `packages/engine/src/version.ts`

**Specific Changes**:
1. **Remove the runtime read**: Delete the `createRequire` import, the `require` binding and the `manifest` binding. The file has no imports and uses no `node:` module.
2. **Literal constant**: `export const ENGINE_VERSION = "0.1.0";` with no type annotation, so the exported type is the literal type `"0.1.0"`. Existing uses (a template literal and a regex check in `test/http.test.ts`) compile unchanged. The typecheck gate confirms this.
3. **Keep the rest**: `REPO_URL` and `USER_AGENT` lines are unchanged. Update the header comment to say the value is checked against the manifest by `test/version.test.ts`.

**File**: `packages/engine/test/version.test.ts` (new)

1. Holds the exploration test, the preservation tests and the drift test.

**File**: `eslint.config.js`

1. Add `"**/cdk.out/**"` to the `ignores` array. Keep the existing `"cdk.out/**"` entry.

### Exploration test approach

Choice: transpile `src/version.ts` with `ts.transpileModule`, write the output to a fresh `mkdtempSync(join(tmpdir(), "sexton-version-"))` folder, and `await import(pathToFileURL(file).href)`.

Why this one:
- It runs the real file contents, not a copy of the logic, so it fails on the unfixed source for the real reason (`Cannot find module '../package.json'`) and passes after the fix.
- It needs no loader hooks and no experimental flags. `node:vm` `SourceTextModule` requires `--experimental-vm-modules`, and a `data:` URL import cannot resolve `createRequire(import.meta.url)` meaningfully, since `import.meta.url` is a `data:` URL and `createRequire` rejects it with a different error. That would make the unfixed failure a false positive for the wrong reason.
- `typescript` 5.7.2 is already a devDependency, so there is no new dependency.
- A precondition assertion checks that `<tmp>/package.json` does not exist, so the test cannot pass or fail because of a stray manifest above the temp folder. The module sits in a nested folder `<tmp>/a/version.js`, so `../package.json` resolves to `<tmp>/package.json`, which the test controls.

Two bundler-like transforms are applied to the transpiled text before writing, run with `it.each` because the domain is finite:
- T1, no manifest: no change to the text. The environment has no `package.json` beside it.
- T2, stripped `createRequire`: replace the `node:module` import with `const createRequire = () => () => { throw new Error("Cannot find module '../package.json'"); };`. The replacement is a regex on the transpiled text. On the fixed source there is no such import, so the transform changes nothing and the module still evaluates.

Each case asserts the import resolves, the namespace keys equal the recorded list, and `USER_AGENT` matches the regex. Temp folders are removed in `afterEach` with `rmSync(..., { recursive: true, force: true })`. Imports of the same path are cached by Node, so every case writes into its own `mkdtemp` folder.

The test imports `node:fs`, `node:os`, `node:path`, `node:url` and `typescript`. That is allowed in `test/`; the engine rules restrict `src/`.

### Drift test

```
const manifest = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version: string };
expect(ENGINE_VERSION).toBe(manifest.version);
```

The path is resolved from the test file, so it points at `packages/engine/package.json`.

### Release process note

Bumping `version` in `packages/engine/package.json` now also needs `ENGINE_VERSION` in `src/version.ts` bumped in the same commit. If one is missed, `test/version.test.ts` fails with both values in the message. Add this line to the release checklist when one exists; no new file is created for it by this spec.

## Testing Strategy

### Validation Approach

First surface the counterexample on unfixed code with the exploration test, record preservation behavior on unfixed code, then apply the fix and rerun both. No network access in any test.

### Exploratory Bug Condition Checking

**Goal**: Show the bug on unfixed code, and confirm or refute the root cause.

**Test Plan**: In `packages/engine/test/version.test.ts`, run the two transforms above against the unfixed source and assert the module evaluates. Run on unfixed code and record the error.

**Test Cases**:
1. **No manifest beside the module (T1)**: transpiled `version.ts` in a temp folder with no `package.json` one level up (will fail on unfixed code)
2. **Stripped createRequire (T2)**: same, with `createRequire` replaced by a throwing stub (will fail on unfixed code)
3. **Precondition**: `<tmp>/package.json` does not exist (passes on both)

**Expected Counterexamples**:
- Import rejects with `Cannot find module '../package.json'` for T1 and T2
- If T1 passes on unfixed code, the root cause is refuted for that environment and the temp-folder layout needs to be re-checked before continuing

### Fix Checking

**Goal**: For every input where the bug condition holds, the fixed module evaluates and satisfies P.

**Pseudocode:**
```
FOR ALL T IN {T1, T2} WHERE isBugCondition(T) DO
  ns := import(transpile(version.ts) under T)
  ASSERT ns evaluates without throwing
  ASSERT keys(ns) = ["ENGINE_VERSION", "REPO_URL", "USER_AGENT"]
  ASSERT ns.USER_AGENT MATCHES /^sexton\/\d+\.\d+\.\d+ \(\+https:\/\/github\.com\/hsiddhu2\/sexton\)$/
END FOR
```

### Preservation Checking

**Goal**: For every input where the bug condition does not hold, behavior is the same before and after.

**Pseudocode:**
```
FOR ALL input WHERE NOT isBugCondition(input) DO
  ASSERT version_original(input) = version_fixed(input)
END FOR
```

**Testing Approach**: The inputs are the module's values and names, so the preservation tests read `../src/version.js` and `../src/index.js` directly and pass on unfixed code. The format check uses fast-check over semver-shaped strings, `numRuns` 100. That check validates the regex against the template with the module's `REPO_URL`; it does not substitute a version into the module, because the unfixed module cannot be given a version without a manifest. The module-level equality check covers the real value.

**Test Cases**:
1. **USER_AGENT template**: `USER_AGENT` equals `sexton/${ENGINE_VERSION} (+${REPO_URL})` and matches the regex
2. **REPO_URL**: equals `https://github.com/hsiddhu2/sexton`
3. **Export names**: `version.ts` namespace keys are exactly the recorded list, and the engine index provides the same three values
4. **Existing tests**: `test/http.test.ts` and `test/index.test.ts` pass unedited

### Unit Tests

- Exploration cases T1 and T2 with the temp-folder precondition
- Drift equality against `package.json`
- Recorded export-name list for `version.ts`
- ESLint ignore: no unit test. The check is that root `npm run lint` passes with zero warnings after the change

### Property-Based Tests

- fast-check over `fc.tuple(fc.nat(), fc.nat(), fc.nat())` joined with dots: the USER_AGENT template matches the regex for every generated version, `numRuns` 100
- The exploration cases are a two-element finite domain and use `it.each`, not fast-check

### Integration Tests

- Root `npm run typecheck`, `npm run lint` and `npm test` pass
- Bundle check is not added here. Bundling happens in the API build, which does not exist yet. The exploration test stands in for it by removing the manifest. The first API bundle task should rely on this test.
