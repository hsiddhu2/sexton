import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { formatPolicy } from "../../src/policy/format.js";
import { parsePolicy } from "../../src/policy/parse.js";
import { ERROR_CODES, type ParseResult } from "../../src/types.js";
import { arbValidPolicy } from "../arbitraries.js";

function errorsOf(text: string): [string, string][] {
  const result = parsePolicy(text);
  if (result.ok) {
    return [];
  }
  return result.errors.map((e): [string, string] => [e.code, e.path]);
}

function rule(body: string): string {
  return `{version: 1, rules: [{${body}}]}`;
}

describe("parsePolicy examples, one per error code", () => {
  it("YAML_SYNTAX", () => {
    expect(errorsOf("version: [1")).toEqual([["YAML_SYNTAX", "$"]]);
  });
  it("MULTIPLE_DOCUMENTS", () => {
    expect(errorsOf("version: 1\nrules: []\n---\nversion: 1\nrules: []\n")).toEqual([["MULTIPLE_DOCUMENTS", "$"]]);
  });
  it("DUPLICATE_KEY", () => {
    expect(errorsOf("version: 1\nversion: 1\nrules: []\n")).toEqual([["DUPLICATE_KEY", ""]]);
  });
  it("NOT_OBJECT", () => {
    expect(errorsOf("- a\n- b\n")).toEqual([["NOT_OBJECT", ""]]);
    expect(errorsOf("")).toEqual([["NOT_OBJECT", ""]]);
    expect(errorsOf("# only a comment\n")).toEqual([["NOT_OBJECT", ""]]);
    expect(errorsOf("just text")).toEqual([["NOT_OBJECT", ""]]);
  });
  it("MISSING_FIELD", () => {
    expect(errorsOf("version: 1\n")).toEqual([["MISSING_FIELD", "/rules"]]);
    expect(errorsOf("rules: []\n")).toEqual([["MISSING_FIELD", "/version"]]);
  });
  it("VERSION_UNSUPPORTED", () => {
    expect(errorsOf("{version: 2, rules: []}")).toEqual([["VERSION_UNSUPPORTED", "/version"]]);
    expect(errorsOf('{version: "1", rules: []}')).toEqual([["WRONG_TYPE", "/version"]]);
    expect(errorsOf("{version: 1.5, rules: []}")).toEqual([["WRONG_TYPE", "/version"]]);
  });
  it("UNKNOWN_RULE_TYPE", () => {
    expect(errorsOf(rule("type: forbid_licence"))).toEqual([["UNKNOWN_RULE_TYPE", "/rules/0/type"]]);
    expect(errorsOf(rule("type: 5"))).toEqual([["UNKNOWN_RULE_TYPE", "/rules/0/type"]]);
  });
  it("UNKNOWN_FIELD", () => {
    expect(errorsOf("{version: 1, rules: [], extra: true}")).toEqual([["UNKNOWN_FIELD", "/extra"]]);
    expect(errorsOf(rule("type: forbid_state, states: [Dead], months: 3"))).toEqual([["UNKNOWN_FIELD", "/rules/0/months"]]);
  });
  it("WRONG_TYPE", () => {
    expect(errorsOf("{version: 1, rules: oops}")).toEqual([["WRONG_TYPE", "/rules"]]);
    expect(errorsOf("{version: 1, rules: [3]}")).toEqual([["WRONG_TYPE", "/rules/0"]]);
    expect(errorsOf(rule("type: forbid_state, states: [Sleepy]"))).toEqual([["WRONG_TYPE", "/rules/0/states/0"]]);
  });
  it("EMPTY_LIST", () => {
    expect(errorsOf(rule("type: forbid_state, states: []"))).toEqual([["EMPTY_LIST", "/rules/0/states"]]);
    expect(errorsOf(rule("type: require_provenance, packages: []"))).toEqual([["EMPTY_LIST", "/rules/0/packages"]]);
  });
  it("INVALID_MONTHS", () => {
    expect(errorsOf(rule("type: max_age_months, months: 0"))).toEqual([["INVALID_MONTHS", "/rules/0/months"]]);
  });
  it("INVALID_WILDCARD", () => {
    expect(errorsOf(rule('type: require_provenance, packages: ["*", left-pad]'))).toEqual([
      ["INVALID_WILDCARD", "/rules/0/packages"],
    ]);
  });
  it("INVALID_PATTERN", () => {
    expect(errorsOf(rule('type: forbid_state, states: [Dead], matchPackagePatterns: ["a(b)"]'))).toEqual([
      ["INVALID_PATTERN", "/rules/0/matchPackagePatterns/0"],
    ]);
  });
});

describe("parsePolicy further examples", () => {
  it("reports every error of a multi-error text, sorted by path", () => {
    expect(errorsOf("{version: 2, rules: [{type: max_age_months, months: 0}], extra: 1}")).toEqual([
      ["UNKNOWN_FIELD", "/extra"],
      ["INVALID_MONTHS", "/rules/0/months"],
      ["VERSION_UNSUPPORTED", "/version"],
    ]);
  });

  it("gives the path of a nested duplicate key", () => {
    expect(errorsOf("version: 1\nrules:\n  - type: forbid_state\n    type: forbid_state\n    states: [Dead]\n")).toEqual([
      ["DUPLICATE_KEY", "/rules/0"],
    ]);
  });

  it("gives YAML_SYNTAX when a syntax error and a duplicate key both occur", () => {
    expect(errorsOf("a: 1\na: 2\nb: [1\n")).toEqual([["YAML_SYNTAX", "$"]]);
  });

  it.each([["0"], ["-1"], ["1.5"], [".nan"], [".inf"], ["-.inf"]])("months %s gives INVALID_MONTHS", (months) => {
    expect(errorsOf(rule(`type: max_age_months, months: ${months}`))).toEqual([["INVALID_MONTHS", "/rules/0/months"]]);
  });

  it("months of the wrong kind gives WRONG_TYPE", () => {
    expect(errorsOf(rule('type: max_age_months, months: "3"'))).toEqual([["WRONG_TYPE", "/rules/0/months"]]);
    expect(errorsOf(rule("type: max_age_months"))).toEqual([["MISSING_FIELD", "/rules/0/months"]]);
  });

  it("checks name length in code points", () => {
    const named = (name: string): string => rule(`type: forbid_state, states: [Dead], name: ${JSON.stringify(name)}`);
    expect(errorsOf(named(""))).toEqual([["WRONG_TYPE", "/rules/0/name"]]);
    expect(errorsOf(named("x"))).toEqual([]);
    expect(errorsOf(named("😀".repeat(80)))).toEqual([]);
    expect(errorsOf(named("😀".repeat(81)))).toEqual([["WRONG_TYPE", "/rules/0/name"]]);
  });

  it.each([["a b"], ["a(b)"], ["a\\b"], ["a$"]])("pattern %j gives INVALID_PATTERN", (pattern) => {
    const text = rule(`type: forbid_state, states: [Dead], matchPackagePatterns: [${JSON.stringify(pattern)}]`);
    expect(errorsOf(text)).toEqual([["INVALID_PATTERN", "/rules/0/matchPackagePatterns/0"]]);
  });

  it("an empty pattern gives INVALID_PATTERN and a non-string pattern gives WRONG_TYPE", () => {
    expect(errorsOf(rule('type: forbid_state, states: [Dead], matchPackagePatterns: [""]'))).toEqual([
      ["INVALID_PATTERN", "/rules/0/matchPackagePatterns/0"],
    ]);
    expect(errorsOf(rule("type: forbid_state, states: [Dead], matchPackagePatterns: [3]"))).toEqual([
      ["WRONG_TYPE", "/rules/0/matchPackagePatterns/0"],
    ]);
  });

  it('gives INVALID_WILDCARD for ["*", "*"] and accepts a lone "*"', () => {
    expect(errorsOf(rule('type: require_provenance, packages: ["*", "*"]'))).toEqual([["INVALID_WILDCARD", "/rules/0/packages"]]);
    expect(errorsOf(rule('type: require_provenance, packages: ["*"]'))).toEqual([]);
  });

  it("gives WRONG_TYPE for bad entries of packages", () => {
    expect(errorsOf(rule('type: require_provenance, packages: [""]'))).toEqual([["WRONG_TYPE", "/rules/0/packages/0"]]);
    expect(errorsOf(rule("type: require_provenance, packages: 3"))).toEqual([["WRONG_TYPE", "/rules/0/packages"]]);
  });

  it("gives MISSING_FIELD for a rule without a type", () => {
    expect(errorsOf("{version: 1, rules: [{states: [Dead]}]}")).toEqual([["MISSING_FIELD", "/rules/0/type"]]);
  });

  it("gives UNKNOWN_FIELD for __proto__ and constructor keys and pollutes nothing", () => {
    expect(errorsOf("{version: 1, rules: [], __proto__: {polluted: true}}")).toEqual([["UNKNOWN_FIELD", "/__proto__"]]);
    expect(errorsOf(rule("type: forbid_state, states: [Dead], __proto__: {polluted: true}"))).toEqual([
      ["UNKNOWN_FIELD", "/rules/0/__proto__"],
    ]);
    expect(errorsOf("{version: 1, rules: [], constructor: {prototype: {polluted: true}}}")).toEqual([
      ["UNKNOWN_FIELD", "/constructor"],
    ]);
    expect(({} as Record<string, unknown>)["polluted"]).toBeUndefined();
  });

  it("never copies Ajv message text into an error", () => {
    const texts = ["{version: 2, rules: [{type: max_age_months, months: 0}], extra: 1}", rule("type: nope"), "{version: 1, rules: oops}"];
    for (const text of texts) {
      const result = parsePolicy(text);
      if (!result.ok) {
        for (const e of result.errors) {
          expect(e.message).not.toMatch(/must be integer|required property|NOT have additional|must be equal to|must match|schema/);
        }
      }
    }
  });

  it("returns a plain policy with plain-string patterns and only schema keys", () => {
    const result = parsePolicy(
      [
        "version: 1",
        "rules:",
        "  - name: no dead",
        "    type: forbid_state",
        "    states: [Dead, Possessed]",
        "    matchPackagePatterns: ['@s/*', 'a?']",
        "    excludePackageNames: [left-pad]",
        "  - type: forbid_install_scripts",
        "  - type: max_age_months",
        "    months: 18",
        "  - type: require_provenance",
        "    packages: ['*']",
        "",
      ].join("\n"),
    );
    expect(result).toEqual({
      ok: true,
      policy: {
        version: 1,
        rules: [
          {
            type: "forbid_state",
            states: ["Dead", "Possessed"],
            name: "no dead",
            matchPackagePatterns: ["@s/*", "a?"],
            excludePackageNames: ["left-pad"],
          },
          { type: "forbid_install_scripts" },
          { type: "max_age_months", months: 18 },
          { type: "require_provenance", packages: ["*"] },
        ],
      },
    });
    if (result.ok) {
      const patterns = result.policy.rules[0]?.matchPackagePatterns ?? [];
      expect(patterns.every((p) => typeof p === "string")).toBe(true);
      expect(JSON.parse(JSON.stringify(result.policy))).toEqual(result.policy);
    }
  });

  it("does not throw on deep nesting or alias bombs", () => {
    expect(parsePolicy("[".repeat(200000)).ok).toBe(false);
    const bomb = ["a: &a [x, x, x, x, x, x, x, x, x]"];
    let prev = "a";
    for (let i = 0; i < 12; i += 1) {
      const name = `b${String(i)}`;
      bomb.push(`${name}: &${name} [*${prev}, *${prev}, *${prev}, *${prev}, *${prev}, *${prev}, *${prev}, *${prev}, *${prev}]`);
      prev = name;
    }
    expect(parsePolicy(bomb.join("\n")).ok).toBe(false);
  });
});

const PIECES = [
  "---", "&a", "*a", "[", "]", "{", "}", ": ", "- ", "\t", "version: 1", "rules:", "rules: []", "type: forbid_state",
  "states: [Dead]", "months: 3", "packages: ['*']", "  ", "# c", "!!str", "? x", "<<: *a", "|", ">", "'", '"', "__proto__:",
];

const arbFragments = fc.array(fc.constantFrom(...PIECES), { maxLength: 14 }).chain((parts) =>
  fc.constantFrom("\n", " ", "").map((sep) => parts.join(sep)),
);

const arbCorrupted = fc
  .tuple(arbValidPolicy, fc.constantFrom(0, 1, 2), fc.nat(500), fc.nat(500), fc.fullUnicodeString({ maxLength: 3 }))
  .map(([policy, op, i, j, insert]) => {
    const text = formatPolicy(policy);
    if (op === 0) {
      return text.slice(0, i % (text.length + 1));
    }
    if (op === 1) {
      const at = i % (text.length + 1);
      return text.slice(0, at) + insert + text.slice(at);
    }
    const lines = text.split("\n");
    const a = i % lines.length;
    const b = j % lines.length;
    const la = lines[a] ?? "";
    lines[a] = lines[b] ?? "";
    lines[b] = la;
    return lines.join("\n");
  });

function checkResult(result: ParseResult): void {
  if (result.ok) {
    expect("errors" in result).toBe(false);
    expect(result.policy.version).toBe(1);
    return;
  }
  expect("policy" in result).toBe(false);
  expect(result.errors.length).toBeGreaterThan(0);
  const codes: readonly string[] = ERROR_CODES;
  for (const e of result.errors) {
    expect(codes).toContain(e.code);
  }
  for (let k = 1; k < result.errors.length; k += 1) {
    const a = result.errors[k - 1];
    const b = result.errors[k];
    if (a === undefined || b === undefined) {
      throw new Error("unreachable");
    }
    const ka = [a.path, a.code, a.message];
    const kb = [b.path, b.code, b.message];
    const order = ka[0] !== kb[0] ? (ka[0] ?? "") < (kb[0] ?? "") : ka[1] !== kb[1] ? (ka[1] ?? "") < (kb[1] ?? "") : (ka[2] ?? "") <= (kb[2] ?? "");
    expect(order).toBe(true);
  }
}

describe("parsePolicy properties", () => {
  // Feature: policy, Property 15: parsePolicy never throws, and ok matches the errors
  it("Feature: policy, Property 15: parsePolicy never throws, and ok matches the errors", () => {
    fc.assert(
      fc.property(fc.oneof(fc.string(), fc.fullUnicodeString(), arbFragments, arbCorrupted), (text) => {
        const first = parsePolicy(text);
        checkResult(first);
        expect(parsePolicy(text)).toEqual(first);
      }),
      { numRuns: 1000 },
    );
  }, 120_000);
});
