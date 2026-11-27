# Requirements Document

## Introduction

Release 0.1 puts the Sexton CLI and the Sexton MCP server on npm as two packages, `sexton` and `sexton-mcp`, published from GitHub Actions with provenance, and lists the server in the official MCP Registry. Each package is one bundled file with the engine inside, so neither depends on a workspace package. The engine is not published in 0.1.

This spec prepares the release. It adds a bundle build for the two packages, a release workflow, a release check, a `server.json` and a README section, and fixes `sexton --version`. It publishes nothing, creates no secret and changes no account setting. Every account step is the owner's, after his word, and is listed in design.md "Owner steps".

The workspace packages keep their `@sexton/*` names and every import stays as it is. The spec changes no scoring, no state rule, no policy rule, no plan, no tool and no output of the CLI or the server other than the `--version` line.

## Glossary

- **Workspace package**: `@sexton/engine`, `@sexton/cli` or `@sexton/mcp` under `packages/`, used for development and never published.
- **Published package**: `sexton` (the CLI, bin `sexton`) or `sexton-mcp` (the MCP server, bin `sexton-mcp`).
- **Release folder**: `build/release/<published package>/`, written by `scripts/build-release.mjs`: the folder npm publishes.
- **Bundle**: one ES module file with every dependency inside, built by esbuild with the options in `scripts/lib/bundle.mjs`. The Kiro Power's server file (spec sexton-power) is one.
- **Pack**: the tarball `npm pack` builds from a Release folder, the exact file set npm would publish.
- **Third-party notices**: `THIRD-PARTY-NOTICES.md` in a Release folder: each third-party package in the Bundle with its version, licence and licence text.
- **Release tag**: a git tag of the form `vMAJOR.MINOR.PATCH`, pushed to the repository.
- **Release version**: the Release tag without its `v`.
- **Release workflow**: `.github/workflows/release.yml`.
- **Release check**: `scripts/release-check.mjs` and the pure function `releaseProblems` in `scripts/lib/release.mjs`.
- **Trusted publishing**: npm's OIDC publishing, where npm exchanges a GitHub Actions OIDC token for a short-lived publish token. No npm token is stored.
- **Provenance**: the signed npm attestation that links a package version to the commit and workflow that built it.
- **MCP Registry**: the official registry at `registry.modelcontextprotocol.io`, which holds server metadata, not code.
- **server.json**: `packages/mcp/server.json`, the metadata the MCP Registry takes for the server.
- **Server name**: the `name` in server.json and the `mcpName` of `sexton-mcp`, `io.github.hsiddhu2/sexton`.

## Requirements

### Requirement 1: Names

**User Story:** As the owner, I want to publish under names that are free and mine, so that the first publish does not fail or land on a name someone else holds.

#### Acceptance Criteria

1. THE check of names SHALL be read-only: registry reads only, no login, no publish.
2. THE Published packages SHALL be named `sexton` and `sexton-mcp`, both free on npm on 27 Nov 2026. The scope `@sexton` belongs to another user and SHALL NOT be used.
3. THE Workspace packages SHALL keep their names and SHALL be marked `private`, so that npm refuses to publish them.

### Requirement 2: Published packages

**User Story:** As a user installing Sexton from npm, I want each package to be one file that runs on its own and says where it came from, so that I can trust and audit what I install.

#### Acceptance Criteria

1. EACH Published package SHALL hold only its Bundle, `README.md`, `LICENSE`, `NOTICE`, the Third-party notices and `package.json`.
2. NO Pack SHALL hold a source map, a test, a test fixture, a source file, a file under a private folder or a machine path.
3. NO Published package SHALL have a dependency of any kind, and no Bundle SHALL import an `@sexton/*` package.
4. EACH Published package SHALL name `repository` (with `directory`), `homepage`, `bugs`, `author` "Harpreet Singh Siddhu", `publishConfig` with `access: public` and `provenance: true`, and `engines.node` `>=20.19.0`, the Node its Bundle is built for.
5. THE Third-party notices SHALL list every third-party package in the Bundle with its version, its licence and its licence text, taken from the package itself; IF a bundled package has no licence file, THEN the build SHALL fail.
6. THE Bundle of `sexton-mcp` SHALL be byte for byte the Kiro Power's server file.
7. THE Release folders SHALL be built by one script from the committed sources and lockfile, so that the same commit gives the same folders.

### Requirement 3: Release workflow

**User Story:** As the owner, I want a pushed version tag to publish both packages from CI with provenance and no stored token, so that a release is repeatable and a leaked token cannot publish.

#### Acceptance Criteria

1. THE Release workflow SHALL run only on a pushed Release tag.
2. THE Release workflow SHALL ask for `contents: read` and `id-token: write` only, and the job that runs the gates SHALL get `contents: read` only.
3. THE Release workflow SHALL pin every action to a full commit SHA, use no cache, read no secret, and run no install script in the job that holds the OIDC token.
4. WHEN a Release tag is pushed, THE Release workflow SHALL run typecheck, lint, every package's tests and the self-scan, then build the Release folders, then run the Release check before any publish.
5. IF the Release version differs from either Published package's version, or a Published package has a dependency, a wrong bin, or lacks a setting of Requirement 2.4, or server.json disagrees with `sexton-mcp`, THEN THE Release check SHALL fail and THE Release workflow SHALL publish nothing.
6. THE Release workflow SHALL publish `sexton`, then `sexton-mcp`, with Trusted publishing, and SHALL skip a package whose version is already on npm.
7. IF the npm documentation shows that Trusted publishing cannot do a step, THEN THE spec SHALL say which step and SHALL NOT add a token.

### Requirement 4: MCP Registry metadata

**User Story:** As a user of an MCP client, I want to find the Sexton server in the official MCP Registry, so that I can install it by name.

#### Acceptance Criteria

1. THE repository SHALL hold a server.json that is valid against the MCP Registry's published `server.schema.json`.
2. THE server.json `name` SHALL equal the `mcpName` of `sexton-mcp`, in the `io.github.hsiddhu2/` namespace that GitHub login grants.
3. THE server.json version and package version SHALL equal the version of `sexton-mcp`, and its package identifier SHALL be `sexton-mcp`.
4. THE server.json description SHALL be at most 100 characters.
5. THE spec SHALL run no MCP Registry command, and SHALL list the steps and the namespace proof the owner does himself.

### Requirement 5: Documentation

**User Story:** As a reader of the README, I want to know install from npm is coming, without a command that fails today.

#### Acceptance Criteria

1. THE README SHALL have a section "Install" marked as coming with release 0.1, naming the two packages.
2. THE section SHALL hold no command that does not work yet.
3. THE spec SHALL cite the npm and MCP Registry documents it relies on, with their URLs.
4. THE steering file `tech.md` SHALL say that the Published packages need Node 20.19.0 or later while the workspace builds on Node 22.

### Requirement 6: The CLI's version

**User Story:** As a user of `sexton`, I want `sexton --version` to print the version of the package I installed, so that I can report and compare versions.

#### Acceptance Criteria

1. WHEN `sexton --version` runs, THE CLI SHALL print the version of the `sexton` package, which is the version of `@sexton/cli`, and not the engine's version.
