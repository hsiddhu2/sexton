// Spec release: the two published packages, server.json, the release check and the release workflow.
// Properties 1 to 5. Requirements 2.1 to 2.7, 3.1 to 3.6, 4.1 to 4.4.

import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import fc from "fast-check";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NODE_FLOOR, publishedManifest, RELEASE_PACKAGES, REPOSITORY_URL, releaseProblems, thirdPartyDirs } from "../../../scripts/lib/release.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const text = (path: string): string => readFileSync(join(ROOT, path), "utf8");
type Json = Record<string, unknown>;
type ServerJson = Json & { packages: [Json] };
const versionOf = (workspace: string): string => (JSON.parse(text(`packages/${workspace}/package.json`)) as { version: string }).version;
const manifests = (): Json[] => RELEASE_PACKAGES.map((def) => publishedManifest(def, versionOf(def.workspace)) as Json);
const serverJson = (): ServerJson => JSON.parse(text("packages/mcp/server.json")) as ServerJson;
const pkgAt = (m: Json[], i: number): Json => m[i] as Json;
const tagOf = (): string => `v${versionOf("mcp")}`;
const WORKFLOW = text(".github/workflows/release.yml");

describe("Feature: release, Property 1: the tag of the packages passes the release check", () => {
  it("finds no problem for the tag that matches both packages", () => {
    expect(versionOf("cli")).toBe(versionOf("mcp"));
    expect(releaseProblems(tagOf(), manifests(), serverJson())).toEqual([]);
  });

  it("rejects every other tag, near misses included", () => {
    const near = fc.constantFrom("v0.1.1", "v0.2.0", "v1.1.0", "0.1.0", "v0.1", "v0.1.0-rc.1", "v01.1.0", "v0.01.0", "V0.1.0", " v0.1.0", "v0.1.0 ", "v0.1.0\n");
    fc.assert(
      fc.property(fc.oneof(near, fc.string({ maxLength: 20 })), (tag) => {
        fc.pre(tag !== tagOf());
        expect(releaseProblems(tag, manifests(), serverJson()).length).toBeGreaterThan(0);
      }),
      { numRuns: 100 },
    );
  });
});

describe("Feature: release, Property 2: any one setting out of step fails the release check", () => {
  const edits: readonly [string, (m: Json[], s: ServerJson) => void][] = [
    ["CLI version", (m) => { pkgAt(m, 0)["version"] = "9.9.9"; }],
    ["server name", (m) => { pkgAt(m, 1)["name"] = "@sexton/mcp"; }],
    ["a dependency on the engine", (m) => { pkgAt(m, 0)["dependencies"] = { "@sexton/engine": "0.2.0" }; }],
    ["a peer dependency", (m) => { pkgAt(m, 1)["peerDependencies"] = { zod: "4.6.7" }; }],
    ["CLI bin", (m) => { pkgAt(m, 0)["bin"] = { sexton: "dist/bin.js" }; }],
    ["an extra bin", (m) => { pkgAt(m, 1)["bin"] = { "sexton-mcp": "sexton-mcp.mjs", sexton: "sexton-mcp.mjs" }; }],
    ["a prepublish script", (m) => { pkgAt(m, 0)["scripts"] = { prepublishOnly: "node x.js" }; }],
    ["CLI access", (m) => { pkgAt(m, 0)["publishConfig"] = { provenance: true }; }],
    ["server provenance", (m) => { pkgAt(m, 1)["publishConfig"] = { access: "public" }; }],
    ["server repository", (m) => { pkgAt(m, 1)["repository"] = { type: "git", url: "https://github.com/someone/else.git" }; }],
    ["CLI private", (m) => { pkgAt(m, 0)["private"] = true; }],
    ["CLI engines", (m) => { pkgAt(m, 0)["engines"] = { node: ">=22" }; }],
    ["mcpName", (m) => { pkgAt(m, 1)["mcpName"] = "io.github.someone/sexton"; }],
    ["server.json version", (_m, s) => { s["version"] = "0.0.1"; }],
    ["server.json identifier", (_m, s) => { s.packages[0]["identifier"] = "@sexton/mcp"; }],
    ["server.json package version", (_m, s) => { s.packages[0]["version"] = "0.0.1"; }],
  ];

  it("reports a problem for each edit", () => {
    fc.assert(
      fc.property(fc.constantFrom(...edits), ([, edit]) => {
        const m = manifests();
        const s = serverJson();
        edit(m, s);
        expect(releaseProblems(tagOf(), m, s).length).toBeGreaterThan(0);
      }),
      { numRuns: 100 },
    );
  });
});

describe("Feature: release, Property 3: third-party packages are named from the bundle's inputs", () => {
  it("names each package once, scoped or not, nested or not, and skips workspace code", () => {
    const seg = fc.stringMatching(/^[a-z][a-z0-9-]{0,8}$/);
    const pkg = fc.oneof(seg, fc.tuple(seg, seg).map(([s, n]) => `@${s}/${n}`));
    fc.assert(
      fc.property(fc.array(fc.tuple(fc.boolean(), pkg, seg), { maxLength: 12 }), fc.array(seg, { maxLength: 4 }), (entries, own) => {
        const inputs = [
          ...entries.map(([nested, name, file]) => `${nested ? "packages/engine/" : ""}node_modules/${name}/dist/${file}.js`),
          ...own.map((f) => `packages/cli/dist/${f}.js`),
        ];
        const dirs = thirdPartyDirs(inputs);
        const expected = new Set(entries.map(([nested, name]) => `${nested ? "packages/engine/" : ""}node_modules/${name}`));
        expect(new Set(dirs)).toEqual(expected);
        expect(dirs).toHaveLength(expected.size);
      }),
      { numRuns: 100 },
    );
  });
});

describe("Feature: release, Property 4: each published folder is one bundle with no dependency", () => {
  let out: string;
  beforeAll(() => {
    out = mkdtempSync(join(tmpdir(), "sexton-release-"));
    execFileSync(process.execPath, [join(ROOT, "scripts/build-release.mjs"), "--out", out], { cwd: ROOT, stdio: "pipe" });
  }, 120_000);
  afterAll(() => rmSync(out, { recursive: true, force: true }));

  it.each(RELEASE_PACKAGES.map((def) => [def.name, def] as const))("builds %s with only its bundle, README, LICENSE, NOTICE and notices", (_name, def) => {
    const dir = join(out, def.name);
    expect(readdirSync(dir).sort()).toEqual([`${def.bin}.mjs`, "LICENSE", "NOTICE", "README.md", "THIRD-PARTY-NOTICES.md", "package.json"].sort());
    const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8")) as Json;
    expect(pkg).toEqual(publishedManifest(def, versionOf(def.workspace)));
    expect(JSON.stringify(pkg)).not.toContain("@sexton/");
    expect(pkg["repository"]).toEqual({ type: "git", url: REPOSITORY_URL, directory: `packages/${def.workspace}` });
    expect(pkg["engines"]).toEqual({ node: NODE_FLOOR });
    const bundle = readFileSync(join(dir, `${def.bin}.mjs`), "utf8");
    expect(bundle.startsWith("#!/usr/bin/env node\n")).toBe(true);
    expect(statSync(join(dir, `${def.bin}.mjs`)).mode & 0o111).not.toBe(0);
    expect(bundle).not.toMatch(/sourceMappingURL|\/Users\/|\/home\/|(from|require\()\s*["']@sexton\//);
    expect(readFileSync(join(dir, "LICENSE"), "utf8")).toBe(text("LICENSE"));
    expect(readFileSync(join(dir, "NOTICE"), "utf8")).toBe(text("NOTICE"));
    expect(readFileSync(join(dir, "README.md"), "utf8")).toContain(`# ${def.name}\n`);
  });

  it("lists every bundled third-party package with its licence text", () => {
    const heads = (name: string): string[] => readFileSync(join(out, name, "THIRD-PARTY-NOTICES.md"), "utf8").split("\n").filter((l) => l.startsWith("## ")).map((l) => l.slice(3).split(" ")[0] ?? "");
    const engineDeps = ["ajv", "fast-deep-equal", "fast-uri", "json-schema-traverse", "semver", "yaml"];
    expect(heads("sexton")).toEqual(engineDeps);
    expect(heads("sexton-mcp")).toEqual(["@modelcontextprotocol/core", "@modelcontextprotocol/server", ...engineDeps, "zod"]);
  });

  it("builds sexton-mcp.mjs byte for byte as the Kiro Power's Bundle", () => {
    expect(readFileSync(join(out, "sexton-mcp", "sexton-mcp.mjs"))).toEqual(readFileSync(join(ROOT, "powers/sexton/server/sexton-mcp.mjs")));
  });

  it("prints the sexton package's version from the bundle", () => {
    const printed = execFileSync(process.execPath, [join(out, "sexton", "sexton.mjs"), "--version"], { encoding: "utf8" });
    expect(printed).toBe(`${versionOf("cli")}\n`);
  });

  it("refuses --out with no folder, so it never empties the current directory", () => {
    for (const args of [["--out"], ["--out", ""], ["--out", "--x"], ["extra"]]) {
      let status = 0;
      try {
        execFileSync(process.execPath, [join(ROOT, "scripts/build-release.mjs"), ...args], { cwd: out, stdio: "pipe" });
      } catch (e) {
        status = (e as { status: number }).status;
      }
      expect(status, args.join(" ")).toBe(2);
    }
    expect(readdirSync(out).sort()).toEqual(["sexton", "sexton-mcp"]);
  });

  it("passes the release check on the built folders", () => {
    const printed = execFileSync(process.execPath, [join(ROOT, "scripts/release-check.mjs"), tagOf(), "--dir", out], { encoding: "utf8" });
    expect(printed).toContain(`sexton@${versionOf("cli")}, sexton-mcp@${versionOf("mcp")}`);
  });

  it("gives server.json the registry's required fields within its limits", () => {
    const s = serverJson();
    expect(s["$schema"]).toBe("https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json");
    expect(String(s["name"])).toMatch(/^io\.github\.hsiddhu2\/[a-zA-Z0-9._-]+$/);
    expect(String(s["description"]).length).toBeLessThanOrEqual(100);
    expect(s["packages"]).toEqual([
      { registryType: "npm", registryBaseUrl: "https://registry.npmjs.org", identifier: "sexton-mcp", version: versionOf("mcp"), runtimeHint: "npx", transport: { type: "stdio" } },
    ]);
  });
});

describe("Feature: release, Property 5: the release workflow publishes only from a version tag, with OIDC and no secret", () => {
  it("runs on a pushed version tag and nothing else", () => {
    expect(WORKFLOW).toMatch(/^on:\n {2}push:\n {4}tags:\n {6}- "v\[0-9\]\+\.\[0-9\]\+\.\[0-9\]\+"\n\n/m);
    expect(WORKFLOW).not.toMatch(/pull_request|workflow_dispatch|workflow_call|branches:/);
  });

  it("asks for contents read and id-token write only, and gives the gates job no OIDC token", () => {
    expect(WORKFLOW).toMatch(/^permissions:\n {2}contents: read\n {2}id-token: write\n\n/m);
    const gates = WORKFLOW.slice(WORKFLOW.indexOf("  gates:"), WORKFLOW.indexOf("  publish:"));
    expect(gates).toMatch(/ {4}permissions:\n {6}contents: read\n {4}steps:/);
    expect(WORKFLOW.match(/^\s+[a-z-]+: (read|write)$/gm)?.map((l) => l.trim())).toEqual([
      "contents: read", "id-token: write", "contents: read", "contents: read", "id-token: write",
    ]);
  });

  it("pins every action to a full commit SHA and uses no secret, token, cache or install script while publishing", () => {
    const uses = [...WORKFLOW.matchAll(/uses: (\S+)/g)].map((m) => m[1]);
    expect(uses.length).toBeGreaterThan(0);
    for (const ref of uses) expect(ref).toMatch(/^[\w.-]+\/[\w.-]+@[0-9a-f]{40}$/);
    expect(WORKFLOW).not.toMatch(/secrets\.|NPM_TOKEN|NODE_AUTH_TOKEN|cache: npm|actions\/cache/);
    expect(WORKFLOW.match(/package-manager-cache: false/g)).toHaveLength(2);
    const publish = WORKFLOW.slice(WORKFLOW.indexOf("  publish:"));
    expect(publish).toContain("- run: npm ci --ignore-scripts\n");
  });

  it("builds the folders, checks the tag, then publishes sexton and sexton-mcp in that order", () => {
    const at = (s: string): number => WORKFLOW.indexOf(s);
    expect(at("node scripts/build-release.mjs")).toBeGreaterThan(0);
    expect(at('node scripts/release-check.mjs "$GITHUB_REF_NAME"')).toBeGreaterThan(at("node scripts/build-release.mjs"));
    expect(at("npm publish")).toBeGreaterThan(at('node scripts/release-check.mjs "$GITHUB_REF_NAME"'));
    expect(WORKFLOW).toContain("for name in sexton sexton-mcp; do");
    expect(WORKFLOW).toContain('npm publish "./build/release/$name"');
    expect(RELEASE_PACKAGES.map((d) => d.name)).toEqual(["sexton", "sexton-mcp"]);
  });
});
