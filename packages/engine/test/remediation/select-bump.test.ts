// Spec: .kiro/specs/remediation, Requirement 2, properties 2, 3, 4, 5 and 14.

import fc from "fast-check";
import semver from "semver";
import { describe, expect, it } from "vitest";
import { orderCandidates, MAX_CANDIDATES } from "../../src/remediation/candidates.js";
import { rangeStyle, styledRange } from "../../src/remediation/range-style.js";
import { selectBump, type SelectBumpInput, type SelectBumpResult } from "../../src/remediation/select-bump.js";
import type { Advisory } from "../../src/types.js";
import { arbJunkVersion, arbSelectInput, arbSelectRange } from "./arbitraries.js";

// Brute-force model. Shares no code with candidates.ts or select-bump.ts.
function triple(v: string): [number, number, number] {
  const p = semver.parse(v) as semver.SemVer;
  return [p.major, p.minor, p.patch];
}
function modelUsable(range: string | undefined): range is string {
  if (range === undefined || range.length > 256) return false;
  try {
    return semver.validRange(range) !== null;
  } catch {
    return false;
  }
}
function modelHasPre(range: string): boolean {
  return /\d+\.\d+\.\d+-/.test(range);
}
function modelCandidates(input: SelectBumpInput): { version: string; inRange: boolean }[] {
  const usable = modelUsable(input.declaredRange);
  const range = input.declaredRange as string;
  const sat = (v: string): boolean => {
    try {
      return usable && semver.satisfies(v, range);
    } catch {
      return false;
    }
  };
  const all = [...new Set(input.published)].filter(
    (v) => typeof v === "string" && v.length <= 64 && semver.valid(v) === v && semver.gt(v, input.installedVersion),
  );
  const kept = all.filter((v) => semver.prerelease(v) === null || (usable && modelHasPre(range) && sat(v)));
  const cmp = (a: string, b: string): number => {
    const [x, y] = [triple(a), triple(b)];
    for (let i = 0; i < 3; i++) if ((x[i] as number) !== (y[i] as number)) return (x[i] as number) - (y[i] as number);
    const pa = semver.prerelease(a) === null;
    const pb = semver.prerelease(b) === null;
    if (pa !== pb) return pa ? 1 : -1;
    return semver.compare(a, b) || (a < b ? -1 : a > b ? 1 : 0);
  };
  const inside = kept.filter(sat).sort(cmp);
  const outside = kept.filter((v) => !sat(v)).sort(cmp);
  return [...inside.map((version) => ({ version, inRange: true })), ...outside.map((version) => ({ version, inRange: false }))].slice(0, 20);
}
function modelPasses(input: SelectBumpInput, v: string): boolean {
  const list = input.advisories.get(v);
  return !input.deprecated.has(v) && list !== undefined && list.every((a) => a.severity === "Low");
}
function model(input: SelectBumpInput): { version: string; majorUpgrade: boolean; evaluated: number } | { evaluated: number } {
  const c = modelCandidates(input);
  const i = c.findIndex((x) => modelPasses(input, x.version));
  if (i === -1) return { evaluated: c.length };
  const pick = c[i] as { version: string; inRange: boolean };
  return { version: pick.version, majorUpgrade: !pick.inRange, evaluated: i + 1 };
}

function withAdvisory(input: SelectBumpInput, version: string, advisory: Advisory): SelectBumpInput {
  const map = new Map(input.advisories);
  map.set(version, [...(map.get(version) ?? []), advisory]);
  return { ...input, advisories: map };
}

describe("selectBump", () => {
  it("Feature: remediation, Property 2: The lowest passing candidate", () => {
    fc.assert(
      fc.property(arbSelectInput, (input) => {
        const result = selectBump(input);
        const expected = model(input);
        if (result.outcome === "none") {
          expect(expected).toEqual({ evaluated: result.evaluated });
          return;
        }
        expect({ version: result.version, majorUpgrade: result.majorUpgrade, evaluated: result.evaluated }).toEqual(expected);
        expect(input.deprecated.has(result.version)).toBe(false);
        expect(input.advisories.get(result.version)?.every((a) => a.severity === "Low")).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it("Feature: remediation, Property 3: The major label is set if and only if the version is outside the range", () => {
    fc.assert(
      fc.property(arbSelectInput, (input) => {
        const result = selectBump(input);
        if (result.outcome !== "chosen") return;
        const usable = modelUsable(input.declaredRange);
        expect(result.majorUpgrade).toBe(!(usable && semver.satisfies(result.version, input.declaredRange as string)));
      }),
      { numRuns: 100 },
    );
  });

  it("Feature: remediation, Property 4: Prereleases are excluded", () => {
    fc.assert(
      fc.property(arbSelectInput, fc.array(arbJunkVersion, { maxLength: 6 }), (input, junk) => {
        const result = selectBump(input);
        const candidates = orderCandidates(input.installedVersion, input.declaredRange, input.published);
        expect(candidates.length).toBeLessThanOrEqual(MAX_CANDIDATES);
        const preRange = input.declaredRange !== undefined && modelUsable(input.declaredRange) && modelHasPre(input.declaredRange);
        for (const c of candidates) if (semver.prerelease(c.version) !== null) expect(preRange && c.inRange).toBe(true);
        if (result.outcome === "chosen") {
          expect(semver.valid(result.version)).toBe(result.version);
          expect(result.version.length).toBeLessThanOrEqual(64);
          expect(semver.gt(result.version, input.installedVersion)).toBe(true);
          if (!preRange) expect(semver.prerelease(result.version)).toBeNull();
        }
        if (!preRange) expect(selectBump({ ...input, published: [...input.published, ...junk] })).toEqual(result);
      }),
      { numRuns: 100 },
    );
  });

  it("Feature: remediation, Property 5: Selector determinism and order independence", () => {
    const hostile = fc.record({
      installedVersion: fc.oneof(fc.fullUnicodeString({ maxLength: 8 }), fc.constant("1.0.0")),
      declaredRange: fc.option(fc.fullUnicodeString({ maxLength: 12 }), { nil: undefined }),
      published: fc.array(fc.oneof(fc.fullUnicodeString({ maxLength: 8 }), fc.constant("1.2.0")), { maxLength: 10 }),
    });
    fc.assert(
      fc.property(fc.oneof(arbSelectInput, hostile.map((h): SelectBumpInput => ({ ...h, ...(h.declaredRange === undefined ? {} : { declaredRange: h.declaredRange }), deprecated: new Set(), advisories: new Map() }))), fc.integer(), (input, seed) => {
        const a = selectBump(input);
        expect(selectBump(input)).toEqual(a);
        const k = input.published.length === 0 ? 0 : Math.abs(seed) % input.published.length;
        const rotated = [...input.published.slice(k), ...input.published.slice(0, k), ...input.published.slice(0, 3)];
        expect(selectBump({ ...input, published: rotated })).toEqual(a);
        expect(selectBump({ ...input, published: [...input.published].reverse() })).toEqual(a);
      }),
      { numRuns: 100 },
    );
  });

  it("Feature: remediation, Property 14: Selector metamorphic and monotonic relations", () => {
    fc.assert(
      fc.property(arbSelectInput, fc.nat(), fc.constantFrom<"deprecate" | Advisory["severity"]>("deprecate", "Moderate", "High", "Critical", "Unknown"), (input, pick, fault) => {
        const before = selectBump(input);
        const candidates = orderCandidates(input.installedVersion, input.declaredRange, input.published);
        // In-range candidates precede out-of-range ones.
        const firstOut = candidates.findIndex((c) => !c.inRange);
        if (firstOut !== -1) expect(candidates.slice(firstOut).every((c) => !c.inRange)).toBe(true);
        if (candidates.length === 0) return;
        const target = candidates[pick % candidates.length] as { version: string };
        // Adding a Low advisory to a candidate that has advisory data changes nothing.
        if (input.advisories.has(target.version)) {
          expect(selectBump(withAdvisory(input, target.version, { id: "LOW-1", severity: "Low", summary: "" }))).toEqual(before);
        }
        // Adding a version not above the installed one, or a non-candidate prerelease, changes nothing.
        expect(selectBump({ ...input, published: [...input.published, input.installedVersion, "0.0.0"] })).toEqual(before);
        if (before.outcome !== "chosen") return;
        const position = (r: SelectBumpResult): number => (r.outcome === "chosen" ? candidates.findIndex((c) => c.version === r.version) : Infinity);
        const faulted: SelectBumpInput =
          fault === "deprecate"
            ? { ...input, deprecated: new Set([...input.deprecated, before.version]) }
            : withAdvisory(input, before.version, { id: "BAD-1", severity: fault, summary: "" });
        const after = selectBump(faulted);
        expect(position(after)).toBeGreaterThan(position(before));
        // Faulting a later candidate changes nothing.
        const later = candidates[candidates.length - 1] as { version: string };
        if (later.version !== before.version) {
          expect(selectBump({ ...input, deprecated: new Set([...input.deprecated, later.version]) })).toEqual(before);
        }
      }),
      { numRuns: 100 },
    );
  });
});

describe("selectBump examples", () => {
  const advisories = (entries: [string, Advisory["severity"][]][]): Map<string, Advisory[]> =>
    new Map(entries.map(([v, sevs]) => [v, sevs.map((severity, i) => ({ id: `A-${String(i)}`, severity, summary: "" }))]));

  it("severity table: Low passes, Moderate, High, Critical and Unknown fail, a missing entry fails", () => {
    const base = { installedVersion: "1.0.0", declaredRange: "^1.0.0", deprecated: new Set<string>() };
    const pick = (sev: Advisory["severity"] | null): SelectBumpResult =>
      selectBump({ ...base, published: ["1.1.0"], advisories: sev === null ? new Map() : advisories([["1.1.0", [sev]]]) });
    expect(pick("Low").outcome).toBe("chosen");
    for (const sev of ["Moderate", "High", "Critical", "Unknown"] as const) expect(pick(sev).outcome).toBe("none");
    expect(pick(null).outcome).toBe("none");
  });

  it("in-range candidates come first even when an out-of-range one is lower", () => {
    const result = selectBump({
      installedVersion: "1.0.0",
      declaredRange: "^1.2.0",
      published: ["1.1.0", "1.5.0"],
      deprecated: new Set(),
      advisories: advisories([["1.1.0", []], ["1.5.0", []]]),
    });
    expect(result).toMatchObject({ outcome: "chosen", version: "1.5.0", majorUpgrade: false });
  });

  it("an unusable range makes every pick a major upgrade", () => {
    for (const declaredRange of ["latest", "git+https://x/y.git", undefined]) {
      const result = selectBump({
        installedVersion: "1.0.0",
        ...(declaredRange === undefined ? {} : { declaredRange }),
        published: ["1.0.1"],
        deprecated: new Set(),
        advisories: advisories([["1.0.1", []]]),
      });
      expect(result).toMatchObject({ outcome: "chosen", majorUpgrade: true });
    }
  });

  it("installed equal to the newest release gives none with 0 evaluated", () => {
    expect(selectBump({ installedVersion: "2.0.0", declaredRange: "^2.0.0", published: ["1.0.0", "2.0.0"], deprecated: new Set(), advisories: new Map() })).toEqual({
      outcome: "none",
      evaluated: 0,
    });
  });

  it("the -0 upper bound of ^ and ~ is not a prerelease comparator", async () => {
    const { hasPrereleaseComparator } = await import("../../src/remediation/candidates.js");
    expect(hasPrereleaseComparator("^1.0.0")).toBe(false);
    expect(hasPrereleaseComparator("~1.2.3")).toBe(false);
    expect(hasPrereleaseComparator("^2.0.0-beta.1")).toBe(true);
    expect(hasPrereleaseComparator("<2.0.0-rc.1")).toBe(true);
  });

  it("a prerelease comparator admits in-range prereleases only", () => {
    const published = ["2.0.0-beta.1", "2.0.0-beta.2", "2.1.0-rc.1", "2.0.0"];
    const c = orderCandidates("2.0.0-beta.1", "^2.0.0-beta.1", published).map((x) => x.version);
    expect(c).toEqual(["2.0.0-beta.2", "2.0.0"]);
    expect(orderCandidates("1.0.0", "^1.0.0", ["1.1.0-rc.1", "1.1.0"]).map((x) => x.version)).toEqual(["1.1.0"]);
  });

  it("cuts at 20 with in-range first", () => {
    const published = Array.from({ length: 30 }, (_, i) => `1.${String(i)}.0`).concat(["2.0.0", "2.1.0"]);
    const c = orderCandidates("1.0.0", "^1.0.0", published);
    expect(c).toHaveLength(20);
    expect(c.every((x) => x.inRange)).toBe(true);
    const few = orderCandidates("1.25.0", "^1.0.0", published);
    expect(few.map((x) => x.version)).toEqual(["1.26.0", "1.27.0", "1.28.0", "1.29.0", "2.0.0", "2.1.0"]);
  });
});

describe("range style (HP decision 4)", () => {
  it.each([
    ["1.2.3", "exact"],
    ["=1.2.3", "exact"],
    ["v1.2.3", "exact"],
    ["~1.2.3", "tilde"],
    ["~1.2", "tilde"],
    ["~>1.2.3", "tilde"],
    ["^1.2.3", "caret"],
    [">=1.2.0", "caret"],
    ["1.x", "caret"],
    ["*", "caret"],
    ["", "caret"],
    ["1.2.3 - 2.0.0", "caret"],
    ["^1.0.0 || ^2.0.0", "caret"],
    ["latest", "caret"],
    [undefined, "caret"],
  ] as const)("%s is %s", (range, style) => {
    expect(rangeStyle(range)).toBe(style);
  });

  it("every styled range is valid and its lowest version is the chosen version (4.14)", () => {
    fc.assert(
      fc.property(arbSelectRange, fc.tuple(fc.nat(30), fc.nat(30), fc.nat(30)), (range, [a, b, c]) => {
        const v = `${String(a)}.${String(b)}.${String(c)}`;
        const r = styledRange(rangeStyle(range), v);
        expect(semver.validRange(r)).not.toBeNull();
        expect(semver.minVersion(r)?.version).toBe(v);
      }),
      { numRuns: 100 },
    );
  });
});
