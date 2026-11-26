#!/usr/bin/env node
// The sexton-mcp bin. Spec: .kiro/specs/sexton-power, Requirements 1.5, 1.6, 2.1.
// It reads no environment variable and no working directory to find a project: each tool call names it.
// Nothing is read or fetched until the first call. stdout carries MCP messages only; log lines go to stderr.
import { lstat, realpath, stat } from "node:fs/promises";
import { createRealDeps } from "@sexton/cli";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { readOnlyFiles } from "./read-only-files.js";
import { createServer } from "./server.js";

const real = createRealDeps(process.cwd());
const server = createServer({
  cli: { ...real, files: readOnlyFiles(real.files) },
  fs: { realpath: (p) => realpath(p), stat: (p) => stat(p), lstat: (p) => lstat(p) },
  scanTimeoutMs: 55_000,
  cacheTtlMs: 900_000,
  now: () => Date.now(),
  log: (line) => void process.stderr.write(`${line}\n`),
});
await server.connect(new StdioServerTransport());
