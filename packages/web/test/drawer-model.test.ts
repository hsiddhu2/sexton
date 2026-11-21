import type { PackageHealth, ScanResponse } from "@sexton/api";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { drawerModel } from "../src/drawer/drawer-model.js";
import { formatSignalValue, UNDISPLAYABLE_TEXT } from "../src/drawer/format-value.js";
import { SIGNAL_NAMES } from "../src/load/lists.js";
import { allUnavailable, arbResponseAndPackage, cheapPackage, cheapScan } from "./arbitraries.js";

type Env = { available: boolean; value: unknown; source: string; fetchedAt: string; reason?: string };
const env = (pkg: PackageHealth, name: string): Env => (pkg.signals as unknown as Record<string, Env>)[name] as Env;

describe("drawerModel", () => {
  // Feature: cemetery-ui, Property 6: The drawer content shows every signal of the selected package
  it("Feature: cemetery-ui, Property 6: The drawer content shows every signal of the selected package", () => {
    fc.assert(
      fc.property(arbResponseAndPackage, fc.boolean(), ({ response, pkg }, forceUnavailable) => {
        const target = forceUnavailable ? allUnavailable(pkg) : pkg;
        const model = drawerModel(response, target);
        expect(model.signals.map((s) => s.name)).toEqual([...SIGNAL_NAMES]);
        expect(model.title).toBe(`${target.name} ${target.installedVersion}`);
        expect(model.state).toBe(target.state);
        expect(model.stateReason).toBe(target.stateReason);
        for (const row of model.signals) {
          const e = env(target, row.name);
          expect(row.source).toBe(e.source);
          expect(row.fetchedAt).toBe(e.fetchedAt);
          expect(row.available).toBe(e.available);
          if (e.available) {
            expect(row.valueText).toBe(JSON.stringify(e.value, null, 2));
            expect(row.reason).toBeNull();
          } else {
            expect(row.valueText).toBeNull();
            expect(row.reason).toBe(e.reason);
          }
        }
        expect(model.missingSignals).toEqual(target.missingSignals);
        const entry = response.remediations?.find((r) => r.packageName === target.name) ?? null;
        expect(model.remediation).toEqual(entry);
      }),
      { numRuns: 100 },
    );
  });

  // Feature: cemetery-ui, Property 15: The drawer shows exactly the failing rules that name the package
  it("Feature: cemetery-ui, Property 15: The drawer shows exactly the failing rules that name the package", () => {
    fc.assert(
      fc.property(arbResponseAndPackage, ({ response, pkg }) => {
        const model = drawerModel(response, pkg);
        const expected = response.policy.rules.filter((r) => r.failures.some((f) => f.name === pkg.name));
        expect(model.failingRules.map((r) => r.index)).toEqual(expected.map((r) => r.index));
        model.failingRules.forEach((row, i) => {
          const rule = expected[i];
          expect(row.type).toBe(rule?.type);
          const mine = rule?.failures.filter((f) => f.name === pkg.name) ?? [];
          expect(row.failures.map((f) => f.reason)).toEqual(mine.map((f) => f.reason));
          expect(row.failures.map((f) => f.fetchedAt)).toEqual(mine.map((f) => f.fetchedAt));
        });
      }),
      { numRuns: 100 },
    );
  });

  it("covers a package with all ten signals unavailable", () => {
    const pkg = allUnavailable(cheapPackage("a", "Alive"));
    const model = drawerModel(cheapScan(1), pkg);
    expect(model.signals).toHaveLength(10);
    expect(model.signals.every((s) => !s.available && s.valueText === null && s.reason !== null)).toBe(true);
    expect(model.missingSignals).toHaveLength(10);
  });

  it("gives the fixed text for a deeply nested opaque value", () => {
    let deep: unknown = [];
    for (let i = 0; i < 200000; i += 1) deep = [deep];
    expect(formatSignalValue(deep)).toBe(UNDISPLAYABLE_TEXT);
    expect(formatSignalValue(undefined)).toBe(UNDISPLAYABLE_TEXT);
    expect(formatSignalValue({ a: 1 })).toBe('{\n  "a": 1\n}');
  });

  it("returns a null remediation and records 'not recorded' for an absent failure source", () => {
    const base = cheapScan(1);
    const name = (base.report.packages[0] as PackageHealth).name;
    const response = {
      ...base,
      policy: {
        source: "default",
        pass: false,
        rules: [{ index: 3, type: "forbid_state", pass: false, failures: [{ name, reason: "r", source: null }], unevaluated: [], notFound: [] }],
      },
    } as unknown as ScanResponse;
    const model = drawerModel(response, base.report.packages[0] as PackageHealth);
    expect(model.remediation).toBeNull();
    expect(model.failingRules[0]?.failures[0]).toEqual({ reason: "r", source: "not recorded", fetchedAt: "not recorded" });
    expect(model.failingRules[0]?.name).toBeNull();
  });
});
