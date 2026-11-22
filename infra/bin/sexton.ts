// CDK entry point. Bundles a handler only when its entry file exists, and deploys the web
// build only when packages/web/dist/index.html exists (design.md, Decisions).

import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { buildApp } from "../lib/app.js";
import type { HandlerCode } from "../lib/edge-stack.js";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const lockFile = `${repoRoot}package-lock.json`;

function handlerCode(relativeEntry: string): HandlerCode {
  const entry = `${repoRoot}${relativeEntry}`;
  return existsSync(entry) ? { kind: "bundle", entry, projectRoot: repoRoot, depsLockFilePath: lockFile } : { kind: "placeholder" };
}

const webDist = `${repoRoot}packages/web/dist`;

const region = process.env["CDK_DEFAULT_REGION"] ?? process.env["AWS_REGION"] ?? "us-east-1";

buildApp({
  region,
  scanCode: handlerCode("packages/api/src/handlers/scan.ts"),
  snapshotterCode: handlerCode("packages/api/src/handlers/snapshotter.ts"),
  remediateCode: handlerCode("packages/api/src/handlers/remediate.ts"),
  webAssetPath: existsSync(`${webDist}/index.html`) ? webDist : null,
}).app.synth();
