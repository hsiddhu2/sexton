// Spec release: the package settings, server.json, the release check and the release workflow.
// Properties 1 to 4. Requirements 2.1 to 2.6, 3.1 to 3.6, 4.1 to 4.4.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { PUBLISH_ORDER, REPOSITORY_URL, releaseProblems } from "../../../scripts/lib/release-check.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const text = (path: string): string => readFileSync(join(ROOT, path), "utf8");
type Manifest = Record<string, unknown> & { name: string; version: string };
type Manifests = { engine: Manifest; cli: Manifest; mcp: Manifest };
type ServerJson = Record<string, unknown> & { packages: [Record<string, unknown>] };
const manifest = (key: string): Manifest => JSON.parse(text(`packages/${key}/package.json`)) as Manifest;
const manifests = (): Manifests => ({ engine: manifest("engine"), cli: manifest("cli"), mcp: manifest("mcp") });
const serverJson = (): ServerJson => JSON.parse(text("packages/mcp/server.json")) as ServerJson;
const deps = (pkg: Manifest): Record<string, string> => pkg["dependencies"] as Record<string, string>;
const tagOf = (): string => `v${manifest("mcp").version}`;
const WORKFLOW = text(".github/workflows/release.yml");

describe("Feature: release, Property 1: the tag of the packages passes the release check", () => {
  it("finds no problem for the tag that matches the CLI and the server", () => {
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
  const edits: readonly [string, (m: Manifests, s: ServerJson) => void][] = [
    ["cli version", (m) => { m.cli.version = "9.9.9"; }],
    ["engine pin of the CLI", (m) => { deps(m.cli)["@sexton/engine"] = "^0.2.0"; }],
    ["CLI pin of the server", (m) => { deps(m.mcp)["@sexton/cli"] = "0.0.9"; }],
    ["engine access", (m) => { m.engine["publishConfig"] = { provenance: true }; }],
    ["CLI provenance", (m) => { m.cli["publishConfig"] = { access: "public" }; }],
    ["server repository", (m) => { m.mcp["repository"] = { type: "git", url: "https://github.com/someone/else.git" }; }],
    ["engine private", (m) => { m.engine["private"] = true; }],
    ["mcpName", (m) => { m.mcp["mcpName"] = "io.github.someone/sexton"; }],
    ["server.json version", (_m, s) => { s["version"] = "0.0.1"; }],
    ["server.json identifier", (_m, s) => { s.packages[0]["identifier"] = "sexton-mcp"; }],
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

describe("Feature: release, Property 3: each published package ships built output, README, LICENSE and NOTICE only", () => {
  it.each(PUBLISH_ORDER)("sets files, publishConfig, repository, author and engines for %s", (key) => {
    const pkg = manifest(key);
    expect(pkg["files"]).toEqual(["dist/**/*.js", "dist/**/*.d.ts", "NOTICE"]);
    expect(pkg["publishConfig"]).toEqual({ access: "public", provenance: true });
    expect(pkg["repository"]).toEqual({ type: "git", url: REPOSITORY_URL, directory: `packages/${key}` });
    expect(pkg["author"]).toBe("Harpreet Singh Siddhu");
    expect(pkg["engines"]).toEqual({ node: ">=20.19.0" });
    expect(pkg["private"]).toBeUndefined();
    expect(text(`packages/${key}/LICENSE`)).toBe(text("LICENSE"));
    expect(text(`packages/${key}/NOTICE`)).toBe(text("NOTICE"));
    expect(text(`packages/${key}/README.md`)).toContain(`# ${pkg.name}`);
  });

  it("builds the Power's Bundle for the Node the packages require", () => {
    expect(text("scripts/build-power.mjs")).toContain('target: "node20"');
    expect(manifest("mcp")["engines"]).toEqual({ node: ">=20.19.0" });
  });

  it("gives server.json the registry's required fields within its limits", () => {
    const s = serverJson();
    expect(s["$schema"]).toBe("https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json");
    expect(String(s["name"])).toMatch(/^io\.github\.hsiddhu2\/[a-zA-Z0-9._-]+$/);
    expect(String(s["description"]).length).toBeLessThanOrEqual(100);
    expect(s["packages"]).toEqual([
      { registryType: "npm", registryBaseUrl: "https://registry.npmjs.org", identifier: "@sexton/mcp", version: manifest("mcp").version, runtimeHint: "npx", transport: { type: "stdio" } },
    ]);
  });
});

describe("Feature: release, Property 4: the release workflow publishes only from a version tag, with OIDC and no secret", () => {
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

  it("pins every action to a full commit SHA and uses no secret, token or cache", () => {
    const uses = [...WORKFLOW.matchAll(/uses: (\S+)/g)].map((m) => m[1]);
    expect(uses.length).toBeGreaterThan(0);
    for (const ref of uses) expect(ref).toMatch(/^[\w.-]+\/[\w.-]+@[0-9a-f]{40}$/);
    expect(WORKFLOW).not.toMatch(/secrets\.|NPM_TOKEN|NODE_AUTH_TOKEN|cache: npm|actions\/cache/);
    expect(WORKFLOW.match(/package-manager-cache: false/g)).toHaveLength(2);
  });

  it("checks the tag, then publishes engine, CLI and server in that order", () => {
    const check = WORKFLOW.indexOf('node scripts/release-check.mjs "$GITHUB_REF_NAME"');
    const publish = WORKFLOW.indexOf("npm publish");
    expect(check).toBeGreaterThan(0);
    expect(publish).toBeGreaterThan(check);
    expect(WORKFLOW).toContain("for dir in packages/engine packages/cli packages/mcp; do");
    expect(PUBLISH_ORDER).toEqual(["engine", "cli", "mcp"]);
  });
});
