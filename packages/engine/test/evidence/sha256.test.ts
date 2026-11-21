// Spec: .kiro/specs/evidence-pack, Requirements 1.5, 1.6. Property 34.

import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { sha256Hex, sha256HexOfText } from "../../src/evidence/sha256.js";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "src");

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? files(full) : full.endsWith(".ts") ? [full] : [];
  });
}

describe("sha256", () => {
  it("matches the FIPS 180 test vector", async () => {
    expect(await sha256HexOfText("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(await sha256Hex(new Uint8Array())).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  });

  it("no file under packages/engine/src imports a node: module", () => {
    const offenders = files(SRC).filter((f) => /from\s+["']node:|import\(\s*["']node:|require\(\s*["']node:/.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });
});

describe("Feature: evidence-pack, Property 34: SHA-256 equals node:crypto", () => {
  it("agrees with node:crypto for any string", async () => {
    await fc.assert(
      fc.asyncProperty(fc.oneof(fc.fullUnicodeString({ maxLength: 200 }), fc.string({ maxLength: 50 })), async (text) => {
        expect(await sha256HexOfText(text)).toBe(createHash("sha256").update(text, "utf8").digest("hex"));
      }),
      { numRuns: 100 },
    );
  });
});
