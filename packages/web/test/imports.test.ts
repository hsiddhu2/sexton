import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

// Feature: cemetery-ui. Static checks over packages/web/src (requirements 1.3, 1.16, 2.18, 2.21).

// Vitest runs each workspace package with its own directory as cwd.
const WEB_ROOT = process.cwd();
const SRC = join(WEB_ROOT, "src");

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(path));
    else if (/\.(ts|tsx|css|html)$/.test(entry.name)) out.push(path);
  }
  return out;
}

function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
}

const FILES = walk(SRC).map((path) => ({
  rel: relative(SRC, path).split(sep).join("/"),
  text: stripComments(readFileSync(path, "utf8")),
}));

interface ImportRef {
  readonly specifier: string;
  readonly typeOnly: boolean;
}

function importRefs(text: string): ImportRef[] {
  const refs: ImportRef[] = [];
  const fromRe = /\b(import|export)\s+(type\s+)?[^;'"`]*?\bfrom\s*["']([^"']+)["']/g;
  for (const m of text.matchAll(fromRe)) {
    refs.push({ specifier: m[3] ?? "", typeOnly: m[2] !== undefined });
  }
  const bareRe = /\bimport\s*["']([^"']+)["']/g;
  for (const m of text.matchAll(bareRe)) refs.push({ specifier: m[1] ?? "", typeOnly: false });
  const dynRe = /\bimport\s*\(\s*["']([^"']+)["']/g;
  for (const m of text.matchAll(dynRe)) refs.push({ specifier: m[1] ?? "", typeOnly: false });
  return refs;
}

describe("static checks over packages/web/src", () => {
  it("finds source files to check", () => {
    expect(FILES.length).toBeGreaterThan(10);
  });

  it("imports from @sexton/api and @sexton/engine are type-only, and engine is never a runtime import (1.3)", () => {
    const bad: string[] = [];
    for (const f of FILES) {
      for (const ref of importRefs(f.text)) {
        const internal = ref.specifier.startsWith("@sexton/");
        const contract = /(^|\/)contract(\.js)?$/.test(ref.specifier);
        if ((internal || contract) && !ref.typeOnly) bad.push(`${f.rel}: ${ref.specifier}`);
        if (ref.specifier.startsWith("@sexton/engine") && !ref.typeOnly) bad.push(`${f.rel}: runtime engine ${ref.specifier}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it("has no HTML injection or eval (2.21)", () => {
    const re = /dangerouslySetInnerHTML|innerHTML|outerHTML|insertAdjacentHTML|\beval\s*\(/;
    expect(FILES.filter((f) => re.test(f.text)).map((f) => f.rel)).toEqual([]);
  });

  it("has no node: import", () => {
    const bad = FILES.filter((f) => importRefs(f.text).some((r) => r.specifier.startsWith("node:"))).map((f) => f.rel);
    expect(bad).toEqual([]);
  });

  it("has no fetch call outside src/load (2.18)", () => {
    const re = /\bfetch\s*\(/;
    const bad = FILES.filter((f) => !f.rel.startsWith("load/") && re.test(f.text)).map((f) => f.rel);
    expect(bad).toEqual([]);
  });

  it("has no registry, osv, deps.dev or github host string (2.18)", () => {
    const re = /registry\.npmjs|npmjs\.(org|com)|osv\.dev|deps\.dev|github\.com|githubusercontent|api\.github/i;
    // One exception, spec remediate design decision 14: the pull request link prefix, which only checks a URL
    // before it is shown as a link. No request goes to it; fetch is only called with the API base.
    const PR_PREFIX_LINE = 'export const PR_PREFIX = "https://github.com/hsiddhu2/sexton-demo/pull/";';
    // Spec clean-site, design C2 and 12.2: header/repo-input.ts reads a github.com link typed into the Scan field and
    // writes the canonical https://github.com/owner/name that is sent only as the repo= value to the API base; the
    // failure cards in load/scan-failure.ts ask for "a github.com link". Only that host name is allowed there, and
    // neither file calls fetch (the check above).
    const READS_LINKS = new Set(["header/repo-input.ts", "load/scan-failure.ts"]);
    const text = (f: { rel: string; text: string }) =>
      READS_LINKS.has(f.rel) ? f.text.replace(/(?<![\w.])github(\\)?\.com(?![\w.-])/g, "") : f.rel === "load/remediate-client.ts" ? f.text.replace(PR_PREFIX_LINE, "") : f.text;
    expect(FILES.filter((f) => re.test(text(f))).map((f) => f.rel)).toEqual([]);
    expect(FILES.find((f) => f.rel === "load/remediate-client.ts")?.text).toContain(PR_PREFIX_LINE);
  });
});

describe("packages/web/package.json pins (1.16)", () => {
  const pkg = JSON.parse(readFileSync(join(WEB_ROOT, "package.json"), "utf8")) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  const EXPECTED_DEV: Record<string, string> = {
    "@playwright/test": "1.65.1",
    "@sexton/api": "0.1.0",
    "@testing-library/dom": "10.4.2",
    "@testing-library/react": "16.3.3",
    "@testing-library/user-event": "14.6.13",
    "@types/react": "19.3.0",
    "@types/react-dom": "19.3.0",
    "@vitejs/plugin-react": "6.3.0",
    "axe-core": "4.14.1",
    jsdom: "31.0.1",
    vite: "8.3.8",
  };

  it("pins every version exactly", () => {
    const all = { ...pkg.dependencies, ...pkg.devDependencies };
    for (const [name, version] of Object.entries(all)) {
      expect(version, name).toMatch(/^\d+\.\d+\.\d+$/);
    }
  });

  it("has react and react-dom as the only runtime dependencies", () => {
    expect(pkg.dependencies).toEqual({ react: "19.3.1", "react-dom": "19.3.1" });
  });

  it("matches the design.md dev pins", () => {
    expect(pkg.devDependencies).toEqual(EXPECTED_DEV);
  });
});
