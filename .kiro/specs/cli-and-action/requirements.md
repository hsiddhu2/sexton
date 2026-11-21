# Requirements Document

## Introduction

The cli-and-action module implements R-CL-1 to R-CL-4 and R-PO-6 of docs/requirements.md, and R-RM-3 (remove) for local scans. It adds `packages/cli` (`@sexton/cli`, bin `sexton`) with the commands `scan`, `check` and `evidence`, and `packages/action` (`@sexton/action`), a composite GitHub Action that builds the CLI from its own checkout, runs `sexton check` on a pull request and posts one summary comment. It adds to the Engine local intake from manifest texts, the policy-file client moved from the API, terminal-safe text exports, configurable caps for the Capped source, and import-site counting. It adds one workflow that runs the Action on this repository.

The Engine stays pure and reads no file. The CLI owns every file and process read: the root manifests, the policy file, the working tree for import counting and review sites, and two git commands.

This spec does NOT publish to npm, add the remediation executor or `POST /api/remediate` (10b), scan workspaces, or deploy anything. It adds no runtime dependency.

## Glossary

- **Engine**, **Transport**, **ClientContext**, **IntakeWithManifests**, **FileSource**, **Capped source**, **Caps**, **Safe path**, **Ignored directory**, **Review site**, **RemediationEntry**, **EvidencePack**, **escapeField**, **neutralise**, **cleanLine**, **sha256HexOfText**, **verifyEvidencePack**: as defined in the earlier specs.
- **CLI**: `runCli(argv, deps): Promise<number>` and the `sexton` bin that calls it.
- **CLI deps**: `{ transport, clock, stdout, stderr, files, git, env, cwd }`. Tests inject fakes.
- **Target**: the first positional argument. A Target that `parseRepoUrl` accepts is a **Repository target**; any other string is a **Path target**.
- **Exit code**: 0 success; 1 the policy failed or the pack did not verify; 2 anything else.
- **Usage error**: an unknown command or flag, a missing flag value, an extra positional, or a flag given twice.
- **Error line**: one fixed-text line on stderr. It names no input except a file name the user passed, through Safe text. The one exception is an invalid policy file, which adds one Safe-text line per validation error (code and JSON pointer).
- **File port**: reads a file under a root with a byte cap, UTF-8 fatal with the byte order mark stripped; writes a file.
- **Git port**: three fixed commands, `remote get-url origin`, `rev-parse HEAD` and `ls-files -z`, each as `git -c core.fsmonitor=false -C <path> ...` through `execFile` with a fixed argument list, no shell, 5 second timeout; any failure gives null.
- **Working-tree source**: the CLI File source over a Path target: `git ls-files -z` inside a work tree, else a directory walk; at most 20000 raw entries; no symbolic link; reads only listed paths inside the root, at most 256 KiB each.
- **Count limits**: Capped-source limits of 20000 listed and 5000 read, used for import counting only.
- **Reference**: a line of a counted file that holds the package name between quote characters (`"`, `'`, `` ` ``) or followed by `/` inside quotes, and for style files the forms `~name/` and `~name"`; or a package.json script whose command holds the name as a whole word.
- **importSites**: the planner map from package name to reference count.
- **Safe text**: a string that went through `neutralise` and `cleanLine`, so it holds no escape or control character.
- **Summary**: the Markdown policy summary of `sexton check --summary`, first line `<!-- sexton:check -->`, at most 60000 characters.
- **Marker**: `<!-- sexton:check -->`.
- **Allowed requests**: list issue comments, create an issue comment, update an issue comment, on `api.github.com`.

## Requirements

### Requirement 1: Engine additions

**User Story:** As the CLI, I need local intake, the policy client and safe text from the Engine, so that the Engine stays the one place for rules.

#### Acceptance Criteria

1. THE Engine SHALL expose `intakeFromManifests({ repo, packageJsonText, packageLockText }, ctx)` returning an IntakeWithManifests, and `intakeRepoWithManifests` SHALL fetch the two texts and call it.
2. FOR ANY repository and any two manifest texts of at most 5 MiB each with no leading U+FEFF, `intakeFromManifests` SHALL give the same result as `intakeRepoWithManifests` over a Transport that serves those texts (equivalence).
3. THE Engine SHALL expose `fetchPolicyText(ctx, repo)`, `policyUrl` and `POLICY_FILE` from `clients/github-policy.ts` with the URL shape, 256 KiB cap and cache rule of the API's former `policy-source.ts`, and THE API SHALL re-export them from `policy-source.ts`.
4. THE Engine SHALL export `neutralise` and `cleanLine` from its index.
5. THE Engine SHALL let `capFileSource(source, limits?)` take `{ maxListed, maxRead, maxFileBytes }`, with the defaults 500, 200 and 262144 when absent.
6. THE Engine SHALL contain no `node:` import in `packages/engine/src`. (review constraint, existing source scan test)

### Requirement 2: Import-site counting

**User Story:** As a maintainer, I want an unused dependency proposed for removal only when Sexton looked everywhere, so that a remove never breaks my build.

#### Acceptance Criteria

1. THE Engine SHALL expose `countReferences(files, scripts, names)`, pure, returning a map from each name to its Reference count.
2. THE Engine SHALL count only files whose path ends in `.js .mjs .cjs .ts .mts .cts .jsx .tsx .vue .svelte .json .yml .yaml .scss .sass .css .less .html`, and SHALL NOT count `package.json`, `package-lock.json`, `npm-shrinkwrap.json` at any depth or any path with an Ignored directory segment.
3. FOR ANY name and any listed import form (`require("n")`, `from 'n'`, `` import(`n`) ``, `"n/sub"`, `~n/x` and `~n"` in a style file, a script `n --flag`), THE count SHALL be at least 1 (completeness).
4. FOR ANY name `n` and any longer valid name that contains `n` (`n-es`, `@x/n`, `n2`, `xn`), a file that references only the longer name SHALL give `n` a count of 0 (no false match).
5. THE CLI SHALL give `importSites` an entry for a package only WHEN its origin is `dependencies`, the listing was performed, nothing was capped and nothing was skipped; otherwise the name SHALL be absent.
6. FOR ANY scan, `importSites` SHALL have no entry for a `devDependencies` package, and no entry at all WHEN the listing was capped or a file was skipped (invariant).
7. THE remediation PR body for a remove SHALL carry the fixed line "No reference to this package was found in the files read. A package loaded by name at run time is not detected. Check before merging." (remediation spec, amended).

### Requirement 3: CLI arguments and exit codes

**User Story:** As a CI author, I want stable commands and exit codes, so that a pipeline can gate on them.

#### Acceptance Criteria

1. THE CLI SHALL parse arguments with `parseArgs` from `node:util` in strict mode and SHALL accept `scan <target> [--repo <url>] [--out <file>]`, `check [target] [--repo <url>] [--summary <file>]`, `evidence [target] [--repo <url>] [--out-dir <dir>]`, `evidence --verify <file>`, `--help` and `--version`.
2. FOR ANY argument list, `runCli` SHALL resolve to 0, 1 or 2 and SHALL NOT reject (invariant).
3. FOR ANY Usage error, THE CLI SHALL return 2 and write one Error line (rejection).
4. THE CLI SHALL write results to stdout and errors to stderr, each error one fixed-text line.
5. `--version` SHALL print `ENGINE_VERSION`; `--help` SHALL print the usage text; both SHALL return 0.

### Requirement 4: Local intake

**User Story:** As a developer, I want to scan my working copy, so that I see the state before I push.

#### Acceptance Criteria

1. FOR a Path target, THE CLI SHALL read `package.json`, `package-lock.json` and `sexton.policy.yml` from the path root only, with caps of 5 MiB, 5 MiB and 256 KiB, UTF-8 fatal, byte order mark stripped.
2. IF `package.json` is missing or invalid, THEN THE CLI SHALL return 2; a missing lockfile SHALL give an unlocked scan; a missing policy file SHALL give the default policy and every output SHALL say so.
3. THE CLI SHALL name the repository of a Path target from `--repo`, else from the origin remote when it parses as a GitHub URL in its https or `git@github.com:` form, and IF neither gives one, THEN SHALL return 2 with "cannot name the repository, pass --repo https://github.com/<owner>/<repo>".
4. THE Git port SHALL run only its three fixed commands, each with `-c core.fsmonitor=false`, through `execFile` with no shell and a 5 second timeout, and SHALL give null on any failure; a commit SHALL be used only WHEN it is 40 lower-case hex characters.
5. FOR a Repository target, THE CLI SHALL use `intakeRepoWithManifests` and `fetchPolicyText` and SHALL pass no File source.
6. IF `--repo` is given with a Repository target or is not a GitHub repository URL, THEN THE CLI SHALL return 2 with a fixed Error line.
7. THE CLI SHALL never write through a symbolic link: IF an output path is an existing symbolic link or an existing entry that is not a regular file, THEN the write SHALL fail and THE CLI SHALL return 2.

### Requirement 5: Working-tree source

**User Story:** As a developer, I want the CLI to read only my repository, so that a hostile checkout cannot make it read elsewhere.

#### Acceptance Criteria

1. THE Working-tree source SHALL list with `git ls-files -z` WHEN the path is inside a git work tree, else by a directory walk that skips Ignored directories, with forward-slash paths relative to the root.
2. THE raw listing SHALL stop at 20000 entries and mark itself capped.
3. THE Working-tree source SHALL never list or follow a symbolic link.
4. `readFile` SHALL answer only a listed path, SHALL resolve the real path and refuse one outside the root, SHALL skip a file over 256 KiB before reading it, and SHALL return undefined for a file that is not valid UTF-8.
5. FOR the example trees of the tests (a link to a file outside the root, a link to a directory, a file over the cap, an invalid UTF-8 file), no returned path SHALL be outside the root and none SHALL be a symbolic link (security, examples in temporary directories).
6. Symbolic links and vanished files SHALL be dropped from the listing without counting as skipped; a file refused for size, encoding or the root check SHALL count as skipped.

### Requirement 6: scan

**User Story:** As a developer, I want a readable table and a scan file, so that I can read and keep the result.

#### Acceptance Criteria

1. THE CLI `scan` SHALL compose, in order: intake, `scorePackages` with a MemoryCacheStore and no snapshot store, the policy, `bumpTargets`, `gatherBumpData`, `gatherMigrationData`, `runMigrations`, `planRemediation`, `attachRemediations`.
2. THE scan file SHALL be exactly `{ report, policy, remediations }` with two-space indentation and a final newline, at `--out` or `scan.json` in the current directory.
3. THE table SHALL have the columns Package, Version, State, Reason, Advisories, Install script, Provenance, Last publish; Advisories the count and highest severity; an unavailable signal "unavailable"; rows in STATE_ORDER then name; cells cut at 40 code points.
4. Under the table THE CLI SHALL print one line per notice (unlocked, capped, unresolved), then the policy line with its source, then one line per remediation title.
5. FOR ANY scan data, THE output of every command, stdout and stderr, SHALL hold no escape character and no control character other than line feed, and no colour (security, 1000 runs).
6. `scan` SHALL return 0 WHEN the scan file is written, whatever the policy result.

### Requirement 7: check

**User Story:** As a CI author, I want a non-zero exit on a policy failure, so that the build fails.

#### Acceptance Criteria

1. THE CLI `check` SHALL default its target to the current directory, print one line per rule with PASS or FAIL, the failing packages with reasons under it, unevaluated entries marked as such, then "policy passed" or "policy failed" and the policy source.
2. `check` SHALL return 1 WHEN any rule fails and 0 WHEN all pass (R-PO-6).
3. WITH `--summary <file>`, THE CLI SHALL write the Summary: the Marker first, result, source, counts per state, failing rules with their packages, remediation titles.
4. THE Summary SHALL pass every outside string through `escapeField`, and FOR ANY scan data no raw line of an outside string SHALL appear outside a code span (security, 1000 runs).
5. THE Summary SHALL be at most 60000 characters, cut with a closing note.

### Requirement 8: evidence

**User Story:** As a security reviewer, I want the pack from the CLI and a way to check it, so that I can work offline.

#### Acceptance Criteria

1. THE CLI `evidence` SHALL default its target to the current directory, write `sexton-evidence.json` and `sexton-evidence.md` to `--out-dir` (default the current directory), overwriting them, and print the digest.
2. FOR a Path target, the commit SHALL come from the Git port or be null, manifest and policy digests through `sha256HexOfText`, remediations from the scan, and the remediation log null; FOR a Repository target, commit null and digests from the fetched texts.
3. `evidence --verify <file>` SHALL read at most 16 MiB and print "verified" and the digest with 0, "digest mismatch" with 1, and "not an evidence pack" with 2 for invalid JSON or a malformed pack; a missing or larger file SHALL give 2 with a fixed Error line.
4. FOR ANY pack the CLI wrote, `--verify` SHALL return 0, and FOR a copy that is valid JSON with one body leaf changed, 1 (round trip).

### Requirement 9: The Action

**User Story:** As a maintainer, I want Sexton on every pull request, so that a dangerous dependency is caught in review.

#### Acceptance Criteria

1. THE Action SHALL be a composite action at `packages/action/action.yml` with inputs `path` (default "."), `comment` (default "true") and `token` (default the workflow token).
2. THE Action SHALL set up Node 22 with the same pinned commit as ci.yml, run `npm ci --ignore-scripts` for the Engine, CLI and Action workspaces and the workspace root (for TypeScript) in its own repository root from its own lockfile, build the Engine, the CLI and the Action, run `sexton check` on the caller's path with `--repo` from `GITHUB_REPOSITORY` and `--summary` under `RUNNER_TEMP`, append the Summary to `GITHUB_STEP_SUMMARY`, post the comment, and exit with the check's code.
3. THE Action SHALL pass every input to a script through `env`; no `${{ }}` SHALL appear in any `run` block, and every `uses` SHALL be pinned to a 40-character commit SHA (enforced by a test).
4. WHEN the Action's checkout is separate from the scanned repository, THE Action SHALL NOT install, build or run anything from the scanned repository; it SHALL only read its three root files and the working tree as text.
5. THE comment step SHALL run only WHEN the event is `pull_request` and `comment` is "true", SHALL list at most 3 pages of 100 comments, update the first that starts with the Marker and was written by `github-actions[bot]` (user type `Bot`), or else create one.
6. FOR ANY event file content and any responses, THE comment step SHALL build only the Allowed requests (security, 1000 runs).
7. FOR ANY token, THE token SHALL NOT appear in stdout, stderr or an error message (security, 1000 runs).
8. IF posting fails, THEN THE comment step SHALL print a warning and exit 0.
9. THE pull request number SHALL come from the file named by `GITHUB_EVENT_PATH` and be used only WHEN it is a positive integer.
10. THE repository SHALL hold `.github/workflows/sexton.yml`: on `pull_request`, permissions contents read and pull-requests write, checkout pinned as in ci.yml with persist-credentials false, then `uses: ./packages/action`.
11. THE token SHALL be set in `env` of the comment step only, and the scanned path SHALL follow `--` on the command line.

### Requirement 10: Docs

**User Story:** As a reader, I want the CLI and Action documented with their limits.

#### Acceptance Criteria

1. README SHALL gain a CLI section (four commands, exit codes, "not published to npm yet, run it from a clone") and an Action section with an example pinned to a marked SHA placeholder that uses `pull_request`, never `pull_request_target`, and grants contents read and pull-requests write, and SHALL replace the hosted Markdown sentence with "The hosted site gains the evidence endpoint and the header links at its next deploy."
2. ROADMAP 0.2 SHALL gain "Workspace scanning in the CLI" and "CLI published to npm".
3. docs/architecture.md SHALL gain a CLI and Action section; docs/threat-model.md SHALL cover terminal escape injection, the working-tree boundary and links, the fork token, the refusal of `pull_request_target`, and the limit of the remove check.
