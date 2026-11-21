// Spec: .kiro/specs/migration-node-sass, Requirements 3, 4, properties 21, 22 and 28.

import fc from "fast-check";
import semver from "semver";
import { describe, expect, it } from "vitest";
import { effectiveVersion, SASS_LOADER_MINIMUM, sassCandidates, sassLoaderCandidates } from "../../src/remediation/migration-candidates.js";
import { NODE_SASS_RECIPE } from "../../src/remediation/node-sass-recipe.js";
import { DEFAULT_RECIPE_REGISTRY, EMPTY_RECIPE_REGISTRY } from "../../src/remediation/recipes.js";
import {
  NOTE_NOT_SCANNED,
  NOTE_SASS_LOADER_RAISED,
  NOTE_SASS_LOADER_UNCHANGED,
  NOTE_SASS_LOADER_UNKNOWN,
  RECIPE_NOTES,
} from "../../src/remediation/recipe-notes.js";
import { runRecipe } from "../../src/remediation/run-migrations.js";
import { isPassing } from "../../src/remediation/select-bump.js";
import type { BumpDataResult, IntakePackage, MigrationData, PackageJsonEdit, PackageJsonView, RecipeInput, RecipeOutcome } from "../../src/types.js";
import { arbMigrationData, arbView, arbVersionData } from "./migration-arbitraries.js";

const run = (packageJson: PackageJsonView, data: MigrationData): Promise<RecipeOutcome> => NODE_SASS_RECIPE.run({ packageJson, files: undefined, data });

const dep = (name: string, installedVersion: string, declaredRange: string, origin: IntakePackage["origin"] = "devDependencies"): IntakePackage => ({
  name,
  installedVersion,
  declaredRange,
  origin,
  resolution: "locked",
});

const clean = (published: string[]): BumpDataResult => ({ ok: true, published, deprecated: new Set(), advisories: new Map(published.map((v) => [v, []])) });

function byVersion(a: string, b: string): number {
  return semver.compare(a, b) || (a < b ? -1 : a > b ? 1 : 0);
}

const releasesOf = (published: readonly string[]): string[] =>
  [...new Set(published.filter((v) => semver.valid(v) === v && semver.prerelease(v) === null))].sort(byVersion);

/** Applies Edits to a view as an Executor would, with the installed version of each new range. */
function applyEdits(view: PackageJsonView, edits: readonly PackageJsonEdit[]): PackageJsonView {
  let packages = [...view.packages];
  for (const e of edits) {
    if (e.op === "remove-dependency") packages = packages.filter((p) => p.name !== e.name);
    else {
      const installed = semver.minVersion(e.range)?.version ?? "unresolved";
      const next = dep(e.name, installed, e.range, e.section);
      packages = e.op === "add-dependency" ? [...packages, next] : packages.map((p) => (p.name === e.name ? { ...next, origin: p.origin } : p));
    }
  }
  return { ...view, packages };
}

describe("node-sass to sass recipe", () => {
  it("is the only default recipe", () => {
    expect([...DEFAULT_RECIPE_REGISTRY.keys()]).toEqual(["node-sass"]);
    expect(DEFAULT_RECIPE_REGISTRY.get("node-sass")).toBe(NODE_SASS_RECIPE);
    expect([NODE_SASS_RECIPE.id, NODE_SASS_RECIPE.from, NODE_SASS_RECIPE.to]).toEqual(["node-sass-to-sass", "node-sass", "sass"]);
    expect(EMPTY_RECIPE_REGISTRY.size).toBe(0);
  });

  it("Feature: migration-node-sass, Property 22: Edit names and order", async () => {
    await fc.assert(
      fc.asyncProperty(arbView, arbMigrationData, async (view, data) => {
        const outcome = await run(view, data);
        expect(await run(view, data)).toEqual(outcome);
        if (!outcome.ok) {
          expect(outcome.reason.startsWith("migration data unavailable: ")).toBe(true);
          return;
        }
        const edits = outcome.result.edits;
        const order = ["remove-dependency", "add-dependency", "set-range"];
        const names: Record<string, string> = { "remove-dependency": "node-sass", "add-dependency": "sass", "set-range": "sass-loader" };
        expect(edits.map((e) => order.indexOf(e.op))).toEqual([...edits.map((e) => order.indexOf(e.op))].sort());
        expect(new Set(edits.map((e) => e.op)).size).toBe(edits.length);
        for (const e of edits) {
          expect(e.path).toBe("package.json");
          expect(e.name).toBe(names[e.op]);
          expect(Object.keys(e).every((k) => ["path", "op", "section", "name", "range"].includes(k))).toBe(true);
        }
        const nodeSass = view.packages.find((p) => p.name === "node-sass");
        expect(edits.length > 0).toBe(nodeSass !== undefined);
        const add = edits.find((e) => e.op === "add-dependency");
        if (add !== undefined) expect(add.section).toBe(nodeSass?.origin);
        expect(add !== undefined).toBe(nodeSass !== undefined && !view.packages.some((p) => p.name === "sass"));
        expect(outcome.result.filesChanged).toEqual(edits.length > 0 ? ["package.json"] : []);
        for (const n of outcome.result.notes) expect(RECIPE_NOTES.has(n)).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it("Feature: migration-node-sass, Property 21: Recipe idempotence", async () => {
    await fc.assert(
      fc.asyncProperty(arbView, arbMigrationData, async (view, data) => {
        const first = await run(view, data);
        if (!first.ok || first.result.edits.length === 0) return;
        const after = applyEdits(view, first.result.edits);
        const second = await run(after, data);
        expect(second.ok && second.result.edits).toEqual([]);
        expect(after.packages.some((p) => p.name === "node-sass")).toBe(false);
        expect(after.packages.some((p) => p.name === "sass")).toBe(true);
        const loader = after.packages.find((p) => p.name === "sass-loader");
        const v = loader === undefined ? null : effectiveVersion(loader);
        if (loader !== undefined && v !== null && first.result.edits.some((e) => e.name === "sass-loader")) expect(semver.gte(v, SASS_LOADER_MINIMUM)).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it("Feature: migration-node-sass, Property 28: Version choice", async () => {
    await fc.assert(
      fc.asyncProperty(arbVersionData, arbVersionData, fc.constantFrom("6.0.0", "7.1.0", "7.1.9", "unresolved"), async (sass, loader, installed) => {
        const view: PackageJsonView = {
          packages: [dep("node-sass", "7.0.3", "^7.0.3"), dep("sass-loader", installed, installed === "unresolved" ? "^7.0.0" : `~${installed}`)],
          scripts: new Map(),
        };
        const outcome = await run(view, new Map([["sass", sass], ["sass-loader", loader]]));
        const effective = installed === "unresolved" ? "7.0.0" : installed;
        if (sass.ok) {
          const sassList = releasesOf(sass.published).reverse().slice(0, 20);
          expect(sassCandidates(sass.published)).toEqual(sassList);
          const want = sassList.find((v) => isPassing(v, sass.deprecated, sass.advisories));
          const add = outcome.ok ? outcome.result.edits.find((e) => e.op === "add-dependency") : undefined;
          if (want === undefined) expect(outcome).toEqual({ ok: false, reason: `migration data unavailable: no safe version of sass found among ${String(sassList.length)} evaluated candidate versions` });
          else if (outcome.ok) expect(add).toMatchObject({ range: `^${want}` });
        } else expect(outcome).toEqual({ ok: false, reason: `migration data unavailable: ${sass.reason}` });
        if (!outcome.ok || !loader.ok) return;
        const loaderList = releasesOf(loader.published).filter((v) => semver.gte(v, "7.2.0") && semver.gt(v, effective)).slice(0, 20);
        expect(sassLoaderCandidates(loader.published, effective)).toEqual(loaderList);
        const pick = loaderList.find((v) => isPassing(v, loader.deprecated, loader.advisories));
        const raise = outcome.result.edits.find((e) => e.op === "set-range");
        expect(raise).toMatchObject({ range: `${installed === "unresolved" ? "^" : "~"}${pick ?? ""}` });
        expect(pick !== undefined && semver.prerelease(pick) === null && !loader.deprecated.has(pick)).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it("notes for sass-loader compatible, unknown, absent, and when not scanned", async () => {
    const sass = new Map([["sass", clean(["1.0.0", "1.1.0"])]]);
    const base = [dep("node-sass", "7.0.3", "^7.0.3")];
    const notes = async (packages: IntakePackage[]): Promise<readonly string[]> => {
      const o = await runRecipe(NODE_SASS_RECIPE, { packageJson: { packages, scripts: new Map() }, files: undefined, data: sass });
      return o.ok ? o.result.notes : [o.reason];
    };
    expect(await notes([...base, dep("sass-loader", "8.0.0", "^8.0.0")])).toEqual([NOTE_SASS_LOADER_UNCHANGED, NOTE_NOT_SCANNED]);
    expect(await notes([...base, dep("sass-loader", "7.2.0", "7.2.0")])).toEqual([NOTE_SASS_LOADER_UNCHANGED, NOTE_NOT_SCANNED]);
    expect(await notes([...base, dep("sass-loader", "unresolved", "latest")])).toEqual([NOTE_SASS_LOADER_UNKNOWN, NOTE_NOT_SCANNED]);
    expect(await notes(base)).toEqual([NOTE_NOT_SCANNED]);
    const raised = await runRecipe(NODE_SASS_RECIPE, {
      packageJson: { packages: [...base, dep("sass-loader", "7.1.0", "~7.1.0", "dependencies")], scripts: new Map() },
      files: undefined,
      data: new Map([...sass, ["sass-loader", clean(["7.1.0", "7.2.0", "8.0.0"])]]),
    } satisfies RecipeInput);
    expect(raised).toMatchObject({ ok: true, result: { notes: [NOTE_SASS_LOADER_RAISED, NOTE_NOT_SCANNED] } });
    if (raised.ok) expect(raised.result.edits.at(-1)).toEqual({ path: "package.json", op: "set-range", section: "dependencies", name: "sass-loader", range: "~7.2.0" });
  });

  it("fixed reasons when data is missing or no version passes", async () => {
    const view: PackageJsonView = { packages: [dep("node-sass", "7.0.3", "^7.0.3"), dep("sass-loader", "7.0.0", "^7.0.0")], scripts: new Map() };
    expect(await run(view, new Map())).toEqual({ ok: false, reason: "migration data unavailable: sass data was not gathered" });
    expect(await run(view, new Map([["sass", clean(["1.0.0"])]]))).toEqual({ ok: false, reason: "migration data unavailable: sass-loader data was not gathered" });
    const deprecatedAll: BumpDataResult = { ok: true, published: ["7.2.0", "7.3.0"], deprecated: new Set(["7.2.0", "7.3.0"]), advisories: new Map() };
    expect(await run(view, new Map([["sass", clean(["1.0.0"])], ["sass-loader", deprecatedAll]]))).toEqual({
      ok: false,
      reason: "migration data unavailable: no safe version of sass-loader found among 2 evaluated candidate versions",
    });
  });

  it("node-sass not listed: no edit; sass already listed: no add and no sass data needed", async () => {
    const none = await run({ packages: [dep("sass", "1.0.0", "^1.0.0")], scripts: new Map() }, new Map());
    expect(none.ok && none.result.edits).toEqual([]);
    const listed = await run({ packages: [dep("node-sass", "7.0.3", "^7.0.3", "dependencies"), dep("sass", "1.0.0", "^1.0.0")], scripts: new Map() }, new Map());
    expect(listed.ok && listed.result.edits).toEqual([{ path: "package.json", op: "remove-dependency", section: "dependencies", name: "node-sass" }]);
  });

  it("a recipe that throws or returns junk becomes a fixed failure", async () => {
    const input: RecipeInput = { packageJson: { packages: [], scripts: new Map() }, files: undefined, data: new Map() };
    const throwing = { id: "t", from: "a", to: "b", run: () => Promise.reject(new Error("secret")) };
    const junk = { id: "j", from: "a", to: "b", run: () => Promise.resolve({ ok: true } as unknown as RecipeOutcome) };
    expect(await runRecipe(throwing, input)).toEqual({ ok: false, reason: "migration could not be run" });
    expect(await runRecipe(junk, input)).toEqual({ ok: false, reason: "migration could not be run" });
    const scan = { performed: false, listed: 0, read: 0, skipped: 0, capped: false };
    const rogue = {
      id: "r",
      from: "a",
      to: "b",
      run: (): Promise<RecipeOutcome> =>
        Promise.resolve({
          ok: true,
          result: {
            edits: [{ path: ".github/workflows/x.yml", op: "remove-dependency", section: "dependencies", name: "a" } as unknown as PackageJsonEdit],
            reviewSites: [
              { path: "../etc/passwd", line: 1, rule: "deep-combinator", excerpt: "x" },
              { path: "package.json", line: null, rule: "node-sass-script", excerpt: "s" },
            ],
            filesChanged: [],
            scan,
            notes: [],
          },
        }),
    };
    const out = await runRecipe(rogue, input);
    expect(out.ok && out.result.edits).toEqual([]);
    expect(out.ok && out.result.reviewSites.map((s) => s.path)).toEqual(["package.json"]);
  });
});
