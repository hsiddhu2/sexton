// The largest allowed timelines block stays well under the Lambda response limit. Spec cemetery-time, 8.11, 8.12.
// The template package, report and policy are built in memory from the committed engine fixtures, never read from
// another workspace's generated files. Spec cemetery-time-fixes, 1.3.
import { beforeAll, describe, expect, it } from "vitest";
// @ts-expect-error plain JavaScript module without declarations
import { buildDemoScan } from "../scripts/generate-demo-scan.mjs";
import { validateScanResponse } from "../../web/src/load/validate-scan-response.js";
import { ENGINE_FIXTURES } from "./support/fixture-transport.js";
import type { ScanResponse } from "../src/contract.js";
import { guardTimelinesSize } from "../src/timelines-guard.js";

const STATES = ["Possessed", "Dead", "Haunted", "Restless", "Alive"] as const;

interface DemoScan {
  readonly report: { generatedAt: string; packages: { name: string }[] };
  readonly policy: unknown;
}

let demo: DemoScan;

beforeAll(async () => {
  demo = (await buildDemoScan({ fixturesDir: ENGINE_FIXTURES })) as DemoScan;
});

describe("timeline response size", () => {
  it("300 packages, 64 Segments each, 200 character reasons, serialise the block under the 6 MB Lambda limit and validate", () => {
    const names = Array.from({ length: 300 }, (_, i) => `package-${String(i).padStart(3, "0")}`);
    const template = demo.report.packages[0] as { name: string };
    const packages = names.map((name) => ({ ...structuredClone(template), name }));
    const timelines = Object.fromEntries(
      names.map((name) => [
        name,
        {
          installed: "1.0.0",
          coveredFrom: null,
          segments: Array.from({ length: 64 }, (_, k) => ({
            from: new Date(Date.UTC(2020, 0, 1) + k * 86_400_000).toISOString(),
            state: STATES[k % STATES.length],
            reason: "r".repeat(200),
            ghost: k % 2 === 0,
          })),
        },
      ]),
    );
    const body = { report: { ...demo.report, packages }, policy: demo.policy, timelines };
    const text = JSON.stringify(body);
    // Measured 23 Nov 2026: the design estimated 150 bytes per Segment, the worst case is about 290 bytes, so the
    // timelines block alone is about 5.6 MB. It stays under the 6 MB Lambda response limit; see design.md "Notes and open items".
    const timelinesBytes = Buffer.byteLength(JSON.stringify(timelines));
    expect(timelinesBytes).toBeLessThan(6 * 1024 * 1024);
    const result = validateScanResponse(JSON.parse(text));
    expect(result.ok).toBe(true);
  });

  it("with reasons of 80 characters the block stays under 4 MB", () => {
    const segment = { from: "2026-01-01T00:00:00.000Z", state: "Possessed", reason: "r".repeat(80), ghost: true };
    const block = Object.fromEntries(Array.from({ length: 300 }, (_, i) => [`package-${i}`, { installed: "1.0.0", coveredFrom: null, segments: Array.from({ length: 64 }, () => segment) }]));
    expect(Buffer.byteLength(JSON.stringify(block))).toBeLessThan(4 * 1024 * 1024);
  });

  // Spec cemetery-time-fixes, 5.7: the guard at the real limit, built in memory with no generated file.
  const body = (reason: string): ScanResponse => {
    const names = Array.from({ length: 300 }, (_, i) => `package-${String(i).padStart(3, "0")}`);
    const template = demo.report.packages[0] as { name: string };
    const timelines = Object.fromEntries(
      names.map((name) => [
        name,
        {
          installed: "1.0.0",
          coveredFrom: null,
          segments: Array.from({ length: 64 }, (_, k) => ({
            from: new Date(Date.UTC(2020, 0, 1) + k * 86_400_000).toISOString(),
            state: STATES[k % STATES.length],
            reason,
            ghost: k % 2 === 0,
          })),
        },
      ]),
    );
    return { report: { ...demo.report, packages: names.map((name) => ({ ...structuredClone(template), name })) }, policy: demo.policy, timelines } as unknown as ScanResponse;
  };

  it("the guard omits the 300 by 64 timelines with 200 character reasons at the real limit", () => {
    const out = guardTimelinesSize(body("r".repeat(200)));
    expect(out.omitted).toBe(true);
    expect(out.body.timelines).toBeUndefined();
    expect(out.body.timelinesOmitted).toBe("too-large");
    expect(validateScanResponse(JSON.parse(JSON.stringify(out.body))).ok).toBe(true);
  });

  it("the guard keeps the 300 by 64 timelines with 80 character reasons", () => {
    const input = body("r".repeat(80));
    const out = guardTimelinesSize(input);
    expect(out.omitted).toBe(false);
    expect(out.body).toBe(input);
  });
});
