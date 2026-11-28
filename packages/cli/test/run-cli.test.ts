// runCli arguments and exit codes. Spec: .kiro/specs/cli-and-action, Requirements 3.1 to 3.5. Properties 43 and 44.

import fc from "fast-check";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseCommand } from "../src/args.js";
import { USAGE } from "../src/messages.js";
import { runCli } from "../src/run-cli.js";
import { CLI_VERSION } from "../src/version.js";
import { fakeDeps } from "./support.js";

const offline = () => fakeDeps({ transport: () => Promise.reject(new Error("no network in this test")) });

describe("arguments", () => {
  it.each([
    [["scan", "."], { kind: "scan", target: "." }],
    [["scan", ".", "--repo", "https://github.com/a/b", "--out", "x.json"], { kind: "scan", target: ".", repo: "https://github.com/a/b", out: "x.json" }],
    [["check"], { kind: "check" }],
    [["check", "--", "-dir"], { kind: "check", target: "-dir" }],
    [["check", "dir", "--summary", "s.md"], { kind: "check", target: "dir", summary: "s.md" }],
    [["evidence", "--out-dir", "out"], { kind: "evidence", outDir: "out" }],
    [["evidence", "--verify", "p.json"], { kind: "verify", file: "p.json" }],
    [["--help"], { kind: "help" }],
    [["--version"], { kind: "version" }],
  ])("parses %j", (argv, command) => {
    expect(parseCommand(argv)).toEqual({ ok: true, command });
  });

  it.each([
    [[]],
    [["scan"]],
    [["scan", "a", "b"]],
    [["scan", ".", "--summary", "s"]],
    [["check", "--out", "x"]],
    [["check", "--repo"]],
    [["check", "--repo", "a", "--repo", "b"]],
    [["evidence", "--verify", "p", "dir"]],
    [["evidence", "--verify", "p", "--out-dir", "o"]],
    [["--help", "scan"]],
    [["--version", "--help"]],
    [["destroy"]],
    [["scan", "--colour"]],
    [["scan", ""]],
  ])("refuses %j", (argv) => {
    expect(parseCommand(argv).ok).toBe(false);
  });

  it("prints help and the version with exit 0", async () => {
    const h = offline();
    expect(await runCli(["--help"], h.deps)).toBe(0);
    expect(h.out.join("")).toBe(USAGE);
    const v = offline();
    expect(await runCli(["--version"], v.deps)).toBe(0);
    expect(v.out.join("")).toBe(`${CLI_VERSION}\n`);
  });

  // Spec release, Requirement 6.1: --version prints the CLI's own version, which the published `sexton` package carries, not the engine's.
  it("prints the CLI package's version, not the engine's", async () => {
    const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version: string };
    expect(CLI_VERSION).toBe(pkg.version);
    const v = offline();
    expect(await runCli(["--version"], v.deps)).toBe(0);
    expect(v.out).toEqual([`${pkg.version}\n`]);
  });
});

const WORDS = ["scan", "check", "evidence", "--repo", "--out", "--summary", "--out-dir", "--verify", "--help", "--version", "--", ".", "https://github.com/a/b", "x.json", "-x", "--x=1"];

describe("Feature: cli-and-action, Property 43: runCli total", () => {
  it("resolves to 0, 1 or 2 for any argument list", async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(fc.oneof(fc.constantFrom(...WORDS), fc.string({ maxLength: 8 })), { maxLength: 6 }), async (argv) => {
        const h = offline();
        const code = await runCli(argv, h.deps);
        expect([0, 1, 2]).toContain(code);
      }),
      { numRuns: 100 },
    );
  });

  it("never rejects even for non-string arguments", async () => {
    expect(await runCli([1, null, {}] as unknown as string[], offline().deps)).toBe(2);
  });
});

const VALID: readonly string[][] = [["scan", "dir"], ["check"], ["check", "dir"], ["evidence"], ["evidence", "dir", "--out-dir", "o"]];

describe("Feature: cli-and-action, Property 44: Usage errors", () => {
  it("returns 2 with one stderr line and no I/O for an unknown flag, a missing value, a repeat or an extra positional", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...VALID),
        fc.oneof(
          fc.stringMatching(/^[a-z]{2,8}$/).filter((n) => !["repo", "out", "summary", "verify", "help", "version"].includes(n)).map((n) => [`--${n}`]),
          fc.constant(["--repo"]),
          fc.constant(["--repo", "https://github.com/a/b", "--repo", "https://github.com/a/b"]),
          fc.constant(["extra-one", "extra-two"]),
        ),
        async (valid, bad) => {
          const h = offline();
          expect(await runCli([...valid, ...bad], h.deps)).toBe(2);
          expect(h.err.join("").split("\n").filter((l) => l !== "")).toHaveLength(1);
          expect(h.err.join("")).toMatch(/^usage error: .*\. Run sexton --help\.\n$/);
          expect(h.calls).toEqual({ files: 0, git: 0, network: 0 });
        },
      ),
      { numRuns: 100 },
    );
  });
});
