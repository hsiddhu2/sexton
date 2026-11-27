// One scan, shared. Spec: .kiro/specs/sexton-power, Requirements 9.3 to 9.5, Property 9.
import fc from "fast-check";
import type { Transport } from "@sexton/engine";
import { describe, expect, it } from "vitest";
import { appFiles, harness, ROOT } from "./support.js";

async function oneScanRequests(): Promise<number> {
  const h = await harness();
  await h.client.callTool("scan_project", { projectDir: ROOT });
  return h.captured.calls.network;
}

describe("ScanCache", () => {
  it("Property 9: 1 to 20 calls, sequential or concurrent, make the requests of one scan", async () => {
    const single = await oneScanRequests();
    expect(single).toBeGreaterThan(0);
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 1, max: 20 }), fc.boolean(), fc.array(fc.constantFrom("scan_project", "fix_order", "check_policy"), { minLength: 20, maxLength: 20 }), async (n, concurrent, tools) => {
        const h = await harness();
        const calls = tools.slice(0, n).map((t) => () => h.client.callTool(t, { projectDir: ROOT }));
        if (concurrent) await Promise.all(calls.map((c) => c()));
        else for (const c of calls) await c();
        expect(h.captured.calls.network).toBe(single);
      }),
      { numRuns: 25 },
    );
  });
  it("starts a new scan when a manifest changes", async () => {
    const h = await harness();
    await h.client.callTool("scan_project", { projectDir: ROOT });
    const first = h.captured.calls.network;
    await h.client.callTool("scan_project", { projectDir: ROOT });
    expect(h.captured.calls.network).toBe(first);
    const other = await harness({ projectFiles: appFiles({ [`${ROOT}/sexton.policy.yml`]: "version: 1\nrules: []\n" }) });
    const out = await other.client.callTool("check_policy", { projectDir: ROOT });
    expect(out.json["policySource"]).toBe("file");
  });
  it("keeps a finished scan for 15 minutes only", async () => {
    let t = 0;
    const h = await harness({ now: () => t });
    await h.client.callTool("scan_project", { projectDir: ROOT });
    const first = h.captured.calls.network;
    t = 899_999;
    await h.client.callTool("scan_project", { projectDir: ROOT });
    expect(h.captured.calls.network).toBe(first);
    t = 900_000;
    await h.client.callTool("scan_project", { projectDir: ROOT });
    expect(h.captured.calls.network).toBe(first * 2);
  });
  it("answers scan-timeout, leaves the scan running, and serves the next call from it", async () => {
    const single = await oneScanRequests();
    const h = await harness({
      scanTimeoutMs: 30,
      cli: (cli) => ({ ...cli, transport: ((url, request) => new Promise((resolve) => setTimeout(() => resolve(cli.transport(url, request)), 5)).then((p) => p)) as Transport }),
    });
    const first = await h.client.callTool("scan_project", { projectDir: ROOT });
    expect(first.isError).toBe(true);
    expect((first.json["error"] as { code: string }).code).toBe("scan-timeout");
    let second = first;
    for (let i = 0; i < 200 && second.isError; i += 1) {
      await new Promise((r) => setTimeout(r, 50));
      second = await h.client.callTool("scan_project", { projectDir: ROOT });
    }
    expect(second.json["ok"]).toBe(true);
    expect(h.captured.calls.network).toBe(single);
  });
});
