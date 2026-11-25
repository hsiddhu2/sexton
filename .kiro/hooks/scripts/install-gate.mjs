// PreToolUse install gate. Reads the tool call as JSON on stdin. When the shell command runs
// npm install, npm i, npm ci or npm add (also through npx npm@11), it runs `sexton check` on the
// repository the hook runs in and exits 2 to block the install when the policy fails.
// Every other command exits 0 at once. Exit 0 lets the tool run; exit 2 blocks it.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const CLI = join(ROOT, "packages", "cli", "dist", "bin.js");
const ENGINE = join(ROOT, "packages", "engine", "dist", "index.js");
const TSC = join(ROOT, "node_modules", "typescript", "bin", "tsc");

// One shell segment: optional VAR=value prefixes, then npm or npx [-y|--yes] npm@<version>,
// then any flags, then the install subcommand.
const INSTALL = /^(?:[A-Za-z_][A-Za-z0-9_]*=\S*\s+)*(?:npm|npx\s+(?:(?:-y|--yes)\s+)?npm@[\w.-]+)(?:\s+-{1,2}[\w-]+(?:=\S+|\s+(?!-)\S+)?)*\s+(?:install|i|ci|add)(?:\s|$)/;

export function isInstallCommand(command) {
  if (typeof command !== "string") return false;
  return command.split(/&&|\|\||[;|\n]/).some((segment) => INSTALL.test(segment.trim()));
}

function readStdin() {
  return new Promise((resolve) => {
    let raw = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (c) => (raw += c));
    process.stdin.on("end", () => resolve(raw));
  });
}

async function main() {
  let input;
  try {
    input = JSON.parse(await readStdin());
  } catch {
    process.exit(0);
  }
  const command = input?.tool_input?.command;
  if (!isInstallCommand(command)) process.exit(0);

  if (!existsSync(CLI) || !existsSync(ENGINE)) {
    const build = spawnSync(process.execPath, [TSC, "-b", join(ROOT, "packages", "cli")], { cwd: ROOT, encoding: "utf8" });
    if (build.status !== 0) {
      process.stderr.write(`sexton install gate: could not build the CLI, install blocked.\n${build.stdout}${build.stderr}`);
      process.exit(2);
    }
  }

  const target = typeof input?.cwd === "string" && input.cwd.length > 0 ? input.cwd : process.cwd();
  const check = spawnSync(process.execPath, [CLI, "check", target], { cwd: target, encoding: "utf8" });
  if (check.status === 0) {
    process.stdout.write(`sexton install gate: policy passed for ${target}, install allowed.\n`);
    process.exit(0);
  }
  const lines = `${check.stdout ?? ""}`.split("\n");
  const failing = [];
  let inFail = false;
  for (const line of lines) {
    if (!line.startsWith("      ")) inFail = line.startsWith("FAIL");
    if (inFail) failing.push(line);
  }
  const detail = failing.length > 0 ? failing.join("\n") : `${check.stdout ?? ""}${check.stderr ?? ""}`.trim();
  process.stderr.write(`sexton install gate: sexton check exited ${check.status ?? "on a signal"} for ${target}, install blocked.\n${detail}\n`);
  process.exit(2);
}

await main();
