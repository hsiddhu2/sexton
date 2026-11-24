// Spec cemetery-time-fixes, task 4.4: the hosted scan's timelines size guard (requirement 5). No network.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { ScanResponse } from "../src/contract.js";
import { TIMELINES_SIZE_LIMIT, applySizeGuard, guardTimelinesSize, responseBytes } from "../src/timelines-guard.js";
import { arbIsoUtc, arbJsonValue, arbPackageName } from "./arbitraries.js";
import { captureLogger } from "./support/capture-logger.js";

const arbSegment = fc.record({
  from: arbIsoUtc,
  state: fc.constantFrom("Possessed", "Dead", "Haunted", "Restless", "Alive"),
  reason: fc.string({ maxLength: 120 }),
  ghost: fc.boolean(),
});
const arbTimelines = fc.dictionary(
  arbPackageName,
  fc.record({ installed: fc.constant("1.0.0"), coveredFrom: fc.constant(null), segments: fc.array(arbSegment, { maxLength: 30 }) }),
  { maxKeys: 20 },
);
const arbBody: fc.Arbitrary<ScanResponse> = fc
  .record(
    {
      report: fc.record({ generatedAt: arbIsoUtc, packages: fc.array(arbJsonValue, { maxLength: 5 }) }),
      policy: arbJsonValue,
      remediations: fc.array(arbJsonValue, { maxLength: 3 }),
      actions: fc.record({ remediate: fc.boolean() }),
      timelines: arbTimelines,
      pullRequests: fc.array(arbJsonValue, { maxLength: 3 }),
    },
    { requiredKeys: ["report", "policy"] },
  )
  .map((b) => b as unknown as ScanResponse);

function without(body: ScanResponse): Record<string, unknown> {
  const rest: Record<string, unknown> = { ...body };
  Reflect.deleteProperty(rest, "timelines");
  Reflect.deleteProperty(rest, "timelinesOmitted");
  return rest;
}

describe("Property 1: The size guard bounds the response and keeps every other field", () => {
  it("Feature: cemetery-time-fixes, Property 1: The size guard bounds the response and keeps every other field", () => {
    fc.assert(
      fc.property(arbBody, fc.integer({ min: 1, max: 200_000 }), (body, limit) => {
        const snapshot = structuredClone(body);
        const { body: out, omitted, bytes } = guardTimelinesSize(body, limit);
        expect(body).toEqual(snapshot);
        expect(without(out)).toEqual(without(body));
        expect(bytes).toBe(responseBytes(body));
        if (body.timelines === undefined) {
          expect(out).toBe(body);
          expect(omitted).toBe(false);
        } else if (bytes <= limit) {
          expect(out).toBe(body);
          expect(omitted).toBe(false);
          expect(out.timelinesOmitted).toBeUndefined();
        } else {
          expect(omitted).toBe(true);
          expect("timelines" in out).toBe(false);
          expect(out.timelinesOmitted).toBe("too-large");
          const floor = responseBytes({ ...(without(body) as unknown as ScanResponse), timelinesOmitted: "too-large" });
          if (floor <= limit) expect(responseBytes(out)).toBeLessThanOrEqual(limit);
        }
      }),
      { numRuns: 100 },
    );
  });
});

describe("guard examples", () => {
  const base = (reason: string): ScanResponse =>
    ({
      report: { generatedAt: "2026-11-24T00:00:00.000Z", packages: [] },
      policy: { pass: true },
      timelines: { a: { installed: "1.0.0", coveredFrom: null, segments: [{ from: "2026-11-24T00:00:00.000Z", state: "Alive", reason, ghost: false }] } },
    }) as unknown as ScanResponse;

  it("the limit is 5,242,880 bytes", () => {
    expect(TIMELINES_SIZE_LIMIT).toBe(5_242_880);
  });

  it("keeps timelines at exactly the limit and omits them one byte over", () => {
    const body = base("r");
    const size = responseBytes(body);
    expect(guardTimelinesSize(body, size).body).toBe(body);
    const over = guardTimelinesSize(body, size - 1);
    expect(over.omitted).toBe(true);
    expect(over.body.timelinesOmitted).toBe("too-large");
    expect(over.body.timelines).toBeUndefined();
  });

  it("counts UTF-8 bytes, not characters", () => {
    const body = base("é".repeat(100));
    const chars = JSON.stringify(body).length;
    expect(responseBytes(body)).toBe(chars + 100);
    expect(guardTimelinesSize(body, chars).omitted).toBe(true);
  });

  it("applySizeGuard writes one warn line with the byte count and no package name over the real limit, and nothing under it", () => {
    const big = base("r".repeat(TIMELINES_SIZE_LIMIT));
    const log = captureLogger();
    const out = applySizeGuard(big, log);
    expect(out.timelinesOmitted).toBe("too-large");
    expect(log.lines).toEqual([{ level: "warn", fields: { msg: "timelines-omitted", bytes: responseBytes(big) } }]);
    expect(JSON.stringify(log.lines)).not.toContain('"a"');
    const small = captureLogger();
    const kept = base("r");
    expect(applySizeGuard(kept, small)).toBe(kept);
    expect(small.lines).toEqual([]);
  });
});
