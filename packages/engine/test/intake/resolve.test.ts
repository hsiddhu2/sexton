import fc from "fast-check";
import semver from "semver";
import { describe, expect, it } from "vitest";
import { MAX_RANGE_LENGTH, UNRESOLVED_VERSION, isResolvableRange, resolveUnlocked } from "../../src/intake/resolve.js";
import { arbRange, arbVersion, validRangeArb } from "../arbitraries.js";

const RUNS = { numRuns: 100 };
const arbVersions = fc.array(fc.oneof(arbVersion, fc.string({ maxLength: 12 })), { maxLength: 15 });

function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

describe("resolveUnlocked properties", () => {
  it("Feature: repo-intake, Property 9: resolveUnlocked never throws", () => {
    fc.assert(
      fc.property(fc.oneof(arbRange, fc.string({ maxLength: 400 })), arbVersions, (range, versions) => {
        const first = resolveUnlocked(range, versions);
        expect(typeof first).toBe("string");
        expect(resolveUnlocked(range, versions)).toBe(first);
      }),
      RUNS,
    );
  });

  it("Feature: repo-intake, Property 10: The chosen version satisfies the range and is maximal", () => {
    fc.assert(
      fc.property(validRangeArb, arbVersions, (range, versions) => {
        const result = resolveUnlocked(range, versions);
        const satisfying = versions.filter((v) => semver.valid(v) === v && semver.satisfies(v, range));
        if (result === UNRESOLVED_VERSION) {
          expect(satisfying).toEqual([]);
          return;
        }
        expect(versions).toContain(result);
        expect(semver.satisfies(result, range)).toBe(true);
        for (const other of satisfying) expect(semver.compare(result, other)).toBeGreaterThanOrEqual(0);
      }),
      RUNS,
    );
  });

  it("Feature: repo-intake, Property 11: Order independence", () => {
    fc.assert(
      fc.property(arbRange, arbVersions, (range, versions) => {
        const result = resolveUnlocked(range, versions);
        expect(resolveUnlocked(range, [...versions].reverse())).toBe(result);
        expect(resolveUnlocked(range, [...versions].sort(cmp))).toBe(result);
        expect(resolveUnlocked(range, [...versions, ...versions])).toBe(result);
        const nonSatisfying = versions.filter(
          (v) => !(semver.valid(v) === v && isResolvableRange(range) && semver.satisfies(v, range)),
        );
        expect(resolveUnlocked(range, [...versions, ...nonSatisfying])).toBe(result);
      }),
      RUNS,
    );
  });

  it("Feature: repo-intake, Property 12: Monotonic", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 20 }), fc.array(fc.tuple(fc.nat(20), fc.nat(20)), { maxLength: 10 }), (major, minors) => {
        const range = `^${major}.0.0`;
        const versions = minors.map(([minor, patch]) => `${major}.${minor}.${patch}`);
        const before = resolveUnlocked(range, versions);
        const added = `${major}.21.0`;
        expect(resolveUnlocked(range, [...versions, added])).toBe(added);
        if (before !== UNRESOLVED_VERSION) {
          expect(semver.compare(resolveUnlocked(range, [...versions, added]), before)).toBeGreaterThanOrEqual(0);
        }
      }),
      RUNS,
    );
  });
});

describe("resolveUnlocked examples", () => {
  const versions = ["1.0.0", "1.2.0", "2.0.0"];

  it.each([
    "latest",
    "next",
    "git+https://example.invalid/x.git",
    "github:o/r",
    "o/r",
    "file:../x",
    "link:../x",
    "http://example.invalid/x.tgz",
    "https://example.invalid/x.tgz",
    "workspace:*",
    "npm:other@1",
    `^${"1".repeat(MAX_RANGE_LENGTH)}`,
  ])("resolves %s to unresolved", (range) => {
    expect(resolveUnlocked(range, versions)).toBe(UNRESOLVED_VERSION);
  });

  it("treats a 257-character range as unresolved", () => {
    const range = `>=1.0.0${" ".repeat(MAX_RANGE_LENGTH + 1 - 7)}`;
    expect(range).toHaveLength(MAX_RANGE_LENGTH + 1);
    expect(resolveUnlocked(range, versions)).toBe(UNRESOLVED_VERSION);
  });

  it("picks the greatest release for the empty string and *", () => {
    expect(resolveUnlocked("", [...versions, "3.0.0-beta.1"])).toBe("2.0.0");
    expect(resolveUnlocked("*", [...versions, "3.0.0-beta.1"])).toBe("2.0.0");
  });

  it("excludes prereleases unless the range names one", () => {
    expect(resolveUnlocked("^1.0.0", ["1.2.0", "1.3.0-beta.1"])).toBe("1.2.0");
    expect(resolveUnlocked(">=1.3.0-beta.0", ["1.2.0", "1.3.0-beta.1"])).toBe("1.3.0-beta.1");
  });

  it("returns unresolved for an empty versions array or no match", () => {
    expect(resolveUnlocked("^1.0.0", [])).toBe(UNRESOLVED_VERSION);
    expect(resolveUnlocked("^9.0.0", versions)).toBe(UNRESOLVED_VERSION);
  });
});
