// Generators for the remediation tests. Spec: .kiro/specs/remediation, Correctness Properties.

import fc from "fast-check";
import { available, unavailable } from "../../src/signal.js";
import { isValidPackageName } from "../../src/intake/names.js";
import type { BumpDataResult } from "../../src/remediation/gather-bump-data.js";
import type { PlanOptions } from "../../src/remediation/plan-options.js";
import type { SelectBumpInput } from "../../src/remediation/select-bump.js";
import {
  RULE_TYPES,
  SEVERITIES,
  STATE_ORDER,
  type Advisory,
  type HealthReport,
  type IntakePackage,
  type PackageHealth,
  type PackageSignals,
  type PolicyResult,
  type Recipe,
  type RuleResult,
  type Signal,
} from "../../src/types.js";

export const MARKER = "@@zx@@";
export const RANGE_MARKER = "##range-marker##";

const AT = new Date("2026-11-12T00:00:00Z");
const SRC = "https://registry.npmjs.org/x";

/** Versions around 1.x to 3.x so candidates collide with ranges often. */
export const arbSmallVersion: fc.Arbitrary<string> = fc
  .tuple(fc.integer({ min: 0, max: 3 }), fc.integer({ min: 0, max: 4 }), fc.integer({ min: 0, max: 4 }))
  .map(([a, b, c]) => `${String(a)}.${String(b)}.${String(c)}`);

export const arbPrerelease: fc.Arbitrary<string> = fc
  .tuple(arbSmallVersion, fc.constantFrom("alpha", "beta", "rc"), fc.nat(3))
  .map(([v, tag, n]) => `${v}-${tag}.${String(n)}`);

export const arbJunkVersion: fc.Arbitrary<string> = fc.oneof(
  arbPrerelease,
  arbSmallVersion.map((v) => `${v}+build.1`),
  arbSmallVersion.map((v) => `v${v}`),
  fc.string({ maxLength: 10 }),
  fc.constant("1".repeat(65)),
  fc.constant("__proto__"),
);

export const arbSelectRange: fc.Arbitrary<string | undefined> = fc.oneof(
  { weight: 1, arbitrary: fc.constant(undefined) },
  {
    weight: 5,
    arbitrary: fc
      .tuple(fc.constantFrom("^", "~", ">=", "", "=", "<"), arbSmallVersion)
      .map(([op, v]) => `${op}${v}`),
  },
  { weight: 1, arbitrary: fc.constantFrom("", "*", "1.x", ">=1 <3", "latest", "git+https://x/y.git", "file:../x", "npm:other@1", `^${"1".repeat(299)}`) },
  { weight: 1, arbitrary: arbPrerelease.map((v) => `^${v}`) },
);

const arbAdvisoryFor = (severity: fc.Arbitrary<Advisory["severity"]>): fc.Arbitrary<Advisory> =>
  fc.record({ id: fc.stringMatching(/^GHSA-[a-z0-9]{4}$/), severity, summary: fc.string({ maxLength: 20 }) });

export const arbAdvisory = arbAdvisoryFor(fc.constantFrom(...SEVERITIES));

/** Installed version, optional range, published list with noise, deprecated subset, advisories with gaps. */
export const arbSelectInput: fc.Arbitrary<SelectBumpInput> = fc
  .record({
    installedVersion: arbSmallVersion,
    declaredRange: arbSelectRange,
    published: fc.array(fc.oneof({ weight: 4, arbitrary: arbSmallVersion }, { weight: 1, arbitrary: arbJunkVersion }), { maxLength: 60 }),
  })
  .chain((base) => {
    const versions = [...new Set(base.published)];
    return fc
      .record({
        deprecated: fc.subarray(versions),
        advisories: fc.array(
          fc.tuple(fc.constantFrom(...(versions.length > 0 ? versions : ["0.0.0"])), fc.array(arbAdvisory, { maxLength: 2 })),
          { maxLength: versions.length + 2 },
        ),
        lowOnly: fc.subarray(versions),
      })
      .map(({ deprecated, advisories, lowOnly }): SelectBumpInput => {
        const map = new Map<string, readonly Advisory[]>(advisories);
        for (const v of lowOnly) if (!map.has(v)) map.set(v, []);
        return {
          installedVersion: base.installedVersion,
          ...(base.declaredRange !== undefined ? { declaredRange: base.declaredRange } : {}),
          published: base.published,
          deprecated: new Set(deprecated),
          advisories: map,
        };
      });
  });

/** Names from tokens that force encoding collisions, kept only when valid. */
export const arbDenseName: fc.Arbitrary<string> = fc
  .tuple(fc.boolean(), fc.array(fc.constantFrom("a", "_", "__", ".", "..", "~", ".lock", "-", "b"), { minLength: 1, maxLength: 6 }))
  .map(([scoped, parts]) => (scoped ? `@s${parts.slice(0, 2).join("")}/a${parts.slice(2).join("")}` : `a${parts.join("")}`))
  .filter(isValidPackageName);

export const arbPlanName: fc.Arbitrary<string> = fc.oneof(
  { weight: 6, arbitrary: fc.constantFrom("a", "b", "c", "left-pad", "@s/a", "@s/b", "x_y", "a.lock") },
  { weight: 1, arbitrary: fc.constantFrom("__proto__", "Bad Name", "", "constructor", "_x") },
  { weight: 1, arbitrary: fc.constant(`a${"_".repeat(150)}`) },
);

function sig<T>(value: T): Signal<T> {
  return available(value, SRC, AT);
}

export function healthySignals(): PackageSignals {
  return {
    lastPublish: sig<string | null>("2026-01-01T00:00:00.000Z"),
    deprecated: sig(false),
    hasInstallScript: sig(false),
    advisories: sig<readonly Advisory[]>([]),
    maintainers: sig<readonly string[]>(["alice"]),
    provenance: sig({ present: false, predicateType: null }),
    transitiveReach: sig({ reach: 1, graphsMissing: 0 }),
    maintainerChange: sig({ status: "history-insufficient" as const, events: [] as const }),
    provenanceRegression: sig({ status: "history-insufficient" as const, reason: "none" }),
    newInstallScript: sig<readonly { version: string; publishTime: string }[]>([]),
  };
}

export const arbInstalled: fc.Arbitrary<string> = fc.oneof(
  { weight: 6, arbitrary: arbSmallVersion },
  { weight: 1, arbitrary: fc.constantFrom("unresolved", "v1.0.0", "1.0") },
);

export const arbPlanPackage: fc.Arbitrary<PackageHealth> = fc
  .record({ name: arbPlanName, installedVersion: arbInstalled, state: fc.constantFrom(...STATE_ORDER), allUnavailable: fc.boolean() })
  .map(({ name, installedVersion, state, allUnavailable }) => {
    const base = healthySignals();
    const signals = allUnavailable
      ? (Object.fromEntries(Object.keys(base).map((k) => [k, unavailable("unresolvable range", SRC, AT)])) as unknown as PackageSignals)
      : base;
    return { name, installedVersion, state, stateReason: `rule for ${state}`, signals, missingSignals: [] };
  });

/** 0 to 12 packages; names may repeat. */
export const arbPlanReport: fc.Arbitrary<HealthReport> = fc
  .array(arbPlanPackage, { maxLength: 12 })
  .map((packages) => ({ generatedAt: "2026-11-12T00:00:00.000Z", packages }));

export const arbImportSite: fc.Arbitrary<number> = fc.oneof(
  { weight: 3, arbitrary: fc.constant(0) },
  { weight: 1, arbitrary: fc.nat(5) },
  { weight: 1, arbitrary: fc.integer({ min: -5, max: -1 }) },
  { weight: 1, arbitrary: fc.double({ noNaN: false }) },
  { weight: 1, arbitrary: fc.constantFrom(Number.NaN, Number.POSITIVE_INFINITY, 0.5) },
);

export const arbBumpData: fc.Arbitrary<BumpDataResult> = fc.oneof(
    { weight: 1, arbitrary: fc.constant<BumpDataResult>({ ok: false, reason: "packument request failed (HTTP 500)" }) },
    {
      weight: 4,
      arbitrary: arbSelectInput.map(
        (s): BumpDataResult => ({ ok: true, published: s.published, deprecated: s.deprecated, advisories: s.advisories }),
      ),
    },
);

/** Options for a report: intake for most names, import sites, recipes and bump data for a subset. */
export function arbOptionsFor(report: HealthReport): fc.Arbitrary<PlanOptions> {
  const names = [...new Set(report.packages.map((p) => p.name))];
  return fc
    .record({
      intakeNames: fc.subarray(names),
      origins: fc.array(fc.constantFrom("dependencies" as const, "devDependencies" as const), { minLength: names.length, maxLength: names.length }),
      ranges: fc.array(arbSelectRange, { minLength: names.length, maxLength: names.length }),
      sites: fc.array(fc.tuple(fc.constantFrom(...(names.length > 0 ? names : ["a"])), arbImportSite), { maxLength: names.length }),
      recipeNames: fc.subarray(names, { maxLength: Math.min(2, names.length) }),
      bump: fc.array(fc.tuple(fc.constantFrom(...(names.length > 0 ? names : ["a"])), arbBumpData), { maxLength: names.length }),
    })
    .map((r): PlanOptions => {
      const intake: IntakePackage[] = r.intakeNames.map((name) => {
        const i = names.indexOf(name);
        const pkg = report.packages.find((p) => p.name === name);
        return {
          name,
          installedVersion: pkg?.installedVersion ?? "1.0.0",
          declaredRange: r.ranges[i] ?? "^1.0.0",
          origin: r.origins[i] ?? "dependencies",
          resolution: "locked",
        };
      });
      const recipes = new Map<string, Recipe>(r.recipeNames.map((n) => [n, { id: `recipe-${n}` }]));
      return { intake, importSites: new Map(r.sites), recipes, bumpData: new Map(r.bump) };
    });
}

export const arbReportAndOptions = arbPlanReport.chain((report) => arbOptionsFor(report).map((options) => ({ report, options })));

/** A string with a planted marker and Markdown, HTML, pipes, backticks, newlines, bidi and astral characters. */
export const arbHostileString: fc.Arbitrary<string> = fc
  .tuple(
    fc.constantFrom("", "# ", "> ", "- ", "1. ", "| ", "* "),
    fc.array(
      fc.constantFrom("<b>x</b>", "[l](http://e.x)", "![i](http://e.x/i.png)", "&amp;", "|", "`", "\n", "\r\n", "‮", " ", "😀", "\ud800", "*em*", "@user", "https://evil.example"),
      { maxLength: 6 },
    ),
    fc.fullUnicodeString({ maxLength: 20 }),
  )
  .map(([lead, parts, tail]) => `${lead}${parts.join("")}${MARKER}${tail}`);

/** A PackageHealth with every free-text field hostile, every list non-empty. */
export const arbHostileHealth: fc.Arbitrary<PackageHealth> = fc
  .record({
    name: arbHostileString,
    installedVersion: arbHostileString,
    state: fc.constantFrom(...STATE_ORDER),
    stateReason: arbHostileString,
    text: fc.array(arbHostileString, { minLength: 14, maxLength: 14 }),
    unavailableMask: fc.array(fc.boolean(), { minLength: 10, maxLength: 10 }),
  })
  .map((r) => {
    const t = (i: number): string => r.text[i] as string;
    const avail = <T>(value: T, i: number): Signal<T> => available(value, t(i), AT);
    const signals: PackageSignals = {
      lastPublish: avail<string | null>(t(0), 0),
      deprecated: avail(true, 1),
      hasInstallScript: avail(true, 2),
      advisories: avail<readonly Advisory[]>([{ id: t(3), severity: "High", summary: t(4) }], 3),
      maintainers: avail<readonly string[]>([t(5), t(6)], 5),
      provenance: avail({ present: true, predicateType: t(7) }, 7),
      transitiveReach: avail({ reach: 3, graphsMissing: 1 }, 8),
      maintainerChange: avail(
        { status: "history-sufficient" as const, events: [{ kind: "live" as const, before: [t(9)], after: [t(10)], eventTime: t(11), recent: true }] },
        9,
      ),
      provenanceRegression: avail({ status: "regression" as const, installedVersion: t(12), earlierVersion: t(13), snapshotCaptureTime: t(0) }, 12),
      newInstallScript: avail([{ version: t(13), publishTime: t(1) }], 13),
    };
    const keys = Object.keys(signals) as (keyof PackageSignals)[];
    const masked = Object.fromEntries(
      keys.map((k, i) => [k, r.unavailableMask[i] === true ? unavailable(t(i), t((i + 1) % 14), AT) : signals[k]]),
    ) as unknown as PackageSignals;
    return { name: r.name, installedVersion: r.installedVersion, state: r.state, stateReason: r.stateReason, signals: masked, missingSignals: [] };
  });

/** A policy result naming the target in some failing rules and other names in others. */
export function arbPolicyResultFor(target: string, maxRules = 30): fc.Arbitrary<PolicyResult> {
  return fc
    .array(
      fc.record({
        type: fc.constantFrom(...RULE_TYPES),
        name: fc.option(fc.string({ minLength: 1, maxLength: 10 }), { nil: undefined }),
        pass: fc.boolean(),
        names: fc.array(fc.constantFrom(target, "other", "@s/z"), { maxLength: 3 }),
        reason: fc.string({ maxLength: 20 }),
      }),
      { maxLength: maxRules },
    )
    .map((rules): PolicyResult => ({
      source: "default",
      pass: rules.every((r) => r.pass),
      rules: rules.map(
        (r, index): RuleResult => ({
          index,
          type: r.type,
          ...(r.name !== undefined ? { name: r.name } : {}),
          pass: r.pass || r.names.length === 0,
          failures: r.pass
            ? []
            : r.names.map((n) => ({ name: n, installedVersion: "1.0.0", signal: "state" as const, value: "Dead", source: null, fetchedAt: AT.toISOString(), reason: r.reason })),
          unevaluated: [],
          notFound: [],
        }),
      ),
    }));
}

/** Deep-freezes a value in place and returns it. */
export function deepFreeze<T>(value: T): T {
  if (value instanceof Map || value instanceof Set) return Object.freeze(value);
  if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value)) deepFreeze(v);
  }
  return value;
}
