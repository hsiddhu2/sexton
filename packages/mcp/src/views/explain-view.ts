// explain_package result. Spec: .kiro/specs/sexton-power, Requirement 4. Pure.
import type { PipelineResult } from "@sexton/cli";
import { SIGNAL_NAMES, type Advisory, type PackageHealth } from "@sexton/engine";
import { boundValue, capList, CAP, clean, MAX, type Cut } from "../bound.js";
import { planView, plansByPackage } from "./plan-view.js";

function signalView(pkg: PackageHealth, name: (typeof SIGNAL_NAMES)[number], cut: Cut): Record<string, unknown> {
  const signal = pkg.signals[name];
  const base = { available: signal.available, source: clean(signal.source, MAX.url), fetchedAt: clean(signal.fetchedAt, 40) };
  if (!signal.available) return { ...base, reason: clean(signal.reason, MAX.reason) };
  if (name === "advisories") {
    const list = capList(signal.value as readonly Advisory[], CAP.advisories);
    if (list.truncated) cut.truncated = true;
    return {
      ...base,
      value: list.items.map((a) => ({ id: clean(a.id, MAX.name), severity: a.severity, summary: clean(a.summary, MAX.advisorySummary) })),
    };
  }
  return { ...base, value: boundValue(signal.value, cut) };
}

/** The explanation of one package, or null when the name is not a direct dependency of the scan. Exact match only. */
export function explainView(scan: PipelineResult, name: string): Record<string, unknown> | null {
  const pkg = scan.report.packages.find((p) => p.name === name);
  if (pkg === undefined) return null;
  const intake = scan.dependencies.find((d) => d.name === name);
  const cut: Cut = { truncated: false };
  const signals = Object.fromEntries(SIGNAL_NAMES.map((n) => [n, signalView(pkg, n, cut)]));
  const failures: { rule: string; reason: string }[] = [];
  for (const rule of scan.policy.rules) {
    for (const f of rule.failures) {
      if (f.name === name) failures.push({ rule: clean(rule.name ?? rule.type, MAX.ruleName), reason: clean(f.reason, MAX.reason) });
    }
  }
  const failureList = capList(failures, CAP.failures);
  const entry = plansByPackage(scan.remediations).get(name);
  return {
    generatedAt: clean(scan.report.generatedAt, 40),
    package: {
      name: clean(pkg.name, MAX.name),
      version: clean(pkg.installedVersion, MAX.version),
      declaredRange: intake === undefined ? null : clean(intake.declaredRange, MAX.other),
      origin: intake?.origin ?? null,
      resolution: intake?.resolution ?? null,
    },
    state: pkg.state,
    reason: clean(pkg.stateReason, MAX.reason),
    missingSignals: pkg.missingSignals.map((n) => clean(n, MAX.other)),
    signals,
    policyFailures: failureList.items,
    plan: entry === undefined ? null : planView(entry, true),
    truncated: cut.truncated || failureList.truncated,
  };
}
