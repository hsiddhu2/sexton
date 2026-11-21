// engine-version tasks 1, 2 and 4. Requirements 1.1, 1.2, 2.1, 2.2, 2.3, 3.1, 3.2, 3.3, 3.4.
// Exploration: version.ts must evaluate where ../package.json is not resolvable.
// Preservation: USER_AGENT format, REPO_URL and export names.

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import fc from "fast-check";
import ts from "typescript";
import { afterEach, describe, expect, it } from "vitest";
import * as engine from "../src/index.js";
import * as versionModule from "../src/version.js";
import { ENGINE_VERSION, REPO_URL, USER_AGENT } from "../src/version.js";

const USER_AGENT_PATTERN = /^sexton\/\d+\.\d+\.\d+ \(\+https:\/\/github\.com\/hsiddhu2\/sexton\)$/;
const EXPORT_NAMES = ["ENGINE_VERSION", "REPO_URL", "USER_AGENT"];

const tempFolders: string[] = [];

afterEach(() => {
  for (const folder of tempFolders.splice(0)) {
    rmSync(folder, { recursive: true, force: true });
  }
});

// T1: no change to the text, no manifest beside the module.
// T2: createRequire replaced by a stub whose returned require throws.
const THROWING_STUB =
  "const createRequire = () => () => { throw new Error(\"Cannot find module '../package.json'\"); };";
const TRANSFORMS: ReadonlyArray<readonly [string, (js: string) => string]> = [
  ["T1 no manifest beside the module", (js) => js],
  ["T2 createRequire replaced by a throwing stub", (js) => js.replace(/import\s*\{\s*createRequire\s*\}\s*from\s*["']node:module["'];?/, THROWING_STUB)],
];

describe("exploration: version.ts evaluates without package.json (1.1, 1.2, 2.1, 2.2)", () => {
  it.each(TRANSFORMS)("%s", async (_name, transform) => {
    const source = readFileSync(new URL("../src/version.ts", import.meta.url), "utf8");
    const transpiled = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
    }).outputText;

    const root = mkdtempSync(join(tmpdir(), "sexton-version-"));
    tempFolders.push(root);
    mkdirSync(join(root, "a"));
    const file = join(root, "a", "version.js");
    writeFileSync(file, transform(transpiled));

    expect(existsSync(join(root, "package.json"))).toBe(false);

    const ns = (await import(pathToFileURL(file).href)) as Record<string, unknown>;
    expect(Object.keys(ns).sort()).toEqual(EXPORT_NAMES);
    expect(ns["USER_AGENT"]).toMatch(USER_AGENT_PATTERN);
  });
});

describe("drift (2.3)", () => {
  it("ENGINE_VERSION equals the version in packages/engine/package.json", () => {
    const manifest = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version: string };
    expect(ENGINE_VERSION).toBe(manifest.version);
  });
});

describe("preservation (3.1, 3.2, 3.3, 3.4)", () => {
  it("USER_AGENT is the template over ENGINE_VERSION and REPO_URL and matches the pattern", () => {
    expect(USER_AGENT).toBe(`sexton/${ENGINE_VERSION} (+${REPO_URL})`);
    expect(USER_AGENT).toMatch(USER_AGENT_PATTERN);
  });

  it("REPO_URL is unchanged", () => {
    expect(REPO_URL).toBe("https://github.com/hsiddhu2/sexton");
  });

  it("version.ts exports exactly the recorded names", () => {
    expect(Object.keys(versionModule).sort()).toEqual(EXPORT_NAMES);
  });

  it("the engine index provides the same three values", () => {
    expect(engine.ENGINE_VERSION).toBe(ENGINE_VERSION);
    expect(engine.REPO_URL).toBe(REPO_URL);
    expect(engine.USER_AGENT).toBe(USER_AGENT);
  });

  it("the template matches the pattern for any semver-shaped version", () => {
    fc.assert(
      fc.property(fc.tuple(fc.nat(), fc.nat(), fc.nat()), (parts) => {
        const version = parts.join(".");
        expect(`sexton/${version} (+${REPO_URL})`).toMatch(USER_AGENT_PATTERN);
      }),
      { numRuns: 100 },
    );
  });
});
