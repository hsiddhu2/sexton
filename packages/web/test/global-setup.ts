// Vitest global setup: creates the demo files when they are missing, so a bare `npx vitest run` in packages/web of a
// fresh clone passes. `pretest` still regenerates them on every `npm test`. Spec cemetery-time-fixes, 1.4.
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "../../..");
const DEMO_SCAN_PATH = resolve(HERE, "../public/demo/scan.json");

export default function setup(): void {
  if (existsSync(DEMO_SCAN_PATH)) return;
  // Fixed command and arguments, no shell.
  execFileSync("npm", ["run", "demo:generate", "-w", "@sexton/api"], { cwd: REPO_ROOT, stdio: "inherit" });
}
