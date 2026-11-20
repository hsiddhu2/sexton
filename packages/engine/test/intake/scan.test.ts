import fc from "fast-check";
import { describe, expect, expectTypeOf, it } from "vitest";
import { evaluatePolicy } from "../../src/policy/evaluate.js";
import { attachScan, scanMetadata } from "../../src/intake/scan.js";
import { scorePackages } from "../../src/score.js";
import type { HealthReport, IntakePackage, IntakeSuccess, PackageRef, PolicySource, ScanMetadata } from "../../src/types.js";
import { arbReport, arbScanMetadata, arbValidPolicy, arbValidName, arbVersion } from "../arbitraries.js";
import { NOW, routedTransport } from "../helpers.js";

const arbSource = fc.constantFrom<PolicySource>("default", "file");

function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

const arbIntakePackage: fc.Arbitrary<IntakePackage> = fc
  .tuple(arbValidName, arbVersion, fc.constantFrom("locked", "unlocked", "unresolved"), fc.constantFrom("dependencies", "devDependencies"))
  .map(([name, installedVersion, resolution, origin]) => ({ name, installedVersion, declaredRange: "*", origin, resolution }));

const arbIntakeSuccess: fc.Arbitrary<IntakeSuccess> = fc
  .tuple(arbScanMetadata, fc.array(arbIntakePackage, { maxLength: 5 }))
  .map(([scan, packages]) => ({ ok: true as const, ...scan, packages }));

describe("Property 19: attachScan preserves the report", () => {
  // Feature: repo-intake, Property 19: attachScan preserves the report
  it("keeps generatedAt and packages and mutates nothing", () => {
    fc.assert(
      fc.property(arbReport, arbScanMetadata, (report, scan) => {
        const reportCopy = structuredClone(report);
        const scanCopy = structuredClone(scan);
        deepFreeze(report);
        deepFreeze(scan);
        const out = attachScan(report, scan);
        expect(out.generatedAt).toBe(report.generatedAt);
        expect(out.packages).toStrictEqual(reportCopy.packages);
        expect(out.scan).toStrictEqual(scanCopy);
        expect(out).not.toBe(report);
        expect(report).toStrictEqual(reportCopy);
        expect(scan).toStrictEqual(scanCopy);
      }),
      { numRuns: 100 },
    );
  });
});

describe("Property 20: evaluatePolicy ignores scan", () => {
  // Feature: repo-intake, Property 20: evaluatePolicy ignores scan
  it("gives the same result with or without scan metadata", () => {
    fc.assert(
      fc.property(arbValidPolicy, arbReport, arbScanMetadata, arbSource, (policy, report, scan, source) => {
        expect(evaluatePolicy(policy, attachScan(report, scan), source)).toStrictEqual(evaluatePolicy(policy, report, source));
      }),
      { numRuns: 100 },
    );
  });
});

describe("Property 21: Scan metadata JSON round trip", () => {
  // Feature: repo-intake, Property 21: Scan metadata JSON round trip
  it("survives JSON.stringify and JSON.parse", () => {
    fc.assert(
      fc.property(arbScanMetadata, (scan) => {
        expect(JSON.parse(JSON.stringify(scan)) as unknown).toStrictEqual(scan);
      }),
      { numRuns: 100 },
    );
  });

  it("also holds for scanMetadata of an IntakeSuccess, which carries no packages", () => {
    fc.assert(
      fc.property(arbIntakeSuccess, (intake) => {
        const scan = scanMetadata(deepFreeze(intake));
        expect(JSON.parse(JSON.stringify(scan)) as unknown).toStrictEqual(scan);
        expect(Object.keys(scan).sort()).toEqual(
          ["capped", "lockfileVersion", "repo", "skipped", "totalDirect", "unlocked", "unlockedPackages", "unresolved"],
        );
        expect(scan).not.toHaveProperty("packages");
      }),
      { numRuns: 100 },
    );
  });
});

describe("scan metadata examples", () => {
  const intake: IntakeSuccess = {
    ok: true,
    repo: { owner: "o", repo: "r", url: "https://github.com/o/r" },
    packages: [{ name: "a", installedVersion: "unresolved", declaredRange: "latest", origin: "dependencies", resolution: "unresolved" }],
    unlocked: true,
    unlockedPackages: ["a"],
    lockfileVersion: null,
    capped: false,
    totalDirect: 1,
    skipped: { peer: 0, optional: 0, invalidName: 0 },
    unresolved: ["a"],
  };

  it("returns the eight fields and copies the arrays", () => {
    const scan = scanMetadata(intake);
    expect(Object.keys(scan)).toHaveLength(8);
    expect(scan.unlockedPackages).toEqual(["a"]);
    expect(scan.unlockedPackages).not.toBe(intake.unlockedPackages);
    expect(scan.unresolved).not.toBe(intake.unresolved);
    expect(scan.repo).not.toBe(intake.repo);
    expect(scan.skipped).not.toBe(intake.skipped);
  });

  it("two calls are deeply equal", () => {
    expect(scanMetadata(intake)).toStrictEqual(scanMetadata(intake));
  });

  it("a report from scorePackages has no scan key", async () => {
    const { transport } = routedTransport([]);
    const report = await scorePackages([{ name: "x", installedVersion: "1.0.0" }], {
      transport,
      clock: () => NOW,
      retry: { sleep: () => Promise.resolve() },
    });
    expect("scan" in report).toBe(false);
  });

  it("has the expected types", () => {
    expectTypeOf<IntakePackage>().toExtend<PackageRef>();
    expectTypeOf<HealthReport["scan"]>().toEqualTypeOf<ScanMetadata | undefined>();
    expectTypeOf<{ generatedAt: string; packages: HealthReport["packages"] }>().toExtend<HealthReport>();
  });
});
