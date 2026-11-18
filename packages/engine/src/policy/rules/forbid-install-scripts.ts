// forbid_install_scripts rule. Requirement 5. Pure, total.

import type { Failure, ForbidInstallScriptsRule, HealthReport, RuleOutcome, Unevaluated } from "../../types.js";
import { inScope } from "../match.js";

/** Fails in-scope packages with an install script unless allowed. Unavailable signals are recorded, never failures. */
export function evaluateForbidInstallScripts(rule: ForbidInstallScriptsRule, report: HealthReport): RuleOutcome {
  const allow = rule.allow ?? [];
  const failures: Failure[] = [];
  const unevaluated: Unevaluated[] = [];
  for (const pkg of report.packages) {
    if (!inScope(rule, pkg.name) || allow.includes(pkg.name)) {
      continue;
    }
    const signal = pkg.signals.hasInstallScript;
    if (!signal.available) {
      unevaluated.push({
        name: pkg.name,
        installedVersion: pkg.installedVersion,
        signal: "hasInstallScript",
        reason: signal.reason,
      });
    } else if (signal.value) {
      failures.push({
        name: pkg.name,
        installedVersion: pkg.installedVersion,
        signal: "hasInstallScript",
        value: true,
        source: signal.source,
        fetchedAt: signal.fetchedAt,
        reason: "hasInstallScript is true",
      });
    }
  }
  return { failures, unevaluated, notFound: [] };
}
