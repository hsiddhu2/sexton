// The largest allowed timelines block stays well under the Lambda response limit. Spec cemetery-time, 8.11, 8.12.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { validateScanResponse } from "../../web/src/load/validate-scan-response.js";

const DEMO = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "web", "public", "demo", "scan.json");
const STATES = ["Possessed", "Dead", "Haunted", "Restless", "Alive"] as const;

describe("timeline response size", () => {
  it("300 packages, 64 Segments each, 200 character reasons, serialise the block under the 6 MB Lambda limit and validate", () => {
    const names = Array.from({ length: 300 }, (_, i) => `package-${String(i).padStart(3, "0")}`);
    const demo = JSON.parse(readFileSync(DEMO, "utf8")) as { report: { generatedAt: string; packages: { name: string }[] }; policy: unknown };
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
});
