// Spec fresh-site, Requirement 2.6: every file the build writes under assets/ carries a content hash,
// because CloudFront sends those files with Cache-Control immutable.

import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const WEB = resolve(process.cwd());

describe("hashed asset names (2.6)", () => {
  it("has no assets folder in public, so no unhashed file lands in assets/", () => {
    expect(existsSync(join(WEB, "public", "assets"))).toBe(false);
  });

  it("keeps the bundler's default output folder and hashed names", () => {
    const config = readFileSync(join(WEB, "vite.config.ts"), "utf8");
    for (const option of ["assetsDir", "assetFileNames", "entryFileNames", "chunkFileNames"]) {
      expect(config, option).not.toContain(option);
    }
  });
});
