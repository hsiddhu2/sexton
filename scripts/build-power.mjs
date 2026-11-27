// Builds the Bundle of the Kiro Power: one file with the MCP server, the Engine, the CLI composition and the protocol library.
// Spec: .kiro/specs/sexton-power, Requirements 14.5, 14.6, Decision 8. Run `npm run build -w @sexton/mcp` first (npm run build:power does).
// Usage: node scripts/build-power.mjs [--out <file>]. Default output: powers/sexton/server/sexton-mcp.mjs.
// esbuild is the one already pinned in infra (a devDependency, accepted in sexton.policy.yml); this script adds no dependency.
// The esbuild options live in scripts/lib/bundle.mjs, shared with the npm release build (spec release).
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { bundle, loadEsbuild } from "./lib/bundle.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const entry = "packages/mcp/dist/bin.js";
if (!existsSync(resolve(root, entry))) {
  console.error(`build-power: ${entry} is missing. Run npm run build -w @sexton/mcp first.`);
  process.exit(2);
}
const esbuild = await loadEsbuild("build-power");
const flag = process.argv.indexOf("--out");
const out = flag === -1 ? resolve(root, "powers/sexton/server/sexton-mcp.mjs") : resolve(process.argv[flag + 1] ?? "");
await bundle(esbuild, { root, entry, outfile: out });
console.log(`build-power: wrote ${out}`);
