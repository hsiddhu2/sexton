// The real ports in temporary directories. Spec: .kiro/specs/cli-and-action, Requirements 4.1, 4.3, 4.4, 4.7, 5.

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { nodeFilePort } from "../src/file-port.js";
import { nodeGitPort } from "../src/git-port.js";
import { repoFromRemote } from "../src/repo-name.js";
import { createWorkingTreeSource, MAX_RAW_ENTRIES } from "../src/working-tree.js";
import type { GitPort } from "../src/deps.js";

let dir: string;
let outside: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "sexton-cli-"));
  outside = mkdtempSync(join(tmpdir(), "sexton-out-"));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  rmSync(outside, { recursive: true, force: true });
});

const noGit: GitPort = { originUrl: () => Promise.resolve(null), head: () => Promise.resolve(null), lsFiles: () => Promise.resolve(null) };

function hasGit(): boolean {
  try {
    execFileSync("git", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

describe("File port", () => {
  it("reads a plain root file, strips a byte order mark, caps the size and refuses links and invalid UTF-8", async () => {
    writeFileSync(join(dir, "package.json"), "﻿{}");
    writeFileSync(join(dir, "big"), "x".repeat(11));
    writeFileSync(join(dir, "bad"), Buffer.from([0xff, 0xfe, 0x00]));
    writeFileSync(join(outside, "secret"), "secret");
    symlinkSync(join(outside, "secret"), join(dir, "sexton.policy.yml"));
    expect(await nodeFilePort.readRoot(dir, "package.json", 10)).toEqual({ kind: "found", text: "{}" });
    expect(await nodeFilePort.readRoot(dir, "big", 10)).toEqual({ kind: "too-large" });
    expect(await nodeFilePort.readRoot(dir, "bad", 10)).toEqual({ kind: "invalid" });
    expect(await nodeFilePort.readRoot(dir, "sexton.policy.yml", 10)).toEqual({ kind: "missing" });
    expect(await nodeFilePort.readRoot(dir, "none", 10)).toEqual({ kind: "missing" });
  });

  it("never writes through a planted symbolic link", async () => {
    writeFileSync(join(outside, "target"), "keep");
    symlinkSync(join(outside, "target"), join(dir, "scan.json"));
    expect(await nodeFilePort.writeText(join(dir, "scan.json"), "overwritten")).toBe(false);
    expect(readFileSync(join(outside, "target"), "utf8")).toBe("keep");
    mkdirSync(join(dir, "adir"));
    expect(await nodeFilePort.writeText(join(dir, "adir"), "x")).toBe(false);
    expect(await nodeFilePort.writeText(join(dir, "new.json"), "ok")).toBe(true);
    expect(readFileSync(join(dir, "new.json"), "utf8")).toBe("ok");
  });
});

describe("Working-tree source", () => {
  it("walks without git, skips ignored directories and links, and refuses oversized and invalid files", async () => {
    mkdirSync(join(dir, "src"));
    mkdirSync(join(dir, "node_modules", "x"), { recursive: true });
    writeFileSync(join(dir, "src", "a.js"), 'require("a")');
    writeFileSync(join(dir, "src", "big.js"), "x".repeat(262145));
    writeFileSync(join(dir, "src", "bad.js"), Buffer.from([0xc3, 0x28]));
    writeFileSync(join(dir, "node_modules", "x", "i.js"), "x");
    writeFileSync(join(outside, "secret.js"), "secret");
    symlinkSync(join(outside, "secret.js"), join(dir, "src", "link.js"));
    symlinkSync(outside, join(dir, "linkdir"));
    const tree = createWorkingTreeSource(dir, noGit);
    const listed = await tree.listFiles();
    expect([...listed].sort()).toEqual(["src/a.js", "src/bad.js", "src/big.js"]);
    expect(await tree.readFile("src/a.js")).toBe('require("a")');
    expect(await tree.readFile("src/big.js")).toBeUndefined();
    expect(await tree.readFile("src/bad.js")).toBeUndefined();
    expect(await tree.readFile("src/link.js")).toBeUndefined();
    expect(await tree.readFile("../" + outside.split("/").pop() + "/secret.js")).toBeUndefined();
    expect(tree.counts()).toEqual({ performed: true, rawCapped: false, skipped: 2, unread: 0 });
  });

  it("drops a git-listed path that is a link or escapes the root", async () => {
    writeFileSync(join(dir, "a.js"), "x");
    writeFileSync(join(outside, "s.js"), "s");
    symlinkSync(join(outside, "s.js"), join(dir, "l.js"));
    const git: GitPort = { ...noGit, lsFiles: () => Promise.resolve(["a.js", "l.js", "../s.js", "/etc/passwd", "gone.js"]) };
    const tree = createWorkingTreeSource(dir, git);
    expect(await tree.listFiles()).toEqual(["a.js"]);
    // gone.js is tracked but missing on disk (a sparse checkout): skipped, so remove is not offered.
    expect(tree.counts()).toEqual({ performed: true, rawCapped: false, skipped: 1, unread: 0 });
  });

  // Spec remediation-remove-scope, bugfix 2.5: a walked build, dist or coverage folder counts as unread.
  it("counts each walked build, dist or coverage folder as unread, and node_modules or .git as nothing", async () => {
    for (const d of ["build", "dist", "coverage", "node_modules", ".git"]) mkdirSync(join(dir, d));
    writeFileSync(join(dir, "a.js"), "x");
    const tree = createWorkingTreeSource(dir, noGit);
    expect(await tree.listFiles()).toEqual(["a.js"]);
    expect(tree.counts()).toEqual({ performed: true, rawCapped: false, skipped: 0, unread: 3 });
  });
  it("marks the raw listing capped above 20000 entries", async () => {
    writeFileSync(join(dir, "a.js"), "x");
    const many = Array.from({ length: MAX_RAW_ENTRIES + 1 }, (_, i) => (i === 0 ? "a.js" : `f${String(i)}.js`));
    const tree = createWorkingTreeSource(dir, { ...noGit, lsFiles: () => Promise.resolve(many) });
    expect(await tree.listFiles()).toEqual(["a.js"]);
    expect(tree.counts().rawCapped).toBe(true);
  });
});

describe.skipIf(!hasGit())("Git port", () => {
  it("lists tracked files, reads origin and HEAD, and never runs core.fsmonitor from the checkout's config", async () => {
    const run = (...args: string[]) => execFileSync("git", ["-C", dir, ...args], { stdio: "ignore", env: { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" } });
    run("init", "-q");
    run("config", "user.email", "t@example.invalid");
    run("config", "user.name", "t");
    writeFileSync(join(dir, "a.js"), "x");
    run("add", "a.js");
    run("commit", "-q", "-m", "c");
    run("remote", "add", "origin", "git@github.com:acme/app.git");
    const pwned = join(outside, "PWNED");
    run("config", "core.fsmonitor", `touch ${pwned}`);
    expect(await nodeGitPort.lsFiles(dir, 10)).toEqual(["a.js"]);
    expect(existsSync(pwned)).toBe(false);
    expect(await nodeGitPort.originUrl(dir)).toBe("git@github.com:acme/app.git");
    expect(await nodeGitPort.head(dir)).toMatch(/^[0-9a-f]{40}$/);
    expect(await nodeGitPort.originUrl(outside)).toBeNull();
    expect(await nodeGitPort.lsFiles(outside, 10)).toBeNull();
  });
});

describe("repoFromRemote", () => {
  it.each([
    ["git@github.com:acme/app.git", "https://github.com/acme/app"],
    ["git@github.com:acme/app", "https://github.com/acme/app"],
    ["https://github.com/acme/app.git", "https://github.com/acme/app"],
    ["https://github.com/acme/app", "https://github.com/acme/app"],
  ])("names %s", (remote, url) => {
    expect(repoFromRemote(remote)?.url).toBe(url);
  });

  it.each([null, "", "git@gitlab.com:a/b.git", "https://gitlab.com/a/b", "file:///tmp/x", "git@github.com:a/b/c.git", "ssh://git@github.com/a/b.git"])("refuses %s", (remote) => {
    expect(repoFromRemote(remote)).toBeNull();
  });
});
