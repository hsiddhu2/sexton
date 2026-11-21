// The self-scan collector. Requirement 7 of cemetery-theme. Inline fixtures only. No network, no file reads.

import fc from "fast-check";
import { describe, expect, it } from "vitest";
// @ts-expect-error plain JavaScript module without declarations
import { collectDirect } from "../../../../scripts/lib/collect-direct.mjs";

interface Manifest {
  name?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}
interface Workspace {
  dir: string;
  manifest: Manifest;
}
interface Lock {
  packages: Record<string, { version?: string }>;
}
interface Row {
  name: string;
  installedVersion: string;
}
type Collect = (input: { root: Manifest; workspaces: Workspace[]; lock: Lock }) => Row[];
const collect = collectDirect as Collect;

const EXTERNAL = ["alpha", "beta", "gamma", "@scope/delta", "epsilon", "ä-zeta"];
const INTERNAL = ["@sexton/w0", "@sexton/w1", "@sexton/w2"];
const VERSIONS = ["1.0.0", "1.10.0", "1.2.0", "2.0.0", "10.0.0", "0.9.9"];

function manifestOf(name: string | undefined, deps: string[], dev: string[]): Manifest {
  const m: Manifest = {
    dependencies: Object.fromEntries(deps.map((d) => [d, "1.0.0"])),
    devDependencies: Object.fromEntries(dev.map((d) => [d, "1.0.0"])),
  };
  if (name !== undefined) m.name = name;
  return m;
}

const ALL_NAMES = [...EXTERNAL, ...INTERNAL];
const arbNames = fc.uniqueArray(fc.constantFrom(...ALL_NAMES), { maxLength: 6 });
const arbCell = fc.record({ nested: fc.boolean(), root: fc.constantFrom(...VERSIONS), nest: fc.constantFrom(...VERSIONS) });

const arbCase = fc
  .record({
    count: fc.integer({ min: 1, max: 3 }),
    rootDeps: arbNames,
    rootDev: arbNames,
    wsDeps: fc.array(arbNames, { minLength: 3, maxLength: 3 }),
    wsDev: fc.array(arbNames, { minLength: 3, maxLength: 3 }),
    cells: fc.array(arbCell, { minLength: 60, maxLength: 60 }),
  })
  .map((c) => {
    const workspaces: Workspace[] = Array.from({ length: c.count }, (_, i) => ({
      dir: `packages/w${i}`,
      manifest: manifestOf(`@sexton/w${i}`, c.wsDeps[i] ?? [], c.wsDev[i] ?? []),
    }));
    const root = manifestOf("sexton", c.rootDeps, c.rootDev);
    // Lockfile: a root entry for every external name, plus nested entries for any (dir, name), declared or not.
    const lock: Lock = { packages: { "": {} } };
    let n = 0;
    for (const name of ALL_NAMES) {
      const cell = c.cells[n++ % c.cells.length];
      if (cell === undefined) continue;
      lock.packages[`node_modules/${name}`] = { version: cell.root };
      for (const w of workspaces) {
        const nestedCell = c.cells[n++ % c.cells.length];
        if (nestedCell?.nested === true) lock.packages[`${w.dir}/node_modules/${name}`] = { version: nestedCell.nest };
      }
    }
    return { root, workspaces, lock };
  });

function declared(m: Manifest): string[] {
  return [...Object.keys(m.dependencies ?? {}), ...Object.keys(m.devDependencies ?? {})];
}

function oracle(root: Manifest, workspaces: Workspace[], lock: Lock): Row[] {
  const internal = new Set(workspaces.map((w) => w.manifest.name));
  const seen = new Map<string, Row>();
  for (const name of declared(root)) {
    if (internal.has(name)) continue;
    const v = lock.packages[`node_modules/${name}`]?.version;
    if (v !== undefined) seen.set(`${name}\u0000${v}`, { name, installedVersion: v });
  }
  for (const w of workspaces) {
    for (const name of declared(w.manifest)) {
      if (internal.has(name)) continue;
      const v = lock.packages[`${w.dir}/node_modules/${name}`]?.version ?? lock.packages[`node_modules/${name}`]?.version;
      if (v !== undefined) seen.set(`${name}\u0000${v}`, { name, installedVersion: v });
    }
  }
  return [...seen.values()];
}

function codeUnitCompare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

describe("collectDirect", () => {
  it("Feature: cemetery-theme, Property 12: collectDirect", () => {
    fc.assert(
      fc.property(arbCase, fc.nat(), (c, seed) => {
        const rows = collect(c);
        // unique by name and version
        expect(new Set(rows.map((r) => `${r.name}\u0000${r.installedVersion}`)).size).toBe(rows.length);
        // sorted by name then version, code-unit order
        for (let i = 1; i < rows.length; i++) {
          const a = rows[i - 1] as Row;
          const b = rows[i] as Row;
          expect(codeUnitCompare(a.name, b.name) || codeUnitCompare(a.installedVersion, b.installedVersion)).toBeLessThan(0);
        }
        // no workspace-internal names
        const internal = new Set(c.workspaces.map((w) => w.manifest.name));
        for (const r of rows) expect(internal.has(r.name)).toBe(false);
        // resolution order and coverage of the union
        const expected = oracle(c.root, c.workspaces, c.lock);
        expect(rows).toHaveLength(expected.length);
        expect(new Set(rows.map((r) => `${r.name}\u0000${r.installedVersion}`))).toEqual(
          new Set(expected.map((r) => `${r.name}\u0000${r.installedVersion}`)),
        );
        // permutation invariance
        const rotated = c.workspaces.length === 0 ? [] : [...c.workspaces.slice(seed % c.workspaces.length), ...c.workspaces.slice(0, seed % c.workspaces.length)];
        expect(collect({ ...c, workspaces: rotated.reverse() })).toEqual(rows);
        // a declared external name with no lockfile version throws and names the package
        const external = [...declared(c.root), ...c.workspaces.flatMap((w) => declared(w.manifest))].filter((n) => !internal.has(n));
        const victim = external[seed % Math.max(external.length, 1)];
        if (victim !== undefined) {
          const packages = Object.fromEntries(
            Object.entries(c.lock.packages).filter(([k]) => k !== `node_modules/${victim}` && !k.endsWith(`/node_modules/${victim}`)),
          );
          expect(() => collect({ ...c, lock: { packages } })).toThrow(victim);
        }
      }),
      { numRuns: 100 },
    );
  });

  const lock: Lock = {
    packages: {
      "": {},
      "node_modules/vitest": { version: "4.0.0" },
      "node_modules/ajv": { version: "6.15.0" },
      "packages/engine/node_modules/ajv": { version: "8.20.0" },
      "node_modules/vite": { version: "7.0.0" },
      "packages/web/node_modules/vite": { version: "8.3.8" },
      "node_modules/zod": { version: "3.0.0" },
      "packages/api/node_modules/zod": { version: "4.0.0" },
      "node_modules/fast-check": { version: "3.23.2" },
    },
  };
  const root: Manifest = { name: "sexton", devDependencies: { vitest: "4.0.0" } };
  const engine: Workspace = { dir: "packages/engine", manifest: { name: "@sexton/engine", dependencies: { ajv: "8.20.0" } } };
  const web: Workspace = { dir: "packages/web", manifest: { name: "@sexton/web", dependencies: { vite: "8.3.8", "@sexton/api": "1.0.0" } } };
  const api: Workspace = { dir: "packages/api", manifest: { name: "@sexton/api", dependencies: { "@sexton/engine": "1.0.0" } } };

  it("prefers the workspace-nested version over the hoisted one", () => {
    const rows = collect({ root, workspaces: [engine, web, api], lock });
    expect(rows).toEqual([
      { name: "ajv", installedVersion: "8.20.0" },
      { name: "vite", installedVersion: "8.3.8" },
      { name: "vitest", installedVersion: "4.0.0" },
    ]);
  });

  it("skips workspace-internal names", () => {
    const names = collect({ root, workspaces: [engine, web, api], lock }).map((r) => r.name);
    expect(names).not.toContain("@sexton/engine");
    expect(names).not.toContain("@sexton/api");
  });

  it("gives two rows for a name locked at two versions in two workspaces", () => {
    const a: Workspace = { dir: "packages/engine", manifest: { name: "@sexton/engine", dependencies: { zod: "3.0.0" } } };
    const b: Workspace = { dir: "packages/api", manifest: { name: "@sexton/api", dependencies: { zod: "4.0.0" } } };
    const rows = collect({ root: { name: "sexton" }, workspaces: [a, b], lock });
    expect(rows).toEqual([
      { name: "zod", installedVersion: "3.0.0" },
      { name: "zod", installedVersion: "4.0.0" },
    ]);
  });

  it("gives one row when two workspaces declare the same pair", () => {
    const a: Workspace = { dir: "packages/engine", manifest: { name: "@sexton/engine", dependencies: { "fast-check": "3.23.2" } } };
    const b: Workspace = { dir: "packages/api", manifest: { name: "@sexton/api", devDependencies: { "fast-check": "3.23.2" } } };
    expect(collect({ root: { name: "sexton" }, workspaces: [a, b], lock })).toEqual([{ name: "fast-check", installedVersion: "3.23.2" }]);
  });

  it("resolves a root-declared name at the root only", () => {
    const rootAjv: Manifest = { name: "sexton", dependencies: { ajv: "6.15.0" } };
    expect(collect({ root: rootAjv, workspaces: [engine], lock })).toEqual([
      { name: "ajv", installedVersion: "6.15.0" },
      { name: "ajv", installedVersion: "8.20.0" },
    ]);
  });

  it("names the package and the declaring directory when the lockfile has no version", () => {
    const missing: Workspace = { dir: "packages/web", manifest: { name: "@sexton/web", dependencies: { ghostpkg: "1.0.0" } } };
    expect(() => collect({ root, workspaces: [missing], lock })).toThrow("ghostpkg (declared in packages/web)");
  });
});
