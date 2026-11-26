// Static checks on the package. Spec: .kiro/specs/sexton-power, Requirements 7.2, 7.5, 8.6, 12.1, 12.5, 13.2, and Decision 4.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import * as cli from "@sexton/cli";
import * as engine from "@sexton/engine";
import { describe, expect, it } from "vitest";

const PACKAGE = fileURLToPath(new URL("..", import.meta.url));
const SRC = join(PACKAGE, "src");
function sources(dir: string): { path: string; text: string }[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? sources(join(dir, e.name)) : e.name.endsWith(".ts") ? [{ path: join(dir, e.name), text: readFileSync(join(dir, e.name), "utf8") }] : [],
  );
}
const FILES = sources(SRC);
const importsOf = (text: string): string[] => [...text.matchAll(/^import\s[^;]*?from\s+"([^"]+)";?$/gm)].map((m) => m[1] ?? "");

describe("package.json", () => {
  const pkg = JSON.parse(readFileSync(join(PACKAGE, "package.json"), "utf8")) as { name: string; dependencies: Record<string, string>; devDependencies?: unknown };
  it("has exactly the three runtime dependencies of Requirement 12.1, pinned, and no development dependencies", () => {
    expect(pkg.name).toBe("@sexton/mcp");
    expect(Object.keys(pkg.dependencies).sort()).toEqual(["@modelcontextprotocol/server", "@sexton/cli", "@sexton/engine"]);
    expect(pkg.dependencies["@modelcontextprotocol/server"]).toBe("2.4.0");
    expect(pkg.devDependencies).toBeUndefined();
    for (const v of Object.values(pkg.dependencies)) expect(v).toMatch(/^\d+\.\d+\.\d+$/);
  });
});

describe("imports of packages/mcp/src (Decision 4)", () => {
  const all = FILES.flatMap((f) => importsOf(f.text).map((spec) => ({ file: f.path, spec })));
  it("import no api package, no child_process, no schema library, and only allowed packages", () => {
    const allowed = /^(\.\/|\.\.\/|node:|@sexton\/(engine|cli)$|@modelcontextprotocol\/server(\/stdio)?$)/;
    for (const { spec } of all) {
      expect(spec).not.toMatch(/@sexton\/api|child_process|zod|ajv/);
      expect(spec).toMatch(allowed);
    }
  });
  it("import no file-writing function from node:fs", () => {
    const writes = ["writeFile", "writeFileSync", "appendFile", "appendFileSync", "mkdir", "mkdirSync", "rm", "rmSync", "rmdir", "rmdirSync", "unlink", "unlinkSync", "rename", "renameSync", "copyFile", "copyFileSync", "chmod", "chmodSync", "truncate", "createWriteStream", "symlink", "mkdtemp", "open"];
    for (const f of FILES) {
      for (const m of f.text.matchAll(/import\s*\{([^}]*)\}\s*from\s*"node:fs(?:\/promises)?"/g)) {
        const names = (m[1] ?? "").split(",").map((n) => n.trim().split(/\s+as\s+/)[0] ?? "");
        for (const name of names) expect(writes).not.toContain(name);
      }
      expect(f.text).not.toMatch(/import\s+\*\s+as\s+\w+\s+from\s+"node:fs/);
    }
  });
  it("read no environment variable, and use the working directory only in bin.ts, for the CLI ports", () => {
    for (const f of FILES) {
      expect(f.text).not.toMatch(/process\.env/);
      if (!f.path.endsWith("bin.ts")) expect(f.text).not.toMatch(/process\.cwd/);
    }
  });
});

describe("one implementation (Requirement 8.6)", () => {
  it("redefines no function that @sexton/engine or @sexton/cli exports", () => {
    const names = new Set([...Object.keys(engine), ...Object.keys(cli)].filter((n) => typeof (engine as Record<string, unknown>)[n] === "function" || typeof (cli as Record<string, unknown>)[n] === "function"));
    for (const f of FILES) {
      for (const m of f.text.matchAll(/(?:function\s+|const\s+)([A-Za-z_][A-Za-z0-9_]*)\s*(?:=|\()/g)) expect(names.has(m[1] ?? "")).toBe(false);
    }
  });
});
