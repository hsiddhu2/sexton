// The real ports of the CLI. Spec: .kiro/specs/sexton-power, Requirement 8.2. bin.ts and the MCP server both build them here.
import { resolve } from "node:path";
import { createFetchTransport } from "@sexton/engine";
import type { CliDeps } from "./deps.js";
import { nodeFilePort } from "./file-port.js";
import { nodeGitPort } from "./git-port.js";
import { createWorkingTreeSource } from "./working-tree.js";

export function createRealDeps(cwd: string): CliDeps {
  return {
    transport: createFetchTransport(),
    clock: () => new Date(),
    stdout: { write: (text) => void process.stdout.write(text) },
    stderr: { write: (text) => void process.stderr.write(text) },
    files: nodeFilePort,
    git: nodeGitPort,
    env: process.env,
    cwd,
    workingTree: (root) => createWorkingTreeSource(root, nodeGitPort),
    resolvePath: (...parts) => resolve(...parts),
  };
}
