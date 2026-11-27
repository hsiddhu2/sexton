// Run by .github/workflows/release.yml before any publish. Spec: .kiro/specs/release, Requirement 3.4.
// Usage: node scripts/release-check.mjs <tag>. Exit 0 when the tag agrees with the packages, 1 when it does not, 2 on a usage error.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { PUBLISH_ORDER, releaseProblems } from "./lib/release-check.mjs";

const tag = process.argv[2];
if (tag === undefined || process.argv.length !== 3) {
  console.error("usage: node scripts/release-check.mjs <tag>");
  process.exit(2);
}
const root = fileURLToPath(new URL("..", import.meta.url));
const read = (path) => JSON.parse(readFileSync(resolve(root, path), "utf8"));
const manifests = Object.fromEntries(PUBLISH_ORDER.map((key) => [key, read(`packages/${key}/package.json`)]));
const problems = releaseProblems(tag, manifests, read("packages/mcp/server.json"));
if (problems.length > 0) {
  for (const line of problems) console.error(`release-check: ${line}`);
  process.exit(1);
}
console.log(`release-check: ${tag} ok: ${PUBLISH_ORDER.map((key) => `${manifests[key].name}@${manifests[key].version}`).join(", ")}`);
