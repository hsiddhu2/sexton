// The four tools end to end over the in-memory transport. Spec: .kiro/specs/sexton-power, Requirements 1, 3 to 6.
import { describe, expect, it } from "vitest";
import { DATA_HEADER } from "../src/result.js";
import { harness, ROOT } from "./support.js";

describe("tools/list", () => {
  it("lists exactly the four tools in order, read-only, each requiring projectDir", async () => {
    const h = await harness();
    const response = await h.client.request("tools/list");
    const tools = (response["result"] as { tools: { name: string; description: string; inputSchema: Record<string, unknown>; annotations: Record<string, unknown> }[] }).tools;
    expect(tools.map((t) => t.name)).toEqual(["scan_project", "explain_package", "fix_order", "check_policy"]);
    for (const t of tools) {
      expect(t.annotations).toMatchObject({ readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true });
      expect(t.description.length).toBeLessThanOrEqual(400);
      expect(t.inputSchema["required"]).toContain("projectDir");
      expect(t.inputSchema["additionalProperties"]).toBe(false);
    }
    expect(tools[1]?.inputSchema["required"]).toEqual(["projectDir", "package"]);
  });
  it("lists no resources and no prompts", async () => {
    const h = await harness();
    const caps = ((await h.client.request("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "0" } }))["result"] as { capabilities: Record<string, unknown> }).capabilities;
    expect(Object.keys(caps)).not.toContain("resources");
    expect(Object.keys(caps)).not.toContain("prompts");
  });
});

describe("scan_project", () => {
  it("returns every package with state, reason and the header first", async () => {
    const h = await harness();
    const out = await h.client.callTool("scan_project", { projectDir: ROOT });
    expect(out.isError).toBe(false);
    expect(out.text.startsWith(`${DATA_HEADER}\n{`)).toBe(true);
    expect(out.json["ok"]).toBe(true);
    const packages = out.json["packages"] as { name: string; state: string; reason: string }[];
    expect(packages.length).toBeGreaterThan(0);
    expect(packages.every((p) => typeof p.state === "string" && p.reason.length > 0)).toBe(true);
    expect(out.structured).toEqual(out.json);
    expect(JSON.stringify(out.json)).not.toContain(ROOT);
    expect(JSON.stringify(out.json)).not.toContain("local/");
  });
  it("scans a project with no GitHub origin", async () => {
    const h = await harness({ origin: null });
    const out = await h.client.callTool("scan_project", { projectDir: ROOT });
    expect(out.json["ok"]).toBe(true);
  });
});

describe("refusals", () => {
  it("refuses a bad projectDir with its code and a fixed message", async () => {
    const h = await harness();
    const cases: [unknown, string][] = [
      [{ projectDir: "work/app" }, "project-dir-not-absolute"],
      [{ projectDir: "/nowhere" }, "project-dir-not-found"],
      [{ projectDir: `${ROOT}/package.json` }, "project-dir-not-a-directory"],
      [{ projectDir: "/work" }, "package-json-missing"],
      [{}, "invalid-arguments"],
      [{ projectDir: 5 }, "invalid-arguments"],
      [{ projectDir: ROOT, path: "/" }, "invalid-arguments"],
    ];
    for (const [args, code] of cases) {
      const out = await h.client.callTool("scan_project", args);
      expect(out.isError).toBe(true);
      expect((out.json["error"] as { code: string }).code).toBe(code);
    }
    expect(h.captured.calls.network).toBe(0);
  });
  it("refuses an unknown package without a request of its own", async () => {
    const h = await harness();
    await h.client.callTool("scan_project", { projectDir: ROOT });
    const before = h.captured.calls.network;
    const out = await h.client.callTool("explain_package", { projectDir: ROOT, package: "not-a-dependency" });
    expect((out.json["error"] as { code: string }).code).toBe("package-not-in-scan");
    expect(h.captured.calls.network).toBe(before);
  });
});
