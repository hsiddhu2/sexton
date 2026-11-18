// require_provenance rule. Requirements 7.1 to 7.10 of the policy spec. Examples only.
import { describe, expect, it } from "vitest";
import { evaluateRequireProvenance } from "../../../src/policy/rules/require-provenance.js";
import type { HealthReport, RequireProvenanceRule } from "../../../src/types.js";
import { FETCHED, SRC, gone, makePackage, makeReport, ok } from "./make-package.js";

function run(rule: RequireProvenanceRule, report: HealthReport) {
  return evaluateRequireProvenance(rule, report);
}

const NONE = ok({ present: false, predicateType: null });
const HAS = ok({ present: true, predicateType: "https://slsa.dev/provenance/v1" });

describe("evaluateRequireProvenance", () => {
  const report = makeReport([
    makePackage({ name: "a", provenance: NONE }),
    makePackage({ name: "b", provenance: NONE }),
    makePackage({ name: "c", provenance: HAS }),
    makePackage({ name: "d", provenance: gone("HTTP 429") }),
  ]);

  it("selects by name only the packages listed", () => {
    const out = run({ type: "require_provenance", packages: ["a", "c", "d"] }, report);
    expect(out.failures.map((f) => f.name)).toEqual(["a"]);
    expect(out.unevaluated).toEqual([{ name: "d", installedVersion: "1.0.0", signal: "provenance", reason: "HTTP 429" }]);
  });

  it("selects every package with the wildcard, with matchers still applied", () => {
    const all = run({ type: "require_provenance", packages: ["*"] }, report);
    expect(all.failures.map((f) => f.name)).toEqual(["a", "b"]);
    expect(all.unevaluated.map((u) => u.name)).toEqual(["d"]);
    const scoped = run({ type: "require_provenance", packages: ["*"], excludePackageNames: ["a"] }, report);
    expect(scoped.failures.map((f) => f.name)).toEqual(["b"]);
  });

  it("requires both matchers and packages to select", () => {
    const out = run({ type: "require_provenance", packages: ["a", "b"], matchPackageNames: ["b"] }, report);
    expect(out.failures.map((f) => f.name)).toEqual(["b"]);
  });

  it("records value, source and fetchedAt as evidence", () => {
    const out = run({ type: "require_provenance", packages: ["a"] }, report);
    expect(out.failures).toEqual([
      {
        name: "a",
        installedVersion: "1.0.0",
        signal: "provenance",
        value: { present: false, predicateType: null },
        source: SRC,
        fetchedAt: FETCHED.toISOString(),
        reason: "provenance is absent",
      },
    ]);
  });

  it("produces nothing for present provenance", () => {
    expect(run({ type: "require_provenance", packages: ["c"] }, report)).toEqual({ failures: [], unevaluated: [], notFound: [] });
  });

  it("lists absent names in notFound in first-appearance order without repeats", () => {
    const out = run({ type: "require_provenance", packages: ["zz", "a", "yy", "zz"] }, report);
    expect(out.notFound).toEqual(["zz", "yy"]);
    expect(out.failures.map((f) => f.name)).toEqual(["a"]);
  });

  it("does not list a present but excluded package in notFound", () => {
    const out = run({ type: "require_provenance", packages: ["a"], excludePackageNames: ["a"] }, report);
    expect(out).toEqual({ failures: [], unevaluated: [], notFound: [] });
  });

  it("has an empty notFound when every named package is present, and for the wildcard", () => {
    expect(run({ type: "require_provenance", packages: ["a", "b"] }, report).notFound).toEqual([]);
    expect(run({ type: "require_provenance", packages: ["*"] }, report).notFound).toEqual([]);
  });

  it("makes the wildcard failing set contain that of a named list", () => {
    const named = run({ type: "require_provenance", packages: ["a", "c"] }, report).failures.map((f) => f.name);
    const wild = run({ type: "require_provenance", packages: ["*"] }, report).failures.map((f) => f.name);
    for (const n of named) {
      expect(wild).toContain(n);
    }
  });
});
