// A real stdio smoke test of dist/bin.js and of the Power's Bundle. tools/list only: no tool call, so no network.
// Spec: .kiro/specs/sexton-power, Requirements 1.1, 1.5, 1.6, 14.5.
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = fileURLToPath(new URL("../../..", import.meta.url));

interface Reply {
  readonly stdoutLines: string[];
  readonly tools: { name: string; inputSchema: { required: string[] } }[];
}
function talk(node: string, script: string, cwd: string): Promise<Reply> {
  return new Promise((resolve, reject) => {
    const child = spawn(node, [script], { cwd, stdio: ["pipe", "pipe", "pipe"], env: { PATH: process.env["PATH"] ?? "" } });
    const lines: string[] = [];
    let buffer = "";
    let tools: Reply["tools"] = [];
    child.stdout.on("data", (d: Buffer) => {
      buffer += d.toString("utf8");
      let i: number;
      while ((i = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, i);
        buffer = buffer.slice(i + 1);
        lines.push(line);
        const msg = JSON.parse(line) as { id?: number; result?: { tools?: Reply["tools"] } };
        if (msg.id === 1) {
          child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n`);
          child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" })}\n`);
        }
        if (msg.id === 2) {
          tools = msg.result?.tools ?? [];
          child.kill();
        }
      }
    });
    child.on("error", reject);
    child.on("close", () => resolve({ stdoutLines: lines, tools }));
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "smoke", version: "0" } } })}\n`);
  });
}
function check(reply: Reply): void {
  expect(reply.tools.map((t) => t.name)).toEqual(["scan_project", "explain_package", "fix_order", "check_policy"]);
  for (const t of reply.tools) expect(t.inputSchema.required).toContain("projectDir");
  for (const line of reply.stdoutLines) expect(() => JSON.parse(line)).not.toThrow();
}

describe("dist/bin.js", () => {
  it("lists the four tools over stdio, with MCP messages only on stdout", async () => {
    const script = join(ROOT, "packages/mcp/dist/bin.js");
    expect(existsSync(script)).toBe(true);
    const empty = mkdtempSync(join(tmpdir(), "sexton-smoke-"));
    try {
      check(await talk(process.execPath, script, empty));
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
  });
});

describe("the Power's Bundle", () => {
  const bundle = join(ROOT, "powers/sexton/server/sexton-mcp.mjs");
  const versions = ["v20", "v22"];
  const nvm = join(homedir(), ".nvm", "versions", "node");
  for (const major of versions) {
    it(`runs under Node ${major} from an empty directory with no node_modules`, async () => {
      const dirs = existsSync(nvm) ? (await import("node:fs")).readdirSync(nvm).filter((d) => d.startsWith(`${major}.`)).sort() : [];
      const dir = dirs[dirs.length - 1];
      if (dir === undefined) {
        console.warn(`Node ${major} is not installed under ~/.nvm; skipped.`);
        return;
      }
      const empty = mkdtempSync(join(tmpdir(), "sexton-bundle-"));
      try {
        expect(readFileSync(bundle, "utf8").length).toBeGreaterThan(1000);
        check(await talk(join(nvm, dir, "bin", "node"), bundle, empty));
      } finally {
        rmSync(empty, { recursive: true, force: true });
      }
    });
  }
});
