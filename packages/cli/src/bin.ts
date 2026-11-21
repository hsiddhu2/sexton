#!/usr/bin/env node
// The sexton bin. Builds the real ports and sets the exit code. Spec: .kiro/specs/cli-and-action, Requirement 3.

import { resolve } from "node:path";
import { createFetchTransport } from "@sexton/engine";
import { nodeFilePort } from "./file-port.js";
import { nodeGitPort } from "./git-port.js";
import { runCli } from "./run-cli.js";
import { createWorkingTreeSource } from "./working-tree.js";

process.exitCode = await runCli(process.argv.slice(2), {
  transport: createFetchTransport(),
  clock: () => new Date(),
  stdout: { write: (text) => void process.stdout.write(text) },
  stderr: { write: (text) => void process.stderr.write(text) },
  files: nodeFilePort,
  git: nodeGitPort,
  env: process.env,
  cwd: process.cwd(),
  workingTree: (root) => createWorkingTreeSource(root, nodeGitPort),
  resolvePath: (...parts) => resolve(...parts),
});
