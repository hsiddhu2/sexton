// Severity normalisation. Requirement 3.

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { normaliseSeverity, severityFromOsv, severityFromScore } from "../src/severity.js";
import { SEVERITIES } from "../src/types.js";

describe("normaliseSeverity", () => {
  it("maps the textual labels case-insensitively (3.2)", () => {
    expect(normaliseSeverity("critical")).toBe("Critical");
    expect(normaliseSeverity("HIGH")).toBe("High");
    expect(normaliseSeverity("Moderate")).toBe("Moderate");
    expect(normaliseSeverity("medium")).toBe("Moderate");
    expect(normaliseSeverity(" low ")).toBe("Low");
    expect(normaliseSeverity("severe")).toBe("Unknown");
    expect(normaliseSeverity(undefined)).toBe("Unknown");
  });

  it("is total: any string gives one of the five values", () => {
    fc.assert(
      fc.property(fc.string(), (s) => {
        expect(SEVERITIES).toContain(normaliseSeverity(s));
      }),
      { numRuns: 1000 },
    );
  });
});

describe("severityFromScore (3.3)", () => {
  it("maps the CVSS bands", () => {
    expect(severityFromScore(10)).toBe("Critical");
    expect(severityFromScore(9.0)).toBe("Critical");
    expect(severityFromScore(8.9)).toBe("High");
    expect(severityFromScore(7.0)).toBe("High");
    expect(severityFromScore(6.9)).toBe("Moderate");
    expect(severityFromScore(4.0)).toBe("Moderate");
    expect(severityFromScore(3.9)).toBe("Low");
    expect(severityFromScore(0.1)).toBe("Low");
    expect(severityFromScore(0)).toBe("Unknown");
    expect(severityFromScore(Number.NaN)).toBe("Unknown");
  });

  it("is total for any double", () => {
    fc.assert(
      fc.property(fc.double(), (n) => {
        expect(SEVERITIES).toContain(severityFromScore(n));
      }),
      { numRuns: 1000 },
    );
  });
});

describe("severityFromOsv", () => {
  it("prefers database_specific.severity text", () => {
    expect(severityFromOsv({ database_specific: { severity: "HIGH" }, severity: [{ type: "CVSS_V3", score: "9.8" }] })).toBe("High");
  });

  it("falls back to a numeric score and never parses a vector", () => {
    expect(severityFromOsv({ severity: [{ type: "CVSS_V3", score: "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H" }] })).toBe("Unknown");
    expect(severityFromOsv({ severity: [{ type: "CVSS_V3", score: "CVSS:3.1/AV:N" }, { type: "X", score: 5.5 }] })).toBe("Moderate");
  });

  it("gives Unknown when nothing usable is present (3.4)", () => {
    expect(severityFromOsv({})).toBe("Unknown");
    expect(severityFromOsv({ database_specific: null, severity: null })).toBe("Unknown");
  });

  it("is deterministic for any record shape (3.5)", () => {
    const recordArb = fc.record({
      database_specific: fc.option(fc.record({ severity: fc.oneof(fc.string(), fc.integer(), fc.constant(undefined)) }), { nil: null }),
      severity: fc.option(fc.array(fc.record({ type: fc.string(), score: fc.oneof(fc.string(), fc.double(), fc.constant(undefined)) })), { nil: null }),
    });
    fc.assert(
      fc.property(recordArb, (r) => {
        const a = severityFromOsv(r);
        expect(severityFromOsv(structuredClone(r))).toBe(a);
        expect(SEVERITIES).toContain(a);
      }),
      { numRuns: 1000 },
    );
  });
});
