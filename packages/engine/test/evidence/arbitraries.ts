// Generators for the evidence-pack tests. Spec: .kiro/specs/evidence-pack, Correctness Properties 30 to 42.

import fc from "fast-check";
import { available, unavailable } from "../../src/signal.js";
import type { EvidenceInput } from "../../src/evidence/build-pack.js";
import type { JsonValue } from "../../src/evidence/canonical-json.js";
import {
  REMEDIATION_KINDS,
  REMEDIATION_STATUSES,
  STATE_ORDER,
  type HealthReport,
  type IntakePackage,
  type PackageHealth,
  type RemediationEntry,
  type RemediationLogEntry,
  type RepoRef,
} from "../../src/types.js";
import { arbHostileHealth, arbPolicyResultFor, healthySignals } from "../remediation/arbitraries.js";

export const AT = new Date("2026-11-12T00:00:00Z");

/** Any finite number, with -0 read as 0 so a parse gives back an equal value. */
const arbNumber = fc
  .oneof(fc.double({ noNaN: true, noDefaultInfinity: true }), fc.integer(), fc.constantFrom(1e21, 1e-7, 5e-324, 333333333.3333333, 0.1))
  .map((n) => (Object.is(n, -0) ? 0 : n));

const arbKey = fc.oneof(fc.fullUnicodeString({ maxLength: 6 }), fc.constantFrom("__proto__", "constructor", "€", "😀", "\r", "a", "B"));

/** Any JSON value without lone surrogates. */
export const arbJsonValue: fc.Arbitrary<JsonValue> = fc.letrec<{ value: JsonValue }>((tie) => ({
  value: fc.oneof(
    { depthSize: "small", withCrossShrink: true },
    fc.constant(null),
    fc.boolean(),
    arbNumber,
    fc.fullUnicodeString({ maxLength: 12 }),
    fc.array(tie("value"), { maxLength: 4 }),
    fc.array(fc.tuple(arbKey, tie("value")), { maxLength: 4 }).map((entries) => {
      const out: Record<string, JsonValue> = {};
      for (const [k, v] of entries) Object.defineProperty(out, k, { value: v, enumerable: true, writable: true, configurable: true });
      return out;
    }),
  ),
})).value;

/** The same value with every object's keys in reverse order. */
export function reorderKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(reorderKeys);
  if (typeof value === "object" && value !== null) {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value).reverse()) {
      Object.defineProperty(out, key, { value: reorderKeys((value as Record<string, unknown>)[key]), enumerable: true, writable: true, configurable: true });
    }
    return out;
  }
  return value;
}

export const arbValidName: fc.Arbitrary<string> = fc.oneof(
  fc.stringMatching(/^[a-z0-9][a-z0-9._~-]{0,12}$/),
  fc.tuple(fc.stringMatching(/^[a-z0-9][a-z0-9._~-]{0,8}$/), fc.stringMatching(/^[a-zA-Z0-9][a-zA-Z0-9._~-]{0,8}$/)).map(([s, n]) => `@${s}/${n}`),
);

export const arbVersionText: fc.Arbitrary<string> = fc.oneof(
  fc.tuple(fc.nat(30), fc.nat(30), fc.nat(30)).map(([a, b, c]) => `${String(a)}.${String(b)}.${String(c)}`),
  fc.constantFrom("1.0.0-beta.1+build.5", "2.0.0-rc.1", "unresolved", "file:../x", "npm:other@1", "1.0.0 || 2"),
  fc.fullUnicodeString({ minLength: 1, maxLength: 10 }),
);

function healthy(name: string, installedVersion: string): PackageHealth {
  return { name, installedVersion, state: "Alive", stateReason: "no rule matched", signals: healthySignals(), missingSignals: [] };
}

/** A package with a generated state and some unavailable signals. */
export const arbPackageHealth: fc.Arbitrary<PackageHealth> = fc
  .record({ name: arbValidName, version: arbVersionText, state: fc.constantFrom(...STATE_ORDER), dropAdvisories: fc.boolean() })
  .map(({ name, version, state, dropAdvisories }) => {
    const base = healthy(name, version);
    const signals = dropAdvisories ? { ...base.signals, advisories: unavailable("https://api.osv.dev/v1/querybatch", "HTTP 503", AT) } : base.signals;
    return { ...base, state, signals };
  });

export const arbPackages: fc.Arbitrary<PackageHealth[]> = fc.uniqueArray(arbPackageHealth, { selector: (p) => p.name, maxLength: 8 });

export const arbRepoRef: fc.Arbitrary<RepoRef> = fc
  .tuple(fc.stringMatching(/^[A-Za-z0-9]{1,20}(-[A-Za-z0-9]{1,10})?$/), fc.stringMatching(/^[A-Za-z0-9._-]{1,100}$/))
  .filter(([, repo]) => repo !== "." && repo !== ".." && !repo.toLowerCase().endsWith(".git"))
  .map(([owner, repo]) => ({ owner, repo, url: `https://github.com/${owner}/${repo}` }));

/** Intake rows for some of the packages, with either origin and any resolution. */
export function arbIntakeFor(packages: readonly PackageHealth[]): fc.Arbitrary<IntakePackage[]> {
  return fc
    .array(fc.tuple(fc.boolean(), fc.constantFrom("dependencies" as const, "devDependencies" as const), fc.constantFrom("locked" as const, "unlocked" as const, "unresolved" as const)), {
      minLength: packages.length,
      maxLength: packages.length,
    })
    .map((flags) =>
      packages.flatMap((p, i) => {
        const [keep, origin, resolution] = flags[i] ?? [false, "dependencies", "locked"];
        return keep ? [{ name: p.name, installedVersion: p.installedVersion, declaredRange: `^${p.installedVersion}`, origin, resolution }] : [];
      }),
    );
}

export function reportFor(repo: RepoRef, packages: readonly PackageHealth[], generatedAt = AT.toISOString()): HealthReport {
  return {
    generatedAt,
    packages,
    scan: {
      repo,
      unlocked: false,
      unlockedPackages: [],
      lockfileVersion: 3,
      capped: false,
      totalDirect: packages.length,
      skipped: { peer: 0, optional: 0, invalidName: 0 },
      unresolved: [],
    },
  };
}

const arbHex = (n: number): fc.Arbitrary<string> => fc.stringMatching(new RegExp(`^[0-9a-f]{${String(n)}}$`));

const arbEntry: fc.Arbitrary<RemediationEntry> = fc
  .record({
    packageName: arbValidName,
    kind: fc.constantFrom(...REMEDIATION_KINDS),
    status: fc.constantFrom(...REMEDIATION_STATUSES),
    title: fc.string({ maxLength: 30 }),
    chosenVersion: fc.option(arbVersionText, { nil: undefined }),
    majorUpgrade: fc.option(fc.boolean(), { nil: undefined }),
  })
  .map((r) => ({
    packageName: r.packageName,
    kind: r.kind,
    status: r.status,
    title: r.title,
    summary: "s",
    prBody: "b",
    ...(r.chosenVersion !== undefined ? { chosenVersion: r.chosenVersion } : {}),
    ...(r.majorUpgrade !== undefined ? { majorUpgrade: r.majorUpgrade } : {}),
  }));

export function arbLogFor(repo: RepoRef): fc.Arbitrary<RemediationLogEntry[] | null> {
  const entry = fc
    .record({
      repository: fc.constantFrom(repo.url, "https://github.com/other/repo", "not a url"),
      name: arbValidName.filter((n) => !n.startsWith("@")),
      kind: fc.constantFrom(...REMEDIATION_KINDS),
      day: fc.integer({ min: 1, max: 28 }),
      pr: fc.nat(999),
    })
    .map(
      (r): RemediationLogEntry => ({
        repository: r.repository,
        branch: `sexton/${r.kind}-${r.name}`,
        prUrl: `https://github.com/x/y/pull/${String(r.pr)}`,
        package: r.name,
        kind: r.kind,
        timestamp: `2026-11-${String(r.day).padStart(2, "0")}T00:00:00Z`,
      }),
    );
  return fc.option(fc.array(entry, { maxLength: 6 }), { nil: null });
}

/** A valid evidence input: the builder always succeeds on it. */
export const arbEvidenceInput: fc.Arbitrary<EvidenceInput> = fc.tuple(arbRepoRef, arbPackages).chain(([repo, packages]) =>
  fc
    .record({
      dependencies: arbIntakeFor(packages),
      policyResult: arbPolicyResultFor(packages[0]?.name ?? "x", 4),
      fileSource: fc.boolean(),
      policyDigest: fc.option(arbHex(64), { nil: null }),
      commit: fc.option(arbHex(40), { nil: null }),
      packageJson: fc.option(arbHex(64), { nil: null }),
      packageLock: fc.option(arbHex(64), { nil: null }),
      remediations: fc.array(arbEntry, { maxLength: 4 }),
      remediationLog: arbLogFor(repo),
    })
    .map(
      (r): EvidenceInput => ({
        report: reportFor(repo, packages),
        dependencies: r.dependencies,
        policyResult: { ...r.policyResult, source: r.fileSource ? "file" : "default" },
        policyDigest: r.policyDigest,
        commit: r.commit,
        manifestDigests: { packageJson: r.packageJson, packageLock: r.packageLock },
        remediations: r.remediations,
        remediationLog: r.remediationLog,
      }),
    ),
);

/** An input whose every free-text field is hostile. */
export const arbHostileInput: fc.Arbitrary<EvidenceInput> = fc
  .tuple(arbRepoRef, fc.array(arbHostileHealth, { minLength: 1, maxLength: 3 }), fc.array(arbEntry, { maxLength: 2 }))
  .chain(([repo, packages, remediations]) =>
    arbPolicyResultFor(packages[0]?.name ?? "x", 3).map(
      (policyResult): EvidenceInput => ({
        report: reportFor(repo, packages),
        dependencies: [],
        policyResult,
        policyDigest: null,
        commit: null,
        manifestDigests: { packageJson: null, packageLock: null },
        remediations,
        remediationLog: null,
      }),
    ),
  );

export { available };
