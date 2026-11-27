# @sexton/engine

The core of Sexton: signals, states, policy, remediation plans and the evidence pack. The CLI and the MCP server are built on it.

Sexton finds the npm dependencies that will hurt you, proves it, and proposes the fix. Each direct dependency gets one of five states (Possessed, Dead, Haunted, Restless, Alive), and every signal behind a state carries its source URL and fetch time.

Most people want the command line instead: [`@sexton/cli`](https://www.npmjs.com/package/@sexton/cli).

```sh
npm install @sexton/engine
```

- ES module only. Node.js 20.19 or later.
- Source, specs and the full documentation: https://github.com/hsiddhu2/sexton

Licensed under the Apache License, Version 2.0.
