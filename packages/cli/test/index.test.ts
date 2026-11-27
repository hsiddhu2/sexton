// The public surface and the real ports. Spec: .kiro/specs/sexton-power, Requirement 8.2.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import * as cli from "../src/index.js";
import { createRealDeps } from "../src/real-deps.js";

describe("@sexton/cli index", () => {
  it("exports exactly the names the MCP server needs", () => {
    expect(Object.keys(cli).sort()).toEqual(["MSG", "createRealDeps", "renderCheck", "repoFromRemote", "resolveTarget", "runCli", "runScanPipeline", "safe"]);
  });
  it("package.json points main and types at the index", () => {
    const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { main: string; types: string; bin: Record<string, string> };
    expect(pkg.main).toBe("dist/index.js");
    expect(pkg.types).toBe("dist/index.d.ts");
    expect(pkg.bin["sexton"]).toBe("dist/bin.js");
  });
});

describe("createRealDeps", () => {
  it("builds the full port set for a working directory", () => {
    const deps = createRealDeps("/work/app");
    expect(Object.keys(deps).sort()).toEqual(["clock", "cwd", "env", "files", "git", "resolvePath", "stderr", "stdout", "transport", "workingTree"]);
    expect(deps.cwd).toBe("/work/app");
    expect(deps.resolvePath("/a", "b")).toBe("/a/b");
    expect(deps.clock()).toBeInstanceOf(Date);
  });
  it("bin.ts builds its ports through createRealDeps", () => {
    const bin = readFileSync(new URL("../src/bin.ts", import.meta.url), "utf8");
    expect(bin).toContain("createRealDeps(process.cwd())");
    expect(bin).not.toContain("createFetchTransport");
  });
});
