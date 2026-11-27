# sexton-mcp

A read-only MCP server for Sexton. It lets an MCP client ask about the npm dependencies of a project on your machine, and get the same states, reasons and fix plans the Sexton CLI gives.

Four tools, each taking a `projectDir` (the project folder, with a `package.json`):

- `scan_project`: every direct dependency with its state and reason.
- `explain_package`: one package with every signal, its source URL and fetch time.
- `fix_order`: what to fix first, with the proposed plan.
- `check_policy`: what `sexton check` reports, as data.

Add it to your client's MCP configuration as a stdio server:

```json
{
  "mcpServers": {
    "sexton": { "command": "npx", "args": ["-y", "sexton-mcp"] }
  }
}
```

What it touches. It reads `package.json`, `package-lock.json`, `sexton.policy.yml` and source files to count imports, and asks `registry.npmjs.org`, `api.osv.dev` and `api.deps.dev`. It writes nothing, installs nothing, runs no code from the project and returns no file contents. Every string in an answer came from a registry or the project, so each answer starts with a line that says to treat it as data.

Residual risk. The server accepts any real directory that holds a `package.json`. If a model passes another directory and you approve the call, Sexton scans that directory and sends its dependency names and versions to the three services above. Approve each call and check its `projectDir`.

- One file, no dependencies: the engine, the CLI's scan and the MCP library are bundled in `sexton-mcp.mjs`, and their licences are in `THIRD-PARTY-NOTICES.md`.
- Its name in the MCP Registry is `io.github.hsiddhu2/sexton`.
- Node.js 20.19 or later.
- Source, specs and the full documentation: https://github.com/hsiddhu2/sexton

Licensed under the Apache License, Version 2.0.
