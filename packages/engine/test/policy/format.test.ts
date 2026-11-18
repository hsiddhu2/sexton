import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { formatPolicy } from "../../src/policy/format.js";
import { parsePolicy } from "../../src/policy/parse.js";
import type { Policy, Rule } from "../../src/types.js";
import { arbValidPolicy } from "../arbitraries.js";

const TRICKY = [
  "*", "123", "yes", "@a/b", " lead", "trail ", "a: b", "# c", '"q"', "'s'", "line\nbreak", "null", "~", "true", "1e3", "0x1F",
  "- x", "[a]", "{a}", "tab\there", "\r\n", "é", "😀",
];

const arbTricky: fc.Arbitrary<string> = fc.oneof(
  fc.fullUnicodeString({ minLength: 1, maxLength: 80 }),
  fc.constantFrom(...TRICKY),
);

const ALLOWED_KEYS: Record<Rule["type"], readonly string[]> = {
  forbid_state: ["type", "name", "states", "matchPackageNames", "matchPackagePatterns", "excludePackageNames"],
  forbid_install_scripts: ["type", "name", "allow", "matchPackageNames", "matchPackagePatterns", "excludePackageNames"],
  max_age_months: ["type", "name", "months", "matchPackageNames", "matchPackagePatterns", "excludePackageNames"],
  require_provenance: ["type", "name", "packages", "matchPackageNames", "matchPackagePatterns", "excludePackageNames"],
};

/** Replaces rule names and the name lists with tricky strings, keeping the shape of each rule. */
const arbTrickyPolicy: fc.Arbitrary<Policy> = fc
  .tuple(arbValidPolicy, fc.array(arbTricky, { minLength: 40, maxLength: 40 }))
  .map(([policy, pool]) => ({
    version: 1,
    rules: policy.rules.map((r, i): Rule => {
      const pick = (k: number): string => pool[(i * 5 + k) % pool.length] ?? "x";
      const swapped: Record<string, unknown> = { ...r };
      if (r.name !== undefined) {
        swapped["name"] = pick(0).slice(0, 80) === "" ? "x" : [...pick(0)].slice(0, 80).join("");
      }
      if (r.matchPackageNames !== undefined) {
        swapped["matchPackageNames"] = r.matchPackageNames.map((_, k) => pick(k % 5));
      }
      if (r.excludePackageNames !== undefined) {
        swapped["excludePackageNames"] = r.excludePackageNames.map((_, k) => pick((k + 1) % 5));
      }
      if (r.type === "forbid_install_scripts" && r.allow !== undefined) {
        swapped["allow"] = r.allow.map((_, k) => pick((k + 2) % 5));
      }
      if (r.type === "require_provenance" && !(r.packages.length === 1 && r.packages[0] === "*")) {
        swapped["packages"] = r.packages.map((_, k) => pick((k + 3) % 5)).filter((p) => p !== "*");
        if ((swapped["packages"] as string[]).length === 0) {
          swapped["packages"] = ["x"];
        }
      }
      return swapped as unknown as Rule;
    }),
  }));

describe("formatPolicy properties", () => {
  // Feature: policy, Property 14: Schema round trip and format determinism
  it("Feature: policy, Property 14: Schema round trip and format determinism", () => {
    fc.assert(
      fc.property(fc.oneof(arbValidPolicy, arbTrickyPolicy), (policy) => {
        const text = formatPolicy(policy);
        expect(formatPolicy(policy)).toBe(text);

        const first = parsePolicy(text);
        expect(first).toEqual({ ok: true, policy });
        if (!first.ok) {
          return;
        }
        const second = parsePolicy(formatPolicy(first.policy));
        expect(second).toEqual({ ok: true, policy: first.policy });

        expect(Object.keys(first.policy).sort()).toEqual(["rules", "version"]);
        for (const r of first.policy.rules) {
          for (const key of Object.keys(r)) {
            expect(ALLOWED_KEYS[r.type]).toContain(key);
          }
        }
      }),
      { numRuns: 100 },
    );
  });
});

describe("formatPolicy examples", () => {
  it("prints keys in the fixed order", () => {
    const text = formatPolicy({
      version: 1,
      rules: [
        {
          excludePackageNames: ["e"],
          matchPackagePatterns: ["p*"],
          matchPackageNames: ["n"],
          months: 6,
          type: "max_age_months",
          name: "old",
        },
      ],
    });
    expect(text).toBe(
      [
        "version: 1",
        "rules:",
        "  - name: old",
        "    type: max_age_months",
        "    months: 6",
        "    matchPackageNames:",
        "      - n",
        "    matchPackagePatterns:",
        "      - p*",
        "    excludePackageNames:",
        "      - e",
        "",
      ].join("\n"),
    );
  });

  it("prints an empty rules list as rules: []", () => {
    expect(formatPolicy({ version: 1, rules: [] })).toBe("version: 1\nrules: []\n");
  });

  it("quotes scalars that would read back as another type", () => {
    const names = ["*", "@scope/pkg", "yes", "123"];
    const policy: Policy = {
      version: 1,
      rules: [{ type: "forbid_install_scripts", allow: names }],
    };
    const text = formatPolicy(policy);
    expect(text).toContain('"*"');
    expect(text).toContain('"@scope/pkg"');
    expect(text).toContain('"123"');
    const parsed = parsePolicy(text);
    expect(parsed).toEqual({ ok: true, policy });
    if (parsed.ok) {
      const rule = parsed.policy.rules[0];
      expect(rule?.type === "forbid_install_scripts" ? rule.allow : undefined).toEqual(names);
    }
  });
});
