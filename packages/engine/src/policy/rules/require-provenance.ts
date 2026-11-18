// require_provenance rule. Requirement 7. Pure, total.

import type { Failure, HealthReport, RequireProvenanceRule, RuleOutcome, Unevaluated } from "../../types.js";
import { inScope } from "../match.js";

export function evaluateRequireProvenance(rule: RequireProvenanceRule, report: HealthReport): RuleOutcome {
  const wildcard = rule.packages.length === 1 && rule.packages[0] === "*";
  const failures: Failure[] = [];
  const unevaluated: Unevaluated[] = [];

  for (const pkg of report.packages) {
    if (!inScope(rule, pkg.name) || !(wildcard || rule.packages.includes(pkg.name))) {
      continue;
    }
    const signal = pkg.signals.provenance;
    if (!signal.available) {
      unevaluated.push({ name: pkg.name, installedVersion: pkg.installedVersion, signal: "provenance", reason: signal.reason });
    } else if (!signal.value.present) {
      failures.push({
        name: pkg.name,
        installedVersion: pkg.installedVersion,
        signal: "provenance",
        value: { present: signal.value.present, predicateType: signal.value.predicateType },
        source: signal.source,
        fetchedAt: signal.fetchedAt,
        reason: "provenance is absent",
      });
    }
  }

  const present = new Set(report.packages.map((p) => p.name));
  const notFound: string[] = [];
  for (const entry of rule.packages) {
    if (entry !== "*" && !present.has(entry) && !notFound.includes(entry)) {
      notFound.push(entry);
    }
  }
  return { failures, unevaluated, notFound };
}
