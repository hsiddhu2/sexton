# Install gate proof

Date: 25 Nov 2026. Branch kiro/depth. Hook: .kiro/hooks/supply-chain.json. Script: .kiro/hooks/scripts/install-gate.mjs.

## What was confirmed and where

- Matcher. The Kiro hook triggers page (https://kiro.dev/docs/hooks/types/, section Pre Tool Use) lists the built-in category `shell` as matching every built-in shell tool. The hook uses `"matcher": "shell"`. The tool ID in this IDE is `execute_bash`, as recorded in the AWS Labs empirical payload reference (https://awslabs.github.io/aidlc-workflows/reference/kiro-ide-hook-payload/).
- Tool input. The hooks overview (https://kiro.dev/docs/hooks/) says a command action runs in the project root and receives session context as JSON on STDIN. The triggers page shows the event shape `{ hook_event_name, cwd, session_id, tool_name, tool_input }`. The documentation does not list the fields of the shell tool's `tool_input`. The AWS Labs page records them from live captures as `{ command, cwd, run_in_background, timeout }` for PreToolUse on the shell tool. The script reads `tool_input.command`.
- Blocking. The hook actions page (https://kiro.dev/docs/hooks/actions/) says any non-zero exit blocks a Pre Tool Use tool call. The script exits 2, the code the workspace's existing security.json hook uses.
- Not tested live. createHook reported that the hook loads at the next session start. A dry run, `npx npm@11 ci --dry-run`, in this session showed no gate output. The proofs below feed the script the documented STDIN payload directly. The first live fire still needs a new session.

## Proof 1: an install that is allowed

The repository as committed. Payload on STDIN:

```
{"cwd":"/Users/harpreetsiddhu/Documents/Personal/Projects/Kiroween2026/sexton-kiro","tool_input":{"command":"npx npm@11 ci"}}
```

Output:

```
sexton install gate: policy passed for /Users/harpreetsiddhu/Documents/Personal/Projects/Kiroween2026/sexton-kiro, install allowed.
exit=0
```

## Proof 2: an install that is blocked

The scratch copy is /tmp/sexton-scratch, outside the repository. It holds package.json, package-lock.json and sexton.policy.yml, a `git init` and the same origin remote. The CLI needs the remote to name the repository; without it, check exits 2 with "cannot name the repository". One temporary rule was appended to the scratch policy only:

```
  - name: Temporary scratch rule, no living dependencies
    type: forbid_state
    states:
      - Alive
```

Payload on STDIN:

```
{"cwd":"/tmp/sexton-scratch","tool_input":{"command":"npm install left-pad"}}
```

Output:

```
sexton install gate: sexton check exited 1 for /tmp/sexton-scratch, install blocked.
FAIL  Temporary scratch rule, no living dependencies
      fail: @eslint/js@10.0.1  state is Alive: no rule matched
      fail: @types/node@22.10.2  state is Alive: no rule matched
      fail: @types/semver@7.8.0  state is Alive: no rule matched
      fail: eslint@10.15.0  state is Alive: no rule matched
      fail: fast-check@3.23.1  state is Alive: no rule matched
      fail: typescript@5.7.2  state is Alive: no rule matched
      fail: typescript-eslint@8.72.2  state is Alive: no rule matched
      fail: vitest@4.1.12  state is Alive: no rule matched
exit=2
```

## Matcher sweep

Each command was fed to the script against the scratch copy. "blocked" means the script recognised an install and the scratch policy failed. "passed" means the script exited at once without running check.

```
blocked exit 2  1324 ms  npm ci
blocked exit 2   974 ms  npm i
blocked exit 2   998 ms  npm add lodash
blocked exit 2  1016 ms  npx npm@11 ci
blocked exit 2   979 ms  npx -y npm@11 install
blocked exit 2   918 ms  npm --prefix infra install
blocked exit 2   911 ms  npm -g i typescript
blocked exit 2  1015 ms  npm --no-audit ci
blocked exit 2  1121 ms  cd infra && npm i
passed  exit 0    45 ms  npm test
passed  exit 0    42 ms  npm run build
passed  exit 0    39 ms  npm run lint -- --fix
passed  exit 0    41 ms  git status
passed  exit 0    38 ms  npm info semver
passed  exit 0    41 ms  echo hello
```

The first sweep let `npm --prefix infra install` through, because a flag that takes a value was not matched. The pattern was fixed before this sweep.

## Working directory order

Added 25 Nov 2026 after the merge of main. The script takes the directory to check from `tool_input.cwd` first, then the event's `cwd`, then `process.cwd()`, which is the project root where Kiro runs the hook. Each case uses the same failing scratch copy as Proof 2, rebuilt and deleted by the run.

### A. tool_input.cwd is the failing scratch copy, event cwd is the repository

Payload:

```
{"cwd":"/Users/harpreetsiddhu/Documents/Personal/Projects/Kiroween2026/sexton-kiro","tool_input":{"command":"npm install left-pad","cwd":"/tmp/sexton-scratch"}}
```

Output:

```
sexton install gate: sexton check exited 1 for /tmp/sexton-scratch, install blocked.
FAIL  Temporary scratch rule, no living dependencies
      fail: @eslint/js@10.0.1  state is Alive: no rule matched
      fail: @types/node@22.10.2  state is Alive: no rule matched
      fail: @types/semver@7.8.0  state is Alive: no rule matched
      fail: eslint@10.15.0  state is Alive: no rule matched
      fail: fast-check@3.23.1  state is Alive: no rule matched
      fail: typescript@5.7.2  state is Alive: no rule matched
      fail: typescript-eslint@8.72.2  state is Alive: no rule matched
      fail: vitest@4.1.12  state is Alive: no rule matched
exit=2
```

### B. tool_input.cwd is the repository, event cwd is the failing scratch copy

Payload:

```
{"cwd":"/tmp/sexton-scratch","tool_input":{"command":"npm install left-pad","cwd":"/Users/harpreetsiddhu/Documents/Personal/Projects/Kiroween2026/sexton-kiro"}}
```

Output:

```
sexton install gate: policy passed for /Users/harpreetsiddhu/Documents/Personal/Projects/Kiroween2026/sexton-kiro, install allowed.
exit=0
```

### C. no tool_input.cwd, event cwd is the failing scratch copy

Payload:

```
{"cwd":"/tmp/sexton-scratch","tool_input":{"command":"npm install left-pad"}}
```

Output:

```
sexton install gate: sexton check exited 1 for /tmp/sexton-scratch, install blocked.
FAIL  Temporary scratch rule, no living dependencies
      fail: @eslint/js@10.0.1  state is Alive: no rule matched
      fail: @types/node@22.10.2  state is Alive: no rule matched
      fail: @types/semver@7.8.0  state is Alive: no rule matched
      fail: eslint@10.15.0  state is Alive: no rule matched
      fail: fast-check@3.23.1  state is Alive: no rule matched
      fail: typescript@5.7.2  state is Alive: no rule matched
      fail: typescript-eslint@8.72.2  state is Alive: no rule matched
      fail: vitest@4.1.12  state is Alive: no rule matched
exit=2
```

### D. neither cwd, the hook runs in the repository

Payload:

```
{"tool_input":{"command":"npm install left-pad"}}
```

Output:

```
sexton install gate: policy passed for /Users/harpreetsiddhu/Documents/Personal/Projects/Kiroween2026/sexton-kiro, install allowed.
exit=0
```

