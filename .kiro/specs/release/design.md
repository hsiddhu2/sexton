# Design Document: release

## Overview

Release 0.1 publishes `@sexton/engine`, `@sexton/cli` and `@sexton/mcp` to npm from GitHub Actions with provenance, then lists the server in the official MCP Registry. This spec prepares it and publishes nothing:

- package settings for the three packages, so each Pack holds built output, README, LICENSE and NOTICE only;
- `.github/workflows/release.yml`, which runs the gates on a version tag and publishes with npm trusted publishing (OIDC), with no npm token;
- `scripts/release-check.mjs`, which stops a publish when the tag and the packages disagree;
- `packages/mcp/server.json` for the MCP Registry;
- a README section "Install", marked as coming with release 0.1.

Every account step is the owner's and is listed under "Owner steps". The package names are the owner's decision (Decision 1).

## Architecture

```
git tag v0.1.0 && git push origin v0.1.0          (owner)
        |
        v
release.yml  on: push tags v[0-9]+.[0-9]+.[0-9]+
  job gates    Node 22, contents: read            npm ci, typecheck, lint, test, build engine, scan:self
  job publish  Node 24 (npm 11), contents: read + id-token: write
        npm ci
        node scripts/release-check.mjs "$GITHUB_REF_NAME"   -> exit 1 stops the job before any publish
        npm run build -w engine -w cli -w mcp
        for engine, cli, mcp: skip if name@version is on npm, else npm publish -w <dir>
                 npm CLI sees the OIDC environment, exchanges the job's ID token for a short-lived
                 publish token, and attaches provenance (public package, public repository)
        |
        v
registry.npmjs.org  @sexton/engine@0.2.0, @sexton/cli@0.1.0, @sexton/mcp@0.1.0, each with provenance
        |
        v
mcp-publisher login github; mcp-publisher publish   (owner, from packages/mcp)
        -> registry.modelcontextprotocol.io checks the GitHub login grants io.github.hsiddhu2/*
           and that @sexton/mcp@0.1.0 on npm has mcpName io.github.hsiddhu2/sexton
```

## Components and Interfaces

### Package settings (`packages/{engine,cli,mcp}/package.json`)

Added to each: `author`, `repository` (`git+https://github.com/hsiddhu2/sexton.git`, with `directory`), `homepage`, `bugs`, `keywords`, `files: ["dist/**/*.js", "dist/**/*.d.ts", "NOTICE"]`, `engines.node: ">=20.19.0"`, `publishConfig: { access: "public", provenance: true }`. The server also gets `mcpName: "io.github.hsiddhu2/sexton"`. npm adds `package.json`, `README.md` and `LICENSE` to every Pack on its own. Each package gets its own `README.md`, and a copy of the repository's `LICENSE` and `NOTICE`; a test keeps the copies identical.

Names, versions, dependencies, scripts, `bin`, `main` and `types` are unchanged.

### Release check (`scripts/lib/release-check.mjs`, `scripts/release-check.mjs`)

`releaseProblems(tag, { engine, cli, mcp }, serverJson): string[]` is pure. It returns one line per problem:

- the tag is not `vMAJOR.MINOR.PATCH`;
- `@sexton/cli` or `@sexton/mcp` has a version other than the tag's;
- the CLI's pin of the engine, or the server's pin of the engine or the CLI, is not that package's own version;
- a package is `private`, or lacks `publishConfig.access: public`, `publishConfig.provenance: true` or the repository URL;
- server.json's `name` is not the server's `mcpName`, or its version or package version is not the server's version, or its package identifier is not the server's name.

The engine keeps its own version (0.2.0 today). `scripts/release-check.mjs <tag>` reads the files, prints each problem and exits 1, or prints the three names and versions and exits 0. Usage error: exit 2.

### Release workflow (`.github/workflows/release.yml`)

As in the Architecture. Points that matter:

- Trigger: `push` of a tag matching `v[0-9]+.[0-9]+.[0-9]+` only. GitHub's filter `+` means one or more of the preceding character.
- Permissions: workflow `contents: read`, `id-token: write`; job `gates` narrows to `contents: read`.
- The publish job runs `npm ci --ignore-scripts`, so no dependency's install script runs while the job holds an OIDC token.
- Actions: `actions/checkout` v7.0.1 and `actions/setup-node` v7.1.0 at the same full SHAs as `ci.yml`. `package-manager-cache: false` in both jobs, as npm's example says for release builds. `persist-credentials: false`.
- `setup-node` with `registry-url: https://registry.npmjs.org`, as in npm's example.
- The publish loop skips a version npm already has, so a later release that bumps only the CLI and the server does not fail on the engine.

### server.json (`packages/mcp/server.json`)

```json
{
  "$schema": "https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json",
  "name": "io.github.hsiddhu2/sexton",
  "title": "Sexton",
  "description": "Read-only answers about a project's npm dependencies: state, signals, fix order and policy.",
  "repository": { "url": "https://github.com/hsiddhu2/sexton", "source": "github", "id": "1469651228", "subfolder": "packages/mcp" },
  "version": "0.1.0",
  "packages": [
    { "registryType": "npm", "registryBaseUrl": "https://registry.npmjs.org", "identifier": "@sexton/mcp", "version": "0.1.0", "runtimeHint": "npx", "transport": { "type": "stdio" } }
  ]
}
```

The server takes no argument and no environment variable (each tool call names its `projectDir`), so the package entry has neither. `repository.id` is the GitHub repository ID, as the schema advises. The file is not in the Pack; `mcp-publisher` reads it from `packages/mcp`.

### README "Install"

A section after "Quick start", headed "Install (coming with release 0.1)". It says the CLI and the MCP server will be on npm with provenance and in the MCP Registry, and points to the clone steps and the Kiro Power until then. It holds no command.

## Data Models

No new data model. server.json follows `server.schema.json` 2025-12-11 (JSON Schema draft-07). The release check reads the three package.json files and server.json as plain JSON.

## Error Handling

- Release check fails: the job stops before `npm publish`, and the log lists every problem. Nothing is published.
- A gate fails: `publish` does not start (`needs: gates`).
- `npm publish` of one package fails (for example, no trusted publisher configured, or the configuration expired): the loop stops (`bash -e`), so a later package is not published against a missing dependency. The owner fixes the cause and re-runs the failed workflow run on the same tag; packages already published are skipped.
- `npm view` fails for a network reason: the loop tries `npm publish`. If that version is already on npm, npm refuses it and the loop stops, so later packages wait for a re-run. No version is overwritten.

## Testing Strategy

`packages/mcp/test/release.test.ts`, Vitest and fast-check, numRuns 100, no network:

- the release check passes for the packages' own tag and fails for any other string (Property 1);
- each of eleven single edits to a package or server.json makes the release check fail (Property 2);
- each package's `files`, `publishConfig`, `repository`, `author`, `engines`, LICENSE and NOTICE, and the Bundle target; server.json's schema URL, name, description length and package entry (Property 3);
- the workflow's trigger, permissions, SHA pins, absence of secrets, tokens and cache, and the order check-then-publish, engine-CLI-server (Property 4).

Checked by hand on 27 Nov 2026 and recorded under "Results":

- `npm pack --dry-run` and a real `npm pack` of each package: file list, size, no map, test, fixture, private path or machine path;
- the three tarballs installed into an empty folder with Node 20.19.5: `sexton --version`, a real `sexton scan` of a one-dependency project, and the server's `initialize` and `tools/list` over stdio;
- server.json validated with ajv 8 against the downloaded `server.schema.json`.

## Correctness Properties

1. **Tag agreement.** `releaseProblems` returns no problem exactly when the tag is `v` plus the version of the CLI and the server and every other check holds; for the packages as committed, every other tag string gives at least one problem. Proves 3.5.
2. **Any drift stops the release.** Changing any one of the CLI version, a pin between Published packages, `publishConfig.access`, `publishConfig.provenance`, the repository URL, `private`, `mcpName`, or server.json's version, identifier or package version gives at least one problem. Proves 3.5, 4.2, 4.3.
3. **Packs hold what runs.** Each Published package's `files` is built `.js` and `.d.ts` and NOTICE; its LICENSE and NOTICE equal the repository's; its `engines.node` is `>=20.19.0`, matching the Bundle's `node20` target; server.json meets the registry's name and length rules. Proves 2.1, 2.3 to 2.6, 4.1, 4.4.
4. **Publish only from a tag, by OIDC.** The workflow runs on a version tag only, asks for `contents: read` and `id-token: write` only (gates: `contents: read`), pins every action to a SHA, reads no secret and no token, uses no cache, and checks the tag before it publishes engine, CLI and server in order. Proves 3.1 to 3.4, 3.6.

## Decisions

1. **Names are the owner's.** See "Name check". No name is changed here. If the owner picks other names, the change is: the `name` of each package, every `@sexton/engine` and `@sexton/cli` import and dependency pin (54 engine imports and 11 CLI imports across the CLI, the server, the API and the web app), server.json's `identifier`, the README files, and the test's expected identifier. `mcpName` stays `io.github.hsiddhu2/sexton` whatever the npm name.
2. **Node: `>=20.19.0` for all three packages; the Bundle stays `node20`.** The server package said `>=22` while its Bundle is built for Node 20. Kiro starts a Power's server with Node 20.19.5 (spec sexton-power, design "Facts recorded from the spike"), so the Bundle must stay at Node 20, and the npm package should run where the Bundle runs. The source uses nothing newer than Node 20 (`structuredClone`, `util.parseArgs`), and `@modelcontextprotocol/server` 2.4.0 requires Node `>=20`. Shown on 27 Nov 2026: the three tarballs install and run under Node 20.19.5. The floor is 20.19.0 because that line is the one measured. Node 20 reached end of life on 30 April 2026; raising the floor to 22 later means raising the Bundle target too, once Kiro starts servers on 22. The workspace root keeps `>=22` for the build tools; it is never published.
3. **NOTICE ships too.** Apache-2.0 section 4(d) asks that a NOTICE file go with redistributions. It is four lines.
4. **Publish job on Node 24; gates on Node 22.** Trusted publishing needs npm 11.5.1 or later and Node 22.14.0 or later. Node 22.23.5 ships npm 10.9.9; Node 24.22.3 ships npm 11.19.1 (Node release index, 27 Nov 2026). Node 24 avoids installing npm separately. The gates run on Node 22, the same as `ci.yml`. The publish job builds with `tsc`, whose output does not depend on the Node version.
5. **No npm token.** Every CI publish uses OIDC. The one thing OIDC cannot do: a trusted publisher can be set only on a package that already exists on npm (`npm trust`: "Package must exist"; the website setting is per package too). So the first publish of each name is the owner's, by hand, with 2FA and no token (Owner steps, npm step 3). No secret is added to the repository.
6. **`npm publish`, not `npm stage publish`.** A trusted publisher created after 3 Sep 2026 allows `npm stage publish` by default, and direct `npm publish` only when the owner ticks it. The workflow uses `npm publish`, so the owner ticks "npm publish" (or passes `--allow-publish`). For maximum security npm suggests stage-only, where each CI publish waits for a maintainer's 2FA approval; switching is one word in the workflow and one setting, the owner's choice.
7. **Skip versions already on npm.** The engine has its own version (0.2.0) and the tag follows the CLI and the server. A release that does not bump the engine publishes the other two.
8. **Source map comments stay.** Each built `.js` ends with a `sourceMappingURL` comment; the maps are not shipped. Node ignores a missing map. Turning maps off only for the release would need a second build configuration.
9. **`sexton --version` prints the engine version** (`run-cli.ts`, `ENGINE_VERSION`), so `@sexton/cli@0.1.0` prints `0.2.0`. Unchanged here; noted for the owner.
10. **Deliberate test change.** `packages/web/test/readme.test.ts` pins the README's section headings. Its list gains `## Install (coming with release 0.1)` after `## Quick start` (Requirement 5.1). No other heading changes.

## Review notes (27 Nov 2026)

An independent review of the diff, the spec, docs/requirements.md and the steering files found no defect. Notes:

1. The pack counts in "Results" did not add up (201 for 202 files). Fixed from a fresh `npm pack --dry-run`.
2. `.kiro/steering/tech.md` still says engines is `>=22`. Steering is outside this spec's paths; for the owner: the published packages are `>=20.19.0`, the workspace root stays `>=22`.
3. The network-failure case in Error Handling did not say the loop stops. Fixed.
4. `npm ci` in the publish job ran install scripts while the job holds `id-token: write`. Fixed: `npm ci --ignore-scripts`; the build is `tsc` only.
5. The workflow-level `id-token: write` is redundant with the job-level permissions. Kept, because Requirement 3.2 names it; each job narrows its own.
6. Anyone with push access can tag any commit. Owner step 5 (a tag ruleset) covers it.
7. Property 1 drew random strings that rarely come near a valid tag. Added near misses (`v0.1.1`, `0.1.0`, `v0.1.0-rc.1`, `v01.1.0` and others).
8. The engine's version is not tied to the tag: changed engine code at an unchanged version is skipped. By design (Decision 7); bump the engine's version when its code changes.
9. Not shown before a real run: OIDC with a workspace publish (`npm publish -w <dir>`). npm's example publishes from the root. The first tagged run shows it; the fallback is `cd <dir> && npm publish`.
10. The package READMEs show `npx @sexton/cli` and `npx -y @sexton/mcp`. They ship only inside the packs, so Requirement 5.2 holds, but they follow the names of Decision 1.

## Name check (27 Nov 2026, read-only)

Method: `npm view <name>` (404 means no package), and `https://registry.npmjs.org/-/org/<scope>/package`, which returns `{}` for a scope that exists and `{"error":"Scope not found"}` for one that does not (checked against a made-up scope).

| Name | Result |
|---|---|
| scope `@sexton` | **Exists**, with no public package. The registry does not show who holds it. It is a user or an organisation named `sexton`. |
| `@sexton/cli` | No package. Publishable only by whoever holds the `@sexton` scope. |
| `@sexton/engine` | No package. Same. |
| `@sexton/mcp` | No package. Same. |
| `sexton` | Free |
| `sexton-cli` | Free |
| `sexton-mcp` | Free |
| `sexton-engine` (also checked) | Free |

Recommendation: if the `@sexton` scope is the owner's own account or organisation, keep `@sexton/engine`, `@sexton/cli` and `@sexton/mcp`; nothing changes. If it is not, use unscoped names, all free today: `sexton` for the CLI (so `npx sexton scan` works and the bin stays `sexton`), `sexton-mcp` for the server (its bin is already `sexton-mcp`), and `sexton-engine` for the engine. npm may still refuse a new unscoped name that is too close to an existing one; the first publish (Owner steps, npm step 3) is the test, and it reserves the names.

## Owner steps

Nothing below has been run. Each step is the owner's, after his word.

### npm

1. Decide the names (Decision 1). To see whether `@sexton` is his: sign in at https://www.npmjs.com and look under the account's organisations, or run `npm org ls sexton` while logged in.
2. Turn on two-factor authentication for the npm account, if it is not on. `npm trust` requires it.
3. Create each package with a placeholder, once, because a trusted publisher can be added only to a package that exists. For each of the three names, in an empty folder outside the repository, a `package.json` with only `name`, `version: "0.0.0"`, `description` ("Reserved for Sexton. The first release is 0.1.0."), `license: "Apache-2.0"` and `repository` set as in Decision 1, and a one-line README. Then `npm login` and `npm publish --access public`, approving with 2FA. No token is created. (Publishing 0.1.0 itself by hand would also create the package, but 0.1.0 would then have no provenance, and the workflow would skip it.)
4. Add a trusted publisher to each package, within two days of the first CI publish (a configuration that has not published within two days expires). On npmjs.com: the package, Settings, Trusted publishing, GitHub Actions: organisation or user `hsiddhu2`, repository `sexton`, workflow filename `release.yml`, no environment, allowed action "npm publish". Or from a terminal with npm 11.15.0 or later: `npm trust github <name> --repo hsiddhu2/sexton --file release.yml --allow-publish`.
5. Optional, recommended: a tag ruleset on GitHub so only the owner can create `v*` tags.
6. Merge this branch. Push the tag from the merged `main`: `git tag v0.1.0` and `git push origin v0.1.0`. Watch the release workflow.
7. Check provenance: the package page on npmjs.com shows the provenance section, and `npm audit signatures` in a project that installs it reports verified attestations.
8. After a good release: in each package's Settings, Publishing access, choose "Require two-factor authentication and disallow tokens". Optionally deprecate the placeholder: `npm deprecate <name>@0.0.0 "placeholder"`.

### MCP Registry

The registry is in preview; npm must hold `@sexton/mcp@0.1.0` (or the chosen name) first, because the registry reads `mcpName` from the published package.json.

1. Install `mcp-publisher`: `brew install mcp-publisher`, or the release binary from https://github.com/modelcontextprotocol/registry/releases.
2. In `packages/mcp`: `mcp-publisher validate`.
3. `mcp-publisher login github`, and complete the device login as GitHub user `hsiddhu2`. This is the namespace proof: GitHub login grants `io.github.hsiddhu2/*`. The package proof is `mcpName` in the published package.json.
4. `mcp-publisher publish`.
5. Check: `https://registry.modelcontextprotocol.io/v0.1/servers?search=io.github.hsiddhu2/sexton`.

If the npm name changes (Decision 1), edit server.json's `identifier` first; the release check and the test catch a mismatch.

## Results (27 Nov 2026)

Packs, `npm pack` from a clean build:

| Package | Files | Packed | Unpacked |
|---|---|---|---|
| `@sexton/engine@0.2.0` | 202: 99 `.js`, 99 `.d.ts`, LICENSE, NOTICE, README.md, package.json | 116.3 kB | 415.0 kB |
| `@sexton/cli@0.1.0` | 46: 21 `.js`, 21 `.d.ts`, the same four | 19.2 kB | 62.3 kB |
| `@sexton/mcp@0.1.0` | 36: 16 `.js`, 16 `.d.ts`, the same four | 17.8 kB | 54.7 kB |

No Pack holds a `.map`, a test, a fixture, a source file or a machine path. Under Node 20.19.5 from an empty folder: `sexton --version` printed `0.2.0`; `sexton scan` of a project with one dependency printed its table and exit 0; the server answered `initialize` as `sexton 0.1.0` and listed `scan_project`, `explain_package`, `fix_order`, `check_policy`. server.json is valid against `server.schema.json` 2025-12-11 (ajv 8; the `uri` format is not asserted, and every URL in the file is absolute https).

## Sources

Read on 27 Nov 2026.

- npm, Trusted publishing for npm packages (last edited 6 Oct 2026): https://docs.npmjs.com/trusted-publishers. Requirements npm 11.5.1 and Node 22.14.0; GitHub-hosted runners; `id-token: write`; per-package configuration with workflow filename; allowed actions and the 3 Sep 2026 default; two-day expiry; automatic provenance for a public package from a public repository; `repository.url` must match; "disallow tokens" after setup.
- npm, `npm trust`: https://docs.npmjs.com/cli/v11/commands/npm-trust. "Package must exist"; npm 11.15.0; 2FA; `--allow-publish`.
- npm, Generating provenance statements: https://docs.npmjs.com/generating-provenance-statements. Public repository matching `repository`; trusted publishing makes provenance without `--provenance`.
- Node.js release index: https://nodejs.org/dist/index.json. Node 22.23.5 with npm 10.9.9; Node 24.22.3 with npm 11.19.1.
- GitHub, Workflow syntax, filter pattern cheat sheet: https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax. `+` matches one or more of the preceding character; `v[12].[0-9]+.[0-9]+` example.
- MCP Registry, Quickstart: https://github.com/modelcontextprotocol/registry/blob/main/docs/modelcontextprotocol-io/quickstart.mdx. `mcpName`, `mcp-publisher init/validate/login github/publish`, the 100-character description.
- MCP Registry, Package types: https://github.com/modelcontextprotocol/registry/blob/main/docs/modelcontextprotocol-io/package-types.mdx. npm ownership by `mcpName`; npmjs.org only.
- MCP Registry, Authentication: https://github.com/modelcontextprotocol/registry/blob/main/docs/modelcontextprotocol-io/authentication.mdx. GitHub login grants `io.github.<username>/*`.
- MCP Registry, Official registry requirements: https://github.com/modelcontextprotocol/registry/blob/main/docs/reference/server-json/official-registry-requirements.md.
- MCP Registry schema: https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json.
