// Spec: .kiro/specs/evidence-pack, Requirement 2.8. Property 37.

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { npmPurl } from "../../src/evidence/purl.js";
import { arbValidName, arbVersionText } from "./arbitraries.js";

/** Test-side decoder: pkg:npm/[ns/]name[@version]. */
function decode(purl: string): { name: string; version: string | null } {
  expect(purl.startsWith("pkg:npm/")).toBe(true);
  const rest = purl.slice("pkg:npm/".length);
  const at = rest.indexOf("@");
  const path = at === -1 ? rest : rest.slice(0, at);
  const version = at === -1 ? null : decodeURIComponent(rest.slice(at + 1));
  const segments = path.split("/").map(decodeURIComponent);
  return { name: segments.join("/"), version };
}

describe("npmPurl", () => {
  it("encodes the scope as the namespace", () => {
    expect(npmPurl("@types/node", "22.10.2")).toBe("pkg:npm/%40types/node@22.10.2");
    expect(npmPurl("left-pad", "1.3.0")).toBe("pkg:npm/left-pad@1.3.0");
  });

  it("omits the version part when unresolved or null", () => {
    expect(npmPurl("left-pad", "unresolved")).toBe("pkg:npm/left-pad");
    expect(npmPurl("@s/a", null)).toBe("pkg:npm/%40s/a");
  });

  it("percent-encodes with upper-case hex and keeps . - _ ~ :", () => {
    expect(npmPurl("a.b_c~d-e", "1.0.0+build:x y/é")).toBe("pkg:npm/a.b_c~d-e@1.0.0%2Bbuild:x%20y%2F%C3%A9");
  });
});

describe("Feature: evidence-pack, Property 37: purl round trip", () => {
  it("decodes back to the name and version", () => {
    fc.assert(
      fc.property(arbValidName, arbVersionText, (name, version) => {
        const purl = npmPurl(name, version);
        expect(purl).toMatch(/^pkg:npm\/[A-Za-z0-9.~:%_-]+(\/[A-Za-z0-9.~:%_-]+)?(@[A-Za-z0-9.~:%_-]+)?$/);
        expect(decode(purl)).toEqual({ name, version: version === "unresolved" ? null : version });
      }),
      { numRuns: 100 },
    );
  });
});
