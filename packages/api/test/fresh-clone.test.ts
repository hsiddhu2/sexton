// Static checks that the test suites pass on a fresh clone in any workspace order. Spec cemetery-time-fixes, 1.3, 1.5, 1.6, 1.7.
// A test that builds or reads a path into another workspace's generated files (the demo files, dist output, build/ or
// cdk.out) fails here, unless the reading workspace's own setup creates that file first. No network.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

/** Calls that build or read a path. */
const PATH_CALL = /\b(?:join|resolve|readFileSync|existsSync|readdirSync)\(|\bnew URL\(/;

/** Generated paths: the demo files, dist output, build/ and cdk.out. */
const GENERATED = [/public["/, ]+demo/, /["/]dist(?:-e2e|-types|-types-node)?["/]/, /["/]build["/]/, /["/]cdk\.out["/]/];

/** Files allowed to name a generated path, with the reason. */
const ALLOWED: Readonly<Record<string, string>> = {
  "packages/web/test/support/demo-scan.ts": "web reads its own demo scan, created by its globalSetup and pretest",
  "packages/web/test/global-setup.ts": "creates the demo files when they are missing",
  "packages/web/e2e/polish.spec.ts": "web e2e reads its own demo scan, created by pretest:e2e",
  "packages/web/e2e/remediate.spec.ts": "web e2e reads its own demo scan, created by pretest:e2e",
  "infra/test/nag.test.ts": "skips cdk.out while it walks infra/",
};

const ROOTS = [
  ...readdirSync(join(ROOT, "packages")).map((p) => join("packages", p, "test")),
  join("packages", "web", "e2e"),
  join("infra", "test"),
];

function walk(dir: string, out: string[]): string[] {
  let names: string[];
  try {
    names = readdirSync(join(ROOT, dir));
  } catch {
    return out;
  }
  for (const name of names) {
    if (name === "fixtures" || name === "node_modules") continue;
    const rel = join(dir, name);
    if (statSync(join(ROOT, rel)).isDirectory()) walk(rel, out);
    else if (/\.(?:ts|tsx|mjs)$/.test(name)) out.push(rel.split(sep).join("/"));
  }
  return out;
}

/** The lines of `text` that build or read a generated path. */
export function generatedPathReads(text: string): string[] {
  return text.split("\n").filter((line) => PATH_CALL.test(line) && GENERATED.some((p) => p.test(line)));
}

describe("fresh-clone independence", () => {
  const files = ROOTS.flatMap((dir) => walk(dir, []));

  it("walks the test folders of every workspace", () => {
    expect(files.length).toBeGreaterThan(100);
    for (const dir of ["packages/api/test/", "packages/web/test/", "packages/web/e2e/", "packages/engine/test/", "infra/test/"]) {
      expect(files.some((f) => f.startsWith(dir))).toBe(true);
    }
  });

  it("no test reads another workspace's generated files", () => {
    const offenders = files.filter((f) => !(f in ALLOWED)).flatMap((f) => generatedPathReads(readFileSync(join(ROOT, f), "utf8")).map((line) => `${f}: ${line.trim()}`));
    expect(offenders).toEqual([]);
  });

  it("flags a line like the old timeline-size read of the web demo scan", () => {
    const line = 'const DEMO = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "web", "pub' + 'lic", "demo", "scan.json");';
    expect(generatedPathReads(line)).toEqual([line]);
    expect(generatedPathReads('readFileSync(join(here, "..", "di' + 'st", "index.js"))')).toHaveLength(1);
    expect(generatedPathReads('existsSync(join(ROOT, "bui' + 'ld", "x"))')).toHaveLength(1);
    expect(generatedPathReads('readdirSync(join(ROOT, "infra", "cdk' + '.out", "x"))')).toHaveLength(1);
    expect(generatedPathReads('join(here, "..", "..", "engine", "test", "fixtures")')).toEqual([]);
  });

  it("every allowed file exists and still names a generated path", () => {
    for (const f of Object.keys(ALLOWED)) {
      const text = readFileSync(join(ROOT, f), "utf8");
      expect(GENERATED.some((p) => p.test(text))).toBe(true);
    }
  });
});

describe("the outer tree never checks or tests build/", () => {
  it("eslint ignores build/**", () => {
    const text = readFileSync(join(ROOT, "eslint.config.js"), "utf8");
    expect(text).toContain('"build/**"');
  });

  it("the root tsconfig has no files of its own", () => {
    const config = JSON.parse(readFileSync(join(ROOT, "tsconfig.json"), "utf8")) as { files?: unknown; include?: unknown };
    expect(config.files).toEqual([]);
    expect(config.include).toBeUndefined();
  });

  it("each package vitest config includes only test/** paths", () => {
    const configs = [...readdirSync(join(ROOT, "packages")).map((p) => join("packages", p, "vitest.config.ts")), join("infra", "vitest.config.ts")];
    for (const c of configs) {
      const text = readFileSync(join(ROOT, c), "utf8");
      const include = /include:\s*\[([^\]]*)\]/.exec(text.replace(/typecheck:\s*\{[^}]*\}/, ""));
      expect(include, c).not.toBeNull();
      const entries = [...(include?.[1] ?? "").matchAll(/"([^"]+)"/g)].map((m) => m[1]);
      expect(entries.length, c).toBeGreaterThan(0);
      for (const e of entries) expect(e, c).toMatch(/^test\//);
    }
  });
});
