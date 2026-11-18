#!/usr/bin/env node
// Writes the embedded policy schema to schemas/sexton.policy.schema.json at the repository root.
// Build tool, not engine runtime code. Run `npm run build -w @sexton/engine` first.
// Usage: npm run schema:write -w @sexton/engine

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { POLICY_SCHEMA } from "../dist/policy/schema.js";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "..", "..", "..", "schemas");
const outPath = join(outDir, "sexton.policy.schema.json");

await mkdir(outDir, { recursive: true });
await writeFile(outPath, JSON.stringify(POLICY_SCHEMA, null, 2) + "\n");
console.log(`wrote ${outPath}`);
