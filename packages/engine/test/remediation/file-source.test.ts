// Spec: .kiro/specs/migration-node-sass, Requirements 1, 2, 5.7, properties 23, 24 and 27.

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { capFileSource, MAX_FILE_BYTES, MAX_LISTED, MAX_READ, utf8Length } from "../../src/remediation/capped-source.js";
import { InMemoryFileSource } from "../../src/remediation/file-source.js";
import { NODE_SASS_RECIPE } from "../../src/remediation/node-sass-recipe.js";
import { NOTE_NOT_SCANNED, NOTE_SITES_TRUNCATED } from "../../src/remediation/recipe-notes.js";
import { DEEP_COMBINATOR_COMMENT, LEGACY_RENDER_COMMENT, reviewComments, SCRIPT_COMMENT_END, SCRIPT_COMMENT_START } from "../../src/remediation/review-comments.js";
import { findReviewSites, MAX_REVIEW_SITES } from "../../src/remediation/review-sites.js";
import { runRecipe } from "../../src/remediation/run-migrations.js";
import { hasIgnoredSegment, isSafePath } from "../../src/remediation/safe-path.js";
import type { IntakePackage, RecipeInput } from "../../src/types.js";
import { arbFault, arbFileSet, arbScripts, FlakySource } from "./migration-arbitraries.js";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "src", "remediation");

const dep = (name: string, origin: IntakePackage["origin"] = "devDependencies"): IntakePackage => ({
  name,
  installedVersion: "1.0.0",
  declaredRange: "^1.0.0",
  origin,
  resolution: "locked",
});

/** node-sass and sass listed, no sass-loader: the recipe needs no data and always scans. */
function input(files: RecipeInput["files"], scripts: ReadonlyMap<string, string> = new Map()): RecipeInput {
  return { packageJson: { packages: [dep("node-sass"), dep("sass")], scripts }, files, data: new Map() };
}

function considered(files: ReadonlyMap<string, string>): string[] {
  return [...new Set([...files.keys()].filter((p) => isSafePath(p) && !hasIgnoredSegment(p)))];
}

const spans = (s: string): string => s.replace(/`[^`\n]*`/g, "<c>");

describe("InMemoryFileSource and paths", () => {
  it("answers own entries only", async () => {
    const source = new InMemoryFileSource({ "a.scss": "x", __proto__: "y" } as Record<string, string>);
    expect(await source.listFiles()).toEqual(["a.scss"]);
    expect(await source.readFile("a.scss")).toBe("x");
    expect(await source.readFile("constructor")).toBeUndefined();
    const fromMap = new InMemoryFileSource(new Map([["__proto__", "z"]]));
    expect(await fromMap.readFile("__proto__")).toBe("z");
  });

  it.each([
    ["src/a.scss", true],
    ["a", true],
    ["", false],
    ["/a", false],
    ["a/", false],
    ["a//b", false],
    ["./a", false],
    ["a/../b", false],
    ["a\\b", false],
    ["a\u0001", false],
    ["a\u0085", false],
    ["a ", false],
    ["a‮", false],
    ["a‏", false],
    ["\udc00", false],
    ["😀.scss", true],
    ["x".repeat(401), false],
  ])("isSafePath(%j) is %s", (path, ok) => {
    expect(isSafePath(path)).toBe(ok);
  });

  it("ignores node_modules, .git, dist, build and coverage at any depth", () => {
    for (const p of ["node_modules/a.scss", "a/node_modules/b.scss", ".git/x", "dist/a.css", "packages/x/build/a.js", "coverage/a.js"]) expect(hasIgnoredSegment(p)).toBe(true);
    expect(hasIgnoredSegment("src/builder/a.js")).toBe(false);
  });

  it("no module under src/remediation reads the filesystem or the network directly (Requirement 1.2)", () => {
    for (const file of readdirSync(SRC)) {
      const text = readFileSync(join(SRC, file), "utf8");
      expect(text, file).not.toMatch(/from "node:|require\("node:|\bfetch\(|readFileSync|readdirSync|octokit/i);
    }
  });
});

describe("capFileSource", () => {
  it("Feature: migration-node-sass, Property 24: Caps hold for any file set", async () => {
    await fc.assert(
      fc.asyncProperty(arbFileSet, arbFault, fc.array(fc.string({ maxLength: 6 }), { maxLength: 5 }), async (files, fault, extra) => {
        const inner = new FlakySource(files, fault);
        const capped = capFileSource(inner);
        const listed = await capped.source.listFiles();
        await capped.source.listFiles();
        const texts: (string | undefined)[] = [];
        for (const p of [...listed, ...listed.slice(0, 3), ...extra]) texts.push(await capped.source.readFile(p));
        const counts = capped.counts();
        expect(inner.listCalls).toBe(1);
        expect(inner.reads.length).toBeLessThanOrEqual(MAX_READ);
        expect(new Set(inner.reads).size).toBe(inner.reads.length);
        for (const p of inner.reads) expect(listed).toContain(p);
        expect(counts.listed).toBe(listed.length);
        expect(counts.listed).toBeLessThanOrEqual(MAX_LISTED);
        expect(counts.read).toBe(inner.reads.length);
        for (const t of texts) if (t !== undefined) expect(utf8Length(t)).toBeLessThanOrEqual(MAX_FILE_BYTES);
        const listOk = fault !== "list-rejects" && fault !== "list-not-array";
        expect(counts.performed).toBe(listOk);
        const all = listOk ? considered(files) : [];
        expect(counts.capped).toBe(all.length > MAX_LISTED || listed.length > MAX_READ);
        if (listOk) expect(listed).toEqual([...all].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)).slice(0, MAX_LISTED));
      }),
      { numRuns: 1000 },
    );
  });

  it("measures size in UTF-8 bytes and skips unreadable files", async () => {
    const files = new Map([
      ["a.scss", "x".repeat(MAX_FILE_BYTES)],
      ["b.scss", "é".repeat(MAX_FILE_BYTES / 2 + 1)],
      ["c.scss", "😀".repeat(MAX_FILE_BYTES / 4)],
      ["d/../e.scss", "x"],
    ]);
    const capped = capFileSource(new InMemoryFileSource(files));
    const listed = await capped.source.listFiles();
    expect(listed).toEqual(["a.scss", "b.scss", "c.scss"]);
    expect(await capped.source.readFile("a.scss")).toHaveLength(MAX_FILE_BYTES);
    expect(await capped.source.readFile("b.scss")).toBeUndefined();
    expect(await capped.source.readFile("c.scss")).toBeDefined();
    expect(capped.counts()).toEqual({ performed: true, listed: 3, read: 3, skipped: 2, capped: false });
    expect(utf8Length("aé€😀\ud800")).toBe(1 + 2 + 3 + 4 + 3);
  });
});

describe("review sites", () => {
  it("finds each rule by plain substring, scripts first, files by path and line", () => {
    const { sites, truncated } = findReviewSites(
      [
        { path: "z.css", text: "a\r\n.b /deep/ .c {\r\n" },
        { path: "a.ts", text: 'import s from "node-sass";\ns.render(x);\ns.renderSync(y); s.render(z);\n' },
        { path: "b.js", text: "x.render(y);\n" },
        { path: "c.txt", text: "/deep/" },
      ],
      new Map([
        ["watch", "node-sass -w a"],
        ["build", "webpack"],
        ["css", "npx node-sass a"],
      ]),
    );
    expect(truncated).toBe(false);
    expect(sites).toEqual([
      { path: "package.json", line: null, rule: "node-sass-script", excerpt: "css" },
      { path: "package.json", line: null, rule: "node-sass-script", excerpt: "watch" },
      { path: "a.ts", line: 2, rule: "legacy-render", excerpt: "s.render(x);" },
      { path: "a.ts", line: 3, rule: "legacy-render", excerpt: "s.renderSync(y); s.render(z);" },
      { path: "z.css", line: 2, rule: "deep-combinator", excerpt: ".b /deep/ .c {" },
    ]);
  });

  it("caps at 200 sites and cuts excerpts to 120 code points", () => {
    const text = Array.from({ length: 250 }, () => `/deep/ ${"x".repeat(200)}`).join("\n");
    const { sites, truncated } = findReviewSites([{ path: "a.scss", text }], new Map());
    expect(sites).toHaveLength(MAX_REVIEW_SITES);
    expect(truncated).toBe(true);
    expect(Array.from(sites[0]?.excerpt ?? "")).toHaveLength(120);
  });

  it("Feature: migration-node-sass, Property 23: Review sites come only from listed, non-ignored files", async () => {
    await fc.assert(
      fc.asyncProperty(arbFileSet, arbFault, arbScripts, async (files, fault, scripts) => {
        const outcome = await runRecipe(NODE_SASS_RECIPE, input(new FlakySource(files, fault), scripts));
        if (!outcome.ok) throw new Error("recipe failed");
        const listed = new Set(considered(files));
        for (const site of outcome.result.reviewSites) {
          expect(isSafePath(site.path)).toBe(true);
          expect(hasIgnoredSegment(site.path)).toBe(false);
          if (site.line === null) expect(site.path).toBe("package.json");
          else {
            expect(listed.has(site.path)).toBe(true);
            expect(site.line).toBeGreaterThanOrEqual(1);
            expect(site.line).toBeLessThanOrEqual((files.get(site.path) ?? "").split("\n").length);
          }
        }
        expect(outcome.result.reviewSites.length).toBeLessThanOrEqual(MAX_REVIEW_SITES);
        if (outcome.result.notes.includes(NOTE_SITES_TRUNCATED)) expect(outcome.result.reviewSites).toHaveLength(MAX_REVIEW_SITES);
        expect(outcome.result.notes.includes(NOTE_NOT_SCANNED)).toBe(!outcome.result.scan.performed);
      }),
      { numRuns: 1000 },
    );
  });

  it("Feature: migration-node-sass, Property 27: Review comment paths and bodies", async () => {
    const templates = new Set([
      spans(`${DEEP_COMBINATOR_COMMENT}\`e\``),
      spans(`${LEGACY_RENDER_COMMENT}\`e\``),
      spans(`${SCRIPT_COMMENT_START}\`e\`${SCRIPT_COMMENT_END}`),
    ]);
    await fc.assert(
      fc.asyncProperty(arbFileSet, arbScripts, async (files, scripts) => {
        const outcome = await runRecipe(NODE_SASS_RECIPE, input(new InMemoryFileSource(files), scripts));
        if (!outcome.ok) throw new Error("recipe failed");
        const comments = reviewComments(outcome.result.reviewSites);
        expect(comments).toHaveLength(outcome.result.reviewSites.length);
        for (const c of comments) {
          expect(c.path === "package.json" || files.has(c.path)).toBe(true);
          expect(isSafePath(c.path) && !hasIgnoredSegment(c.path)).toBe(true);
          expect(templates.has(spans(c.body))).toBe(true);
        }
      }),
      { numRuns: 1000 },
    );
  });

  it("without a File source only script sites are found and the scan note is added", async () => {
    const outcome = await runRecipe(NODE_SASS_RECIPE, input(undefined, new Map([["css", "node-sass a"]])));
    expect(outcome).toMatchObject({ ok: true, result: { scan: { performed: false, listed: 0, read: 0, skipped: 0, capped: false }, notes: [NOTE_NOT_SCANNED] } });
    if (outcome.ok) expect(outcome.result.reviewSites.map((s) => s.rule)).toEqual(["node-sass-script"]);
  });
});
