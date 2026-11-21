// The Lambda bundle carries the pinned AWS SDK. design.md, Security: "SDK bundled at a pinned version".
// Runs esbuild locally on a small fixture entry. No network, no AWS.

import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Template } from "aws-cdk-lib/assertions";
import { describe, expect, it } from "vitest";
import { buildApp } from "../lib/app.js";
import { WEB_FIXTURE, resourcesOfType } from "./helpers.js";

const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const ENTRY = fileURLToPath(new URL("./fixtures/handler/sdk-entry.mjs", import.meta.url));

describe("Lambda bundling", () => {
  it("bundles @aws-sdk/client-dynamodb into the handler, so the bundle loads with no node_modules", async () => {
    const outdir = mkdtempSync(join(tmpdir(), "sexton-bundle-"));
    try {
      const built = buildApp({
        scanCode: { kind: "bundle", entry: ENTRY, projectRoot: REPO_ROOT, depsLockFilePath: join(REPO_ROOT, "package-lock.json") },
        snapshotterCode: { kind: "placeholder" },
        webAssetPath: WEB_FIXTURE,
        outdir,
      });
      built.app.synth();

      const scan = resourcesOfType(Template.fromStack(built.edge), "AWS::Lambda::Function").find(([id]) => id.startsWith("ScanFunction"));
      const key = (scan?.[1].Properties?.["Code"] as { S3Key?: string } | undefined)?.S3Key ?? "";
      const hash = key.replace(/\.zip$/, "");
      const bundle = join(outdir, `asset.${hash}`, "index.mjs");
      expect(existsSync(bundle)).toBe(true);

      const text = readFileSync(bundle, "utf8");
      expect(text).not.toMatch(/from\s*["']@aws-sdk\//);
      expect(text).not.toMatch(/import\(\s*["']@aws-sdk\//);
      expect(text).toContain("DynamoDB_20120810");

      // The asset folder sits in a temp directory with no node_modules above it.
      const mod = (await import(pathToFileURL(bundle).href)) as { handler: () => Promise<string> };
      expect(await mod.handler()).toBe("function");
    } finally {
      rmSync(outdir, { recursive: true, force: true });
    }
  }, 120_000);
});
