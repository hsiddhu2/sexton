// history-signals task 9.2. Requirements 10.1, 10.7. Public surface of the engine.

import { describe, expect, it } from "vitest";
import * as engine from "../src/index.js";
import { DEFAULT_POLICY } from "../src/policy/default.js";

const NEW_FUNCTIONS = [
  "unionGraph",
  "transitiveReach",
  "maintainerDiff",
  "maintainerChangeValue",
  "evaluateProvenanceRegression",
  "newInstallScriptEvents",
  "compareVersionOrder",
  "publishedVersions",
  "isRecent",
  "runSnapshotter",
  "fetchProvenanceSignal",
  "fetchDependencyGraph",
  "fetchMaintainersSignal",
  "extractMaintainers",
  "collectReach",
  "buildHistorySignals",
] as const;

describe("engine public surface (history-signals)", () => {
  it.each(NEW_FUNCTIONS)("exports %s as a function", (name) => {
    expect(typeof engine[name]).toBe("function");
  });

  it("exports InMemorySnapshotStore as a constructor", () => {
    expect(typeof engine.InMemorySnapshotStore).toBe("function");
    expect(new engine.InMemorySnapshotStore()).toBeInstanceOf(engine.InMemorySnapshotStore);
  });

  it("exports InvalidCaptureTimeError as an Error constructor", () => {
    const error = new engine.InvalidCaptureTimeError("nope");
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(engine.InvalidCaptureTimeError);
  });

  it("exports the snapshot constants", () => {
    expect(engine.RECENT_WINDOW_MS).toBe(90 * 24 * 60 * 60 * 1000);
    expect(engine.MAX_SNAPSHOT_VERSIONS).toBe(20);
  });

  it("exports the signal name lists", () => {
    expect(engine.ORIGINAL_SIGNAL_NAMES).toEqual(["lastPublish", "deprecated", "hasInstallScript", "advisories"]);
    expect(engine.NEW_SIGNAL_NAMES).toEqual([
      "maintainers",
      "provenance",
      "transitiveReach",
      "maintainerChange",
      "provenanceRegression",
      "newInstallScript",
    ]);
    expect(engine.SIGNAL_NAMES).toEqual([...engine.ORIGINAL_SIGNAL_NAMES, ...engine.NEW_SIGNAL_NAMES]);
    expect(engine.SIGNAL_NAMES).toHaveLength(10);
  });

  it.each(["parsePolicy", "formatPolicy", "evaluatePolicy", "inScope"] as const)(
    "exports %s as a function (policy)",
    (name) => {
      expect(typeof engine[name]).toBe("function");
    },
  );

  it("exports DEFAULT_POLICY and POLICY_SCHEMA as plain objects (policy)", () => {
    expect(typeof engine.DEFAULT_POLICY).toBe("object");
    expect(engine.DEFAULT_POLICY).toBe(DEFAULT_POLICY);
    expect(engine.DEFAULT_POLICY).toEqual({
      version: 1,
      rules: [{ type: "forbid_state", states: ["Possessed", "Dead"] }],
    });
    expect(typeof engine.POLICY_SCHEMA).toBe("object");
    expect(engine.POLICY_SCHEMA).not.toBeNull();
    expect(Array.isArray(engine.POLICY_SCHEMA)).toBe(false);
  });

  it("exports the policy types (compile-time check)", () => {
    const policy: engine.Policy | undefined = undefined;
    const rule: engine.Rule | undefined = undefined;
    const ruleType: engine.RuleType | undefined = undefined;
    const rules: [
      engine.ForbidStateRule | undefined,
      engine.ForbidInstallScriptsRule | undefined,
      engine.MaxAgeMonthsRule | undefined,
      engine.RequireProvenanceRule | undefined,
    ] = [undefined, undefined, undefined, undefined];
    const parse: engine.ParseResult | undefined = undefined;
    const validation: engine.ValidationError | undefined = undefined;
    const code: engine.ErrorCode | undefined = undefined;
    const source: engine.PolicySource | undefined = undefined;
    const result: engine.PolicyResult | undefined = undefined;
    const ruleResult: engine.RuleResult | undefined = undefined;
    const failure: engine.Failure | undefined = undefined;
    const unevaluated: engine.Unevaluated | undefined = undefined;
    expect([policy, rule, ruleType, parse, validation, code, source, result, ruleResult, failure, unevaluated]).toEqual(
      new Array(11).fill(undefined),
    );
    expect(rules).toEqual([undefined, undefined, undefined, undefined]);
  });

  it("exports the new types (compile-time check)", () => {
    const snapshot: engine.Snapshot | undefined = undefined;
    const store: engine.SnapshotStore | undefined = undefined;
    const newSignals: engine.NewSignals | undefined = undefined;
    const originalSignals: engine.OriginalSignals | undefined = undefined;
    const maintainerChange: engine.MaintainerChangeValue | undefined = undefined;
    const regression: engine.ProvenanceRegressionValue | undefined = undefined;
    const reach: engine.TransitiveReachValue | undefined = undefined;
    const graph: engine.UnionGraph | undefined = undefined;
    const result: engine.SnapshotterResult | undefined = undefined;
    expect([snapshot, store, newSignals, originalSignals, maintainerChange, regression, reach, graph, result]).toEqual(
      new Array(9).fill(undefined),
    );
  });
});
