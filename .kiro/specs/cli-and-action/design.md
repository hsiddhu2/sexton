# Design Document: cli-and-action

## Overview

Sexton gets a command line and a GitHub Action (R-CL-1 to R-CL-4, R-PO-6). The CLI composes a scan exactly as the demo generator does, prints a table, writes the scan file, gates CI on the policy, writes and verifies the evidence pack. For a working copy it also counts import sites, so a package nobody references can be proposed for removal (R-RM-3), and it gives the node-sass recipe a real File source.

```
argv ─► runCli(argv, deps) ─► parse (node:util parseArgs, strict)
                         ├─ target: parseRepoUrl ok ─► Repository target: intakeRepoWithManifests, fetchPolicyText
                         └─ otherwise Path target ─► File port: package.json, package-lock.json, sexton.policy.yml
                                                    Git port: origin remote, HEAD
                                                    intakeFromManifests
                         ─► scorePackages ─► evaluatePolicy ─► bumpTargets ─► gatherBumpData
                         ─► gatherMigrationData ─► runMigrations(files) ─► planRemediation(importSites) ─► attachRemediations
                         ─► scan: table + scan.json │ check: rule lines + summary │ evidence: pack + report
```

The Engine stays pure: every file and process read is in `packages/cli`. The Action is a composite action that builds the CLI from its own checkout, runs `sexton check`, and posts or updates one comment through three GitHub REST calls.

### Research findings that shape the design

All read on 21 Nov 2026.

1. **Issue comments API** (https://docs.github.com/en/rest/issues/comments). "Every pull request is an issue", so a pull request conversation comment uses the issue comment endpoints; review comments are a separate API. List: `GET /repos/{owner}/{repo}/issues/{issue_number}/comments`, `per_page` "max 100", `page`. Create: `POST /repos/{owner}/{repo}/issues/{issue_number}/comments` with `body`, 201. Update: `PATCH /repos/{owner}/{repo}/issues/comments/{comment_id}` with `body`, 200. Headers: `Accept: application/vnd.github+json` recommended, `X-GitHub-Api-Version: 2026-03-10`. The page states no token permission for these endpoints; the workflow grants `pull-requests: write`, and the first pull request confirms it (report item).
2. **Composite actions** (https://docs.github.com/en/actions/sharing-automations/creating-actions/metadata-syntax-for-github-actions). `runs.using: composite`; `shell` is "Required if `run` is set"; a composite action "will not automatically get `INPUT_<VARIABLE_NAME>`" and reads inputs through the `inputs` context; `uses` steps are allowed; `$GITHUB_ACTION_PATH` names the action directory.
3. **Script injection** (https://docs.github.com/en/actions/security-for-github-actions/security-guides/security-hardening-for-github-actions): "Use an intermediate environment variable" for untrusted input in inline scripts. Inputs reach scripts only through `env:` here, and a test enforces no `${{` inside any `run`. The same page: `pull_request_target` "when used with the checkout of an untrusted pull request, expose[s] the repository to security compromises" and "Avoid using the `pull_request_target` workflow trigger if it's not necessary."
4. **Fork token** (https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows): "The `GITHUB_TOKEN` has read-only permissions in pull requests from forked repositories." So a failed post is a warning, never a failure.
5. **Default variables** (https://docs.github.com/en/actions/reference/workflows-and-actions/variables): `GITHUB_EVENT_PATH` "The path to the file on the runner that contains the full event webhook payload", `GITHUB_REPOSITORY` "The owner and repository name", `GITHUB_API_URL`, `GITHUB_EVENT_NAME`, `GITHUB_STEP_SUMMARY`, `RUNNER_TEMP`.
6. **`parseArgs`** (Node 22 `node:util`) with `strict: true` throws `ERR_PARSE_ARGS_UNKNOWN_OPTION` and `ERR_PARSE_ARGS_INVALID_OPTION_VALUE`; `allowPositionals: true` returns positionals. Every throw becomes a Usage error.

## Architecture

Engine changes (`packages/engine/src`):

```
intake/intake.ts               intakeFromManifests (new), intakeRepoWithManifests calls it
clients/github-policy.ts       fetchPolicyText, policyUrl, POLICY_FILE, MAX_POLICY_BYTES (moved from packages/api)
remediation/capped-source.ts   capFileSource(source, limits?)
remediation/count-references.ts countReferences, COUNTED_EXTENSIONS                          pure
remediation/pr-body.ts         REMOVE_CHECK_LINE in the remove body
index.ts                       neutralise, cleanLine, the above
```

`packages/api/src/policy-source.ts` becomes a re-export. Its tests stay.

`packages/cli` (`@sexton/cli`, type module, bin `sexton` → `dist/bin.js`, depends on `@sexton/engine` only):

```
src/bin.ts            real deps, process.exit(await runCli(process.argv.slice(2), deps))
src/run-cli.ts        runCli: parse, dispatch, map every failure to an exit code; never rejects
src/args.ts           parseCommand: parseArgs wrapper, Usage errors                     pure
src/deps.ts           CliDeps, Writer, FilePort, GitPort types
src/file-port.ts      nodeFilePort: capped UTF-8 reads under a root, writes
src/git-port.ts       nodeGitPort: execFile git, fixed arguments, 5 s, null on failure
src/repo-name.ts      repoFromRemote: https and git@ GitHub remotes to a RepoRef          pure
src/working-tree.ts   WorkingTreeSource: FileSource over a directory, 20000 raw entries
src/compose.ts        runScanPipeline: intake to remediations, importSites
src/import-sites.ts   importSitesFor: the four conditions of Requirement 2.5             pure
src/safe-text.ts      safe(text, max): neutralise then cleanLine                         pure
src/table.ts          renderTable, renderScanFooter                                       pure
src/check-output.ts   renderCheck                                                         pure
src/summary.ts        renderSummary, SUMMARY_MARKER, MAX_SUMMARY_CHARS                    pure
src/commands/scan.ts, check.ts, evidence.ts
src/messages.ts       every fixed error and status text
```

`packages/action` (`@sexton/action`, private, no runtime dependency):

```
action.yml                 composite action
src/post-comment.ts        main: reads env and the event file, posts or updates the comment
src/comment-client.ts      planComment and the three request builders                       pure
src/event.ts               prNumberFromEvent                                                pure
```

Both packages are in the root tsconfig references. `node:` imports are allowed in these two packages only.

## Components and Interfaces

### intake/intake.ts (Requirements 1.1, 1.2)

```ts
export interface ManifestTexts { readonly repo: RepoRef; readonly packageJsonText: string; readonly packageLockText: string | null }
export async function intakeFromManifests(input: ManifestTexts, ctx: ClientContext): Promise<IntakeWithManifests>;
```

The body of the current `run` after the two fetches: parse, lockfile, cap, resolve. `intakeRepoWithManifests` parses the URL, fetches package.json (error mapping unchanged), checks `parsePackageJson` before fetching the lockfile exactly as now, then calls `intakeFromManifests`. Never rejects. Results and request order are unchanged, so every intake test and fixture holds.

### clients/github-policy.ts (Requirement 1.3)

The code of `packages/api/src/policy-source.ts` moved verbatim: `POLICY_FILE = "sexton.policy.yml"`, `MAX_POLICY_BYTES = 256 * 1024`, `policyUrl`, `fetchPolicyText` with the same cache key and the same found/absent caching. `packages/api/src/policy-source.ts` re-exports these four names and the `PolicyText` type. `http/responses.ts`, which defined `POLICY_FILE` itself at HEAD, now re-exports it from the Engine, so there is one constant.

### remediation/capped-source.ts (Requirement 1.5)

`capFileSource(inner, limits: Partial<CapLimits> = {})` with `CapLimits { maxListed, maxRead, maxFileBytes }`. The constants stay exported and are the defaults. Behaviour for no limits is unchanged.

### remediation/count-references.ts (Requirement 2)

```ts
export const COUNTED_EXTENSIONS: readonly string[];
export function isCountedPath(path: string): boolean;
export function countReferences(files: readonly { path: string; text: string }[], scripts: ReadonlyMap<string, string>, names: readonly string[]): Map<string, number>;
```

Per line and per name, a reference when the line contains any of `q+n+q` or `q+n+"/"` for `q` in `"`, `'`, `` ` ``; in a style file (`.scss .sass .css .less`) also `~n/` and `~n"`. A line counts once per name. A script command counts when the name appears with no name character (`A-Za-z0-9._-@/`) on either side. Plain `includes` and index scans, no regular expression built from the name. Because every form closes the name with a quote, `/` or the end of a word, `lodash` never matches `lodash-es`, and because it opens with a quote or `~`, never `@x/lodash` (`"@x/lodash"` has `/` before `lodash`, not a quote).

### remediation/pr-body.ts (Requirement 2.7)

`REMOVE_CHECK_LINE = "No reference to this package was found in the files read. A package loaded by name at run time is not detected. Check before merging."` is printed after `REMOVE_SCOPE_LINE` for a remove plan. A Correction section is added to the remediation design.

### packages/cli: runCli and arguments (Requirement 3)

```ts
export interface CliDeps {
  readonly transport: Transport; readonly clock: () => Date; readonly stdout: Writer; readonly stderr: Writer;
  readonly files: FilePort; readonly git: GitPort; readonly env: Readonly<Record<string, string | undefined>>; readonly cwd: string;
  readonly workingTree?: (root: string) => FileSource & { counts(): RawCounts };   // injectable for tests
}
export async function runCli(argv: readonly string[], deps: CliDeps): Promise<number>;
```

`parseCommand(argv)` returns `{ kind: "scan" | "check" | "evidence" | "verify" | "help" | "version", target?, repo?, out?, summary?, outDir?, verifyFile? }` or a Usage error. Command is the first positional. Flags allowed per command; a flag of another command, a repeated flag (`parseArgs` keeps the last, so the wrapper counts tokens), a missing value, or a second positional is a Usage error. `--verify` belongs to `evidence` and excludes a target and `--out-dir`. Every unexpected throw anywhere becomes exit 2 with "sexton failed unexpectedly".

### File port and Git port (Requirements 4.1, 4.4)

```ts
export interface FilePort {
  readText(root: string, name: string, maxBytes: number): Promise<{ kind: "found"; text: string } | { kind: "missing" } | { kind: "too-large" } | { kind: "invalid" }>;
  readFileCapped(path: string, maxBytes: number): Promise<…same…>;
  writeText(path: string, text: string): Promise<boolean>;
}
export interface GitPort { originUrl(path: string): Promise<string | null>; head(path: string): Promise<string | null> }
```

`readText` joins the root and a fixed file name, `lstat`s it (a symbolic link or anything other than a plain file is `missing`, Decisions item 2), checks the size before reading, decodes with `new TextDecoder("utf-8", { fatal: true })` (BOM stripped). Git: `execFile("git", ["-c", "core.fsmonitor=false", "-C", path, ...], { timeout: 5000, shell: false })` for `remote get-url origin`, `rev-parse HEAD` and `ls-files -z`, trimmed; any error null. `core.fsmonitor` is a command git runs when it reads the index, and a checkout's own `.git/config` could set it, so it is turned off on the command line, which wins over every config file. `writeText` opens with `O_WRONLY | O_CREAT | O_TRUNC | O_NOFOLLOW` and refuses anything but a regular file, so a planted `scan.json` link is never followed. Reads open the file and read at most `maxBytes + 1` bytes whatever `stat` said, so a file growing between `stat` and read is still capped.

### repo-name.ts (Requirement 4.3)

`repoFromRemote(url)`: `git@github.com:owner/repo(.git)` becomes `https://github.com/owner/repo`; then `parseRepoUrl`. Anything else null.

### working-tree.ts (Requirement 5)

`createWorkingTreeSource(root, git)`. `listFiles`: if `git -c core.fsmonitor=false -C root ls-files -z` succeeds (a third fixed Git port command, `lsFiles`), split on NUL; else walk with `readdir({ withFileTypes: true })`, skipping Ignored directories and every entry that is not a plain file or directory. Either way: at most 20000 raw entries (capped flag), each `lstat`ed, symbolic links and non-files dropped, paths with forward slashes relative to the root. `readFile(p)`: only a listed path; `realpath` must start with `realpath(root) + sep`; `stat.size > 262144` gives undefined; fatal UTF-8 decode, undefined on failure. `counts()` gives `{ performed, rawCapped, skipped }`.

### compose.ts and import-sites.ts (Requirements 2.5, 2.6, 6.1)

```ts
export async function runScanPipeline(target: ResolvedTarget, deps: CliDeps): Promise<PipelineResult | PipelineError>;
```

Order: intake (`intakeFromManifests` or `intakeRepoWithManifests`); `scorePackages` with `MemoryCacheStore`, the CLI transport and clock, no snapshot store; policy (`parsePolicy` of the file text, or `DEFAULT_POLICY` with source default); `evaluatePolicy`; for a Path target, import counting: wrap the Working-tree source with `capFileSource(source, { maxListed: 20000, maxRead: 5000 })`, list, read every counted path, `countReferences`; `importSitesFor(intake, counts, scan)`; `bumpTargets`, `gatherBumpData`, `gatherMigrationData` with `readPackageScripts`, `runMigrations` with the Working-tree source (a fresh one, default caps) or none, `planRemediation(report, { intake, importSites, bumpData, migrations })`, `attachRemediations`. One ClientContext with a MemoryCacheStore is shared by every call.

`importSitesFor` returns an entry for an intake package only when origin is `dependencies`, listing performed, raw listing not capped, Capped source not capped, and skipped 0 in both.

### Output: safe-text, table, check, summary (Requirements 6.3 to 6.5, 7)

`safe(text, max)` = `cleanLine(neutralise(text), max)`. Every string from a scan goes through it before printing. Lines are joined with `\n`. Table cells are padded with spaces to the column width (code points). The summary is built with `escapeField` for every outside string, lines joined with `\n`; when longer than 60000 characters it is cut at a line boundary and ends with "Summary cut at 60000 characters. Run sexton check locally for the full result."

### commands/evidence.ts (Requirement 8)

Path: commit `git.head` when `/^[0-9a-f]{40}$/`, manifest and policy digests `sha256HexOfText`. Repository: commit null, digests from the fetched texts. `buildEvidencePack`, then write `sexton-evidence.json` (`serialiseEvidencePack`) and `sexton-evidence.md`, print "digest {digest}". `--verify`: `readFileCapped(file, 16 MiB)`, `JSON.parse` in try (failure: "not an evidence pack", 2), `verifyEvidencePack`: ok gives "verified {digest}" 0, `digest-mismatch` 1, `malformed` or `unsupported-version` 2.

### packages/action (Requirement 9)

`action.yml`:

```yaml
runs:
  using: composite
  steps:
    - uses: actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1 # v7.1.0
      with: { node-version: 22 }
    - shell: bash
      working-directory: ${{ github.action_path }}/../..
      run: npm ci --ignore-scripts --include-workspace-root -w @sexton/engine -w @sexton/cli -w @sexton/action && npx tsc -b packages/cli packages/action
    - id: check
      shell: bash
      env: { SEXTON_PATH: ${{ inputs.path }}, … }
      run: node "$GITHUB_ACTION_PATH/../cli/dist/bin.js" check "$SEXTON_PATH" --repo "https://github.com/$GITHUB_REPOSITORY" --summary "$RUNNER_TEMP/sexton-summary.md" ...
```

`working-directory` is a key, not a `run` block, so the rule "no `${{` inside run" holds. The check exit code is saved, the summary appended, the comment posted, then the step exits with the saved code.

`comment-client.ts`: `planComment(state)` is a pure state machine over responses: `list(page)` up to 3 pages of 100, then `update(id)` for the first comment whose body starts with the Marker and whose `user.login` is `github-actions[bot]` with `user.type` `Bot`, or `create`. A marker comment written by anyone else is never edited, so nobody can plant a comment for Sexton to fill and then rewrite. Request builders only produce `GET {api}/repos/{owner}/{repo}/issues/{n}/comments?per_page=100&page={p}`, `POST {api}/repos/{owner}/{repo}/issues/{n}/comments`, `PATCH {api}/repos/{owner}/{repo}/issues/comments/{id}`, with owner and repo from `GITHUB_REPOSITORY` validated by `isValidOwner`-equivalent patterns, `n` and `id` positive safe integers, and `{api}` fixed to `https://api.github.com`. Headers: `Accept`, `X-GitHub-Api-Version`, `Authorization: Bearer <token>`, `User-Agent`. Errors print fixed text with the status code only.

## Data Models

The scan file is the API's `ScanResponse` shape: `{ report, policy, remediations }`. The evidence files are the evidence-pack spec's pack and report. The Summary starts:

```
<!-- sexton:check -->
## Sexton check: fail
Policy source: `file`
States: Possessed 0, Dead 2, Haunted 1, Restless 0, Alive 9
### Failing rules
- `forbid_state` `no dead`: `request` `2.88.2`, ...
### Proposed remediations
- `Sexton: bump uuid to 11.1.1`
```

## Error Handling

| Situation | Exit | stderr |
|---|---|---|
| Usage error | 2 | "usage error: {fixed reason}. Run sexton --help." |
| package.json missing / invalid / too large | 2 | "package.json was not found in {path}" etc. |
| lockfile invalid or too large | 2 | fixed text |
| policy file invalid | 2 | "sexton.policy.yml is not valid" and one Safe-text line per error code and JSON pointer |
| `--repo` with a repository target, or not a GitHub URL | 2 | fixed text |
| output path is a link or not a regular file | 2 | "could not write {file}" |
| `--verify` file missing or over 16 MiB | 2 | fixed text |
| policy file over 256 KiB or unreadable | 2 | fixed text |
| repository not named | 2 | "cannot name the repository, pass --repo https://github.com/<owner>/<repo>" |
| intake error (repository target) | 2 | the engine's fixed message |
| file not writable | 2 | "could not write {file}" |
| evidence build failure | 2 | the closed reason |
| policy failed (check) | 1 | none |
| verify mismatch | 1 | none |
| unexpected throw | 2 | "sexton failed unexpectedly" |

## Security

- Terminal escape injection: package names, reasons, advisory summaries and policy text are attacker-controlled. `neutralise` turns every C0, C1, DEL, line and paragraph separator, bidi and direction mark into a space and lone surrogates into U+FFFD before anything is printed.
- The working-tree boundary: no symbolic link is listed or followed; every read resolves the real path under the real root; sizes are checked before reads.
- Git runs through `execFile` with fixed arguments and no shell. The path is an argument after `-C`, never interpolated.
- The Action never runs code from the scanned repository: it installs and builds only its own packages with `--ignore-scripts`, then reads three files. On `pull_request` from a fork the token is read-only, so a post fails with a warning. `pull_request_target` is refused in the docs because it would give a write token to a run over untrusted files.
- The token is read from env, sent only in the Authorization header to `api.github.com`, and never printed.
- The remove check cannot see a package loaded by a computed name, a CLI binary in a non-script file, or a config file outside the counted extensions; the PR body says so.

## Dependencies

None added at run time. `node:util`, `node:fs`, `node:child_process`, `node:path` and the global `fetch` are Node 22 built-ins.

## Testing Strategy

Vitest and fast-check 3.23.1, `numRuns` 100, 1000 for properties 45, 48, 49 and 50. CLI tests inject fake ports (an in-memory file port, a git port with canned answers, a fixture transport over the engine's recorded fixtures) and capture stdout and stderr. Working-tree tests create temporary directories with `mkdtemp` and remove them. Action tests read action.yml as text and scan its `run:` blocks line by line (no YAML library, so the action package gains no dependency), and drive `post-comment` with a fake fetch.

## Correctness Properties

Each property is one test tagged `Feature: cli-and-action, Property {n}: {title}`. Numbering continues from evidence-pack's 42.

### Property 43: runCli total
For any argument list of up to 6 strings drawn from commands, flags, values and arbitrary strings, `runCli` resolves to 0, 1 or 2 and never rejects.
**Validates: Requirement 3.2**

### Property 44: Usage errors
For any valid command line with one unknown flag, one missing flag value, one repeated flag or one extra positional added, `runCli` returns 2 and writes exactly one stderr line, and never touches the file or git port.
**Validates: Requirements 3.1, 3.3, 3.4**

### Property 45: No control character in output (1000 runs)
For any scan whose strings carry ESC sequences, C1 controls, CR, bidi marks and lone surrogates, the stdout and stderr of `scan`, `check` and `evidence` contain no character of `\p{Cc}` other than `\n`, no U+2028, U+2029, no bidi control.
**Validates: Requirement 6.5**

### Property 46: countReferences completeness and precision
For any valid name and any listed form, the count is at least 1; for any longer name containing it, a file referencing only the longer name gives 0; package.json and ignored paths are never counted.
**Validates: Requirements 2.2 to 2.4**

### Property 47: importSites conditions
For any intake, counts and scan counts, `importSitesFor` has no `devDependencies` entry, no entry at all when capped or anything was skipped or the listing was not performed, and otherwise one entry per `dependencies` package.
**Validates: Requirements 2.5, 2.6**

### Property 48: Summary has no raw outside line (1000 runs)
For any scan with hostile strings carrying a marker, removing every code span from the Summary leaves no marker, the Summary starts with the Marker and is at most 60000 characters.
**Validates: Requirements 7.3 to 7.5**

### Property 49: The token is never output (1000 runs)
For any token, event file and response sequence (including failures, thrown errors and response bodies that echo the token), the token never appears in stdout, stderr or a thrown message.
**Validates: Requirement 9.7**

### Property 50: Only allowed requests (1000 runs)
For any event file content, repository name and response sequence, every request is one of the three Allowed shapes on `https://api.github.com`, at most 3 list requests are sent, no request is sent when the pull request number is not a positive integer, and an update targets only a comment by `github-actions[bot]`.
**Validates: Requirements 9.5, 9.6, 9.9**

### Property 51: intakeFromManifests equivalence
For any repository and any package.json and lockfile texts (from the repo-intake arbitraries), `intakeFromManifests` equals `intakeRepoWithManifests` over a Transport serving the same texts.
**Validates: Requirement 1.2**

## Requirement Traceability

| Criterion | Covered by |
|---|---|
| 1.1, 1.2 | property 51, existing intake tests |
| 1.3 | existing policy-source tests through the re-export, engine example |
| 1.4, 1.5 | index test, capped-source examples, existing property 24 |
| 1.6 | existing source scan test |
| 2.1 to 2.4 | property 46, examples |
| 2.5, 2.6 | property 47 |
| 2.7 | pr-body example |
| 3.1 to 3.5 | properties 43, 44, examples |
| 4.1 to 4.7 | examples with fake ports and temporary directories, including a planted output link |
| 5.1 to 5.6 | examples in temporary directories |
| 6.1, 6.2, 6.4, 6.6 | examples over the fixture transport |
| 6.3 | table examples |
| 6.5 | property 45 |
| 7.1, 7.2 | examples: failing and passing fixture policy |
| 7.3 to 7.5 | property 48, examples |
| 8.1 to 8.4 | examples: write, verify, edited copy |
| 9.1 to 9.4, 9.10, 9.11 | action.yml and workflow test |
| 9.5 to 9.9 | properties 49, 50, examples |
| 10.1 to 10.3 | review |

## Decisions made during implementation

Each is the choice that keeps the smallest surface.

1. **Import counting reads up to 5000 files** with the Count limits; the recipe keeps its own default-capped source, so the migration behaves exactly as in spec 06.
2. **The three root files are read through `lstat`**: a symbolic link at `package.json`, `package-lock.json` or `sexton.policy.yml` is treated as missing, for the same boundary reason as the working tree.
3. **`parseArgs` keeps the last of a repeated flag**, so the wrapper counts option tokens and refuses a repeat as a Usage error.
4. **The Action installs with `--include-workspace-root`** so TypeScript (a root dev dependency) is present to build; the install runs in the action's own repository root from its lockfile, with `--ignore-scripts`.
5. **The comment API base is fixed to `https://api.github.com`**, not read from `GITHUB_API_URL`, so a tampered environment cannot send the token elsewhere. GitHub Enterprise Server is out of scope for 0.1.
6. **`scan` exits 0 on a failing policy**; only `check` gates (R-CL-1, R-CL-2).
7. **The Git port has a third command, `ls-files -z`**, which the working-tree listing of handoff decision 12 needs; handoff decision 8 named two. All three run with `-c core.fsmonitor=false` (spec review 1, defect 2).
8. **Writes never follow a link** (`O_NOFOLLOW`), because `scan.json` and the evidence files go to the current directory, which may be an untrusted checkout (spec review 1, defect 3).
9. **The comment step edits only its own comment**: Marker and `github-actions[bot]`. With a personal token passed as `token`, the comment is new each run (spec review 1, defect 4).
10. **The dogfood workflow builds this repository's own pull request code.** `uses: ./packages/action` makes the action checkout the scanned checkout. Under `pull_request` that is the same trust as ci.yml (`npm ci` of the pull request), and a fork pull request gets a read-only token. Requirement 9.4 holds for every other caller, whose action checkout is ours (spec review 1, defect 5).
11. **Symbolic links are dropped, not skipped**, so one link in a repository does not turn off remove; refusals for size, encoding or the root boundary are skipped (spec review 1, note 7). A path `git ls-files` lists that is missing on disk (a sparse or partial checkout) is skipped, so remove is not offered on a tree Sexton could not read in full (code review 2, note 2); a file that vanishes during a directory walk is dropped.
12. **One composite step runs check** and writes the exit code to `$GITHUB_OUTPUT` without failing; the summary and comment steps follow; a last step exits with the saved code. The token is in `env` of the comment step only. The path follows `--`. A path input that is a GitHub URL becomes a Repository target, and since the step also passes `--repo`, the CLI refuses it with 2: the input is a directory.
13. **`X-GitHub-Api-Version: 2026-03-10`**, the version the REST page names.
14. **Handoff points kept as stated**: the remediation tasks.md is not ticked (decision 16); ci.yml and scripts/self-scan.mjs are unchanged (decision 23); insufficient history from the absent snapshot store is not an error (decision 11); no colour (decision 1).
15. **`intakeFromManifests` is compared with the hosted path on texts of at most 5 MiB without a leading byte order mark**: the hosted path refuses larger texts and its decoder drops the mark, the CLI's File port does both before calling it (spec review 1, defect 8).
16. **bin.ts sets `process.exitCode`** instead of calling `process.exit`, so stdout written to a pipe is flushed before the process ends; the exit code is the same.
17. **Import counting runs for every local scan**, before planning, because `bumpTargets` needs the final kind of each package; with nothing unhealthy it costs one listing and the reads.
18. **The style form takes any quote after `~name`** (`~n"`, `~n'`, `` ~n` ``), as handoff decision 14 lists all three quote characters; `@import '~bootstrap';` is the common SCSS form (code review 2, defect 1).
19. **Table cells are cut to 39 code points plus the ellipsis**, so no cell exceeds 40.
