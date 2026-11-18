// Glob matcher. Requirements 2.18, 2.19, 3.3, 3.11 of the policy spec.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { compileGlob, isValidGlob, matchGlob } from "../../src/policy/glob.js";

function matches(pattern: string, name: string): boolean {
  return matchGlob(compileGlob(pattern), name);
}

/** Naive recursive reference written from the Glossary. Shares no code with glob.ts. */
function reference(p: string, n: string): boolean {
  if (p.length === 0) {
    return n.length === 0;
  }
  if (p.charAt(0) === "*") {
    let k = 0;
    while (k < p.length && p.charAt(k) === "*") {
      k += 1;
    }
    const rest = p.slice(k);
    const crossing = k >= 2;
    for (let i = 0; ; i += 1) {
      if (reference(rest, n.slice(i))) {
        return true;
      }
      if (i >= n.length) {
        return false;
      }
      if (!crossing && n.charAt(i) === "/") {
        return false;
      }
    }
  }
  if (n.length === 0) {
    return false;
  }
  if (p.charAt(0) === "?") {
    return n.charAt(0) !== "/" && reference(p.slice(1), n.slice(1));
  }
  return p.charAt(0) === n.charAt(0) && reference(p.slice(1), n.slice(1));
}

const arbGlob = fc
  .array(fc.constantFrom("a", "b", "@", "/", ".", "*", "**", "***", "?"), { maxLength: 8 })
  .map((pieces) => pieces.join(""));
const arbGlobName = fc
  .array(fc.constantFrom("a", "b", "@", "/", "."), { maxLength: 8 })
  .map((chars) => chars.join(""));
const arbLiteralName = fc.stringMatching(/^[A-Za-z0-9@/._-]{0,10}$/);

describe("glob properties", () => {
  it("Feature: policy, Property 17: Glob matcher agrees with a reference", () => {
    fc.assert(
      fc.property(arbGlob, arbGlobName, (g, name) => {
        expect(matches(g, name)).toBe(reference(g, name));
      }),
      { numRuns: 1000 },
    );
    fc.assert(
      fc.property(arbLiteralName, arbLiteralName, (a, b) => {
        expect(matches(a, a)).toBe(true);
        expect(matches(a, b)).toBe(a === b);
      }),
      { numRuns: 1000 },
    );
  });
});

describe("glob examples", () => {
  it("star stops at slash", () => {
    expect(matches("a*", "abc")).toBe(true);
    expect(matches("a*", "a")).toBe(true);
    expect(matches("a*", "a/b")).toBe(false);
  });
  it("doublestar crosses slash", () => {
    expect(matches("a**", "a/b/c")).toBe(true);
    expect(matches("**", "")).toBe(true);
  });
  it("question does not match slash", () => {
    expect(matches("a?b", "axb")).toBe(true);
    expect(matches("a?b", "a/b")).toBe(false);
    expect(matches("a?b", "ab")).toBe(false);
  });
  it("a run of three stars equals doublestar", () => {
    expect(compileGlob("***")).toEqual(compileGlob("**"));
    expect(matches("a***b", "a/x/b")).toBe(true);
  });
  it("scope pattern", () => {
    expect(matches("@scope/*", "@scope/a")).toBe(true);
    expect(matches("@scope/*", "@scope/a/b")).toBe(false);
  });
  it("anchors at both ends of the name", () => {
    expect(matches("abc", "xabc")).toBe(false);
    expect(matches("abc", "abcx")).toBe(false);
    expect(matches("", "")).toBe(true);
    expect(matches("", "a")).toBe(false);
  });
  it("handles a long wildcard pattern against a 200 character name", () => {
    const pattern = "*?".repeat(15) + "z";
    expect(matches(pattern, "a".repeat(199) + "z")).toBe(true);
    expect(matches(pattern, "a".repeat(200))).toBe(false);
    expect(matches(pattern, "a".repeat(20) + "z")).toBe(true);
    expect(matches(pattern, "a".repeat(14) + "z")).toBe(false);
  });
  it("treats characters outside the valid set as plain text", () => {
    expect(matches("a(b)", "a(b)")).toBe(true);
    expect(matches("a(b)", "ab")).toBe(false);
  });
  it("isValidGlob accepts and rejects by character set", () => {
    expect(isValidGlob("@scope/*-x.y_z?**")).toBe(true);
    expect(isValidGlob("")).toBe(false);
    expect(isValidGlob("a b")).toBe(false);
    expect(isValidGlob("a(b)")).toBe(false);
    expect(isValidGlob("a\\b")).toBe(false);
  });
});
