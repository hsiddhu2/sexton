// Spec: .kiro/specs/remediation-safety, bugfix 1.1 to 1.5 and 2.1 to 2.5, design Properties 1 to 3.
// Exploration tests: written and run on the unfixed code first, where they must fail.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { isResolvableRange } from "../../src/intake/resolve.js";
import { bumpTargets } from "../../src/remediation/bump-targets.js";
import { InMemoryFileSource } from "../../src/remediation/file-source.js";
import type { BumpDataResult } from "../../src/remediation/gather-bump-data.js";
import { planRemediation, type PlanOptions } from "../../src/remediation/plan.js";
import { buildPrBody, NONE_LINE } from "../../src/remediation/pr-body.js";
import { buildPrContext } from "../../src/remediation/pr-context.js";
import { buildPrIntent } from "../../src/remediation/pr-intent.js";
import { runMigrations } from "../../src/remediation/run-migrations.js";
import type { HealthReport, IntakePackage, PackageHealth, PolicyResult, State } from "../../src/types.js";
import semver from "semver";
import { branchName } from "../../src/remediation/branch-name.js";
import { isValidBranchName } from "../../src/remediation/is-valid-branch-name.js";
import { NOT_SCANNED_LINE } from "../../src/remediation/pr-body.js";
import { BASE_REF_DEFAULT } from "../../src/remediation/pr-intent.js";
import { rangeStyle, styledRange } from "../../src/remediation/range-style.js";
import { selectBump } from "../../src/remediation/select-bump.js";
import { SIGNAL_NAMES } from "../../src/types.js";
import { arbBumpData, arbHostileHealth, arbReportAndOptions, arbSelectInput, healthySignals, RANGE_MARKER } from "./arbitraries.js";

/** The fixed texts of design.md. Replaced by imports when each fix lands (tasks 3.1 and 4.1). */
const REASON_RANGE_NOT_REGISTRY = "declared range is not a registry semver range, so a bump would replace its source";
const INCOMPLETE_SCAN_LINE = "Stylesheets and scripts: scan incomplete, some files were not read. Check them by hand.";

const POLICY: PolicyResult = { source: "default", pass: true, rules: [] };
const pkg = (name: string, state: State = "Haunted", installedVersion = "1.0.0"): PackageHealth => ({
  name,
  installedVersion,
  state,
  stateReason: `rule for ${state}`,
  signals: healthySignals(),
  missingSignals: [],
});
const report = (...packages: PackageHealth[]): HealthReport => ({ generatedAt: "2026-11-25T00:00:00.000Z", packages });
const intake = (name: string, declaredRange: string, origin: IntakePackage["origin"] = "dependencies"): IntakePackage => ({
  name,
  installedVersion: "1.0.0",
  declaredRange,
  origin,
  resolution: "locked",
});
const SAFE_BUMP: BumpDataResult = { ok: true, published: ["1.0.0", "1.0.1"], deprecated: new Set(), advisories: new Map([["1.0.1", []]]) };

/** The "## Review before merging" section of a body, up to the next heading. */
function reviewSection(body: string): string {
  const at = body.indexOf("## Review before merging");
  if (at === -1) return "";
  const next = body.indexOf("\n## ", at + 3);
  return next === -1 ? body.slice(at) : body.slice(at, next);
}

// D1 ------------------------------------------------------------------------------------------------------------------

const NON_REGISTRY_RANGES = [
  "file:../foo",
  "link:../foo",
  "git+https://github.com/o/foo.git",
  "github:o/foo",
  "https://example.com/foo-1.0.0.tgz",
  "npm:@fork/foo@^1.2.0",
  "workspace:*",
  "latest",
  `^${"1".repeat(256)}`,
];

function expectNoBumpOver(range: string, data: BumpDataResult): void {
  const r = report(pkg("foo"));
  const options: PlanOptions = { intake: [intake("foo", range)], bumpData: new Map([["foo", data]]) };
  const [plan] = planRemediation(r, options);
  expect(plan).toMatchObject({ packageName: "foo", kind: "bump", status: "unavailable", reason: REASON_RANGE_NOT_REGISTRY });
  expect(plan?.edit).toBeUndefined();
  expect(plan?.chosenVersion).toBeUndefined();
  expect(plan?.majorUpgrade).toBeUndefined();
  const ctx = buildPrContext(r, POLICY, "foo");
  expect(ctx).not.toBeNull();
  if (plan !== undefined && ctx !== null) expect(buildPrIntent(plan, ctx)).toBeNull();
  expect(bumpTargets(r, options)).toEqual([]);
}

describe("remediation-safety exploration, D1: a Non-registry range is never overwritten", () => {
  for (const range of NON_REGISTRY_RANGES) {
    it(`declared range ${JSON.stringify(range.length > 40 ? `${range.slice(0, 12)}…(${String(range.length)})` : range)} gives an unavailable plan`, () => {
      expect(isResolvableRange(range)).toBe(false);
      expectNoBumpOver(range, SAFE_BUMP);
    });
  }
  it("Feature: remediation-safety, Property 1: Bug Condition D1", () => {
    fc.assert(
      fc.property(
        fc.oneof(fc.constantFrom(...NON_REGISTRY_RANGES), fc.string({ maxLength: 40 })).filter((s) => !isResolvableRange(s)),
        arbBumpData.filter((d) => d.ok),
        (range, data) => expectNoBumpOver(range, data),
      ),
      { numRuns: 1000 },
    );
  });
});

// D2 ------------------------------------------------------------------------------------------------------------------

const dep = (name: string): IntakePackage => ({ name, installedVersion: "7.0.3", declaredRange: "^7.0.3", origin: "devDependencies", resolution: "locked" });
const sassReport = (): HealthReport => ({
  generatedAt: "2026-11-25T00:00:00.000Z",
  packages: [{ name: "node-sass", installedVersion: "7.0.3", state: "Dead", stateReason: "deprecated", signals: healthySignals(), missingSignals: [] }],
});

async function migrateBody(files: ReadonlyMap<string, string>): Promise<{ body: string; scan: unknown }> {
  const r = sassReport();
  const migrations = await runMigrations(r, {}, { packageJson: { packages: [dep("node-sass"), dep("sass")], scripts: new Map() }, files: new InMemoryFileSource(files), data: new Map() });
  const [plan] = planRemediation(r, { migrations });
  const ctx = buildPrContext(r, POLICY, "node-sass");
  if (plan === undefined || ctx === null) throw new Error("no node-sass plan");
  return { body: buildPrBody(plan, ctx), scan: plan.migration?.scan };
}

function expectIncomplete(section: string): void {
  expect(section).toContain(INCOMPLETE_SCAN_LINE);
  expect(section.split("\n")).not.toContain(NONE_LINE);
}

const capFiles = (): Map<string, string> =>
  new Map(Array.from({ length: 201 }, (_, i) => [`s${String(i).padStart(3, "0")}.scss`, i === 200 ? ".a /deep/ .b {}" : ".a {}"]));

describe("remediation-safety exploration, D2: an Incomplete scan is never reported as none", () => {
  it("201 stylesheets with /deep/ only past the read cap", async () => {
    const { body, scan } = await migrateBody(capFiles());
    expect(scan).toMatchObject({ performed: true, capped: true });
    expectIncomplete(reviewSection(body));
  });
  it("one stylesheet over 256 KiB with /deep/", async () => {
    const { body, scan } = await migrateBody(new Map([["big.scss", `.a /deep/ .b {}\n${"x".repeat(262144)}`]]));
    expect(scan).toMatchObject({ performed: true, skipped: 1 });
    expectIncomplete(reviewSection(body));
  });
  it("an unsafe listed path next to a clean stylesheet", async () => {
    const { body, scan } = await migrateBody(new Map([["../escape.scss", ".a /deep/ .b {}"], ["a.scss", ".a {}"]]));
    expect(scan).toMatchObject({ performed: true, skipped: 1 });
    expectIncomplete(reviewSection(body));
  });
  it("Feature: remediation-safety, Property 2: Bug Condition D2", async () => {
    const arbClean = fc.dictionary(
      fc.stringMatching(/^[a-z]{1,6}$/).map((s) => `src/${s}.scss`),
      fc.constantFrom(".a {}", ".a /deep/ .b {}", "@import 'x';"),
      { maxKeys: 5 },
    );
    await fc.assert(
      fc.asyncProperty(arbClean, fc.constantFrom("unsafe" as const, "big" as const, "cap" as const), async (clean, cause) => {
        const files = new Map(cause === "cap" ? capFiles() : Object.entries(clean));
        if (cause === "unsafe") files.set("../escape.scss", ".a {}");
        if (cause === "big") files.set("zz-big.scss", `.a {}\n${"x".repeat(262144)}`);
        const { body } = await migrateBody(files);
        expectIncomplete(reviewSection(body));
      }),
      { numRuns: 1000 },
    );
  }, 300_000);
});

// D3 ------------------------------------------------------------------------------------------------------------------

function expectNoRemove(name: string, origin: IntakePackage["origin"], state: State = "Possessed"): void {
  const [plan] = planRemediation(report(pkg(name, state)), { intake: [intake(name, "^1.0.0", origin)], importSites: new Map([[name, 0]]) });
  expect(plan?.packageName).toBe(name);
  expect(plan?.kind).not.toBe("remove");
  expect(plan?.edit?.op).not.toBe("remove-dependency");
}

describe("remediation-safety exploration, D3: no remove for an Implicit-use name", () => {
  for (const name of ["@types/node", "@types/express", "tslib"]) {
    it(`${name} with 0 import sites is not removed`, () => expectNoRemove(name, "dependencies"));
  }
  it("Feature: remediation-safety, Property 3: Bug Condition D3", () => {
    const arbImplicit = fc.oneof(
      fc.constantFrom("tslib", "@babel/runtime", "@swc/helpers", "core-js", "regenerator-runtime"),
      fc.stringMatching(/^[a-z][a-z0-9-]{0,12}$/).map((s) => `@types/${s}`),
    );
    fc.assert(
      fc.property(arbImplicit, fc.constantFrom("dependencies" as const, "devDependencies" as const), fc.constantFrom<State>("Possessed", "Dead", "Haunted"), (name, origin, state) =>
        expectNoRemove(name, origin, state),
      ),
      { numRuns: 1000 },
    );
  });
});

// Preservation -------------------------------------------------------------------------------------------------------
// design Properties 4 to 9. Written and run on the unfixed code first, where they must pass.

const IMPLICIT = new Set(["tslib", "@babel/runtime", "@swc/helpers", "core-js", "regenerator-runtime"]);
const implicitUse = (name: string): boolean => name.startsWith("@types/") || IMPLICIT.has(name);

/** arbReportAndOptions with every declared range turned into a Registry range, so no input meets D1. */
const arbRegistryReportAndOptions = arbReportAndOptions.map(({ report: r, options }) => ({
  report: r,
  options: { ...options, intake: (options.intake ?? []).map((i) => (isResolvableRange(i.declaredRange) ? i : { ...i, declaredRange: "^1.0.0" })) },
}));

/** arbSelectInput restricted to a valid installed version and a Registry range, so the planner reaches selectBump. */
const arbRegistrySelect = arbSelectInput.filter(
  (s): s is typeof s & { declaredRange: string } =>
    semver.valid(s.installedVersion) === s.installedVersion && s.declaredRange !== undefined && isResolvableRange(s.declaredRange),
);

function planForSelect(s: typeof arbRegistrySelect extends fc.Arbitrary<infer T> ? T : never) {
  const r = report(pkg("target", "Haunted", s.installedVersion));
  const options: PlanOptions = {
    intake: [{ ...intake("target", s.declaredRange), installedVersion: s.installedVersion }],
    bumpData: new Map([["target", { ok: true as const, published: s.published, deprecated: s.deprecated, advisories: s.advisories }]]),
  };
  const [plan] = planRemediation(r, options);
  if (plan === undefined) throw new Error("no plan");
  return plan;
}

describe("remediation-safety preservation", () => {
  it("Feature: remediation-safety, Property 4: Never downgrade", () => {
    fc.assert(
      fc.property(arbReportAndOptions, ({ report: r, options }) => {
        for (const plan of planRemediation(r, options)) {
          if (plan.kind !== "bump" || plan.status !== "proposed") continue;
          expect(semver.gt(plan.chosenVersion as string, plan.installedVersion)).toBe(true);
        }
      }),
      { numRuns: 1000 },
    );
  });

  it("Feature: remediation-safety, Property 5: Lowest safe candidate on Registry ranges", () => {
    fc.assert(
      fc.property(arbRegistrySelect, (s) => {
        const plan = planForSelect(s);
        const result = selectBump(s);
        if (result.outcome === "chosen") {
          expect(plan).toMatchObject({ status: "proposed", chosenVersion: result.version, majorUpgrade: result.majorUpgrade });
        } else {
          expect(plan).toMatchObject({ status: "no-safe-version", reason: `no safe version found among ${String(result.evaluated)} evaluated candidate versions` });
        }
      }),
      { numRuns: 1000 },
    );
  });

  it("Feature: remediation-safety, Property 6: Range style on Registry ranges", () => {
    fc.assert(
      fc.property(arbRegistrySelect, (s) => {
        const plan = planForSelect(s);
        if (plan.status !== "proposed") return;
        const v = plan.chosenVersion as string;
        const range = plan.edit?.op === "set-range" ? plan.edit.range : "";
        expect(range).toBe(styledRange(rangeStyle(s.declaredRange), v));
        expect(semver.validRange(range)).not.toBeNull();
        expect(semver.minVersion(range)?.version).toBe(v);
      }),
      { numRuns: 1000 },
    );
  });

  it("Feature: remediation-safety, Property 7: Branch names", () => {
    fc.assert(
      fc.property(arbReportAndOptions, ({ report: r, options }) => {
        const branches: string[] = [];
        for (const plan of planRemediation(r, options)) {
          const ctx = buildPrContext(r, POLICY, plan.packageName);
          if (ctx === null) continue;
          const intent = buildPrIntent(plan, ctx);
          if (intent === null) continue;
          expect(intent.branch).toBe(branchName(plan.kind, plan.packageName));
          expect(isValidBranchName(intent.branch)).toBe(true);
          expect(intent.baseRef).toBe(BASE_REF_DEFAULT);
          branches.push(intent.branch);
        }
        expect(new Set(branches).size).toBe(branches.length);
      }),
      { numRuns: 1000 },
    );
  });

  it("Feature: remediation-safety, Property 8a: Body escaping, no echo, signal rows and size", () => {
    fc.assert(
      fc.property(arbHostileHealth, fc.constantFrom("^1.0.0", "file:../x"), (health, range) => {
        const r: HealthReport = { generatedAt: "2026-11-25T00:00:00.000Z", packages: [health] };
        const declared = `${range} ${RANGE_MARKER}`;
        const options: PlanOptions = { intake: [{ ...intake(health.name, declared), installedVersion: health.installedVersion }] };
        for (const plan of planRemediation(r, options)) {
          const ctx = buildPrContext(r, POLICY, plan.packageName);
          if (ctx === null) continue;
          const body = buildPrBody(plan, ctx);
          expect(body).not.toContain(RANGE_MARKER);
          expect(body).not.toContain(declared);
          for (const name of SIGNAL_NAMES) expect(body.split("\n").filter((l) => l.startsWith(`| \`${name}\` |`))).toHaveLength(1);
          expect(body.length).toBeLessThanOrEqual(60000);
        }
      }),
      { numRuns: 1000 },
    );
  });

  it("Feature: remediation-safety, Property 8b: Complete and not-performed scans keep their lines", async () => {
    const arbClean = fc.dictionary(
      fc.stringMatching(/^[a-z]{1,6}$/).map((s) => `src/${s}.scss`),
      fc.constantFrom(".a {}", ".a /deep/ .b {}", "@import 'x';"),
      { maxKeys: 6 },
    );
    await fc.assert(
      fc.asyncProperty(arbClean, async (clean) => {
        const { body, scan } = await migrateBody(new Map(Object.entries(clean)));
        expect(scan).toMatchObject({ performed: true, capped: false, skipped: 0 });
        const section = reviewSection(body);
        const hasSite = section.includes(" deep-combinator: ");
        expect(section.split("\n").includes(NONE_LINE)).toBe(!hasSite);
        expect(section).not.toContain(INCOMPLETE_SCAN_LINE);
      }),
      { numRuns: 1000 },
    );
    const r = sassReport();
    const migrations = await runMigrations(r, {}, { packageJson: { packages: [dep("node-sass"), dep("sass")], scripts: new Map() }, files: undefined, data: new Map() });
    const [plan] = planRemediation(r, { migrations });
    const ctx = buildPrContext(r, POLICY, "node-sass");
    if (plan === undefined || ctx === null) throw new Error("no node-sass plan");
    const section = reviewSection(buildPrBody(plan, ctx));
    expect(section).toContain(NOT_SCANNED_LINE);
    expect(section).not.toContain(INCOMPLETE_SCAN_LINE);
  }, 300_000);

  it("Feature: remediation-safety, Property 9: Plans outside the bug conditions keep the old kind rule", () => {
    fc.assert(
      fc.property(arbRegistryReportAndOptions, ({ report: r, options }) => {
        for (const plan of planRemediation(r, options)) {
          if (implicitUse(plan.packageName)) continue;
          const recipes = options.recipes ?? new Map();
          const expected = recipes.has(plan.packageName) ? "migrate" : options.importSites?.get(plan.packageName) === 0 ? "remove" : "bump";
          expect(plan.kind).toBe(expected);
          expect(plan.reason ?? "").not.toBe(REASON_RANGE_NOT_REGISTRY);
        }
      }),
      { numRuns: 1000 },
    );
  });
});
