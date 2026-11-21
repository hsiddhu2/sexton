# Bugfix Requirements Document

## Introduction

`packages/engine/src/version.ts` reads `../package.json` at module evaluation through `createRequire(import.meta.url)`. That works from source and under Vitest. When the engine is bundled into a Lambda with esbuild, `../package.json` is not resolvable at runtime, the module throws `Cannot find module '../package.json'`, and every cold start of the API crashes. Because `USER_AGENT` is built from `ENGINE_VERSION`, every outbound request depends on that read (R-SG-8).

The bug condition is: the module `version.ts` is evaluated in an environment where `../package.json` is not resolvable at runtime, such as a bundle.

The fix makes `ENGINE_VERSION` a plain string constant and adds a test that asserts it equals the `version` in `packages/engine/package.json`, so the two cannot drift. The same change adds `**/cdk.out/**` to the ESLint ignores, because the current `cdk.out/**` pattern matches only a root-level folder and the CDK app in `infra` writes its output below it.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN `version.ts` is evaluated in a bundle where `../package.json` is not resolvable THEN the system throws "Cannot find module '../package.json'" and the Lambda cold start crashes
1.2 WHEN `version.ts` is evaluated in a bundle THEN the system does not export `ENGINE_VERSION` or `USER_AGENT`, so no outbound request can be built
1.3 WHEN the `version` in `packages/engine/package.json` is changed THEN the system has no check that ties it to a version string held anywhere else in the engine
1.4 WHEN ESLint runs and a `cdk.out` folder exists below `infra` or any other package THEN the system lints the generated files, because the pattern `cdk.out/**` matches only the repository root

### Expected Behavior (Correct)

2.1 WHEN `version.ts` is evaluated in any environment, including a bundle where `../package.json` is not resolvable, THEN the system SHALL complete evaluation without throwing and without importing any module
2.2 WHEN `version.ts` is evaluated THEN the system SHALL export `ENGINE_VERSION` as a plain string constant and `USER_AGENT` SHALL match `/^sexton\/\d+\.\d+\.\d+ \(\+https:\/\/github\.com\/hsiddhu2\/sexton\)$/`
2.3 WHEN the engine test suite runs THEN the system SHALL assert that `ENGINE_VERSION` equals the `version` in `packages/engine/package.json`, and the suite SHALL fail if they differ
2.4 WHEN ESLint runs THEN the system SHALL ignore every `cdk.out` folder at any depth through the pattern `**/cdk.out/**`

### Unchanged Behavior (Regression Prevention)

3.1 WHEN `USER_AGENT` is built THEN the system SHALL CONTINUE TO produce `sexton/<ENGINE_VERSION> (+<REPO_URL>)`
3.2 WHEN `REPO_URL` is read THEN the system SHALL CONTINUE TO equal `https://github.com/hsiddhu2/sexton`
3.3 WHEN a consumer imports `ENGINE_VERSION`, `USER_AGENT` or `REPO_URL` from `version.ts` or from the engine index THEN the system SHALL CONTINUE TO provide those names, and no other export name of the engine index SHALL change
3.4 WHEN `version.ts` is evaluated from source or under Vitest THEN the system SHALL CONTINUE TO evaluate successfully and every existing test, including `test/http.test.ts` and `test/index.test.ts`, SHALL CONTINUE TO pass
3.5 WHEN ESLint runs on files that are not under a `cdk.out` folder THEN the system SHALL CONTINUE TO lint them with the same rules and the same existing ignores
