// forbid_install_scripts rule. Requirements 5.1 to 5.8 of the policy spec.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { evaluateForbidInstallScripts } from "../../../src/policy/rules/forbid-install-scripts.js";
import type { ForbidInstallScriptsRule, HealthReport } from "../../../src/types.js";
import { arbName, arbReport, arbRule } from "../../arbitraries.js";
import { FETCHED, SRC, gone, makePackage, makeReport, matchersOf, ok } from "./make-package.js";

function run(rule: ForbidInstallScriptsRule, report: HealthReport) {
  return evaluateForbidInstallScripts(rule, report);
}

describe("evaluateForbidInstallScripts properties", () => {
  it("Feature: policy, Property 7: Monotonic in allow", () => {
    fc.assert(
      fc.property(
        arbReport,
        arbRule,
        fc.array(arbName, { maxLength: 4 }),
        fc.array(arbName, { maxLength: 4 }),
        (report, base, small, extra) => {
          const large = [...small, ...extra];
          const m = matchersOf(base);
          const withSmall = run({ type: "forbid_install_scripts", allow: small, ...m }, report).failures.map((f) => f.name);
          const withLarge = new Set(run({ type: "forbid_install_scripts", allow: large, ...m }, report).failures.map((f) => f.name));
          // A larger allow list never adds a failure.
          for (const n of withLarge) {
            expect(withSmall).toContain(n);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe("evaluateForbidInstallScripts examples", () => {
  const rule: ForbidInstallScriptsRule = { type: "forbid_install_scripts" };

  it("fails an install script and records value, source and fetchedAt", () => {
    const report = makeReport([makePackage({ name: "bad", hasInstallScript: ok(true) })]);
    const out = run(rule, report);
    expect(out.failures).toEqual([
      {
        name: "bad",
        installedVersion: "1.0.0",
        signal: "hasInstallScript",
        value: true,
        source: SRC,
        fetchedAt: FETCHED.toISOString(),
        reason: "hasInstallScript is true",
      },
    ]);
    expect(out.unevaluated).toEqual([]);
  });

  it("produces nothing for false", () => {
    const out = run(rule, makeReport([makePackage({ name: "fine", hasInstallScript: ok(false) })]));
    expect(out).toEqual({ failures: [], unevaluated: [], notFound: [] });
  });

  it("records unavailable as unevaluated with the signal's reason", () => {
    const out = run(rule, makeReport([makePackage({ name: "unknown", hasInstallScript: gone("HTTP 429") })]));
    expect(out.failures).toEqual([]);
    expect(out.unevaluated).toEqual([
      { name: "unknown", installedVersion: "1.0.0", signal: "hasInstallScript", reason: "HTTP 429" },
    ]);
  });

  it("skips allowed packages whatever their signal holds", () => {
    const report = makeReport([
      makePackage({ name: "a", hasInstallScript: ok(true) }),
      makePackage({ name: "b", hasInstallScript: gone() }),
    ]);
    expect(run({ ...rule, allow: ["a", "b"] }, report)).toEqual({ failures: [], unevaluated: [], notFound: [] });
  });

  it("treats an absent allow as empty", () => {
    const report = makeReport([makePackage({ name: "a", hasInstallScript: ok(true) })]);
    expect(run(rule, report)).toEqual(run({ ...rule, allow: [] }, report));
  });

  it("ignores out-of-scope packages", () => {
    const report = makeReport([makePackage({ name: "a", hasInstallScript: ok(true) })]);
    expect(run({ ...rule, matchPackageNames: ["other"] }, report).failures).toEqual([]);
  });
});
