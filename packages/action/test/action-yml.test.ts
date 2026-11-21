// action.yml and the sexton workflow, read as text. Spec: .kiro/specs/cli-and-action, Requirements 9.1 to 9.4, 9.10, 9.11.
// No YAML library: run blocks are found by indentation, which is enough for these two files and keeps the package free
// of dependencies.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const HERE = dirname(fileURLToPath(import.meta.url));
const ACTION = readFileSync(join(HERE, "..", "action.yml"), "utf8");
const WORKFLOW = readFileSync(join(HERE, "..", "..", "..", ".github", "workflows", "sexton.yml"), "utf8");
const CI = readFileSync(join(HERE, "..", "..", "..", ".github", "workflows", "ci.yml"), "utf8");

/** Every run block: the inline value or the more-indented lines under `run: |`. */
function runBlocks(text: string): string[] {
  const lines = text.split("\n");
  const blocks: string[] = [];
  lines.forEach((line, i) => {
    const m = /^(\s*)(?:- )?run:\s*(.*)$/.exec(line);
    if (m === null) return;
    const indent = (m[1] ?? "").length;
    if (m[2] !== "|" && m[2] !== ">") {
      blocks.push(m[2] ?? "");
      return;
    }
    const body: string[] = [];
    for (let j = i + 1; j < lines.length; j++) {
      const next = lines[j] ?? "";
      if (next.trim() !== "" && next.length - next.trimStart().length <= indent) break;
      body.push(next);
    }
    blocks.push(body.join("\n"));
  });
  return blocks;
}

function uses(text: string): string[] {
  return [...text.matchAll(/^\s*(?:- )?uses:\s*(\S+)/gm)].map((m) => m[1] ?? "");
}

describe("action.yml", () => {
  it("is a composite action with the three inputs and their defaults", () => {
    expect(ACTION).toMatch(/^runs:\n {2}using: composite$/m);
    expect(ACTION).toMatch(/^ {2}path:\n(?: {4}.*\n)*? {4}default: "\."$/m);
    expect(ACTION).toMatch(/^ {2}comment:\n(?: {4}.*\n)*? {4}default: "true"$/m);
    expect(ACTION).toMatch(/^ {2}token:\n(?: {4}.*\n)*? {4}default: \$\{\{ github\.token \}\}$/m);
  });

  it("has no expression inside any run block, and a shell on every run step", () => {
    const blocks = runBlocks(ACTION);
    expect(blocks.length).toBe(5);
    for (const block of blocks) expect(block).not.toContain("${{");
    expect((ACTION.match(/^\s+shell: bash$/gm) ?? []).length).toBe(blocks.length);
  });

  it("pins every uses to a 40-character commit, the same setup-node commit as ci.yml", () => {
    for (const u of uses(ACTION)) expect(u).toMatch(/^[\w.-]+\/[\w.-]+@[0-9a-f]{40}$/);
    const setup = uses(ACTION).find((u) => u.startsWith("actions/setup-node@"));
    expect(uses(CI)).toContain(setup);
  });

  it("installs with --ignore-scripts in its own root, passes the path after --, and the token only to the comment step", () => {
    const blocks = runBlocks(ACTION);
    expect(blocks[0]).toContain('cd "$GITHUB_ACTION_PATH/../.."');
    expect(blocks[0]).toContain("npm ci --ignore-scripts");
    expect(blocks[1]).toContain('-- "$SEXTON_PATH"');
    expect(blocks[1]).toContain('--repo "https://github.com/$GITHUB_REPOSITORY"');
    expect(blocks[1]).toContain('--summary "$summary"');
    expect((ACTION.match(/SEXTON_TOKEN/g) ?? []).length).toBe(1);
    expect(ACTION).toMatch(/name: Pull request comment\n(?: {6}.*\n)*? {8}SEXTON_TOKEN: \$\{\{ inputs\.token \}\}/);
    expect(blocks[4]).toBe('        exit "$SEXTON_CODE"\n');
  });
});

describe("sexton workflow", () => {
  it("runs on pull_request only, with contents read and pull-requests write, and the pinned checkout without credentials", () => {
    expect(WORKFLOW).toMatch(/^on:\n {2}pull_request:\n/m);
    expect(WORKFLOW).not.toMatch(/^\s*pull_request_target:/m);
    expect(WORKFLOW).toMatch(/^permissions:\n {2}contents: read\n {2}pull-requests: write\n/m);
    const u = uses(WORKFLOW);
    expect(u).toEqual(["actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1", "./packages/action"]);
    expect(uses(CI)).toContain(u[0]);
    expect(WORKFLOW).toContain("persist-credentials: false");
    for (const block of runBlocks(WORKFLOW)) expect(block).not.toContain("${{");
  });
});
