// Run by .github/workflows/release.yml after scripts/build-release.mjs and before any publish. Spec: .kiro/specs/release, Requirement 3.5.
// Usage: node scripts/release-check.mjs <tag> [--dir <dir>]. Reads <dir>/<name>/package.json (default build/release) and packages/mcp/server.json.
// Exit 0 when the tag agrees with the packages, 1 when it does not, 2 on a usage error or a missing build.
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, resolve } from "node:path";
import { RELEASE_PACKAGES, releaseProblems } from "./lib/release.mjs";

const args = process.argv.slice(2);
const flag = args.indexOf("--dir");
const dirArg = flag === -1 ? undefined : args[flag + 1];
const rest = flag === -1 ? args : args.filter((_, i) => i !== flag && i !== flag + 1);
if (rest.length !== 1 || (flag !== -1 && dirArg === undefined)) {
  console.error("usage: node scripts/release-check.mjs <tag> [--dir <dir>]");
  process.exit(2);
}
const [tag] = rest;
const root = fileURLToPath(new URL("..", import.meta.url));
const dir = resolve(root, dirArg ?? "build/release");
const paths = RELEASE_PACKAGES.map((def) => join(dir, def.name, "package.json"));
const missing = paths.filter((p) => !existsSync(p));
if (missing.length > 0) {
  console.error(`release-check: ${missing.join(", ")} missing. Run node scripts/build-release.mjs first.`);
  process.exit(2);
}
const manifests = paths.map((p) => JSON.parse(readFileSync(p, "utf8")));
const problems = releaseProblems(tag, manifests, JSON.parse(readFileSync(resolve(root, "packages/mcp/server.json"), "utf8")));
if (problems.length > 0) {
  for (const line of problems) console.error(`release-check: ${line}`);
  process.exit(1);
}
console.log(`release-check: ${tag} ok: ${manifests.map((m) => `${m.name}@${m.version}`).join(", ")}`);
