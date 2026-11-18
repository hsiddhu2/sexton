// forbid_state rule. Requirement 4. Pure, total.

import type { Failure, ForbidStateRule, HealthReport, RuleOutcome } from "../../types.js";
import { inScope } from "../match.js";

/** Takes no reference time; it is assignable to the shared (rule, report, reference) signature. Fails every in-scope package whose state is listed. Never returns unevaluated entries. Requirement 4.2, 4.4, 4.5. */
export function evaluateForbidState(rule: ForbidStateRule, report: HealthReport): RuleOutcome {
  const failures: Failure[] = [];
  for (const pkg of report.packages) {
    if (!inScope(rule, pkg.name) || !rule.states.includes(pkg.state)) {
      continue;
    }
    failures.push({
      name: pkg.name,
      installedVersion: pkg.installedVersion,
      signal: "state",
      value: pkg.state,
      source: null,
      fetchedAt: report.generatedAt,
      reason: `state is ${pkg.state}: ${pkg.stateReason}`,
    });
  }
  return { failures, unevaluated: [], notFound: [] };
}
