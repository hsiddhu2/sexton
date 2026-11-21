// Property 14: cdk-nag AwsSolutions is clean, and every acknowledgement has a written reason
// that also appears in design.md. Requirements 9.4, 10.3, 10.4.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { NAG_SUPPRESSIONS } from "../lib/nag-suppressions.js";
import { DESIGN_PATH, build } from "./helpers.js";

describe("Feature: infra, Property 14: cdk-nag AwsSolutions is clean", () => {
  it("synthesises both stacks with the web build and no unacknowledged finding", () => {
    const { app } = build();
    expect(() => app.synth()).not.toThrow();
  });

  it("synthesises both stacks without the web build and no unacknowledged finding", () => {
    const { app } = build({ web: false });
    expect(() => app.synth()).not.toThrow();
  });

  it("gives every acknowledgement a reason of at least 20 characters that appears verbatim in design.md", () => {
    const design = readFileSync(DESIGN_PATH, "utf8");
    expect(NAG_SUPPRESSIONS.length).toBeGreaterThan(0);
    for (const s of NAG_SUPPRESSIONS) {
      expect(s.reason.length, s.rule).toBeGreaterThanOrEqual(20);
      expect(design.includes(s.reason), `design.md is missing the reason for ${s.rule}: ${s.reason}`).toBe(true);
      expect(design.includes(s.rule), `design.md is missing ${s.rule}`).toBe(true);
    }
  });
});

describe("no secrets in infra (9.4)", () => {
  const root = fileURLToPath(new URL("../", import.meta.url));
  const files: string[] = [];
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      if (name === "node_modules" || name === "cdk.out") continue;
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (/\.(ts|json)$/.test(name)) files.push(path);
    }
  };
  walk(root);

  it("finds no AWS key id, GitHub token or private key in infra source", () => {
    expect(files.length).toBeGreaterThan(5);
    const patterns = [/AKIA[0-9A-Z]{16}/, /ghp_[A-Za-z0-9]{20,}/, /github_pat_[A-Za-z0-9_]{20,}/, /-----BEGIN [A-Z ]*PRIVATE KEY-----/];
    for (const f of files) {
      if (f.endsWith("nag.test.ts")) continue;
      const text = readFileSync(f, "utf8");
      for (const p of patterns) expect(p.test(text), `${f} matches ${p}`).toBe(false);
    }
  });
});
