// Policy evaluator. Requirements 8.2 to 8.4, 9. Pure: no clock, no I/O, no mutation of inputs.

import { fromIso } from "../signal.js";
import type { HealthReport, PackageHealth, Policy, PolicyResult, PolicySource, Rule, RuleOutcome, RuleResult } from "../types.js";
import { evaluateForbidInstallScripts } from "./rules/forbid-install-scripts.js";
import { evaluateForbidState } from "./rules/forbid-state.js";
import { evaluateMaxAgeMonths } from "./rules/max-age-months.js";
import { evaluateRequireProvenance } from "./rules/require-provenance.js";

function runRule(rule: Rule, report: HealthReport, reference: Date | null): RuleOutcome {
  switch (rule.type) {
    case "forbid_state":
      return evaluateForbidState(rule, report);
    case "forbid_install_scripts":
      return evaluateForbidInstallScripts(rule, report);
    case "max_age_months":
      return evaluateMaxAgeMonths(rule, report, reference);
    case "require_provenance":
      return evaluateRequireProvenance(rule, report);
    default: {
      const unreachable: never = rule;
      return unreachable;
    }
  }
}

/** Applies every rule to the report. The reference time is report.generatedAt. */
export function evaluatePolicy(policy: Policy, report: HealthReport, source: PolicySource): PolicyResult {
  const parsed = fromIso(report.generatedAt);
  const reference = Number.isFinite(parsed.getTime()) ? parsed : null;

  const seen = new Set<string>();
  const packages: PackageHealth[] = [];
  for (const pkg of report.packages) {
    if (!seen.has(pkg.name)) {
      seen.add(pkg.name);
      packages.push(pkg);
    }
  }
  const deduped: HealthReport = { generatedAt: report.generatedAt, packages };

  const rules = policy.rules.map((rule, index): RuleResult => {
    const { failures, unevaluated, notFound } = runRule(rule, deduped, reference);
    return {
      index,
      type: rule.type,
      ...(rule.name !== undefined ? { name: rule.name } : {}),
      pass: failures.length === 0,
      failures,
      unevaluated,
      notFound,
    };
  });

  return { source, pass: rules.every((r) => r.pass), rules };
}
