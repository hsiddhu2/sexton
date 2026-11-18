// Scope matching. Requirements 3.1 to 3.9 of the policy spec.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { inScope, type MatcherFields } from "../../src/policy/match.js";

const arbName = fc.constantFrom("a", "b", "ab", "@s/a", "@s/b", "@t/a", "left-pad", "A", "x.y");
const arbPattern = fc.constantFrom("*", "**", "a*", "@s/*", "@*/a", "?", "a?", "**/a", "left-*", "zzz");
const arbNames = fc.array(arbName, { maxLength: 5 });
const arbPatterns = fc.array(arbPattern, { maxLength: 5 });

const arbMatchers: fc.Arbitrary<MatcherFields> = fc.record({
  matchPackageNames: arbNames,
  matchPackagePatterns: arbPatterns,
  excludePackageNames: arbNames,
});

/** Optionally absent lists. */
const arbSparse: fc.Arbitrary<MatcherFields> = fc
  .tuple(arbMatchers, fc.boolean(), fc.boolean(), fc.boolean())
  .map(([m, a, b, c]) => ({
    ...(a ? { matchPackageNames: m.matchPackageNames } : {}),
    ...(b ? { matchPackagePatterns: m.matchPackagePatterns } : {}),
    ...(c ? { excludePackageNames: m.excludePackageNames } : {}),
  }));

function shuffleAndRepeat<T>(items: readonly T[] | undefined, seed: number): T[] | undefined {
  if (items === undefined) {
    return undefined;
  }
  const out = [...items, ...items.slice(0, seed % 3)];
  return out.sort((x, y) => ((String(x).length * 31 + seed) % 7) - ((String(y).length * 17 + seed) % 7)).reverse();
}

describe("inScope properties", () => {
  it("Feature: policy, Property 2: Exclude wins", () => {
    fc.assert(
      fc.property(arbMatchers, arbName, fc.nat(10), (m, name, at) => {
        const excl = [...(m.excludePackageNames ?? [])];
        excl.splice(at % (excl.length + 1), 0, name);
        const rule = { ...m, matchPackageNames: [...(m.matchPackageNames ?? []), name], matchPackagePatterns: [...(m.matchPackagePatterns ?? []), "**"], excludePackageNames: excl };
        expect(inScope(rule, name)).toBe(false);
        expect(inScope({ ...m, excludePackageNames: excl }, name)).toBe(false);
      }),
      { numRuns: 1000 },
    );
  });

  it("Feature: policy, Property 3: No matchers means all packages", () => {
    fc.assert(
      fc.property(
        arbNames,
        arbName,
        fc.constantFrom("absent", "empty"),
        fc.constantFrom("absent", "empty"),
        (excl, name, a, b) => {
          const rule: MatcherFields = {
            ...(a === "empty" ? { matchPackageNames: [] } : {}),
            ...(b === "empty" ? { matchPackagePatterns: [] } : {}),
            excludePackageNames: excl,
          };
          expect(inScope(rule, name)).toBe(!excl.includes(name));
        },
      ),
    );
  });

  it("Feature: policy, Property 4: Order independence of matchers", () => {
    fc.assert(
      fc.property(arbSparse, arbName, fc.nat(100), (m, name, seed) => {
        const permuted: MatcherFields = {
          ...(m.matchPackageNames !== undefined ? { matchPackageNames: shuffleAndRepeat(m.matchPackageNames, seed) ?? [] } : {}),
          ...(m.matchPackagePatterns !== undefined ? { matchPackagePatterns: shuffleAndRepeat(m.matchPackagePatterns, seed + 1) ?? [] } : {}),
          ...(m.excludePackageNames !== undefined ? { excludePackageNames: shuffleAndRepeat(m.excludePackageNames, seed + 2) ?? [] } : {}),
        };
        expect(inScope(permuted, name)).toBe(inScope(m, name));
      }),
    );
  });

  it("monotonic in exclusions (3.5)", () => {
    fc.assert(
      fc.property(arbSparse, arbName, arbName, (m, name, extra) => {
        const more: MatcherFields = { ...m, excludePackageNames: [...(m.excludePackageNames ?? []), extra] };
        if (!inScope(m, name)) {
          expect(inScope(more, name)).toBe(false);
        }
      }),
    );
  });

  it("monotonic in matches when an include list is non-empty (3.8)", () => {
    fc.assert(
      fc.property(arbSparse, arbName, arbName, arbPattern, (m, name, extraName, extraPattern) => {
        const hadInclude = (m.matchPackageNames?.length ?? 0) + (m.matchPackagePatterns?.length ?? 0) > 0;
        fc.pre(hadInclude);
        const moreNames: MatcherFields = { ...m, matchPackageNames: [...(m.matchPackageNames ?? []), extraName] };
        const morePatterns: MatcherFields = { ...m, matchPackagePatterns: [...(m.matchPackagePatterns ?? []), extraPattern] };
        if (inScope(m, name)) {
          expect(inScope(moreNames, name)).toBe(true);
          expect(inScope(morePatterns, name)).toBe(true);
        }
      }),
    );
  });

  it("is deterministic (3.9)", () => {
    fc.assert(
      fc.property(arbSparse, arbName, (m, name) => {
        expect(inScope(m, name)).toBe(inScope(m, name));
      }),
    );
  });
});

describe("inScope examples", () => {
  it("compares names exactly and case-sensitively (3.2)", () => {
    expect(inScope({ matchPackageNames: ["a"] }, "A")).toBe(false);
    expect(inScope({ matchPackageNames: ["a"] }, "a")).toBe(true);
    expect(inScope({ matchPackageNames: ["@s"] }, "@s/a")).toBe(false);
    expect(inScope({ excludePackageNames: ["a"] }, "A")).toBe(true);
    expect(inScope({ excludePackageNames: ["a"] }, "a")).toBe(false);
  });

  it("a name alone or a pattern alone is enough (3.1)", () => {
    expect(inScope({ matchPackageNames: ["left-pad"] }, "left-pad")).toBe(true);
    expect(inScope({ matchPackagePatterns: ["@s/*"] }, "@s/a")).toBe(true);
    expect(inScope({ matchPackagePatterns: ["@s/*"] }, "@s/a/b")).toBe(false);
    expect(inScope({ matchPackageNames: ["zzz"], matchPackagePatterns: ["@s/*"] }, "@s/a")).toBe(true);
    expect(inScope({ matchPackageNames: ["zzz"], matchPackagePatterns: ["@s/*"] }, "other")).toBe(false);
  });

  it("exclusion beats a pattern match", () => {
    expect(inScope({ matchPackagePatterns: ["@s/*"], excludePackageNames: ["@s/a"] }, "@s/a")).toBe(false);
    expect(inScope({ matchPackagePatterns: ["@s/*"], excludePackageNames: ["@s/a"] }, "@s/b")).toBe(true);
  });

  it("stays correct past the 1000-entry memo cap", () => {
    for (let i = 0; i < 2500; i += 1) {
      expect(inScope({ matchPackagePatterns: [`pkg${String(i)}-*`] }, `pkg${String(i)}-x`)).toBe(true);
      expect(inScope({ matchPackagePatterns: [`pkg${String(i)}-*`] }, `pkg${String(i + 1)}-x`)).toBe(false);
    }
    expect(inScope({ matchPackagePatterns: ["pkg0-*"] }, "pkg0-x")).toBe(true);
  });
});
