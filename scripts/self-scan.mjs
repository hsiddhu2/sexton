#!/usr/bin/env node
// Sexton scans itself. Reads the direct dependencies of the root and of every workspace
// with their locked versions, scores them live, evaluates sexton.policy.yml and exits
// non-zero on failure (N-7).
// Usage, from the repo root after `npm run build -w @sexton/engine`:
//   node scripts/self-scan.mjs

import { readFile, readdir } from "node:fs/promises";
import { scorePackages, parsePolicy, evaluatePolicy } from "../packages/engine/dist/index.js";
import { collectDirect } from "./lib/collect-direct.mjs";

const root = new URL("..", import.meta.url);
const rootManifest = JSON.parse(await readFile(new URL("package.json", root), "utf8"));
const lock = JSON.parse(await readFile(new URL("package-lock.json", root), "utf8"));

const workspaces = [];
for (const entry of rootManifest.workspaces ?? []) {
  const m = /^([A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*)\/\*$/.exec(entry);
  if (m === null) {
    console.error(`self-scan: unsupported workspaces entry ${JSON.stringify(entry)}`);
    process.exit(2);
  }
  for (const d of await readdir(new URL(`${m[1]}/`, root), { withFileTypes: true })) {
    if (!d.isDirectory()) continue;
    const dir = `${m[1]}/${d.name}`;
    try {
      workspaces.push({ dir, manifest: JSON.parse(await readFile(new URL(`${dir}/package.json`, root), "utf8")) });
    } catch (e) {
      if (e?.code !== "ENOENT") throw e;
    }
  }
}
const packages = collectDirect({ root: rootManifest, workspaces, lock });

const report = await scorePackages(packages);
for (const p of report.packages) {
  const miss = p.missingSignals.length > 0 ? ` missing: ${p.missingSignals.join(", ")}` : "";
  console.log(`${p.name}@${p.installedVersion}  ${p.state}  (${p.stateReason})${miss}`);
}

const parsed = parsePolicy(await readFile(new URL("sexton.policy.yml", root), "utf8"));
if (!parsed.ok) {
  console.error("policy invalid:", JSON.stringify(parsed.errors, null, 2));
  process.exit(2);
}
const result = evaluatePolicy(parsed.policy, report, "file");
console.log("");
for (const rule of result.rules) {
  const label = rule.name ?? rule.type;
  console.log(`${rule.pass ? "PASS" : "FAIL"}  ${label}`);
  for (const f of rule.failures) console.log(`      fail: ${f.name}@${f.installedVersion}  ${f.reason}`);
  for (const u of rule.unevaluated) console.log(`      unevaluated: ${u.name}  ${u.reason}`);
}
console.log("");
console.log(result.pass ? "policy passed" : "policy failed");
process.exit(result.pass ? 0 : 1);
