// mapWithConcurrency, moved from score.ts. Spec health-scoring Requirement 10.2; spec submission-readiness Requirement 5.4, Property 2.

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import * as engine from "../../src/index.js";
import { mapWithConcurrency, PACKAGE_CONCURRENCY } from "../../src/util/concurrency.js";

describe("mapWithConcurrency", () => {
  it("limits package concurrency to 8 (10.2)", async () => {
    let inFlight = 0;
    let peak = 0;
    const items = Array.from({ length: 30 }, (_, i) => i);
    await mapWithConcurrency(items, PACKAGE_CONCURRENCY, async (i) => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 1));
      inFlight--;
      return i;
    });
    expect(peak).toBeLessThanOrEqual(8);
    expect(peak).toBeGreaterThan(1);
  });

  it("mapWithConcurrency preserves order", async () => {
    const out = await mapWithConcurrency([3, 1, 2], 2, (n) => new Promise<number>((r) => setTimeout(() => r(n * 10), n)));
    expect(out).toEqual([30, 10, 20]);
  });

  it("is still exported from the package entry point under the same names (5.4)", () => {
    expect(engine.mapWithConcurrency).toBe(mapWithConcurrency);
    expect(engine.PACKAGE_CONCURRENCY).toBe(PACKAGE_CONCURRENCY);
  });

  it("Feature: submission-readiness, Property 2: order kept and at most limit in flight", async () => {
    // Validates: Requirement 5.4
    await fc.assert(
      fc.asyncProperty(fc.array(fc.integer({ min: 0, max: 3 }), { maxLength: 40 }), fc.integer({ min: 1, max: 16 }), async (delays, limit) => {
        let inFlight = 0;
        let peak = 0;
        const out = await mapWithConcurrency(delays, limit, async (d) => {
          inFlight++;
          peak = Math.max(peak, inFlight);
          await new Promise((r) => setTimeout(r, d));
          inFlight--;
          return d * 2;
        });
        expect(out).toEqual(delays.map((d) => d * 2));
        expect(peak).toBeLessThanOrEqual(limit);
      }),
      { numRuns: 100 },
    );
  });
});
