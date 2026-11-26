# Sexton Power proof

Date: 26 Nov 2026. Branch kiro/power. Spec: .kiro/specs/sexton-power. Real output only. A step that did not run says so.

Status: **the proof of the Power itself did not run.** The work stopped at task 2 (the spike), because a Power's server does not start in the workspace directory and Kiro gives it no other way to find the project. Only the spike and task 1 are recorded here.

## Task 1: the dependency

- `@modelcontextprotocol/server` 2.4.0 added to `packages/mcp/package.json`, pinned, through `npx npm@11 install --save-exact --workspace=packages/mcp @modelcontextprotocol/server@2.4.0`. Lockfile gains `@modelcontextprotocol/core` 2.4.0, `@modelcontextprotocol/server` 2.4.0 (both Apache-2.0) and `zod` 4.6.7 (MIT, transitive).
- The PreToolUse hook `install-gate` is bound to the shell tool, so it fired on the install command, but its stdout is not shown to the agent. The gate script was therefore also run by hand on the same command, after the install:
  ```
  sexton install gate: policy passed for /Users/harpreetsiddhu/Documents/Personal/Projects/Kiroween2026/sexton-kiro, install allowed.
  gate exit=0
  ```
- `sexton check .` on the repository after the install:
  ```
  PASS  No possessed, dead or haunted dependencies
  PASS  No install scripts
  PASS  Published within 24 months
  policy passed
  policy: passed (sexton.policy.yml)
  check exit=0
  ```
- `sexton check` does not scan workspace packages; `npm run scan:self` does and has not been run yet.
- A first attempt with the machine's npm 10.9.9 (`npm install -w @sexton/mcp ...`) changed 75 lines of `package-lock.json` (`"peer": true` flags) and did not add the dependency. It was reverted. The lockfile in this commit comes from npm 11.21.2, the version CI uses.

## Task 2: the spike

Stub Power: `build/spike/power` (gitignored): `plugin.json` (name `sexton-spike`, keywords `spikewhere`, `sexton-spike`), `mcp.json`, `skills/spike/SKILL.md`, and `server/stub.mjs`, an 800 KB esbuild bundle of one tool, `where`, on `@modelcontextprotocol/server` 2.4.0 with a hand-written Standard Schema and no zod. The server appends one line per start and per call to `/tmp/k4c-spike-start.log`.

### What the owner did

Powers panel, Add Custom Power, Import power from a folder, `build/spike/power`. The owner reported: it shows in the Powers panel as `sexton-spike` with Try power, Uninstall and Check for updates. Importing the folder installed it with no separate Install button.

### What was recorded

| Question | Answer | Evidence |
|---|---|---|
| Does Kiro connect to a v2 server? | **Yes.** Kiro's client is `{ "name": "kiro", "version": "0.0.0" }` and offered only the `elicitation` capability. A `tools/call` of `where` from this chat returned the server's JSON. | `/tmp/k4c-spike-start.log` (event `initialized`), and the tool call from the agent session |
| Does a hand-written Standard Schema work, with no zod? | **Yes.** `tools/list` showed `{"type":"object","properties":{},"additionalProperties":false}`; a call with an extra argument (checked over stdio outside Kiro) was refused with `Input validation error`. | `build/spike/talk.mjs` output |
| Working directory of a Power's server | **The installed copy of the Power, not the workspace**: `/Users/harpreetsiddhu/.kiro/powers/installed/power`. `PWD` and `VSCODE_CWD` in its environment are `/`. | log lines at 18:36:23 and 18:39:19 |
| Where the Power is installed | Kiro copies the folder to `~/.kiro/powers/installed/<folder name>`. The install name is the folder name (`power`), not the `name` in `plugin.json` (`sexton-spike`). | `~/.kiro/powers/installed.json` lists `power`; the tool id is `plugin::power::tool::spike::where` |
| Does a relative `args` path resolve? | **Yes**, against the installed Power folder (`server/stub.mjs` ran from there). | argv in the log |
| Does `env` in `mcp.json` arrive? | **Yes**, literally. | `SPIKE_VAR` in the log |
| Variable expansion in `args` and `env` | `${PLUGIN_ROOT}` and `${HOME}` expand. `${workspaceFolder}`, `${workspaceRoot}`, `${cwd}`, `${env:HOME}`, `${userHome}` and `${workspace}` stay as literal text. | argv entries A to H and `SEXTON_PROJECT_DIR` in the log |
| Does the server get the workspace some other way? | **No.** The client declares no `roots` capability and `roots/list` answers `Method not found`. The `tools/call` context holds only `sessionId`, `mcpReq` and `http`. No environment variable names the workspace (`PLUGIN_ROOT` is the Power folder). | log events `roots-error`, `call` |
| Which `node` runs it | **Node v20.19.5** (the first `node` on the extension host's PATH), not the repository's Node 22. The Bundle must target and run on Node 20. | `nodeVersion` in the log |
| Control: a workspace-level server | A server declared in `.kiro/settings/mcp.json` starts with `cwd` = the workspace (`/Users/harpreetsiddhu/Documents/Personal/Projects/Kiroween2026/sexton-kiro`). The same variables stay literal. The temporary entry was removed and the file restored. | log line at 18:40:09 |

### Outcome against design.md Decision 10

None of the three outcomes holds. The result is a fourth case: **a Power's own `mcp.json` cannot reach the project directory at all** (cwd is the installed Power folder, no workspace variable, no roots, no environment), while a server declared in the workspace's `.kiro/settings/mcp.json` can (cwd is the workspace). Prompt B says to stop when no outcome reaches the project directory. The work stopped here. Nothing after task 2.2 ran: no server code, no Bundle, no Power files, no README change, no live question in chat.

### Cleanup state

- The stub Power is still installed in this workspace under the name `power`. Removing it needs one click: Powers panel, `sexton-spike`, Uninstall. The stub files under `build/spike` are gitignored.
- `.kiro/settings/mcp.json` is back to its committed content.
- Task 2.3 is not done.
