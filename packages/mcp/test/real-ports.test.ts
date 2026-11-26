// The real file and git ports on a real temporary directory, and the write counter. No network: the transport is the recorded fixtures.
// Spec: .kiro/specs/sexton-power, Requirements 2.5, 7.1, 7.6, 7.7, 3.1 (review of 26 Nov 2026, notes 1 to 3 and 6).
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { lstat, realpath, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRealDeps } from "@sexton/cli";
import { available } from "@sexton/engine";
import type { PackageHealth } from "@sexton/engine";
import { describe, expect, it } from "vitest";
import { arbPackage } from "../../engine/test/arbitraries.js";
import { readOnlyFiles } from "../src/read-only-files.js";
import { createServer } from "../src/server.js";
import { highestAdvisory } from "../src/views/highest-advisory.js";
import { fixturePackages, fixtureTransport, manifestsFor } from "../../cli/test/support.js";
import { NOW } from "../../engine/test/helpers.js";
import { connect, harness } from "./support.js";
import fc from "fast-check";

/** A map of every path under dir (.git included) to a SHA-256 of its kind, size and content. Compared as a whole, so a failure names the path. */
function treeDigest(dir: string): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (rel: string): void => {
    for (const name of readdirSync(join(dir, rel)).sort()) {
      const path = rel === "" ? name : `${rel}/${name}`;
      const info = lstatSync(join(dir, path));
      if (info.isDirectory()) {
        out[path] = "dir";
        walk(path);
      } else if (info.isSymbolicLink()) out[path] = "link";
      else out[path] = createHash("sha256").update(readFileSync(join(dir, path))).digest("hex");
    }
  };
  walk("");
  return out;
}

function git(cwd: string, ...args: string[]): void {
  execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.test", ...args], { cwd, stdio: "pipe" });
}

async function serverOver(dir: string) {
  const real = createRealDeps(dir);
  const server = createServer({
    cli: { ...real, files: readOnlyFiles(real.files), transport: fixtureTransport().transport, clock: () => NOW, env: {} },
    fs: { realpath: (p) => realpath(p), stat: (p) => stat(p), lstat: (p) => lstat(p) },
    scanTimeoutMs: 30_000,
    cacheTtlMs: 900_000,
    now: () => 0,
    log: () => undefined,
  });
  return connect(server);
}

describe("real ports on a temporary git repository", () => {
  it("leaves the whole tree, .git included, byte-identical after every tool", async () => {
    const dir = realpathSync(mkdtempSync(join(tmpdir(), "sexton-real-")));
    try {
      const { pkg, lock } = manifestsFor(fixturePackages);
      writeFileSync(join(dir, "package.json"), pkg);
      writeFileSync(join(dir, "package-lock.json"), lock);
      mkdirSync(join(dir, "src"));
      writeFileSync(join(dir, "src", "index.js"), "require('left-pad');\n");
      git(dir, "init", "-q");
      // The repository the test makes must not change under it: no automatic gc or maintenance after the commit.
      git(dir, "config", "gc.auto", "0");
      git(dir, "config", "maintenance.auto", "false");
      git(dir, "remote", "add", "origin", "https://github.com/acme/app.git");
      git(dir, "add", "-A");
      git(dir, "commit", "-q", "-m", "init");
      const before = treeDigest(dir);
      const client = await serverOver(dir);
      for (const tool of ["scan_project", "fix_order", "check_policy"]) {
        const out = await client.callTool(tool, { projectDir: dir });
        expect(out.json["ok"]).toBe(true);
      }
      expect((await client.callTool("explain_package", { projectDir: dir, package: fixturePackages[0]?.name ?? "" })).json["ok"]).toBe(true);
      expect(treeDigest(dir)).toEqual(before);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 60_000);

  it("does not follow a symbolic link for package-lock.json, sexton.policy.yml or a source file", async () => {
    const outside = realpathSync(mkdtempSync(join(tmpdir(), "sexton-outside-")));
    const dir = realpathSync(mkdtempSync(join(tmpdir(), "sexton-links-")));
    try {
      const { pkg, lock } = manifestsFor(fixturePackages);
      writeFileSync(join(outside, "lock.json"), lock);
      writeFileSync(join(outside, "policy.yml"), "version: 1\nrules:\n  - name: SECRET-RULE-NAME\n    type: forbid_state\n    states: [Alive]\n");
      writeFileSync(join(outside, "source.js"), "require('SECRET-PACKAGE');\n");
      writeFileSync(join(dir, "package.json"), pkg);
      symlinkSync(join(outside, "lock.json"), join(dir, "package-lock.json"));
      symlinkSync(join(outside, "policy.yml"), join(dir, "sexton.policy.yml"));
      symlinkSync(join(outside, "source.js"), join(dir, "index.js"));
      const client = await serverOver(dir);
      const check = await client.callTool("check_policy", { projectDir: dir });
      expect(check.json["policySource"]).toBe("default");
      expect(check.text).not.toContain("SECRET-RULE-NAME");
      const scan = await client.callTool("scan_project", { projectDir: dir });
      expect(scan.json["unlocked"]).toBe(true);
      expect(scan.text).not.toContain("SECRET-PACKAGE");
    } finally {
      rmSync(dir, { recursive: true, force: true });
      rmSync(outside, { recursive: true, force: true });
    }
  }, 60_000);
});

describe("the write counter", () => {
  it("counts a write that reaches the port the pipeline sees, and the port still throws", async () => {
    const h = await harness();
    expect(h.writes.count).toBe(0);
    expect(() => h.deps.cli.files.writeText("/work/app/x", "y")).toThrow("write attempted");
    expect(h.writes.count).toBe(1);
  });
});

describe("highestAdvisory", () => {
  const withAdvisories = (p: PackageHealth, severities: ("Critical" | "High" | "Moderate" | "Low" | "Unknown")[]): PackageHealth => ({
    ...p,
    signals: { ...p.signals, advisories: available(severities.map((severity, i) => ({ id: `X-${String(i)}`, severity, summary: "s" })), "https://example.test/x", NOW) },
  });
  it("is the severity the triage order ranks first, for any mix, and null for none", () => {
    fc.assert(
      fc.property(arbPackage, fc.array(fc.constantFrom("Critical", "High", "Moderate", "Low", "Unknown"), { maxLength: 6 }), (base, severities) => {
        const p = withAdvisories(base, severities);
        const expected = (["Critical", "High", "Moderate", "Low", "Unknown"] as const).find((s) => severities.includes(s)) ?? null;
        expect(highestAdvisory(p)).toBe(expected);
      }),
      { numRuns: 100 },
    );
  });
  it("is null when the advisories signal is unavailable", () => {
    const base = fc.sample(arbPackage, { seed: 3, numRuns: 1 })[0] as PackageHealth;
    expect(highestAdvisory({ ...base, signals: { ...base.signals, advisories: { available: false, value: null, source: "s", fetchedAt: NOW.toISOString(), reason: "down" } } })).toBeNull();
  });
});
