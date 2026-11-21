// Spec: .kiro/specs/migration-node-sass, Requirement 8.

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { MAX_SCRIPTS, readPackageScripts } from "../../src/intake/scripts.js";

describe("readPackageScripts", () => {
  it("reads own string entries in key order", () => {
    const text = JSON.stringify({ scripts: { build: "webpack", "build:css": "node-sass a", n: 1, o: null } });
    expect([...readPackageScripts(text)]).toEqual([
      ["build", "webpack"],
      ["build:css", "node-sass a"],
    ]);
    expect([...readPackageScripts('{"scripts":{"__proto__":"x"}}')]).toEqual([["__proto__", "x"]]);
  });

  it.each(["", "nope", "[]", "null", '{"scripts":[]}', '{"scripts":"a"}', '{"scripts":null}', "{}"])("returns an empty map for %j", (text) => {
    expect(readPackageScripts(text).size).toBe(0);
  });

  it("keeps at most 100 entries and never throws", () => {
    const many = Object.fromEntries(Array.from({ length: 150 }, (_, i) => [`s${String(i)}`, "x"]));
    expect(readPackageScripts(JSON.stringify({ scripts: many })).size).toBe(MAX_SCRIPTS);
    fc.assert(
      fc.property(fc.oneof(fc.string(), fc.json(), fc.dictionary(fc.string(), fc.oneof(fc.string(), fc.integer())).map((s) => JSON.stringify({ scripts: s }))), (text) => {
        const map = readPackageScripts(text);
        expect(map.size).toBeLessThanOrEqual(MAX_SCRIPTS);
        for (const v of map.values()) expect(typeof v).toBe("string");
      }),
      { numRuns: 100 },
    );
  });
});
