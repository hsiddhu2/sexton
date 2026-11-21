// Bump targets. Spec: .kiro/specs/remediation, Requirements 2.17, 3.6, 8.2. Pure.

import semver from "semver";
import type { HealthReport } from "../types.js";
import type { BumpTarget } from "./gather-bump-data.js";
import type { PlanOptions } from "./plan-options.js";
import { indexIntake, precheck } from "./precheck.js";
import { isUnhealthy } from "./unhealthy.js";

/** One target per plannable unhealthy bump package, so nothing else costs a request. */
export function bumpTargets(report: HealthReport, options: PlanOptions = {}): readonly BumpTarget[] {
  const intakeByName = indexIntake(options.intake);
  const seen = new Set<string>();
  const targets: BumpTarget[] = [];
  for (const pkg of report.packages) {
    if (seen.has(pkg.name)) continue;
    seen.add(pkg.name);
    if (!isUnhealthy(pkg.state)) continue;
    const check = precheck(pkg, options, intakeByName);
    if (!check.ok || check.kind !== "bump" || check.intake === undefined) continue;
    if (semver.valid(pkg.installedVersion) !== pkg.installedVersion) continue;
    targets.push({ name: pkg.name, installedVersion: pkg.installedVersion, declaredRange: check.intake.declaredRange });
  }
  return targets;
}
