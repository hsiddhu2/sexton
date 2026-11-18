// Policy schema. Requirements 1.1 to 1.7 of the policy spec.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { POLICY_SCHEMA, PATTERN_CHARACTER_SET, validatePolicySchema } from "../../src/policy/schema.js";

const DEFAULT_SHAPED = { version: 1, rules: [{ type: "forbid_state", states: ["Possessed", "Dead"] }] };

const FULL = {
  version: 1,
  rules: [
    {
      type: "forbid_state",
      name: "no dead",
      states: ["Possessed", "Dead", "Haunted"],
      matchPackageNames: ["left-pad"],
      matchPackagePatterns: ["@scope/*", "lodash.?"],
      excludePackageNames: ["ok-pkg"],
    },
    { type: "forbid_install_scripts", name: "scripts", allow: ["esbuild"], matchPackagePatterns: ["**"] },
    { type: "max_age_months", months: 18, excludePackageNames: ["old-but-fine"] },
    { type: "require_provenance", packages: ["*"] },
    { type: "require_provenance", packages: ["a", "@b/c"] },
  ],
};

function record(value: unknown): Record<string, unknown> {
  return value as Record<string, unknown>;
}

describe("POLICY_SCHEMA", () => {
  it("compiles at import time", () => {
    expect(typeof validatePolicySchema).toBe("function");
  });

  it("accepts a default-shaped document, an empty rules list and a full document", () => {
    expect(validatePolicySchema(DEFAULT_SHAPED)).toBe(true);
    expect(validatePolicySchema({ version: 1, rules: [] })).toBe(true);
    expect(validatePolicySchema(FULL)).toBe(true);
  });

  it("rejects representative invalid documents", () => {
    const bad: unknown[] = [
      { version: 2, rules: [] },
      { version: 1 },
      { version: 1, rules: [], extra: true },
      { version: 1, rules: [{ type: "forbid_licence" }] },
      { version: 1, rules: [{ type: "forbid_state" }] },
      { version: 1, rules: [{ type: "forbid_state", states: [] }] },
      { version: 1, rules: [{ type: "forbid_state", states: ["Zombie"] }] },
      { version: 1, rules: [{ type: "forbid_state", states: ["Dead"], months: 3 }] },
      { version: 1, rules: [{ type: "max_age_months", months: 0 }] },
      { version: 1, rules: [{ type: "max_age_months", months: 1.5 }] },
      { version: 1, rules: [{ type: "require_provenance", packages: ["*", "a"] }] },
      { version: 1, rules: [{ type: "require_provenance", packages: [] }] },
      { version: 1, rules: [{ type: "forbid_state", states: ["Dead"], name: "" }] },
      { version: 1, rules: [{ type: "forbid_state", states: ["Dead"], name: "x".repeat(81) }] },
      { version: 1, rules: [{ type: "forbid_state", states: ["Dead"], matchPackagePatterns: ["a(b)"] }] },
    ];
    for (const doc of bad) expect(validatePolicySchema(doc), JSON.stringify(doc)).toBe(false);
  });

  it("accepts rule names of 1 and 80 characters", () => {
    for (const name of ["x", "x".repeat(80)]) {
      expect(validatePolicySchema({ version: 1, rules: [{ type: "forbid_state", states: ["Dead"], name }] })).toBe(true);
    }
  });

  it("sets additionalProperties false on the document and on the rule", () => {
    expect(POLICY_SCHEMA["additionalProperties"]).toBe(false);
    const rule = record(record(POLICY_SCHEMA["$defs"])["rule"]);
    expect(rule["additionalProperties"]).toBe(false);
  });

  it("defines name with minLength 1 and maxLength 80", () => {
    const rule = record(record(POLICY_SCHEMA["$defs"])["rule"]);
    const name = record(record(rule["properties"])["name"]);
    expect(name["type"]).toBe("string");
    expect(name["minLength"]).toBe(1);
    expect(name["maxLength"]).toBe(80);
  });

  it("encodes the pattern character set on matchPackagePatterns items", () => {
    const patternList = record(record(POLICY_SCHEMA["$defs"])["patternList"]);
    const items = record(patternList["items"]);
    expect(items["pattern"]).toBe("^[A-Za-z0-9@/._*?-]+$");
    expect(PATTERN_CHARACTER_SET).toBe("^[A-Za-z0-9@/._*?-]+$");
  });

  it("encodes the wildcard rule for packages as a oneOf", () => {
    const rule = record(record(POLICY_SCHEMA["$defs"])["rule"]);
    const branches = rule["allOf"] as Record<string, unknown>[];
    const provenance = branches.find(
      (b) => JSON.stringify(record(record(record(b["if"])["properties"])["type"])) === JSON.stringify({ const: "require_provenance" }),
    );
    expect(provenance).toBeDefined();
    const packages = record(record(record(provenance?.["then"])["properties"])["packages"]);
    const oneOf = packages["oneOf"] as Record<string, unknown>[];
    expect(oneOf).toHaveLength(2);
    expect(oneOf[0]).toEqual({ const: ["*"] });
    expect(record(oneOf[1])["minItems"]).toBe(1);
  });

  it("builds the states enum from STATE_ORDER", () => {
    expect(validatePolicySchema({ version: 1, rules: [{ type: "forbid_state", states: ["Alive", "Restless", "Haunted", "Dead", "Possessed"] }] })).toBe(true);
  });

  it("survives a JSON round trip unchanged", () => {
    expect(JSON.parse(JSON.stringify(POLICY_SCHEMA))).toEqual(POLICY_SCHEMA);
  });

  it("equals the published file schemas/sexton.policy.schema.json", () => {
    const path = fileURLToPath(new URL("../../../../schemas/sexton.policy.schema.json", import.meta.url));
    expect(JSON.parse(readFileSync(path, "utf8"))).toEqual(POLICY_SCHEMA);
  });
});
