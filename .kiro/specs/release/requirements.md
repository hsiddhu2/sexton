# Requirements Document

## Introduction

Release 0.1 puts the Sexton CLI and the Sexton MCP server on npm, published from GitHub Actions with provenance, and lists the server in the official MCP Registry. This spec prepares that release. It changes package settings, adds a release workflow, a release check, a `server.json` and a README section. It publishes nothing, creates no secret and changes no account setting. Every account step (npm names, trusted publisher, the first publish, the MCP Registry login and publish) is the owner's, after his word, and is listed in design.md "Owner steps".

The spec changes no scoring, no state rule, no policy rule, no plan, no tool and no output of the CLI or the server. It changes no package name: the names are the owner's decision (design.md Decision 1).

## Glossary

- **Published package**: one of `@sexton/engine`, `@sexton/cli` and `@sexton/mcp` (or the names the owner picks).
- **Pack**: the tarball `npm pack` builds for a Published package, the exact file set npm would publish.
- **Release tag**: a git tag of the form `vMAJOR.MINOR.PATCH`, pushed to the repository.
- **Release version**: the Release tag without its `v`.
- **Release workflow**: `.github/workflows/release.yml`.
- **Release check**: `scripts/release-check.mjs` and the pure function `releaseProblems` in `scripts/lib/release-check.mjs`.
- **Trusted publishing**: npm's OIDC publishing, where npm exchanges a GitHub Actions OIDC token for a short-lived publish token. No npm token is stored.
- **Provenance**: the signed npm provenance attestation that links a package version to the commit and workflow that built it.
- **MCP Registry**: the official registry at `registry.modelcontextprotocol.io`, which holds server metadata, not code.
- **server.json**: `packages/mcp/server.json`, the metadata the MCP Registry takes for the server.
- **Server name**: the `name` in server.json and the `mcpName` in the server's package.json, `io.github.hsiddhu2/sexton`.
- **Bundle**: `powers/sexton/server/sexton-mcp.mjs`, the single-file server of the Kiro Power (spec sexton-power).

## Requirements

### Requirement 1: Names

**User Story:** As the owner, I want to know which npm names are free before I pick any, so that the first publish does not fail or land on a name someone else holds.

#### Acceptance Criteria

1. THE check of names SHALL be read-only: registry reads only, no login, no publish.
2. THE check SHALL report each of the scope `@sexton`, `@sexton/cli`, `@sexton/engine`, `@sexton/mcp`, `sexton`, `sexton-cli` and `sexton-mcp` as free or taken, with the owner when the registry shows one.
3. THE spec SHALL recommend a naming plan that uses only free names, and SHALL NOT change any package name.

### Requirement 2: Package settings

**User Story:** As a user installing Sexton from npm, I want each package to hold only what runs, and to say where it came from, so that I can trust and audit what I install.

#### Acceptance Criteria

1. EACH Published package SHALL list `files` so that its Pack holds only its built `.js` and `.d.ts` files, `README.md`, `LICENSE`, `NOTICE` and `package.json`.
2. NO Pack SHALL hold a test, a test fixture, a source file, a source map, a file under a private folder, or a machine path.
3. EACH Published package SHALL name `repository` (with `directory`), `homepage`, `bugs` and `author` "Harpreet Singh Siddhu".
4. EACH Published package SHALL set `publishConfig` to `access: public` and `provenance: true`.
5. EACH Published package SHALL set `engines.node` to the lowest Node it is shown to run on, and the server's `engines.node` SHALL agree with the Node the Bundle is built for.
6. EACH Published package SHALL carry a `LICENSE` and `NOTICE` identical to the repository's.

### Requirement 3: Release workflow

**User Story:** As the owner, I want a pushed version tag to publish the three packages from CI with provenance and no stored token, so that a release is repeatable and a leaked token cannot publish.

#### Acceptance Criteria

1. THE Release workflow SHALL run only on a pushed Release tag.
2. THE Release workflow SHALL ask for `contents: read` and `id-token: write` only, and the job that runs the gates SHALL get `contents: read` only.
3. THE Release workflow SHALL pin every action to a full commit SHA, use no cache, and read no secret.
4. WHEN a Release tag is pushed, THE Release workflow SHALL run typecheck, lint, every package's tests and the self-scan, and SHALL run the Release check before any publish.
5. IF the Release version differs from the version of `@sexton/cli` or `@sexton/mcp`, or a package pins another Published package at a version other than that package's own, or a Published package lacks the settings of Requirement 2.3 and 2.4, THEN THE Release check SHALL fail and THE Release workflow SHALL publish nothing.
6. THE Release workflow SHALL publish `@sexton/engine`, then `@sexton/cli`, then `@sexton/mcp`, with Trusted publishing, and SHALL skip a package whose version is already on npm.
7. IF the npm documentation shows that Trusted publishing cannot do a step, THEN THE spec SHALL say which step and SHALL NOT add a token.

### Requirement 4: MCP Registry metadata

**User Story:** As a user of an MCP client, I want to find the Sexton server in the official MCP Registry, so that I can install it by name.

#### Acceptance Criteria

1. THE repository SHALL hold a server.json that is valid against the MCP Registry's published `server.schema.json`.
2. THE server.json `name` SHALL equal the server package's `mcpName`, in the `io.github.hsiddhu2/` namespace that GitHub login grants.
3. THE server.json version and its npm package version SHALL equal the server package's version, and its package identifier SHALL equal the server package's name.
4. THE server.json description SHALL be at most 100 characters.
5. THE spec SHALL run no MCP Registry command, and SHALL list the steps and the namespace proof the owner does himself.

### Requirement 5: Documentation

**User Story:** As a reader of the README, I want to know install from npm is coming, without a command that fails today.

#### Acceptance Criteria

1. THE README SHALL have a section "Install" marked as coming with release 0.1.
2. THE section SHALL hold no command that does not work yet.
3. THE spec SHALL cite the npm and MCP Registry documents it relies on, with their URLs.
