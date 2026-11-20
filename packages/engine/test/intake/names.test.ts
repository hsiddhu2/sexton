import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { MAX_PACKAGE_NAME_LENGTH, isValidPackageName } from "../../src/intake/names.js";
import { arbInvalidName, arbValidName } from "../arbitraries.js";

describe("isValidPackageName examples (8.2)", () => {
  it.each([
    "left-pad",
    "@babel/core",
    "JSONStream",
    "constructor",
    "prototype",
    "a",
    "~x",
    "x".repeat(214),
    "@scope/Name",
  ])("accepts %s", (name) => {
    expect(isValidPackageName(name)).toBe(true);
  });

  it.each([
    "@Scope/x",
    "__proto__",
    "x".repeat(215),
    "_x",
    ".x",
    "@x",
    "@/x",
    "@x/",
    "a/b",
    "a b",
    "",
    "naïve",
    "@a/b/c",
    "@_a/b",
    "@a/_b",
  ])("rejects %j", (name) => {
    expect(isValidPackageName(name)).toBe(false);
  });

  it("exports the length limit", () => {
    expect(MAX_PACKAGE_NAME_LENGTH).toBe(214);
  });
});

describe("generators agree with the validator", () => {
  it("arbValidName is valid and arbInvalidName is invalid", () => {
    fc.assert(
      fc.property(arbValidName, arbInvalidName, (valid, invalid) => {
        expect(isValidPackageName(valid)).toBe(true);
        expect(isValidPackageName(invalid)).toBe(false);
      }),
      { numRuns: 100 },
    );
  });
});

describe("Feature: repo-intake, Property 17: Prototype keys are inert", () => {
  const EXPECTED = new Map<string, boolean>([
    ["__proto__", false],
    ["constructor", true],
    ["prototype", true],
    ["toString", true],
    ["hasOwnProperty", true],
    ["valueOf", true],
  ]);
  const keys = [...EXPECTED.keys()];

  it("gives the expected verdict, deterministically, without touching Object.prototype (names part)", () => {
    const before = Object.getOwnPropertyNames(Object.prototype);
    fc.assert(
      fc.property(fc.constantFrom(...keys), (name) => {
        const first = isValidPackageName(name);
        expect(first).toBe(EXPECTED.get(name));
        expect(isValidPackageName(name)).toBe(first);
        expect(Object.getOwnPropertyNames(Object.prototype)).toEqual(before);
      }),
      { numRuns: 1000 },
    );
  });
});
