// Shared fast-check arbitraries for engine tests.

import fc from "fast-check";
import { isValidPackageName } from "../src/intake/names.js";
import { available, unavailable } from "../src/signal.js";
import type { Snapshot, SnapshotVersion } from "../src/snapshot.js";
import type { StateInputs } from "../src/state.js";
import {
  SEVERITIES,
  STATE_ORDER,
  type Advisory,
  type HealthReport,
  type LockfileVersion,
  type ScanMetadata,
  type MaintainerChangeEvent,
  type MaintainerChangeValue,
  type NewDependencyEntry,
  type NewDependencyValue,
  type NewInstallScriptEvent,
  type OriginalSignals,
  type PackageHealth,
  type PackageSignals,
  type Policy,
  type ProvenanceRegressionValue,
  type ProvenanceValue,
  type PublisherChangeValue,
  type PublishMethod,
  type PublishRecord,
  type Rule,
  type Signal,
} from "../src/types.js";

export const MIN_DATE = new Date("2000-01-01T00:00:00Z");
export const MAX_DATE = new Date("2040-01-01T00:00:00Z");

export const dateArb: fc.Arbitrary<Date> = fc.date({ min: MIN_DATE, max: MAX_DATE });

export const isoArb: fc.Arbitrary<string> = dateArb.map((d) => d.toISOString());

export const severityArb = fc.constantFrom(...SEVERITIES);

export const advisoryArb: fc.Arbitrary<Advisory> = fc.record({
  id: fc.stringMatching(/^[A-Z]{3,5}-[0-9]{4}-[0-9a-z]{3,6}$/),
  severity: severityArb,
  summary: fc.string({ maxLength: 60 }),
});

export const advisoriesArb: fc.Arbitrary<Advisory[]> = fc.array(advisoryArb, { maxLength: 5 });

/** Inputs to the pure state function. undefined models an unavailable signal. */
export const stateInputsArb: fc.Arbitrary<StateInputs> = fc
  .record({
    lastPublish: fc.option(fc.option(dateArb, { nil: null }), { nil: undefined }),
    deprecated: fc.option(fc.boolean(), { nil: undefined }),
    advisories: fc.option(advisoriesArb, { nil: undefined }),
  })
  .map((r) => {
    const out: { -readonly [K in keyof StateInputs]: StateInputs[K] } = {};
    if (r.lastPublish !== undefined) out.lastPublish = r.lastPublish;
    if (r.deprecated !== undefined) out.deprecated = r.deprecated;
    if (r.advisories !== undefined) out.advisories = r.advisories;
    return out;
  });

const namesArb = fc.array(fc.constantFrom("alice", "bob", "carol", "mallory"), { maxLength: 4 });

export const maintainerChangeEventArb: fc.Arbitrary<MaintainerChangeEvent> = fc.record({
  kind: fc.constantFrom<"snapshot-pair" | "live">("snapshot-pair", "live"),
  before: namesArb,
  after: namesArb,
  eventTime: isoArb,
  recent: fc.boolean(),
});

/** Any maintainerChange value: history-insufficient, or sufficient with 0 to 3 events of arbitrary recency. */
export const maintainerChangeValueArb: fc.Arbitrary<MaintainerChangeValue> = fc.oneof(
  fc.constant<MaintainerChangeValue>({ status: "history-insufficient", events: [] }),
  fc
    .array(maintainerChangeEventArb, { maxLength: 3 })
    .map((events): MaintainerChangeValue => ({ status: "history-sufficient", events })),
);

export const provenanceRegressionValueArb: fc.Arbitrary<ProvenanceRegressionValue> = fc.oneof(
  fc.record({
    status: fc.constant("regression" as const),
    installedVersion: fc.stringMatching(/^[0-9]\.[0-9]\.[0-9]$/),
    earlierVersion: fc.stringMatching(/^[0-9]\.[0-9]\.[0-9]$/),
    snapshotCaptureTime: isoArb,
  }),
  fc.record({ status: fc.constant("no-regression" as const), snapshotCaptureTime: isoArb }),
  fc.record({ status: fc.constant("history-insufficient" as const), reason: fc.string({ maxLength: 30 }) }),
);

export const newInstallScriptArb: fc.Arbitrary<NewInstallScriptEvent[]> = fc.array(
  fc.record({ version: fc.stringMatching(/^[0-9]\.[0-9]\.[0-9]$/), publishTime: isoArb }),
  { maxLength: 2 },
);

type MutableStateInputs = { -readonly [K in keyof StateInputs]: StateInputs[K] };

// Spec new-signals.
const smallVersionArb = fc.stringMatching(/^[0-9]\.[0-9]\.[0-9]$/);
export const publishMethodArb: fc.Arbitrary<PublishMethod> = fc.constantFrom("trusted-publisher", "token", "unknown");
export const publishRecordArb: fc.Arbitrary<PublishRecord> = fc.record({
  version: smallVersionArb,
  publisher: fc.option(fc.constantFrom("alice", "bob", "GitHub Actions"), { nil: null }),
  method: publishMethodArb,
  publishTime: isoArb,
});
export const publisherChangeValueArb: fc.Arbitrary<PublisherChangeValue> = fc.oneof(
  fc.record({ status: fc.constant("no-earlier-version" as const), installed: fc.option(publishRecordArb, { nil: null }) }),
  fc.record({ status: fc.constantFrom("same" as const, "changed" as const, "unknown" as const), installed: publishRecordArb, earlier: publishRecordArb }),
);
export const newDependencyEntryArb: fc.Arbitrary<NewDependencyEntry> = fc.record({
  name: fc.constantFrom("a", "b", "c", "plain-x", "@s/d"),
  range: fc.constantFrom("^1.0.0", "~2.1.0", "git+https://x", "*"),
  resolvedVersion: fc.option(smallVersionArb, { nil: null }),
  resolvedPublishTime: fc.option(isoArb, { nil: null }),
  installScript: fc.option(fc.boolean(), { nil: null }),
  fresh: fc.boolean(),
});
export const newDependencyValueArb: fc.Arbitrary<NewDependencyValue> = fc.oneof(
  fc.record({ status: fc.constant("no-earlier-version" as const), installedVersion: smallVersionArb }),
  fc
    .tuple(smallVersionArb, smallVersionArb, isoArb, fc.array(newDependencyEntryArb, { maxLength: 5 }), fc.nat(3))
    .map(([installedVersion, earlierVersion, installedPublishTime, added, extra]): NewDependencyValue => {
      const sorted = [...added].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
      const addedCount = sorted.length + (sorted.length === 5 ? extra : 0);
      return { status: "compared", installedVersion, earlierVersion, installedPublishTime, addedCount, capped: addedCount > 5, added: sorted };
    }),
);


/** Ten-signal state inputs. Each of the six new inputs is undefined (unavailable) or generated. */
export const tenSignalInputsArb: fc.Arbitrary<StateInputs> = fc
  .tuple(
    stateInputsArb,
    fc.option(maintainerChangeValueArb, { nil: undefined }),
    fc.option(provenanceRegressionValueArb, { nil: undefined }),
    fc.option(newInstallScriptArb, { nil: undefined }),
  )
  .map(([base, mc, pr, ns]) => {
    const out: MutableStateInputs = { ...base };
    if (mc !== undefined) out.maintainerChange = mc;
    if (pr !== undefined) out.provenanceRegression = pr;
    if (ns !== undefined) out.newInstallScript = ns;
    return out;
  });

/** Twelve-signal state inputs: the ten of history-signals plus optional publisherChange and newDependency. */
export const twelveSignalInputsArb: fc.Arbitrary<StateInputs> = fc
  .tuple(
    tenSignalInputsArb,
    fc.option(publisherChangeValueArb, { nil: undefined }),
    fc.option(newDependencyValueArb, { nil: undefined }),
  )
  .map(([base, pc, nd]) => {
    const out: MutableStateInputs = { ...base };
    if (pc !== undefined) out.publisherChange = pc;
    if (nd !== undefined) out.newDependency = nd;
    return out;
  });

/** New inputs that must never change a health-scoring result: absent, insufficient, no-regression, empty or not recent. */
export const inertNewInputsArb: fc.Arbitrary<Pick<StateInputs, "maintainerChange" | "provenanceRegression" | "newInstallScript">> =
  fc
    .tuple(
      fc.option(
        fc.oneof(
          fc.constant<MaintainerChangeValue>({ status: "history-insufficient", events: [] }),
          fc.constant<MaintainerChangeValue>({ status: "history-sufficient", events: [] }),
          fc
            .array(maintainerChangeEventArb.map((e): MaintainerChangeEvent => ({ ...e, recent: false })), { maxLength: 3 })
            .map((events): MaintainerChangeValue => ({ status: "history-sufficient", events })),
        ),
        { nil: undefined },
      ),
      fc.option(
        fc.oneof(
          fc.record({ status: fc.constant("no-regression" as const), snapshotCaptureTime: isoArb }),
          fc.record({ status: fc.constant("history-insufficient" as const), reason: fc.string({ maxLength: 30 }) }),
        ),
        { nil: undefined },
      ),
      fc.option(fc.constant<NewInstallScriptEvent[]>([]), { nil: undefined }),
    )
    .map(([mc, pr, ns]) => {
      const out: MutableStateInputs = {};
      if (mc !== undefined) out.maintainerChange = mc;
      if (pr !== undefined) out.provenanceRegression = pr;
      if (ns !== undefined) out.newInstallScript = ns;
      return out;
    });

export function signalArb<T>(valueArb: fc.Arbitrary<T>): fc.Arbitrary<Signal<T>> {
  return fc.oneof(
    fc.tuple(valueArb, fc.webUrl(), dateArb).map(([v, s, d]) => available(v, s, d)),
    fc.tuple(fc.string({ minLength: 1, maxLength: 40 }), fc.webUrl(), dateArb).map(([r, s, d]) => unavailable(r, s, d)),
  );
}

export const packageSignalsArb: fc.Arbitrary<OriginalSignals> = fc.record({
  lastPublish: signalArb(fc.option(isoArb, { nil: null })),
  deprecated: signalArb(fc.boolean()),
  hasInstallScript: signalArb(fc.boolean()),
  advisories: signalArb(advisoriesArb),
});

const SNAPSHOT_BASE_MS = Date.parse("2026-01-01T00:00:00.000Z");

/** Capture times: a few clustered instants (to force ties) or any date in range, always ISO UTC. */
export const captureTimeArb: fc.Arbitrary<string> = fc.oneof(
  fc.integer({ min: 0, max: 6 }).map((k) => new Date(SNAPSHOT_BASE_MS + k * 500).toISOString()),
  fc.date({ min: new Date("2026-01-01T00:00:00Z"), max: new Date("2027-01-01T00:00:00Z"), noInvalidDate: true }).map((d) => d.toISOString()),
);

export const snapshotVersionArb: fc.Arbitrary<SnapshotVersion> = fc.record({
  version: fc.stringMatching(/^[0-9]\.[0-9]\.[0-9]$/),
  publishTime: isoArb,
  hasInstallScript: fc.boolean(),
  provenance: fc.constantFrom<boolean | null>(true, false, null),
});

/** A valid Snapshot over a small name alphabet so packages collide often. */
export const arbSnapshot: fc.Arbitrary<Snapshot> = fc.record({
  name: fc.constantFrom("a", "b", "c", "@s/d"),
  captureTime: captureTimeArb,
  maintainers: fc.array(fc.constantFrom("alice", "bob", "carol", "mallory"), { maxLength: 6 }),
  versions: fc.array(snapshotVersionArb, { maxLength: 20 }),
});

// Policy generators. Spec: .kiro/specs/policy, design.md "Shared generators".

/** Short names from a small pool so collisions between matchers and report packages are common. */
export const arbName: fc.Arbitrary<string> = fc.constantFrom("a", "b", "c", "left-pad", "@s/a", "@s/b", "@t/a");

const arbValidPattern: fc.Arbitrary<string> = fc.constantFrom("*", "**", "a*", "@s/*", "@*/a", "?", "left-*", "zzz");

const DAY_MS = 86_400_000;

/** A lastPublish value around the reference instant: past, future, null or unparseable. */
function lastPublishValueArb(generatedMs: number): fc.Arbitrary<string | null> {
  return fc.oneof(
    { weight: 8, arbitrary: fc.integer({ min: -3000, max: 60 }).map((days) => new Date(generatedMs + days * DAY_MS).toISOString()) },
    { weight: 1, arbitrary: fc.constant(null) },
    { weight: 1, arbitrary: fc.constant("not-a-date") },
  );
}

const provenanceValueArb: fc.Arbitrary<ProvenanceValue> = fc.oneof(
  fc.constant<ProvenanceValue>({ present: false, predicateType: null }),
  fc.constant<ProvenanceValue>({ present: true, predicateType: "https://slsa.dev/provenance/v1" }),
);

const FIXED_AT = new Date("2026-01-01T00:00:00Z");
const FIXED_SOURCE = "https://example.test/fixed";

/** A PackageHealth whose three policy-relevant signals are generated and whose other signals are fixed. */
export function arbPackageFor(generatedMs: number, name: fc.Arbitrary<string> = arbName): fc.Arbitrary<PackageHealth> {
  return fc
    .record({
      name,
      installedVersion: fc.stringMatching(/^[0-9]\.[0-9]\.[0-9]$/),
      state: fc.constantFrom(...STATE_ORDER),
      stateReason: fc.string({ minLength: 1, maxLength: 20 }),
      hasInstallScript: signalArb(fc.boolean()),
      lastPublish: signalArb(lastPublishValueArb(generatedMs)),
      provenance: signalArb(provenanceValueArb),
    })
    .map((r): PackageHealth => {
      const signals: PackageSignals = {
        lastPublish: r.lastPublish,
        deprecated: available(false, FIXED_SOURCE, FIXED_AT),
        hasInstallScript: r.hasInstallScript,
        advisories: available([], FIXED_SOURCE, FIXED_AT),
        maintainers: available([], FIXED_SOURCE, FIXED_AT),
        provenance: r.provenance,
        transitiveReach: available({ reach: 0, graphsMissing: 0 }, FIXED_SOURCE, FIXED_AT),
        maintainerChange: available({ status: "history-insufficient", events: [] }, FIXED_SOURCE, FIXED_AT),
        provenanceRegression: available({ status: "history-insufficient", reason: "none" }, FIXED_SOURCE, FIXED_AT),
        newInstallScript: available([], FIXED_SOURCE, FIXED_AT),
        publisherChange: available({ status: "no-earlier-version", installed: null }, FIXED_SOURCE, FIXED_AT),
        newDependency: available({ status: "no-earlier-version", installedVersion: "1.0.0" }, FIXED_SOURCE, FIXED_AT),
      };
      return {
        name: r.name,
        installedVersion: r.installedVersion,
        state: r.state,
        stateReason: r.stateReason,
        signals,
        missingSignals: [],
      };
    });
}

export const arbPackage: fc.Arbitrary<PackageHealth> = arbPackageFor(Date.parse("2026-11-12T00:00:00Z"));

/** 0 to 8 packages with unique names. generatedAt is a valid ISO instant, or occasionally unparseable. */
export const arbReport: fc.Arbitrary<HealthReport> = fc
  .tuple(fc.date({ min: new Date("2024-01-01T00:00:00Z"), max: new Date("2030-01-01T00:00:00Z"), noInvalidDate: true }), fc.nat(9))
  .chain(([base, dice]) =>
    fc
      .uniqueArray(arbPackageFor(base.getTime()), { selector: (p) => p.name, maxLength: 8 })
      .map((packages): HealthReport => ({ generatedAt: dice === 0 ? "not-a-date" : base.toISOString(), packages })),
  );

const arbNameList = fc.array(arbName, { maxLength: 4 });
const arbPatternList = fc.array(arbValidPattern, { maxLength: 3 });

const arbMatcherFields = fc
  .tuple(arbNameList, arbPatternList, arbNameList, fc.boolean(), fc.boolean(), fc.boolean())
  .map(([names, patterns, excludes, a, b, c]) => ({
    ...(a ? { matchPackageNames: names } : {}),
    ...(b ? { matchPackagePatterns: patterns } : {}),
    ...(c ? { excludePackageNames: excludes } : {}),
  }));

const arbRuleName = fc.option(fc.string({ minLength: 1, maxLength: 80 }), { nil: undefined });

/** Any valid rule of the four types, with generated parameters and matchers. */
export const arbRule: fc.Arbitrary<Rule> = fc
  .tuple(
    arbMatcherFields,
    arbRuleName,
    fc.oneof(
      fc.uniqueArray(fc.constantFrom(...STATE_ORDER), { minLength: 1 }).map((states) => ({ type: "forbid_state" as const, states })),
      fc.option(arbNameList, { nil: undefined }).map((allow) => ({
        type: "forbid_install_scripts" as const,
        ...(allow === undefined ? {} : { allow }),
      })),
      fc.integer({ min: 1, max: 1200 }).map((months) => ({ type: "max_age_months" as const, months })),
      fc.oneof(
        fc.constant(["*"]),
        fc.uniqueArray(arbName, { minLength: 1, maxLength: 4 }),
      ).map((packages) => ({ type: "require_provenance" as const, packages })),
    ),
  )
  .map(([matchers, name, body]): Rule => ({ ...body, ...matchers, ...(name === undefined ? {} : { name }) }));

export const arbValidPolicy: fc.Arbitrary<Policy> = fc
  .array(arbRule, { maxLength: 6 })
  .map((rules): Policy => ({ version: 1, rules }));

// Intake generators. Spec: .kiro/specs/repo-intake, design.md "Shared generators".

export const arbOwner: fc.Arbitrary<string> = fc
  .stringMatching(/^[A-Za-z0-9_-][A-Za-z0-9_.-]{0,20}$/)
  .filter((s) => !s.includes("..") && s !== "orgs");

export const arbRepo: fc.Arbitrary<string> = arbOwner.filter((s) => !s.endsWith(".git"));

const arbScopePart: fc.Arbitrary<string> = fc.stringMatching(/^[a-z0-9~-][a-z0-9._~-]{0,20}$/);
const arbNamePart: fc.Arbitrary<string> = fc.stringMatching(/^[A-Za-z0-9~-][A-Za-z0-9._~-]{0,20}$/);

/** A valid npm package name, scoped or unscoped. Uppercase appears in the name part only. */
export const arbValidName: fc.Arbitrary<string> = fc.oneof(
  arbNamePart,
  fc.tuple(arbScopePart, arbNamePart).map(([scope, name]) => `@${scope}/${name}`),
);

export const arbInvalidName: fc.Arbitrary<string> = fc.constantFrom(
  "__proto__",
  "_x",
  ".x",
  "@Scope/x",
  "@x",
  "@/x",
  "a/b",
  "a b",
  "",
  "x".repeat(215),
  "naïve",
);

// Manifest generators. Spec: .kiro/specs/repo-intake, tasks 2.3.

export const arbVersion: fc.Arbitrary<string> = fc
  .tuple(fc.nat(20), fc.nat(20), fc.nat(20), fc.option(fc.tuple(fc.constantFrom("alpha", "beta", "rc"), fc.nat(5)), { nil: undefined }))
  .map(([major, minor, patch, pre]) => `${major}.${minor}.${patch}${pre === undefined ? "" : `-${pre[0]}.${pre[1]}`}`);

const arbDeclaredRange: fc.Arbitrary<string> = fc.constantFrom(
  "^1.2.3",
  "~0.4.0",
  "1.x",
  "*",
  ">=1 <3",
  "latest",
  "git+https://example.invalid/x.git",
  "file:../x",
  "workspace:*",
);

export type MapEntries = ReadonlyArray<readonly [string, string]>;

/** A model of the maps in a package.json. Entry order is the order in the rendered text. */
export interface PackageJsonModel {
  readonly dependencies: MapEntries;
  readonly devDependencies: MapEntries;
  readonly peerDependencies: MapEntries;
  readonly optionalDependencies: MapEntries;
  /** "array" renders peerDependencies as a JSON array, which must count as zero names. */
  readonly peerShape: "object" | "array";
}

/** Renders entries as a JSON object by template, so a key such as __proto__ stays an own key. */
export function renderMap(entries: MapEntries): string {
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${JSON.stringify(v)}`).join(",")}}`;
}

/** Renders a package.json text. extraTop is raw JSON members such as `"scripts":{}`, without a leading comma. */
export function renderPackageJson(model: PackageJsonModel, extraTop = ""): string {
  const members = [
    `"dependencies":${renderMap(model.dependencies)}`,
    `"devDependencies":${renderMap(model.devDependencies)}`,
    `"peerDependencies":${model.peerShape === "array" ? "[]" : renderMap(model.peerDependencies)}`,
    `"optionalDependencies":${renderMap(model.optionalDependencies)}`,
  ];
  if (extraTop !== "") members.push(extraTop);
  return `{${members.join(",")}}`;
}

/** A package.json model. Names come from one small pool so the maps overlap. withInvalid adds invalid names. */
export function arbPackageJson(withInvalid: boolean): fc.Arbitrary<PackageJsonModel> {
  const poolArb = fc
    .tuple(fc.uniqueArray(arbValidName, { maxLength: 10 }), withInvalid ? fc.uniqueArray(arbInvalidName, { maxLength: 4 }) : fc.constant<string[]>([]))
    .map(([valid, invalid]) => [...new Set([...valid, ...invalid])]);
  const mapArb = (pool: readonly string[]): fc.Arbitrary<MapEntries> =>
    fc.subarray([...pool]).chain((names) =>
      fc
        .array(arbDeclaredRange, { minLength: names.length, maxLength: names.length })
        .map((ranges): MapEntries => names.map((n, i) => [n, ranges[i] ?? "*"] as const)),
    );
  return poolArb.chain((pool) =>
    fc
      .tuple(mapArb(pool), mapArb(pool), mapArb(pool), mapArb(pool), fc.constantFrom<"object" | "array">("object", "object", "array"))
      .map(([dependencies, devDependencies, peerDependencies, optionalDependencies, peerShape]) => ({
        dependencies,
        devDependencies,
        peerDependencies,
        optionalDependencies,
        peerShape,
      })),
  );
}

export type LockfileFormat = 1 | 2 | 3;

/** Renders a lockfile of the given version with one entry per [name, version]. Version 2 holds both sections. */
export function renderLockfile(format: LockfileFormat, entries: MapEntries): string {
  const packageMembers = [
    `"":{"name":"root"}`,
    ...entries.map(([k, v]) => `${JSON.stringify(`node_modules/${k}`)}:{"version":${JSON.stringify(v)}}`),
  ];
  const packages = `{${packageMembers.join(",")}}`;
  const dependencies = `{${entries.map(([k, v]) => `${JSON.stringify(k)}:{"version":${JSON.stringify(v)}}`).join(",")}}`;
  if (format === 1) return `{"lockfileVersion":1,"dependencies":${dependencies}}`;
  if (format === 2) return `{"lockfileVersion":2,"packages":${packages},"dependencies":${dependencies}}`;
  return `{"lockfileVersion":3,"packages":${packages}}`;
}

/**
 * A lockfile for a model. Entries cover every direct name when all is true, otherwise a subset,
 * plus a few transitive names. Versions are independent of the declared ranges.
 */
export function arbLockfile(
  model: PackageJsonModel,
  format: LockfileFormat,
  all: boolean,
): fc.Arbitrary<{ readonly text: string; readonly entries: MapEntries }> {
  const direct = [...new Set([...model.dependencies, ...model.devDependencies].map(([n]) => n))].filter(isValidPackageName);
  const transitive = fc.uniqueArray(arbValidName, { maxLength: 4 }).map((names) => names.filter((n) => !direct.includes(n)));
  return fc
    .tuple(all ? fc.constant(direct) : fc.subarray(direct), transitive)
    .chain(([chosen, extra]) => {
      const names = [...chosen, ...extra];
      return fc
        .array(arbVersion, { minLength: names.length, maxLength: names.length })
        .map((versions) => {
          const entries: MapEntries = names.map((n, i) => [n, versions[i] ?? "1.0.0"] as const);
          return { text: renderLockfile(format, entries), entries };
        });
    });
}

// Resolver generators. Spec: .kiro/specs/repo-intake, tasks 3.3.

const UNRESOLVABLE_SPECIFIERS: readonly string[] = [
  "latest",
  "next",
  "git+https://example.invalid/x.git",
  "github:o/r",
  "o/r",
  "file:../x",
  "link:../x",
  "http://example.invalid/x.tgz",
  "https://example.invalid/x.tgz",
  "workspace:*",
  "npm:other@1",
];

/** Valid ranges built from version parts, including prerelease comparators. */
export const validRangeArb: fc.Arbitrary<string> = fc
  .tuple(fc.constantFrom("^", "~", ">=", ">", "<=", "<", "=", ""), arbVersion, fc.constantFrom("", " || ^1.0.0", " <99.0.0"))
  .map(([op, version, tail]) => `${op}${version}${tail}`);

/** Valid ranges, unresolvable specifiers, arbitrary strings and a 300-character range. */
export const arbRange: fc.Arbitrary<string> = fc.oneof(
  { weight: 4, arbitrary: validRangeArb },
  { weight: 2, arbitrary: fc.constantFrom(...UNRESOLVABLE_SPECIFIERS) },
  { weight: 2, arbitrary: fc.string({ maxLength: 40 }) },
  { weight: 1, arbitrary: fc.constantFrom("", "*", "1.x", ">=1 <3") },
  { weight: 1, arbitrary: fc.constant(`^${"1".repeat(299)}`) },
);

// intakeRepo generators. Spec: .kiro/specs/repo-intake, tasks 6.2.

export type UpstreamBehaviour =
  | { readonly kind: "ok"; readonly body: string }
  | { readonly kind: "not-found" }
  | { readonly kind: "server-error" }
  | { readonly kind: "rate-limited" }
  | { readonly kind: "throws-sync" }
  | { readonly kind: "rejects-error" }
  | { readonly kind: "rejects-non-error" }
  | { readonly kind: "text-rejects" }
  | { readonly kind: "too-large" }
  | { readonly kind: "invalid-encoding" }
  | { readonly kind: "no-text" }
  | { readonly kind: "nan-status" };

export interface IntakeBehaviours {
  readonly pkg: UpstreamBehaviour;
  readonly lock: UpstreamBehaviour;
  readonly registry: UpstreamBehaviour;
}

const arbBodyText: fc.Arbitrary<string> = fc.oneof(
  arbPackageJson(true).map((model) => renderPackageJson(model)),
  fc.string({ maxLength: 40 }),
  fc.constant(""),
);

/** One upstream behaviour: a body, a status, a thrown value or a broken response. */
export const arbUpstreamBehaviour: fc.Arbitrary<UpstreamBehaviour> = fc.oneof(
  { weight: 4, arbitrary: arbBodyText.map((body): UpstreamBehaviour => ({ kind: "ok", body })) },
  ...(
    [
      "not-found",
      "server-error",
      "rate-limited",
      "throws-sync",
      "rejects-error",
      "rejects-non-error",
      "text-rejects",
      "too-large",
      "invalid-encoding",
      "no-text",
      "nan-status",
    ] as const
  ).map((kind) => ({ weight: 1, arbitrary: fc.constant<UpstreamBehaviour>({ kind }) })),
);

/** Behaviour per upstream: package.json, package-lock.json and the registry. */
export const arbIntakeTransport: fc.Arbitrary<IntakeBehaviours> = fc.record({
  pkg: arbUpstreamBehaviour,
  lock: arbUpstreamBehaviour,
  registry: arbUpstreamBehaviour,
});

/** One package of the Property 16 model. */
export interface IntakeModelDependency {
  readonly name: string;
  readonly range: string;
  readonly dev: boolean;
  /** Locked version, or null when the lockfile has no entry. */
  readonly locked: string | null;
  readonly registry: { readonly kind: "versions"; readonly versions: readonly string[] } | { readonly kind: "not-found" } | { readonly kind: "server-error" };
}

export interface IntakeModel {
  readonly dependencies: readonly IntakeModelDependency[];
  readonly lockfile: LockfileFormat | null;
}

/** Model for Property 16: up to 320 direct dependencies, an optional lockfile with gaps, a registry route per name. */
export const arbIntakeModel: fc.Arbitrary<IntakeModel> = fc
  .oneof(fc.integer({ min: 0, max: 12 }), fc.integer({ min: 290, max: 320 }))
  .chain((count) =>
    fc.tuple(
      fc.constantFrom<LockfileFormat | null>(null, 1, 2, 3),
      fc.array(
        fc.record({
          range: arbRange,
          dev: fc.boolean(),
          locked: fc.option(arbVersion, { nil: null }),
          registry: fc.oneof(
            { weight: 6, arbitrary: fc.array(arbVersion, { maxLength: 6 }).map((versions) => ({ kind: "versions" as const, versions })) },
            { weight: 1, arbitrary: fc.constant({ kind: "not-found" as const }) },
            { weight: 1, arbitrary: fc.constant({ kind: "server-error" as const }) },
          ),
        }),
        { minLength: count, maxLength: count },
      ),
    ),
  )
  .map(([lockfile, items]) => ({
    lockfile,
    dependencies: items.map((item, index) => ({ name: `pkg-${index.toString()}`, ...item })),
  }));

// Scan metadata generator. Spec: .kiro/specs/repo-intake, task 7.3.

/** Scan metadata with unresolved a subset of unlockedPackages, as intakeRepo guarantees. */
export const arbScanMetadata: fc.Arbitrary<ScanMetadata> = fc
  .tuple(
    arbOwner,
    arbRepo,
    fc.uniqueArray(arbValidName, { maxLength: 8 }),
    fc.constantFrom<LockfileVersion | null>(null, 1, 2, 3),
    fc.nat(400),
    fc.record({ peer: fc.nat(20), optional: fc.nat(20), invalidName: fc.nat(20) }),
    fc.nat(8),
  )
  .map(([owner, repo, unlockedPackages, lockfileVersion, totalDirect, skipped, k]): ScanMetadata => ({
    repo: { owner, repo, url: `https://github.com/${owner}/${repo}` },
    unlocked: lockfileVersion === null,
    unlockedPackages,
    lockfileVersion,
    capped: totalDirect > 300,
    totalDirect,
    skipped,
    unresolved: unlockedPackages.slice(0, k),
  }));
