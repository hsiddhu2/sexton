// runCli: the whole CLI behind one function. Spec: .kiro/specs/cli-and-action, Requirements 3.2 to 3.5.
// Resolves to 0, 1 or 2 and never rejects: every unexpected throw becomes exit 2 with fixed text.

import { ENGINE_VERSION } from "@sexton/engine";
import { parseCommand } from "./args.js";
import { checkCommand } from "./commands/check.js";
import { evidenceCommand, verifyCommand } from "./commands/evidence.js";
import { scanCommand } from "./commands/scan.js";
import type { CliDeps } from "./deps.js";
import { MSG, USAGE, usageError } from "./messages.js";
import { writeLines } from "./output.js";

export type { CliDeps } from "./deps.js";

async function dispatch(argv: readonly string[], deps: CliDeps): Promise<number> {
  const parsed = parseCommand(argv);
  if (!parsed.ok) return writeLines(deps.stderr, [usageError(parsed.reason)], 2);
  const c = parsed.command;
  switch (c.kind) {
    case "help":
      deps.stdout.write(USAGE);
      return 0;
    case "version":
      return writeLines(deps.stdout, [ENGINE_VERSION], 0);
    case "scan":
      return scanCommand(c.target, c.repo, c.out, deps);
    case "check":
      return checkCommand(c.target, c.repo, c.summary, deps);
    case "evidence":
      return evidenceCommand(c.target, c.repo, c.outDir, deps);
    case "verify":
      return verifyCommand(c.file, deps);
  }
}

export async function runCli(argv: readonly string[], deps: CliDeps): Promise<number> {
  try {
    const code = await dispatch(Array.isArray(argv) ? argv.map(String) : [], deps);
    return code === 0 || code === 1 ? code : 2;
  } catch {
    try {
      deps.stderr.write(`${MSG.unexpected}\n`);
    } catch {
      // nothing left to report to
    }
    return 2;
  }
}
