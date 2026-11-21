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

// repo-intake task 9.2. Requirements 1.1, 2.1, 3.1, 5.1, 6.1, 7.1, 9.3.
const INTAKE_FUNCTIONS = [
  "parseRepoUrl",
  "formatRepoUrl",
  "isValidOwner",
  "isValidRepo",
  "isValidPackageName",
  "parsePackageJson",
  "applyLockfile",
  "parseManifests",
  "resolveUnlocked",
  "isResolvableRange",
  "applyCap",
  "intakeRepo",
  "scanMetadata",
  "attachScan",
  "fetchManifest",
  "fetchRepoManifests",
  "manifestUrl",
] as const;

describe("engine public surface (repo-intake)", () => {
  it.each(INTAKE_FUNCTIONS)("exports %s as a function", (name) => {
    expect(typeof engine[name]).toBe("function");
  });

  it("exports the intake constants", () => {
    expect(engine.UNRESOLVED_VERSION).toBe("unresolved");
    expect(engine.MAX_DIRECT_DEPENDENCIES).toBe(300);
    expect(typeof engine.MAX_PACKAGE_NAME_LENGTH).toBe("number");
    expect(typeof engine.MAX_RANGE_LENGTH).toBe("number");
    expect(typeof engine.MAX_MANIFEST_BYTES).toBe("number");
    expect(typeof engine.GITHUB_RAW_SOURCE).toBe("string");
    expect(typeof engine.GITHUB_RAW_HOST).toBe("string");
    expect(Array.isArray(engine.INTAKE_ERROR_CODES)).toBe(true);
    expect(engine.INTAKE_ERROR_CODES.length).toBeGreaterThan(0);
  });
});

// remediation task 9.1. Public surface of the remediation module.
const REMEDIATION_FUNCTIONS = [
  "planRemediation",
  "selectBump",
  "orderCandidates",
  "rangeStyle",
  "styledRange",
  "isPublishedVersion",
  "gatherBumpData",
  "bumpTargets",
  "branchName",
  "encodeName",
  "decodeName",
  "isValidBranchName",
  "buildPrIntent",
  "buildPrBody",
  "escapeField",
  "createInMemoryRemediationLog",
  "attachRemediations",
  "failingRulesFor",
  "queryVulnIdsBatch",
] as const;

describe("engine public surface (remediation)", () => {
  it.each(REMEDIATION_FUNCTIONS)("exports %s as a function", (name) => {
    expect(typeof engine[name]).toBe("function");
  });

  it("exports the remediation constants", () => {
    expect(engine.REMEDIATION_KINDS).toEqual(["bump", "remove", "migrate"]);
    expect(engine.REMEDIATION_STATUSES).toEqual(["proposed", "no-safe-version", "unavailable"]);
    expect(engine.BASE_REF_DEFAULT).toBe("@default");
    expect(engine.EMPTY_RECIPE_REGISTRY.size).toBe(0);
    expect(engine.MAX_CANDIDATES).toBe(20);
    expect(engine.OSV_BATCH_SOURCE).toBe("osv-querybatch-multi");
  });

  it("keeps the internal helpers internal", () => {
    for (const name of ["cleanLine", "precheck", "chooseKind", "readPublished", "buildPrContext", "isValidLogEntry"]) {
      expect(Object.keys(engine)).not.toContain(name);
    }
  });
});

// migration-node-sass task 6.4. Public surface of the migration module.
const MIGRATION_FUNCTIONS = [
  "runMigrations",
  "runRecipe",
  "gatherMigrationData",
  "capFileSource",
  "findReviewSites",
  "reviewComments",
  "isSafePath",
  "hasIgnoredSegment",
  "readPackageScripts",
] as const;

describe("engine public surface (migration)", () => {
  it.each(MIGRATION_FUNCTIONS)("exports %s as a function", (name) => {
    expect(typeof engine[name]).toBe("function");
  });

  it("exports the recipe, the registries and the constants", () => {
    expect(typeof engine.InMemoryFileSource).toBe("function");
    expect([...engine.DEFAULT_RECIPE_REGISTRY.keys()]).toEqual(["node-sass"]);
    expect(engine.NODE_SASS_RECIPE.id).toBe("node-sass-to-sass");
    expect(engine.SASS_LOADER_MINIMUM).toBe("7.2.0");
    expect([engine.MAX_LISTED, engine.MAX_READ, engine.MAX_FILE_BYTES, engine.MAX_REVIEW_SITES, engine.MAX_ADVISORY_IDS]).toEqual([500, 200, 262144, 200, 200]);
    expect(engine.REVIEW_RULES).toEqual(["deep-combinator", "legacy-render", "node-sass-script"]);
  });
});

// evidence-pack task 6.2. Public surface of the evidence module.
const EVIDENCE_FUNCTIONS = [
  "intakeRepoWithManifests",
  "canonicalJson",
  "cleanJsonCopy",
  "sha256Hex",
  "sha256HexOfText",
  "npmPurl",
  "buildSbom",
  "buildEvidencePack",
  "serialiseEvidencePack",
  "verifyEvidencePack",
  "renderEvidenceMarkdown",
] as const;

describe("engine public surface (evidence-pack)", () => {
  it.each(EVIDENCE_FUNCTIONS)("exports %s as a function", (name) => {
    expect(typeof engine[name]).toBe("function");
  });

  it("exports the closed failure lists and the fixed texts", () => {
    expect(engine.EVIDENCE_BUILD_FAILURES).toEqual(["report has no scan metadata", "commit is not a 40 character hex string", "body is not serialisable"]);
    expect(engine.BUILD_FAILURES).toBe(engine.EVIDENCE_BUILD_FAILURES);
    expect(engine.EVIDENCE_VERIFY_FAILURES).toEqual(["malformed", "unsupported-version", "digest-mismatch"]);
    expect(engine.COMMIT_NOTE).toBe("commit not recorded, the scan read the default branch head");
    expect(Object.keys(engine.SIGNAL_SUMMARIES).sort()).toEqual([...engine.SIGNAL_NAMES].sort());
  });
});
