# Design Document: release

## Overview

Release 0.1 publishes two npm packages from GitHub Actions with provenance, then lists the server in the official MCP Registry:

- `sexton`: the CLI, bin `sexton`, one bundled file `sexton.mjs` with the engine inside.
- `sexton-mcp`: the MCP server, bin `sexton-mcp`, one bundled file `sexton-mcp.mjs` with the engine and the CLI's scan inside. It is the same file as the Kiro Power's server.

The engine is not published in 0.1. The workspace packages keep their `@sexton/*` names for development, are marked `private`, and no import changes.

This spec prepares the release and publishes nothing:

- `scripts/build-release.mjs` writes one Release folder per package under `build/release/`.
- `.github/workflows/release.yml` runs the gates on a version tag, builds the folders, checks them and publishes with npm trusted publishing (OIDC), with no npm token.
- `scripts/release-check.mjs` stops a publish when the tag, the folders and server.json disagree.
- `packages/mcp/server.json` for the MCP Registry.
- `sexton --version` prints the CLI's own version.
- a README section "Install", marked as coming with release 0.1, and a line in steering `tech.md`.

Every account step is the owner's and is listed under "Owner steps".

## Architecture

```
git tag v0.1.0 && git push origin v0.1.0                         (owner)
        |
        v
release.yml  on: push tags v[0-9]+.[0-9]+.[0-9]+
  job gates    Node 22, contents: read      npm ci, typecheck, lint, test, build engine, scan:self
  job publish  Node 24 (npm 11), contents: read + id-token: write
        npm ci --ignore-scripts
        npm run build -w @sexton/engine -w @sexton/cli -w @sexton/mcp       (tsc)
        node scripts/build-release.mjs                                       (esbuild)
            build/release/sexton/      package.json  sexton.mjs      README.md LICENSE NOTICE THIRD-PARTY-NOTICES.md
            build/release/sexton-mcp/  package.json  sexton-mcp.mjs  README.md LICENSE NOTICE THIRD-PARTY-NOTICES.md
        node scripts/release-check.mjs "$GITHUB_REF_NAME"                     exit 1 stops the job before any publish
        for sexton, sexton-mcp: skip if name@version is on npm, else npm publish ./build/release/<name>
            npm sees the OIDC environment, exchanges the job's ID token for a short-lived publish token,
            and attaches provenance (public package, public repository)
        |
        v
registry.npmjs.org   sexton@0.1.0, sexton-mcp@0.1.0, each with provenance, each with no dependency
        |
        v
mcp-publisher login github; mcp-publisher publish                        (owner, from packages/mcp)
        registry.modelcontextprotocol.io checks the GitHub login grants io.github.hsiddhu2/*
        and that sexton-mcp@0.1.0 on npm has mcpName io.github.hsiddhu2/sexton
```

## Components and Interfaces

### Bundle options (`scripts/lib/bundle.mjs`)

`bundle(esbuild, { root, entry, outfile })` runs esbuild with the options the Kiro Power has always used: `bundle`, `platform: node`, `format: esm`, `target: node20`, `legalComments: none`, no minify, no sourcemap, `absWorkingDir` the repository root, and the `createRequire` banner for CommonJS dependencies. It also asks for the metafile, which does not change the output. `scripts/build-power.mjs` now calls it, and its output is byte for byte what it was (the Power's freshness test checks this).

### Release build (`scripts/build-release.mjs`)

`node scripts/build-release.mjs [--out <dir>]`, default `build/release` (git-ignored). Needs `packages/cli/dist/bin.js` and `packages/mcp/dist/bin.js`. Exits 2 if either is missing. For each Published package it empties its folder, then writes:

- `<bin>.mjs`: the Bundle of `packages/<workspace>/dist/bin.js`, mode 755, with the shebang of `bin.ts` on line 1.
- `package.json`: `publishedManifest(def, version)`, where `version` is the Workspace package's version.
- `README.md`: a copy of `packages/<workspace>/README.md`.
- `LICENSE` and `NOTICE`: copies of the repository's.
- `THIRD-PARTY-NOTICES.md`: for each directory `thirdPartyDirs` finds in the metafile's inputs, the package's name, version, `license` field and licence file text, and its NOTICE file when it has one. A bundled package with no licence file stops the build with exit 1.

### Release definitions and check (`scripts/lib/release.mjs`)

Pure, no file and no network.

- `RELEASE_PACKAGES`: `sexton` from workspace `cli`, bin `sexton`. `sexton-mcp` from workspace `mcp`, bin `sexton-mcp`, `mcpName: io.github.hsiddhu2/sexton`. The order is the publish order.
- `publishedManifest(def, version)`: name, version, description, keywords, `license: Apache-2.0`, author, `repository` (`git+https://github.com/hsiddhu2/sexton.git`, `directory: packages/<workspace>`), homepage, bugs, `type: module`, `bin: { <bin>: "<bin>.mjs" }`, `files: ["<bin>.mjs", "NOTICE", "THIRD-PARTY-NOTICES.md"]`, `engines.node: ">=20.19.0"`, `publishConfig: { access: public, provenance: true }`, and `mcpName` for the server. No dependency key.
- `thirdPartyDirs(inputPaths)`: each `…/node_modules/<name>` or `…/node_modules/@scope/<name>` directory once, by the last `node_modules` in the path, sorted by package name. Workspace code (`packages/…/dist`) is skipped.
- `releaseProblems(tag, manifests, serverJson)`: one line per problem, for a tag that is not `vMAJOR.MINOR.PATCH`, for a package whose name, version, bin, `publishConfig`, repository URL or `engines.node` is wrong, that is `private`, or that has any of `dependencies`, `peerDependencies`, `optionalDependencies` or `bundleDependencies`, and for a server.json whose name is not the server's `mcpName`, or whose version, package identifier or package version is not the server's.

`scripts/release-check.mjs <tag> [--dir <dir>]` reads `<dir>/<name>/package.json` (default `build/release`) and `packages/mcp/server.json`, prints each problem and exits 1, or prints `sexton@<v>, sexton-mcp@<v>` and exits 0. A usage error or a missing folder exits 2.

### The CLI's version (`packages/cli/src/version.ts`)

`CLI_VERSION`, a constant equal to the version in `packages/cli/package.json` (a test keeps them equal). `runCli` prints it for `--version`, in place of the engine's `ENGINE_VERSION`. The constant is compiled into the Bundle, so `sexton --version` prints the `sexton` package's version without reading a file. It is not exported: the CLI's public surface is unchanged.

### Release workflow (`.github/workflows/release.yml`)

As in the Architecture. Points that matter:

- Trigger: `push` of a tag matching `v[0-9]+.[0-9]+.[0-9]+` only.
- Permissions: workflow `contents: read`, `id-token: write`. Job `gates` narrows to `contents: read`.
- Actions: `actions/checkout` v7.0.1 and `actions/setup-node` v7.1.0 at the same full SHAs as `ci.yml`. `package-manager-cache: false` in both jobs, as npm's example says for release builds. `persist-credentials: false`.
- The publish job runs `npm ci --ignore-scripts`: no dependency's install script runs while the job holds an OIDC token. esbuild works without its install script, because its platform binary comes as an optional dependency (checked on 27 Nov 2026 with esbuild 0.28.2).
- `npm publish ./build/release/<name>` publishes a folder, not a workspace, which is the shape npm's documentation shows.

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
    { "registryType": "npm", "registryBaseUrl": "https://registry.npmjs.org", "identifier": "sexton-mcp", "version": "0.1.0", "runtimeHint": "npx", "transport": { "type": "stdio" } }
  ]
}
```

The server takes no argument and no environment variable (each tool call names its `projectDir`). `repository.id` is the GitHub repository ID, as the schema advises. The file is not in the Pack. `mcp-publisher` reads it from `packages/mcp`.

### README and steering

README: a section "Install (coming with release 0.1)" after "Quick start", naming `sexton` and `sexton-mcp`, with no command. Steering `tech.md`: the workspace builds on Node 22. The Published packages need Node 20.19.0 or later. It also names `scripts/build-release.mjs` and the private Workspace packages.

## Data Models

No new data model. server.json follows `server.schema.json` 2025-12-11 (JSON Schema draft-07). The release check reads the two built package.json files and server.json as plain JSON.

## Error Handling

- A workspace build is missing: `build-release` exits 2 and names the file.
- A bundled package has no licence file: `build-release` exits 1 and names the package. Nothing is published.
- The release check fails, or a Release folder is missing: the job stops before `npm publish`, and the log lists every problem.
- A gate fails: `publish` does not start (`needs: gates`).
- `npm publish` fails (for example, no trusted publisher, or the configuration expired): the step stops (`bash -e`), so `sexton-mcp` is not published after a failed `sexton`. The owner fixes the cause and re-runs the failed run on the same tag. A version already on npm is skipped.
- `npm view` fails for a network reason: the loop tries `npm publish`. If that version is already on npm, npm refuses it and the step stops. No version is overwritten.

## Testing Strategy

`packages/mcp/test/release.test.ts`, Vitest and fast-check, numRuns 100, no network:

- Property 1: the release check passes for the packages' own tag and fails for any other string, near misses included.
- Property 2: each of fourteen single edits to a built manifest or server.json makes the release check fail.
- Property 3: `thirdPartyDirs` names each package once, scoped or not, nested or not, and skips workspace code.
- Property 4: `build-release` into a temporary folder gives, for each package, exactly the six files, the manifest of `publishedManifest`, no `@sexton/` in the manifest, a Bundle with the shebang, the executable bit, no source map comment, no machine path and no `@sexton/` import, LICENSE and NOTICE equal to the repository's, the expected third-party list. `sexton-mcp.mjs` equals the Power's file. The built `sexton.mjs --version` prints the CLI's version. The release check passes on the built folders. `server.json` has the registry's fields.
- Property 5: the workflow's trigger, permissions, SHA pins, no secret, token, cache or install script while publishing, and the order build, check, publish `sexton` then `sexton-mcp`.

`packages/cli/test/run-cli.test.ts`: `--version` prints `CLI_VERSION`, and `CLI_VERSION` equals `packages/cli/package.json`'s version (Requirement 6.1).

Checked by hand on 27 Nov 2026 and recorded under "Results": `npm pack --dry-run` and `npm pack` of both folders. The two tarballs installed into empty folders under Node 20.19.5 and Node 22.23.4. `sexton --version`. One real `sexton scan` of a small public repository. The server's `initialize` and `tools/list` over stdio. `server.json` validated with ajv 8 against the downloaded schema.

## Correctness Properties

1. **Tag agreement.** `releaseProblems` returns no problem for `v` plus the version both packages share. Every other tag string, near misses included, gives at least one problem. Proves 3.5.
2. **Any drift stops the release.** Changing any one of a package's version, name, bin, `publishConfig.access`, `publishConfig.provenance`, repository URL, `private`, `engines.node`, `mcpName`, adding a dependency or peer dependency, or changing server.json's version, identifier or package version gives at least one problem. Proves 2.3, 2.4, 3.5, 4.2, 4.3.
3. **Every bundled package is credited once.** For any set of input paths, `thirdPartyDirs` returns exactly the distinct package directories under `node_modules`, and none from workspace code. Proves 2.5.
4. **One file, no dependency.** Each built Release folder holds exactly its Bundle, README, LICENSE, NOTICE, Third-party notices and package.json. The manifest has no dependency and names no `@sexton/` package. The Bundle imports no `@sexton/` package and holds no source map comment or machine path. The notices list the expected packages. `sexton-mcp.mjs` is the Power's file. `sexton --version` from the Bundle prints the CLI's version. Proves 2.1 to 2.7, 4.1, 4.4, 6.1.
5. **Publish only from a tag, by OIDC.** The workflow runs on a version tag only, asks for `contents: read` and `id-token: write` only (gates: `contents: read`), pins every action to a SHA, reads no secret and no token, uses no cache, installs with `--ignore-scripts` where it holds the token, and builds, checks, then publishes `sexton` and `sexton-mcp` in order. Proves 3.1 to 3.4, 3.6.

## Decisions

1. **Layout: a Release folder per package, written at release time by one script.** Options: (a) put the published name and the bundled bin inside `packages/cli` and `packages/mcp` and rewrite their package.json at pack time. (b) A separate folder per package, generated from committed sources. (b) is chosen. The Workspace packages stay exactly as they are for development, imports, tests and the GitHub Action. Nothing is rewritten in place, so a failed release leaves no edited file behind. The folder holds only what is published, so `files` is short and exact, and the release check reads the very package.json npm will publish. It is reproducible: the folders come from the commit's sources and lockfile through one script, and the server's Bundle is checked byte for byte against the committed Power file. Cost: `build/release` is a build output, like `dist`.
2. **The engine is inside each Bundle, not published.** Both Bundles carry the engine, ajv, semver and yaml. The server's also carries the MCP library and zod. `npx sexton` and `npx -y sexton-mcp` install one package with no dependency. A user who installs both gets the engine twice, 0.8 MB and 1.6 MB of plain JavaScript.
3. **Licences travel with the code.** `legalComments: none` keeps licence comments out of the Bundle, so the licences go in `THIRD-PARTY-NOTICES.md`, built from the bundled packages' own files. The build fails rather than publish a package whose licence it cannot copy. `LICENSE` and `NOTICE` (Apache-2.0 section 4(d)) are Sexton's own.
4. **Node: `>=20.19.0` for both packages.** Kiro starts a Power's server with Node 20.19.5 (spec sexton-power), so the Bundles are built for Node 20, and the code uses nothing newer (`structuredClone`, `util.parseArgs`). `@modelcontextprotocol/server` 2.4.0 needs Node 20 or later. Shown on 27 Nov 2026 under Node 20.19.5 and 22.23.4. Node 20 reached end of life on 30 April 2026. Raising the floor to 22 means raising the Bundle target too, once Kiro starts servers on 22. The workspace builds on Node 22 (root `engines >=22`).
5. **`sexton --version` prints `CLI_VERSION`.** It printed `ENGINE_VERSION` (0.2.0) while the package is 0.1.0. A constant in `packages/cli/src/version.ts` is compiled into the Bundle, so the Bundle needs no package.json read at run time. A test keeps it equal to `packages/cli/package.json`. Deliberate test change: the `--version` case in `run-cli.test.ts` now expects `CLI_VERSION`.
6. **One version for both packages.** The release check requires the tag to equal both versions. Releases stay simple to read, and the skip rule handles a re-run.
7. **Workspace packages are `private`.** npm refuses to publish a private package, so `@sexton/engine`, `@sexton/cli` and `@sexton/mcp` cannot be published by mistake, under a scope that belongs to someone else. `private` changes nothing for workspaces, `npm ci` or the GitHub Action.
8. **Publish job on Node 24. Gates on Node 22.** Trusted publishing needs npm 11.5.1 or later and Node 22.14.0 or later. Node 22.23.5 ships npm 10.9.9. Node 24.22.3 ships npm 11.19.1. The publish job's output does not depend on the Node version: `tsc` and esbuild with a fixed target.
9. **No npm token.** Every CI publish uses OIDC. The one step OIDC cannot do: a trusted publisher can be set only on a package that already exists on npm (`npm trust`: "Package must exist"). So the first publish of each name is the owner's, by hand, with 2FA and no token (Owner steps, npm step 2).
10. **`npm publish`, not `npm stage publish`.** A trusted publisher created after 3 Sep 2026 allows `npm stage publish` by default, and direct `npm publish` only when the owner ticks it. The workflow uses `npm publish`. For maximum security npm suggests stage-only, where each CI publish waits for a maintainer's 2FA approval. Switching is one word in the workflow and one setting.
11. **Deliberate test change.** `packages/web/test/readme.test.ts` pins the README's section headings. Its list gains `## Install (coming with release 0.1)` after `## Quick start`.

## Name check (27 Nov 2026, read-only)

Method: `npm view <name>` (404 means no package), and `https://registry.npmjs.org/-/org/<scope>/package`, which returns `{}` for a scope that exists and `{"error":"Scope not found"}` for one that does not (checked against a made-up scope).

| Name | Result |
|---|---|
| scope `@sexton` | Exists, with no public package. The owner confirmed it belongs to another user. Not used. |
| `@sexton/cli`, `@sexton/engine`, `@sexton/mcp` | No package. Publishable only by the holder of `@sexton`. Used only as private workspace names. |
| `sexton` | Free. Chosen for the CLI. |
| `sexton-mcp` | Free. Chosen for the server. |
| `sexton-cli`, `sexton-engine` | Free. Not used. |

npm may still refuse a new unscoped name that is too close to an existing one. The first publish (Owner steps, npm step 2) is the test, and it reserves the name.

## Owner steps

Nothing below has been run. Each step is the owner's, after his word. The npm account is `hpsiddhu`.

### npm

1. Turn on two-factor authentication for `hpsiddhu`, if it is not on. `npm trust` requires it.
2. Create each package with a placeholder, once, because a trusted publisher can be added only to a package that exists. For `sexton` and for `sexton-mcp`, in an empty folder outside the repository, write a `package.json` with only `name`, `version: "0.0.0"`, `description` ("Reserved for Sexton. The first release is 0.1.0."), `license: "Apache-2.0"` and `repository: { "type": "git", "url": "git+https://github.com/hsiddhu2/sexton.git" }`, and a one-line README. Then `npm login` as `hpsiddhu` and `npm publish --access public`, approving with 2FA. No token is created. (Publishing 0.1.0 by hand would also create the package, but 0.1.0 would then have no provenance, and the workflow would skip it.)
3. Add a trusted publisher to each of the two packages, at most two days before the tag (a configuration that has not published within two days expires). On npmjs.com: the package, Settings, Trusted publishing, GitHub Actions: user `hsiddhu2`, repository `sexton`, workflow filename `release.yml`, no environment, allowed action "npm publish". Or from a terminal with npm 11.15.0 or later: `npm trust github sexton --repo hsiddhu2/sexton --file release.yml --allow-publish`, and the same for `sexton-mcp`.
4. Optional, recommended: a tag ruleset on GitHub so only the owner can create `v*` tags.
5. Merge this branch. From the merged `main`: `git tag v0.1.0` and `git push origin v0.1.0`. Watch the release workflow.
6. Check provenance: each package page on npmjs.com shows the provenance section, and `npm audit signatures` in a project that installs them reports verified attestations.
7. After a good release: in each package's Settings, Publishing access, choose "Require two-factor authentication and disallow tokens". Optionally `npm deprecate sexton@0.0.0 "placeholder"` and the same for `sexton-mcp@0.0.0`.

### MCP Registry

The registry is in preview. npm must hold `sexton-mcp@0.1.0` first, because the registry reads `mcpName` from the published package.json.

1. Install `mcp-publisher`: `brew install mcp-publisher`, or the release binary from https://github.com/modelcontextprotocol/registry/releases.
2. In `packages/mcp`: `mcp-publisher validate`.
3. `mcp-publisher login github`, and complete the device login as GitHub user `hsiddhu2`. This is the namespace proof: GitHub login grants `io.github.hsiddhu2/*`. The package proof is `mcpName: io.github.hsiddhu2/sexton` in the published `sexton-mcp` package.json.
4. `mcp-publisher publish`.
5. Check: `https://registry.modelcontextprotocol.io/v0.1/servers?search=io.github.hsiddhu2/sexton`.

## Results (27 Nov 2026)

Packs, from `node scripts/build-release.mjs` after a clean `tsc -b`:

| Package | Files | Packed | Unpacked |
|---|---|---|---|
| `sexton@0.1.0` | 6: `sexton.mjs` (820.6 kB, mode 755), `THIRD-PARTY-NOTICES.md`, `README.md`, `LICENSE`, `NOTICE`, `package.json` | 172.4 kB | 841.4 kB |
| `sexton-mcp@0.1.0` | 6: `sexton-mcp.mjs` (1625.7 kB, mode 755), `THIRD-PARTY-NOTICES.md`, `README.md`, `LICENSE`, `NOTICE`, `package.json` | 330.5 kB | 1672.7 kB |

Neither package.json has a dependency. No Pack holds a source map, test, fixture, source file, machine path or `@sexton/` import. Third-party notices: `sexton` lists ajv, fast-deep-equal, fast-uri, json-schema-traverse, semver and yaml. `sexton-mcp` lists those, `@modelcontextprotocol/core`, `@modelcontextprotocol/server` and zod, the same set as CREDITS.md. `sexton-mcp.mjs` is byte for byte `powers/sexton/server/sexton-mcp.mjs`.

Install proof, each tarball pair into an empty folder (npm reported "added 2 packages", no others):

| Node | `sexton --version` | server `initialize` | `tools/list` |
|---|---|---|---|
| 20.19.5 | `0.1.0` | `sexton 0.1.0` | `scan_project`, `explain_package`, `fix_order`, `check_policy` |
| 22.23.4 | `0.1.0` | `sexton 0.1.0` | the same four |

One real scan, under Node 20.19.5: `sexton scan https://github.com/hsiddhu2/sexton-demo --out scan.json` printed the table for 10 direct dependencies (four Dead, one Restless, five Alive), four remediation lines and `wrote scan.json`, exit 0.

server.json is valid against `server.schema.json` 2025-12-11 with ajv 8. The `uri` format is not asserted, and every URL in the file is absolute https.

## Review notes (27 Nov 2026)

First review, of the layout with three scoped packages, found no defect. Its notes that still apply after the change of layout: the workflow-level `id-token: write` is redundant with the job-level permissions and is kept because Requirement 3.2 names it. Anyone with push access can tag any commit, which Owner step 4 covers. The tag test now includes near misses. The publish job uses `npm ci --ignore-scripts`. Its note on `.kiro/steering/tech.md` is done (Requirement 5.4). Its notes on the engine's own version and on workspace publishing no longer apply: the engine is not published, and the workflow publishes folders.

Second review, of the two-package layout. One defect, fixed: `build-release.mjs --out` with no value resolved to the current directory, whose `sexton` folder it would then empty (from the parent of this repository, the repository itself). It now exits 2 on a missing, empty or flag-like `--out`, or any other argument, and a test runs those cases from a folder and checks nothing was removed. Notes applied: the release check also rejects a `scripts` key (no lifecycle script may run in the publish job) and an extra bin. The licence and NOTICE file is picked the same way on every platform (shortest name, then code unit order) and a `license` object prints its type. The notices say "unmodified apart from bundling". A blank line before and after the new paragraph in CREDITS.md. Notes kept: the workflow-level `id-token: write` (Requirement 3.2). `npm view` under setup-node's placeholder token was checked by the first review and reports a missing version as exit 1, and a failure of `npm view` fails safe, because `npm publish` refuses an existing version.

## Sources

Read on 27 Nov 2026.

- npm, Trusted publishing for npm packages (last edited 6 Oct 2026): https://docs.npmjs.com/trusted-publishers. npm 11.5.1 and Node 22.14.0. GitHub-hosted runners. `id-token: write`. Per-package configuration with workflow filename. Allowed actions and the 3 Sep 2026 default. Two-day expiry. Automatic provenance for a public package from a public repository. `repository.url` must match. "Disallow tokens" after setup.
- npm, `npm trust`: https://docs.npmjs.com/cli/v11/commands/npm-trust. "Package must exist". npm 11.15.0. 2FA. `--allow-publish`.
- npm, Generating provenance statements: https://docs.npmjs.com/generating-provenance-statements. Public repository matching `repository`. Trusted publishing makes provenance without `--provenance`.
- Node.js release index: https://nodejs.org/dist/index.json. Node 22.23.5 with npm 10.9.9. Node 24.22.3 with npm 11.19.1.
- GitHub, Workflow syntax, filter pattern cheat sheet: https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax. `+` matches one or more of the preceding character.
- MCP Registry, Quickstart: https://github.com/modelcontextprotocol/registry/blob/main/docs/modelcontextprotocol-io/quickstart.mdx. `mcpName`, `mcp-publisher validate`, `login github`, `publish`, the 100-character description.
- MCP Registry, Package types: https://github.com/modelcontextprotocol/registry/blob/main/docs/modelcontextprotocol-io/package-types.mdx. npm ownership by `mcpName`. The npm public registry only.
- MCP Registry, Authentication: https://github.com/modelcontextprotocol/registry/blob/main/docs/modelcontextprotocol-io/authentication.mdx. GitHub login grants `io.github.<username>/*`.
- MCP Registry, Official registry requirements: https://github.com/modelcontextprotocol/registry/blob/main/docs/reference/server-json/official-registry-requirements.md.
- MCP Registry schema: https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json.
