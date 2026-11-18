// Recorded policy fixtures. Reads only files under test/fixtures. No network.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_POLICY } from "../../src/policy/default.js";
import { evaluatePolicy } from "../../src/policy/evaluate.js";
import { parsePolicy } from "../../src/policy/parse.js";
import { scorePackages } from "../../src/score.js";
import { ERROR_CODES, type HealthReport, type PackageRef, type Policy } from "../../src/types.js";
import { FIXTURES_DIR, fixtureRoutes, NOW, routedTransport } from "../helpers.js";

const POLICY_DIR = join(FIXTURES_DIR, "policy");
const INVALID_DIR = join(POLICY_DIR, "invalid");

function readText(path: string): string {
  return readFileSync(path, "utf8");
}

function parseValid(file: string): Policy {
  const result = parsePolicy(readText(join(POLICY_DIR, file)));
  if (!result.ok) {
    throw new Error(`${file} did not parse: ${JSON.stringify(result.errors)}`);
  }
  return result.policy;
}

/** Same routes, clock and options as test/fixture-scan.test.ts, with no snapshot store. */
async function recordedReport(): Promise<HealthReport> {
  const manifest = JSON.parse(readText(join(FIXTURES_DIR, "packages.json"))) as PackageRef[];
  const { transport } = routedTransport(manifest.flatMap((p) => fixtureRoutes(p.name, p.installedVersion)));
  return scorePackages(manifest, { transport, clock: () => NOW, retry: { sleep: () => Promise.resolve() } });
}

describe("policy fixtures", () => {
  it("has one invalid file per error code", () => {
    const files = readdirSync(INVALID_DIR).sort();
    expect(files).toEqual([...ERROR_CODES].map((c) => `${c}.yml`).sort());
  });

  it.each([...ERROR_CODES])("invalid/%s.yml reports %s first", (code) => {
    const result = parsePolicy(readText(join(INVALID_DIR, `${code}.yml`)));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0].code).toBe(code);
    }
  });

  it("valid-full.yml parses", () => {
    expect(parsePolicy(readText(join(POLICY_DIR, "valid-full.yml"))).ok).toBe(true);
  });

  it("evaluates the recorded report under valid-full.yml as expected", async () => {
    const expected = JSON.parse(readText(join(POLICY_DIR, "expected-valid-full.json"))) as unknown;
    const result = evaluatePolicy(parseValid("valid-full.yml"), await recordedReport(), "file");
    expect(result).toEqual(expected);
  });

  it("evaluates the recorded report under the default policy as expected", async () => {
    const expected = JSON.parse(readText(join(POLICY_DIR, "expected-default.json"))) as unknown;
    const result = evaluatePolicy(DEFAULT_POLICY, await recordedReport(), "default");
    expect(result).toEqual(expected);
  });
});
