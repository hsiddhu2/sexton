#!/usr/bin/env node
// The sexton bin. Builds the real ports and sets the exit code. Spec: .kiro/specs/cli-and-action, Requirement 3.
import { createRealDeps } from "./real-deps.js";
import { runCli } from "./run-cli.js";

process.exitCode = await runCli(process.argv.slice(2), createRealDeps(process.cwd()));
