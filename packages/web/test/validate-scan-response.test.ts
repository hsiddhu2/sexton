import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  CONTRACT_ERROR_TEXT,
  validateScanResponse,
  type ContractError,
} from "../src/load/validate-scan-response.js";
import { FAULT_MARKER, arbBigScanResponse, arbFault, arbJson, arbScanResponse, cheapScan } from "./arbitraries.js";
import { readDemoScan } from "./support/demo-scan.js";

const PATH_RE = /^(\/(report|policy|remediations|packages|signals|[A-Za-z]+|\d+))*$/;

function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value)) deepFreeze((value as Record<string, unknown>)[key]);
  }
  return value;
}

function errorsOf(input: unknown): readonly ContractError[] {
  const r = validateScanResponse(input);
  return r.ok ? [] : r.errors;
}

describe("validateScanResponse properties", () => {
  it(
    "Feature: cemetery-ui, Property 7: validateScanResponse accepts every valid response and rejects every faulty one",
    () => {
      fc.assert(
        fc.property(
          fc.oneof({ weight: 9, arbitrary: arbScanResponse }, { weight: 1, arbitrary: arbBigScanResponse }),
          (response) => {
            const result = validateScanResponse(response);
            expect(result.ok).toBe(true);
            if (result.ok) expect(result.value).toEqual(response);
            const again = validateScanResponse(JSON.parse(JSON.stringify(response)));
            expect(again.ok).toBe(true);
          },
        ),
        { numRuns: 1000 },
      );
      fc.assert(
        fc.property(arbFault, (fault) => {
          const result = validateScanResponse(fault.broken);
          expect(result.ok).toBe(false);
          if (!result.ok) {
            expect(result.errors.some((e) => e.path === fault.path)).toBe(true);
            for (const e of result.errors) {
              expect(e.path).not.toContain(FAULT_MARKER);
              expect(e.message).not.toContain(FAULT_MARKER);
            }
          }
        }),
        { numRuns: 1000 },
      );
    },
    120000,
  );

  it(
    "Feature: cemetery-ui, Property 10: The validator is total, pure and deterministic on arbitrary JSON",
    () => {
      fc.assert(
        fc.property(arbJson, (input) => {
          const before = structuredClone(input);
          deepFreeze(input);
          const first = validateScanResponse(input);
          const second = validateScanResponse(input);
          expect(input).toEqual(before);
          expect(second).toEqual(first);
          if (first.ok) {
            expect(first.value).toBe(input);
          } else {
            expect(first.errors.length).toBeGreaterThan(0);
            expect(first.errors.length).toBeLessThanOrEqual(20);
            for (let i = 0; i < first.errors.length; i += 1) {
              const e = first.errors[i] as ContractError;
              expect(e.path).toMatch(PATH_RE);
              expect(e.message).toBe(CONTRACT_ERROR_TEXT[e.code]);
              const prev = first.errors[i - 1];
              if (prev !== undefined) {
                const ordered = prev.path < e.path || (prev.path === e.path && prev.code <= e.code);
                expect(ordered).toBe(true);
              }
            }
          }
          // No input string reaches an error: plant a marker as a key and as values.
          const planted = validateScanResponse({ "@@m@@": "@@m@@", report: input, policy: "@@m@@", remediations: "@@m@@" });
          expect(JSON.stringify(planted)).not.toContain("@@m@@");
        }),
        { numRuns: 1000 },
      );
    },
    120000,
  );
});

describe("validateScanResponse examples", () => {
  const base = () => structuredClone(cheapScan(1)) as unknown as Record<string, Record<string, unknown>>;

  it("NOT_OBJECT", () => {
    expect(errorsOf(null)).toEqual([{ path: "", code: "NOT_OBJECT", message: CONTRACT_ERROR_TEXT.NOT_OBJECT }]);
    expect(errorsOf([]).map((e) => e.code)).toEqual(["NOT_OBJECT"]);
  });
  it("MISSING_FIELD", () => {
    expect(errorsOf({}).map((e) => `${e.path}:${e.code}`)).toEqual(["/policy:MISSING_FIELD", "/report:MISSING_FIELD"]);
  });
  it("WRONG_TYPE", () => {
    const v = base();
    (v["report"] as Record<string, unknown>)["generatedAt"] = 5;
    expect(errorsOf(v).map((e) => `${e.path}:${e.code}`)).toEqual(["/report/generatedAt:WRONG_TYPE"]);
  });
  it("UNKNOWN_VALUE", () => {
    const v = base();
    (v["policy"] as Record<string, unknown>)["source"] = "other";
    expect(errorsOf(v).map((e) => `${e.path}:${e.code}`)).toEqual(["/policy/source:UNKNOWN_VALUE"]);
  });
  it("INVALID_DATE", () => {
    const v = base();
    (v["report"] as Record<string, unknown>)["generatedAt"] = "not a date";
    expect(errorsOf(v).map((e) => `${e.path}:${e.code}`)).toEqual(["/report/generatedAt:INVALID_DATE"]);
  });
  it("DUPLICATE", () => {
    const v = cheapScan(2) as unknown as { report: { packages: { name: string }[] } };
    (v.report.packages[1] as { name: string }).name = "pkg-0";
    expect(errorsOf(v).map((e) => `${e.path}:${e.code}`)).toEqual(["/report/packages/1/name:DUPLICATE"]);
  });
  it("TOO_MANY_PACKAGES, with 300 accepted and 301 rejected", () => {
    expect(validateScanResponse(cheapScan(300)).ok).toBe(true);
    expect(errorsOf(cheapScan(301)).map((e) => `${e.path}:${e.code}`)).toEqual(["/report/packages:TOO_MANY_PACKAGES"]);
  });
  it("report.scan absent and present", () => {
    const v = cheapScan(0) as unknown as { report: Record<string, unknown> };
    expect(validateScanResponse(v).ok).toBe(true);
    v.report["scan"] = { repo: { url: "u" }, unlocked: false, unlockedPackages: [], capped: false, totalDirect: 0 };
    expect(validateScanResponse(v).ok).toBe(true);
    v.report["scan"] = { repo: { url: "u" }, unlocked: false, unlockedPackages: [], capped: false, totalDirect: -1 };
    expect(errorsOf(v).map((e) => e.path)).toEqual(["/report/scan/totalDirect"]);
  });
  it("ignores unknown keys", () => {
    const v = { ...cheapScan(1), extra: { deep: [1] } };
    expect(validateScanResponse(v).ok).toBe(true);
  });
  it("caps errors at 20", () => {
    const v = cheapScan(30) as unknown as { report: { packages: Record<string, unknown>[] } };
    for (const p of v.report.packages) p["state"] = "x";
    expect(errorsOf(v)).toHaveLength(20);
  });
});

describe("validateScanResponse demo scan", () => {
  it("accepts the generated Demo scan", () => {
    const result = validateScanResponse(readDemoScan());
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.report.packages).toHaveLength(11);
  });
});
