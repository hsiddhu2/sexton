// The repository's own policy file. Reads sexton.policy.yml and recorded fixtures only. No network.
// The live check for 10.3 is `npm run scan:self`. It needs the network and is not run in tests.

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { evaluatePolicy } from "../../src/policy/evaluate.js";
import { parsePolicy } from "../../src/policy/parse.js";
import { scorePackages } from "../../src/score.js";
import type { HealthReport, PackageRef, Policy } from "../../src/types.js";
import { FIXTURES_DIR, fixtureRoutes, NOW, routedTransport } from "../helpers.js";

const POLICY_PATH = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", "sexton.policy.yml");

function loadPolicy(): Policy {
  const result = parsePolicy(readFileSync(POLICY_PATH, "utf8"));
  if (!result.ok) {
    throw new Error(`sexton.policy.yml did not parse: ${JSON.stringify(result.errors)}`);
  }
  return result.policy;
}

async function recordedReport(): Promise<HealthReport> {
  const manifest = JSON.parse(readFileSync(join(FIXTURES_DIR, "packages.json"), "utf8")) as PackageRef[];
  const { transport } = routedTransport(manifest.flatMap((p) => fixtureRoutes(p.name, p.installedVersion)));
  return scorePackages(manifest, { transport, clock: () => NOW, retry: { sleep: () => Promise.resolve() } });
}

describe("sexton.policy.yml", () => {
  it("parses", () => {
    expect(parsePolicy(readFileSync(POLICY_PATH, "utf8")).ok).toBe(true);
  });

  it("holds exactly the three agreed rules", () => {
    const policy = loadPolicy();
    expect(policy.version).toBe(1);
    expect(policy.rules.map((r) => r.type)).toEqual(["forbid_state", "forbid_install_scripts", "max_age_months"]);
    const [state, scripts, age] = policy.rules;
    expect(state).toMatchObject({ name: "No possessed, dead or haunted dependencies", type: "forbid_state", states: ["Possessed", "Dead", "Haunted"] });
    expect(scripts).toMatchObject({ type: "forbid_install_scripts" });
    expect(age).toMatchObject({ type: "max_age_months", months: 24 });
    for (const rule of policy.rules) {
      expect(rule).not.toHaveProperty("matchPackageNames");
      expect(rule).not.toHaveProperty("matchPackagePatterns");
      expect(rule).not.toHaveProperty("excludePackageNames");
    }
  });

  it("wires the live self-scan script", () => {
    const root = join(dirname(POLICY_PATH));
    const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { scripts?: Record<string, string> };
    expect(pkg.scripts?.["scan:self"]).toBe("node scripts/self-scan.mjs");
    expect(existsSync(join(root, "scripts", "self-scan.mjs"))).toBe(true);
  });

  it("evaluates against the recorded report without throwing", async () => {
    const result = evaluatePolicy(loadPolicy(), await recordedReport(), "file");
    expect(result.source).toBe("file");
    expect(result.rules).toHaveLength(3);
  });
});
