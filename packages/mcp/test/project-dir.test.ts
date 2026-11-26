// checkProjectDir. Spec: .kiro/specs/sexton-power, Requirement 2.2, Property 6 (a), (d), on the module alone.
import { lstat, mkdir, mkdtemp, realpath, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { checkProjectDir, type ProjectFs } from "../src/project-dir.js";
import { memoryFs, type Node } from "./support.js";

const TREE: Record<string, Node> = {
  "/work": "dir",
  "/work/app": "dir",
  "/work/app/package.json": "file",
  "/work/nopkg": "dir",
  "/work/dirpkg": "dir",
  "/work/dirpkg/package.json": "dir",
  "/work/linkpkg": "dir",
  "/work/linkpkg/package.json": { link: "/work/app/package.json" },
  "/work/alias": { link: "/work/app" },
  "/work/a.txt": "file",
};

describe("checkProjectDir", () => {
  const fs = memoryFs(TREE);
  const codeOf = async (input: string): Promise<string> => {
    const r = await checkProjectDir(input, fs);
    return r.ok ? `ok:${r.root}` : r.code;
  };
  it("refuses a string that is empty, relative, `~`, `.`, `..`, has a NUL or is over 4096 characters", async () => {
    for (const input of ["", "work/app", "~", ".", "..", "./app", "~/app", "/work/app\u0000", `/${"a".repeat(4096)}`]) {
      expect(await codeOf(input)).toBe("project-dir-not-absolute");
    }
  });
  it("refuses a missing path, a file, a directory with no package.json, and a package.json that is not a plain file", async () => {
    expect(await codeOf("/nowhere")).toBe("project-dir-not-found");
    expect(await codeOf("/work/a.txt")).toBe("project-dir-not-a-directory");
    expect(await codeOf("/work/nopkg")).toBe("package-json-missing");
    expect(await codeOf("/work/dirpkg")).toBe("package-json-missing");
    expect(await codeOf("/work/linkpkg")).toBe("package-json-missing");
  });
  it("accepts a project and returns its real path, through a link and through . and .. segments", async () => {
    expect(await codeOf("/work/app")).toBe("ok:/work/app");
    expect(await codeOf("/work/alias")).toBe("ok:/work/app");
    expect(await codeOf("/work/nopkg/../app")).toBe("ok:/work/app");
    expect(await codeOf("/work/./app/")).toBe("ok:/work/app");
  });
  it("Property 6 (a), (d): accepts only an existing project directory, and normalises", async () => {
    const parts = fc.constantFrom("work", "app", "alias", "nopkg", "..", ".", "a.txt", "nowhere", "dirpkg", "linkpkg");
    await fc.assert(
      fc.asyncProperty(fc.array(parts, { maxLength: 6 }), async (segments) => {
        const input = `/${segments.join("/")}`;
        const r = await checkProjectDir(input, fs);
        if (r.ok) {
          expect(r.root).toBe("/work/app");
          expect(TREE[r.root]).toBe("dir");
        }
      }),
      { numRuns: 1000 },
    );
  });
  it("Property 6 (a): any string that is not an absolute path is refused as not-absolute, whatever its content", async () => {
    await fc.assert(
      fc.asyncProperty(fc.string({ maxLength: 40 }).filter((s) => !s.startsWith("/")), async (input) => {
        const r = await checkProjectDir(input, fs);
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.code).toBe("project-dir-not-absolute");
      }),
      { numRuns: 1000 },
    );
  });
});

describe("checkProjectDir on a real temporary directory", () => {
  it("follows a symbolic link to the real path, and refuses a symlinked package.json", async () => {
    const base = await realpath(await mkdtemp(join(tmpdir(), "sexton-mcp-")));
    try {
      await mkdir(join(base, "real"));
      await writeFile(join(base, "real", "package.json"), "{}");
      await symlink(join(base, "real"), join(base, "alias"));
      await mkdir(join(base, "linked"));
      await symlink(join(base, "real", "package.json"), join(base, "linked", "package.json"));
      const fs: ProjectFs = { realpath: (p) => realpath(p), stat: (p) => stat(p), lstat: (p) => lstat(p) };
      expect(await checkProjectDir(join(base, "alias"), fs)).toEqual({ ok: true, root: join(base, "real") });
      expect(await checkProjectDir(join(base, "real", "..", "alias"), fs)).toEqual({ ok: true, root: join(base, "real") });
      expect(await checkProjectDir(join(base, "linked"), fs)).toEqual({ ok: false, code: "package-json-missing" });
      expect(await checkProjectDir(join(base, "missing"), fs)).toEqual({ ok: false, code: "project-dir-not-found" });
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  });
});
