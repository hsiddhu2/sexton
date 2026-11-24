import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

describe("eslint.config.js ignore list", () => {
  const text = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "../../../eslint.config.js"), "utf8");

  it("ignores build/**", () => {
    expect(text).toMatch(/ignores:\s*\[[^\]]*"build\/\*\*"/s);
  });

  it("keeps the earlier ignore entries", () => {
    for (const entry of ["**/dist/**", "**/node_modules/**", "private/**", "**/cdk.out/**", "packages/web/public/demo/**"]) expect(text).toContain(`"${entry}"`);
  });
});
