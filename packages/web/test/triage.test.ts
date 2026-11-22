import type { PackageHealth, Severity, State } from "@sexton/api";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { STATES } from "../src/load/lists.js";
import { compareTriage, reachRank, severityRank, stateRank, triageOrder } from "../src/triage/triage.js";
import { validateScanResponse } from "../src/load/validate-scan-response.js";
import { arbSeverity, arbTriagePackageNamed, arbTriagePackages, cheapPackage } from "./arbitraries.js";
import { readDemoScan } from "./support/demo-scan.js";

type Json = Record<string, unknown>;

function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value)) deepFreeze((value as Record<string, unknown>)[key]);
  }
  return value;
}

const sign = (n: number): number => (n < 0 ? -1 : n > 0 ? 1 : 0);

function withAdvisories(pkg: PackageHealth, severities: readonly Severity[]): PackageHealth {
  const copy = structuredClone(pkg) as unknown as { signals: Record<string, Json> };
  copy.signals["advisories"] = {
    value: severities.map((severity, i) => ({ id: `GHSA-${i}`, severity, summary: "s" })),
    source: "https://registry.example/x",
    fetchedAt: "2026-11-12T00:00:00.000Z",
    available: true,
  };
  return copy as unknown as PackageHealth;
}

function withReach(pkg: PackageHealth, reach: number): PackageHealth {
  const copy = structuredClone(pkg) as unknown as { signals: Record<string, Json> };
  copy.signals["transitiveReach"] = {
    value: { reach, graphsMissing: 0 },
    source: "https://registry.example/x",
    fetchedAt: "2026-11-12T00:00:00.000Z",
    available: true,
  };
  return copy as unknown as PackageHealth;
}

function unavailable(pkg: PackageHealth, signal: "advisories" | "transitiveReach"): PackageHealth {
  const copy = structuredClone(pkg) as unknown as { signals: Record<string, Json> };
  copy.signals[signal] = {
    value: null,
    source: "https://registry.example/x",
    fetchedAt: "2026-11-12T00:00:00.000Z",
    available: false,
    reason: "r",
  };
  return copy as unknown as PackageHealth;
}

const keyOf = (p: PackageHealth): string => `${p.state}|${severityRank(p)}|${reachRank(p)}|${p.name}`;

describe("triage properties", () => {
  it("Feature: cemetery-ui, Property 1: The triage sort is a total, stable, deterministic order", () => {
    const arbCase = arbTriagePackages(300).chain((list) => {
      const triple = Math.min(3, list.length);
      return fc.record({
        list: fc.constant(list),
        shuffled: fc.shuffledSubarray(list, { minLength: list.length, maxLength: list.length }),
        triple: fc.shuffledSubarray(list, { minLength: triple, maxLength: triple }),
      });
    });
    fc.assert(
      fc.property(arbCase, ({ list, shuffled, triple }) => {
        for (const a of triple) {
          expect(compareTriage(a, a)).toBe(0);
          for (const b of triple) {
            expect(sign(compareTriage(a, b)) + sign(compareTriage(b, a))).toBe(0);
            if (a !== b) expect((compareTriage(a, b) < 0 ? 1 : 0) + (compareTriage(b, a) < 0 ? 1 : 0)).toBe(1);
          }
        }
        if (triple.length === 3) {
          for (const a of triple) {
            for (const b of triple) {
              for (const c of triple) {
                if (compareTriage(a, b) <= 0 && compareTriage(b, c) <= 0) expect(compareTriage(a, c)).toBeLessThanOrEqual(0);
              }
            }
          }
        }

        const frozen = deepFreeze(structuredClone(list));
        const once = triageOrder(frozen);
        // permutation with the same members
        expect(once).toHaveLength(frozen.length);
        const members = new Set<PackageHealth>(frozen);
        expect(new Set(once).size).toBe(once.length);
        for (const p of once) expect(members.has(p)).toBe(true);
        // determinism and order independence
        expect(triageOrder(frozen)).toEqual(once);
        expect(triageOrder(shuffled)).toEqual(triageOrder(list));
        // state grouping
        const ranks = once.map((p) => stateRank(p.state));
        for (let i = 1; i < ranks.length; i += 1) expect(ranks[i] as number).toBeGreaterThanOrEqual(ranks[i - 1] as number);
        const firstNonPossessed = once.findIndex((p) => p.state !== "Possessed");
        if (firstNonPossessed >= 0) {
          for (const p of once.slice(firstNonPossessed)) expect(p.state).not.toBe("Possessed");
        }
      }),
      { numRuns: 100 },
    );
  });

  it("Feature: cemetery-ui, Property 23: Triage monotonicity, stability and idempotence", () => {
    const arbStable = arbTriagePackages(30).chain((list) =>
      fc
        .array(fc.nat(Math.max(0, list.length - 1)), { maxLength: list.length === 0 ? 0 : 20 })
        .map((picks) => {
          const clones = picks.map((i) => structuredClone(list[i] as PackageHealth));
          return [...list, ...clones];
        }),
    );
    fc.assert(
      fc.property(
        arbStable.chain((all) => fc.shuffledSubarray(all, { minLength: all.length, maxLength: all.length })),
        (input) => {
          const marked = input.map((p, i) => ({ ...p, installedVersion: `v${i}` }) as PackageHealth);
          const once = triageOrder(marked);
          expect(triageOrder(once)).toEqual(once);
          const inputGroups = new Map<string, string[]>();
          for (const p of marked) inputGroups.set(keyOf(p), [...(inputGroups.get(keyOf(p)) ?? []), p.installedVersion]);
          const outputGroups = new Map<string, string[]>();
          for (const p of once) outputGroups.set(keyOf(p), [...(outputGroups.get(keyOf(p)) ?? []), p.installedVersion]);
          expect(outputGroups).toEqual(inputGroups);
        },
      ),
      { numRuns: 100 },
    );

    const positionOf = (list: readonly PackageHealth[], name: string): number => list.findIndex((p) => p.name === name);
    const arbMono = arbTriagePackages(30)
      .filter((l) => l.length > 0)
      .chain((list) =>
        fc.record({
          list: fc.constant(list),
          index: fc.nat(list.length - 1),
          extraReach: fc.integer({ min: 0, max: 60 }),
          severity: arbSeverity,
        }),
      );
    fc.assert(
      fc.property(arbMono, ({ list, index, extraReach, severity }) => {
        const target = list[index] as PackageHealth;
        const before = positionOf(triageOrder(list), target.name);

        const raised = withReach(target, reachRank(target) + extraReach);
        const afterReach = positionOf(triageOrder(list.map((p, i) => (i === index ? raised : p))), target.name);
        expect(afterReach).toBeLessThanOrEqual(before);

        const present = target.signals.advisories.available ? target.signals.advisories.value.map((a) => a.severity) : [];
        const rankOf = (s: Severity): number => severityRank(withAdvisories(target, [s]));
        if (rankOf(severity) > severityRank(target)) {
          const added = withAdvisories(target, [...present, severity]);
          const afterAdvisory = positionOf(triageOrder(list.map((p, i) => (i === index ? added : p))), target.name);
          expect(afterAdvisory).toBeLessThanOrEqual(before);
        }
      }),
      { numRuns: 100 },
    );
  });

  it("returns a result for 0 to 300 packages without throwing", () => {
    fc.assert(
      fc.property(arbTriagePackages(300), (list) => {
        expect(() => triageOrder(list)).not.toThrow();
      }),
      { numRuns: 100 },
    );
  });
});

describe("triage examples", () => {
  const base = (name: string, state: State): PackageHealth => cheapPackage(name, state);

  it("ranks states by STATES index", () => {
    expect(STATES.map((s) => stateRank(s))).toEqual([0, 1, 2, 3, 4]);
  });

  it("orders by severity, then reach, then name inside one state", () => {
    const a = withReach(withAdvisories(base("a", "Haunted"), ["Low"]), 5);
    const b = withReach(withAdvisories(base("b", "Haunted"), ["Critical"]), 1);
    const c = withReach(withAdvisories(base("c", "Haunted"), ["Low"]), 9);
    const d = withReach(withAdvisories(base("d", "Haunted"), ["Low"]), 9);
    expect(triageOrder([a, d, c, b]).map((p) => p.name)).toEqual(["b", "c", "d", "a"]);
  });

  it("ranks unavailable and empty advisories equally, and unavailable reach as 0", () => {
    const empty = withAdvisories(base("x", "Alive"), []);
    const missing = unavailable(base("x", "Alive"), "advisories");
    expect(severityRank(empty)).toBe(0);
    expect(severityRank(missing)).toBe(0);
    expect(compareTriage(empty, missing)).toBe(0);
    const noReach = unavailable(base("r", "Alive"), "transitiveReach");
    expect(reachRank(noReach)).toBe(0);
    expect(reachRank(withReach(noReach, 4))).toBe(4);
  });

  it("ranks Unknown severity 1 below Low", () => {
    expect(severityRank(withAdvisories(base("u", "Alive"), ["Unknown"]))).toBe(1);
    expect(severityRank(withAdvisories(base("u", "Alive"), ["Unknown", "Low", "Moderate"]))).toBe(3);
    expect(severityRank(withAdvisories(base("u", "Alive"), ["Critical"]))).toBe(5);
  });

  it("compares names in code-unit order", () => {
    const upper = base("Zeta", "Alive");
    const lower = base("alpha", "Alive");
    expect(triageOrder([lower, upper]).map((p) => p.name)).toEqual(["Zeta", "alpha"]);
  });

  it("places Possessed first and does not mutate the input", () => {
    const input = deepFreeze([base("a", "Alive"), base("b", "Possessed"), base("c", "Dead")]);
    expect(triageOrder(input).map((p) => p.state)).toEqual(["Possessed", "Dead", "Alive"]);
  });

  it("generator produces a package for a given name", () => {
    fc.assert(fc.property(arbTriagePackageNamed("n"), (p) => p.name === "n"), { numRuns: 100 });
  });
});

describe("triage demo scan", () => {
  it("orders the Demo scan by state, then severity, then reach, then name", () => {
    const result = validateScanResponse(readDemoScan());
    if (!result.ok) throw new Error("demo scan failed validation");
    // Possessed: left-padder. Dead: event-stream (Critical), uuid (Moderate, reach 2), request (Moderate, reach 1),
    // then no advisories by name: left-pad, node-sass. Haunted: lodash. Restless: express, moment
    // (both Moderate, reach 0, by name), then colors (no advisories, stale only). Alive: semver (reach 9, spec evidence-pack), react.
    expect(triageOrder(result.value.report.packages).map((p) => p.name)).toEqual([
      "left-padder",
      "event-stream",
      "uuid",
      "request",
      "left-pad",
      "node-sass",
      "lodash",
      "express",
      "moment",
      "colors",
      "semver",
      "react",
    ]);
  });
});
