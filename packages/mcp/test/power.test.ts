// The Power's files and its Bundle. Spec: .kiro/specs/sexton-power, Requirements 2.11, 14.1 to 14.6.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = fileURLToPath(new URL("../../..", import.meta.url));
const POWER = join(ROOT, "powers/sexton");
const read = (p: string): string => readFileSync(join(POWER, p), "utf8");

describe("plugin.json", () => {
  const plugin = JSON.parse(read("plugin.json")) as Record<string, unknown>;
  it("carries the required fields", () => {
    expect(plugin["$schema"]).toBe("https://agent-plugins.org/schemas/1.0.0/plugin.schema.json");
    expect(plugin["name"]).toBe("sexton");
    expect(plugin["version"]).toMatch(/^\d+\.\d+\.\d+$/);
    expect(typeof plugin["description"]).toBe("string");
    expect((plugin["author"] as { name: string }).name.length).toBeGreaterThan(0);
    expect(plugin["license"]).toBe("Apache-2.0");
    expect(plugin["repository"]).toBe("https://github.com/hsiddhu2/sexton");
  });
  it("lists the keywords that load it", () => {
    for (const k of ["dependency", "dependencies", "npm", "supply chain", "lockfile", "install", "package.json", "vulnerability", "sexton"]) {
      expect(plugin["keywords"]).toContain(k);
    }
  });
});

describe("mcp.json", () => {
  const mcp = JSON.parse(read("mcp.json")) as { mcpServers: Record<string, Record<string, unknown>> };
  it("starts the Bundle with node by a relative path, with no env, no secret and no autoApprove", () => {
    expect(Object.keys(mcp.mcpServers)).toEqual(["sexton"]);
    const server = mcp.mcpServers["sexton"] ?? {};
    expect(server["command"]).toBe("node");
    expect(server["args"]).toEqual(["server/sexton-mcp.mjs"]);
    expect(server["type"]).toBe("stdio");
    expect(server["env"]).toBeUndefined();
    expect(server["autoApprove"]).toBeUndefined();
    expect(JSON.stringify(mcp)).not.toMatch(/token|secret|password|key/i);
  });
});

describe("SKILL.md", () => {
  const skill = read("skills/sexton/SKILL.md");
  it("has front matter, and says what Requirement 14.4 requires", () => {
    expect(skill).toMatch(/^---\nname: sexton\ndescription: .+\n---\n/);
    for (const tool of ["scan_project", "explain_package", "fix_order", "check_policy"]) expect(skill).toContain(`\`${tool}\``);
    expect(skill).toContain("absolute path of the workspace root");
    expect(skill).toMatch(/source URL and the fetch time/);
    expect(skill).toMatch(/untrusted/);
    expect(skill).toMatch(/cannot change a file/);
    expect(skill).toMatch(/Residual risk/);
  });
});

describe("the Bundle", () => {
  const committed = readFileSync(join(POWER, "server/sexton-mcp.mjs"));
  it("is the build of the current sources (Requirement 14.6)", () => {
    const dir = mkdtempSync(join(tmpdir(), "sexton-bundle-"));
    try {
      const out = join(dir, "sexton-mcp.mjs");
      execFileSync(process.execPath, [join(ROOT, "scripts/build-power.mjs"), "--out", out], { cwd: ROOT, stdio: "pipe" });
      const rebuilt = readFileSync(out);
      expect(rebuilt.length).toBe(committed.length);
      expect(rebuilt.equals(committed)).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 60_000);
  it("is built for Node 20 and holds no token-like string", () => {
    const text = committed.toString("utf8");
    expect(text).not.toMatch(/ghp_[A-Za-z0-9]{20,}|github_pat_|sk-[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}/);
    expect(text).not.toContain(ROOT);
  });
});
