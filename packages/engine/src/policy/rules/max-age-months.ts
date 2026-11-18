// max_age_months rule. Requirement 6. Pure, total. Time enters only through `reference`.

import { fromIso } from "../../signal.js";
import { monthsBefore } from "../../state.js";
import type { Failure, HealthReport, MaxAgeMonthsRule, RuleOutcome, Unevaluated } from "../../types.js";
import { inScope } from "../match.js";

/** `reference` is the parsed report.generatedAt, or null when it does not parse. */
export function evaluateMaxAgeMonths(rule: MaxAgeMonthsRule, report: HealthReport, reference: Date | null): RuleOutcome {
  const failures: Failure[] = [];
  const unevaluated: Unevaluated[] = [];
  const scoped = report.packages.filter((pkg) => inScope(rule, pkg.name));

  if (reference === null) {
    for (const pkg of scoped) {
      unevaluated.push({
        name: pkg.name,
        installedVersion: pkg.installedVersion,
        signal: "lastPublish",
        reason: "reference time invalid",
      });
    }
    return { failures, unevaluated, notFound: [] };
  }

  const boundary = monthsBefore(reference, rule.months);
  const boundaryMs = boundary.getTime();
  const boundaryValid = Number.isFinite(boundaryMs);

  for (const pkg of scoped) {
    const signal = pkg.signals.lastPublish;
    if (!signal.available) {
      unevaluated.push({ name: pkg.name, installedVersion: pkg.installedVersion, signal: "lastPublish", reason: signal.reason });
      continue;
    }
    const published = signal.value === null ? null : fromIso(signal.value);
    if (signal.value === null || published === null || !Number.isFinite(published.getTime())) {
      unevaluated.push({
        name: pkg.name,
        installedVersion: pkg.installedVersion,
        signal: "lastPublish",
        reason: "no usable publish date exists",
      });
      continue;
    }
    if (boundaryValid && published.getTime() < boundaryMs) {
      const boundaryIso = boundary.toISOString();
      failures.push({
        name: pkg.name,
        installedVersion: pkg.installedVersion,
        signal: "lastPublish",
        value: signal.value,
        source: signal.source,
        fetchedAt: signal.fetchedAt,
        reason: `last published ${signal.value}, earlier than ${boundaryIso} (${rule.months} months before ${report.generatedAt})`,
        boundary: boundaryIso,
      });
    }
  }
  return { failures, unevaluated, notFound: [] };
}
