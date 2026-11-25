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
import { arbBumpData, healthySignals } from "./arbitraries.js";

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
