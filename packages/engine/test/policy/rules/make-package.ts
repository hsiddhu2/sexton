// Hand-built PackageHealth values for rule example tests.

import { available, fromIso, unavailable } from "../../../src/signal.js";
import type { HealthReport, Matchers, PackageHealth, PackageSignals, ProvenanceValue, Signal, State } from "../../../src/types.js";

export const GENERATED_AT = "2026-11-12T00:00:00.000Z";
export const FETCHED = new Date("2026-11-11T00:00:00Z");
export const SRC = "https://example.test/src";

export interface PackageOptions {
  readonly name: string;
  readonly state?: State;
  readonly stateReason?: string;
  readonly installedVersion?: string;
  readonly hasInstallScript?: Signal<boolean>;
  readonly lastPublish?: Signal<string | null>;
  readonly provenance?: Signal<ProvenanceValue>;
}

export function makePackage(o: PackageOptions): PackageHealth {
  const signals: PackageSignals = {
    lastPublish: o.lastPublish ?? available("2026-10-01T00:00:00.000Z", SRC, FETCHED),
    deprecated: available(false, SRC, FETCHED),
    hasInstallScript: o.hasInstallScript ?? available(false, SRC, FETCHED),
    advisories: available([], SRC, FETCHED),
    maintainers: available([], SRC, FETCHED),
    provenance: o.provenance ?? available({ present: true, predicateType: "https://slsa.dev/provenance/v1" }, SRC, FETCHED),
    transitiveReach: available({ reach: 0, graphsMissing: 0 }, SRC, FETCHED),
    maintainerChange: available({ status: "history-insufficient", events: [] }, SRC, FETCHED),
    provenanceRegression: available({ status: "history-insufficient", reason: "none" }, SRC, FETCHED),
    newInstallScript: available([], SRC, FETCHED),
  };
  return {
    name: o.name,
    installedVersion: o.installedVersion ?? "1.0.0",
    state: o.state ?? "Alive",
    stateReason: o.stateReason ?? "no rule matched",
    signals,
    missingSignals: [],
  };
}

export function makeReport(packages: readonly PackageHealth[], generatedAt: string = GENERATED_AT): HealthReport {
  return { generatedAt, packages };
}

/** The matcher keys of a rule, with absent keys left absent. */
export function matchersOf(rule: Matchers): Matchers {
  return {
    ...(rule.matchPackageNames === undefined ? {} : { matchPackageNames: rule.matchPackageNames }),
    ...(rule.matchPackagePatterns === undefined ? {} : { matchPackagePatterns: rule.matchPackagePatterns }),
    ...(rule.excludePackageNames === undefined ? {} : { excludePackageNames: rule.excludePackageNames }),
  };
}

/** The reference time the evaluator derives from a report: generatedAt, or null when it does not parse. */
export function referenceOf(report: HealthReport): Date | null {
  const d = fromIso(report.generatedAt);
  return Number.isFinite(d.getTime()) ? d : null;
}

export function gone<T>(reason = "HTTP 503"): Signal<T> {
  return unavailable(reason, SRC, FETCHED);
}

export function ok<T>(value: T): Signal<T> {
  return available(value, SRC, FETCHED);
}
