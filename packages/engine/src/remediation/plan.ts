// Planner. Spec: .kiro/specs/remediation, Requirements 1, 2.13, 3.1 to 3.6, 4.13, 8.2. Pure.

import semver from "semver";
import type { HealthReport, PackageHealth, RemediationPlan, UnhealthyState } from "../types.js";
import type { PlanOptions } from "./plan-options.js";
import { indexIntake, precheck, REASON_NO_INTAKE } from "./precheck.js";
import { styledRange } from "./range-style.js";
import { selectBump } from "./select-bump.js";
import { isUnhealthy } from "./unhealthy.js";

export type { PlanOptions } from "./plan-options.js";

export const REASON_INSTALLED_INVALID = "installed version is not a valid semver version";
export const REASON_NOT_GATHERED = "bump data was not gathered";

function noSafeVersionReason(evaluated: number): string {
  return `no safe version found among ${String(evaluated)} evaluated candidate versions`;
}

function planOne(pkg: PackageHealth & { readonly state: UnhealthyState }, options: PlanOptions, intakeByName: ReturnType<typeof indexIntake>): RemediationPlan {
  const base = { packageName: pkg.name, installedVersion: pkg.installedVersion, state: pkg.state, stateReason: pkg.stateReason };
  const check = precheck(pkg, options, intakeByName);
  if (!check.ok) return { ...base, kind: check.kind, status: "unavailable", reason: check.reason };
  if (check.kind === "migrate") return { ...base, kind: "migrate", status: "proposed" };
  const intake = check.intake;
  if (intake === undefined) return { ...base, kind: check.kind, status: "unavailable", reason: REASON_NO_INTAKE };
  if (check.kind === "remove") {
    return { ...base, kind: "remove", status: "proposed", edit: { path: "package.json", op: "remove-dependency", section: intake.origin, name: pkg.name } };
  }
  if (semver.valid(pkg.installedVersion) !== pkg.installedVersion) return { ...base, kind: "bump", status: "unavailable", reason: REASON_INSTALLED_INVALID };
  const data = options.bumpData?.get(pkg.name);
  if (data === undefined) return { ...base, kind: "bump", status: "unavailable", reason: REASON_NOT_GATHERED };
  if (!data.ok) return { ...base, kind: "bump", status: "unavailable", reason: `bump data unavailable: ${data.reason}` };
  const result = selectBump({
    installedVersion: pkg.installedVersion,
    declaredRange: intake.declaredRange,
    published: data.published,
    deprecated: data.deprecated,
    advisories: data.advisories,
  });
  if (result.outcome === "none") return { ...base, kind: "bump", status: "no-safe-version", reason: noSafeVersionReason(result.evaluated) };
  return {
    ...base,
    kind: "bump",
    status: "proposed",
    chosenVersion: result.version,
    majorUpgrade: result.majorUpgrade,
    edit: { path: "package.json", op: "set-range", section: intake.origin, name: pkg.name, range: styledRange(result.style, result.version) },
  };
}

/** One plan per Haunted, Dead or Possessed package, in report order. Never throws for well-typed input. */
export function planRemediation(report: HealthReport, options: PlanOptions = {}): readonly RemediationPlan[] {
  const intakeByName = indexIntake(options.intake);
  const seen = new Set<string>();
  const plans: RemediationPlan[] = [];
  for (const pkg of report.packages) {
    if (seen.has(pkg.name)) continue;
    seen.add(pkg.name);
    if (!isUnhealthy(pkg.state)) continue;
    plans.push(planOne(pkg as PackageHealth & { readonly state: UnhealthyState }, options, intakeByName));
  }
  return plans;
}
