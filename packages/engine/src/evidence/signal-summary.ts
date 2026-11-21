// One value formatter per signal name for the evidence report. Spec: .kiro/specs/evidence-pack, Requirement 5.4.
// The mapped type fails the type check when an entry of SIGNAL_NAMES has no formatter. Every string taken from a
// signal value goes through escapeField. Pure.

import { escapeField } from "../remediation/escape-field.js";
import type { PackageSignals, SignalName } from "../types.js";

export type SignalSummaries = { readonly [K in SignalName]: (value: NonNullable<PackageSignals[K]["value"]>) => string };

const F = escapeField;

function yesNo(value: boolean): string {
  return value ? "yes" : "no";
}

function names(list: readonly string[]): string {
  return list.length === 0 ? "none" : list.map(F).join(", ");
}

export const SIGNAL_SUMMARIES: SignalSummaries = {
  lastPublish: (value) => F(value),
  deprecated: (value) => yesNo(value),
  hasInstallScript: (value) => yesNo(value),
  advisories: (value) => {
    if (value.length === 0) return "none";
    const counts = new Map<string, number>();
    for (const a of value) counts.set(a.severity, (counts.get(a.severity) ?? 0) + 1);
    return `${String(value.length)}: ${[...counts].map(([severity, n]) => `${F(severity)} ${String(n)}`).join(", ")}`;
  },
  maintainers: (value) => `${String(value.length)}: ${names(value)}`,
  provenance: (value) => (value.present ? `present, ${value.predicateType === null ? "no predicate type" : F(value.predicateType)}` : "absent"),
  transitiveReach: (value) => `reach ${String(value.reach)}, graphs missing ${String(value.graphsMissing)}`,
  maintainerChange: (value) =>
    value.status === "history-insufficient"
      ? "history insufficient"
      : `${String(value.events.length)} changes, ${String(value.events.filter((e) => e.recent).length)} in the last 90 days`,
  provenanceRegression: (value) =>
    value.status === "regression"
      ? `regression: ${F(value.installedVersion)} has none, ${F(value.earlierVersion)} had it`
      : value.status === "no-regression"
        ? `no regression, snapshot ${F(value.snapshotCaptureTime)}`
        : `history insufficient: ${F(value.reason)}`,
  newInstallScript: (value) => (value.length === 0 ? "none" : value.map((e) => `${F(e.version)} at ${F(e.publishTime)}`).join(", ")),
};
