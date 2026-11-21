// Spec: .kiro/specs/remediation, Requirements 4.2 to 4.9, 8.3, property 8.

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { isValidPackageName } from "../../src/intake/names.js";
import { branchName, MAX_BRANCH_LENGTH } from "../../src/remediation/branch-name.js";
import { decodeName, encodeName } from "../../src/remediation/encoded-name.js";
import { isValidBranchName } from "../../src/remediation/is-valid-branch-name.js";
import { REMEDIATION_KINDS } from "../../src/types.js";
import { arbDenseName } from "./arbitraries.js";

/** Test-local git ref checker, written from git check-ref-format, plus "{". */
function gitOk(ref: string): boolean {
  if (ref === "" || ref === "@" || ref.startsWith("/") || ref.endsWith("/") || ref.endsWith(".")) return false;
  for (const bad of ["..", "//", "@{", " ", "~", "^", ":", "?", "*", "[", "\\", "{"]) if (ref.includes(bad)) return false;
  for (let i = 0; i < ref.length; i++) {
    const c = ref.charCodeAt(i);
    if (c < 0x20 || c === 0x7f) return false;
  }
  return ref.split("/").every((p) => p !== "" && !p.startsWith(".") && !p.endsWith(".lock"));
}

const arbLongName = fc.integer({ min: 100, max: 213 }).map((n) => `a${"_".repeat(n)}`);
const arbBadName = fc.oneof(fc.constantFrom("__proto__", "", " a", "a b", "a".repeat(215), "\ud800", "@/x", "@s/"), fc.fullUnicodeString({ maxLength: 8 }).filter((s) => !isValidPackageName(s)));
const arbKind = fc.constantFrom(...REMEDIATION_KINDS);

describe("branch names", () => {
  it("Feature: remediation, Property 8: Branch name validity and injectivity", () => {
    fc.assert(
      fc.property(fc.oneof(arbDenseName, arbLongName), fc.oneof(arbDenseName, arbLongName), arbKind, arbKind, arbBadName, (a, b, k1, k2, bad) => {
        const ba = branchName(k1, a);
        if (ba !== null) {
          expect(isValidBranchName(ba)).toBe(true);
          expect(gitOk(ba)).toBe(true);
          expect(ba.startsWith("sexton/")).toBe(true);
          expect(ba.length).toBeLessThanOrEqual(MAX_BRANCH_LENGTH);
          expect(ba.endsWith(encodeName(a))).toBe(true);
          const rest = ba.slice("sexton/".length);
          expect(rest.slice(0, rest.indexOf("-"))).toBe(k1);
          const other = branchName(k2, a);
          if (k1 !== k2 && other !== null) expect(other).not.toBe(ba);
          const bb = branchName(k1, b);
          if (a !== b && bb !== null) expect(bb).not.toBe(ba);
        } else {
          expect(`sexton/${k1}-${encodeName(a)}`.length).toBeGreaterThan(MAX_BRANCH_LENGTH);
        }
        expect(decodeName(encodeName(a))).toBe(a);
        expect(branchName(k1, bad)).toBeNull();
      }),
      { numRuns: 1000 },
    );
  });

  it("examples", () => {
    expect(branchName("bump", "@scope/name")).toBe("sexton/bump-@scope__name");
    expect(branchName("bump", "@a__b/c")).not.toBe(branchName("bump", "@a/b__c"));
    expect(branchName("remove", "a.lock")).toBe("sexton/remove-a_dlock");
    expect(branchName("bump", "a..b")).toBe("sexton/bump-a_d_db");
    expect(branchName("bump", "a.")).toBe("sexton/bump-a_d");
    expect(branchName("bump", "a~b")).toBe("sexton/bump-a_tb");
    expect(branchName("bump", "_".repeat(1) + "a")).toBeNull();
    expect(branchName("bump", `a${"_".repeat(213)}`)).toBeNull();
    expect(decodeName("a_q")).toBeNull();
    expect(decodeName("a_")).toBeNull();
  });

  it.each([
    ["sexton/bump-a", true],
    ["sexton/bump-@s__a", true],
    ["@", false],
    ["a..b", false],
    ["a/.b", false],
    ["a.lock", false],
    ["a/", false],
    ["a//b", false],
    ["a@{b", false],
    ["a b", false],
    ["a~b", false],
    ["a^b", false],
    ["a:b", false],
    ["a?b", false],
    ["a*b", false],
    ["a[b", false],
    ["a\\b", false],
    ["a{b", false],
    ["a.", false],
    ["a\u0001b", false],
  ])("isValidBranchName(%j) is %s", (ref, ok) => {
    expect(isValidBranchName(ref)).toBe(ok);
    expect(gitOk(ref)).toBe(ok);
  });
});
