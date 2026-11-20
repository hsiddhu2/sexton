import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { MAX_DIRECT_DEPENDENCIES, applyCap } from "../../src/intake/cap.js";

const arbList = fc.oneof(
  fc.array(fc.integer(), { minLength: 0, maxLength: 700 }),
  fc.constantFrom(299, 300, 301).chain((n) => fc.array(fc.integer(), { minLength: n, maxLength: n })),
);

function range(n: number): number[] {
  return Array.from({ length: n }, (_, i) => i);
}

describe("applyCap examples (6.1, 6.2, 6.3, 6.8)", () => {
  it("the constant is 300", () => {
    expect(MAX_DIRECT_DEPENDENCIES).toBe(300);
  });

  it("exactly 300 entries is not capped", () => {
    const result = applyCap(range(300));
    expect(result.capped).toBe(false);
    expect(result.totalDirect).toBe(300);
    expect(result.packages).toHaveLength(300);
  });

  it("exactly 301 entries is capped and drops the last entry", () => {
    const list = range(301);
    const result = applyCap(list);
    expect(result.capped).toBe(true);
    expect(result.totalDirect).toBe(301);
    expect(result.packages).toHaveLength(300);
    expect(result.packages).toEqual(list.slice(0, 300));
    expect(result.packages).not.toContain(300);
  });

  it("an empty list is not capped", () => {
    expect(applyCap([])).toEqual({ packages: [], capped: false, totalDirect: 0 });
  });
});

describe("applyCap properties", () => {
  // Feature: repo-intake, Property 13: Cap invariant and boundary
  it("Property 13: Cap invariant and boundary", () => {
    fc.assert(
      fc.property(arbList, (list) => {
        const result = applyCap(list);
        expect(result.totalDirect).toBe(list.length);
        expect(result.packages.length).toBe(Math.min(result.totalDirect, 300));
        expect(result.capped).toBe(result.totalDirect > 300);
        expect(result.packages).toEqual(list.slice(0, result.packages.length));
      }),
      { numRuns: 100 },
    );
  });
});
