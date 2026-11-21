// Planner. Spec: .kiro/specs/remediation, Requirements 1, 2.13, 3.1 to 3.6, 4.13, 8.2, and
// .kiro/specs/migration-node-sass, Requirements 5.2 to 5.4. Pure.

import semver from "semver";
import type { HealthReport, PackageHealth, RemediationPlan, UnhealthyState } from "../types.js";
import { branchName } from "./branch-name.js";
import type { PlanOptions } from "./plan-options.js";
import { indexIntake, precheck, REASON_BRANCH_TOO_LONG, REASON_NO_INTAKE } from "./precheck.js";
import { styledRange } from "./range-style.js";
import { DEFAULT_RECIPE_REGISTRY } from "./recipes.js";
import { selectBump } from "./select-bump.js";
import { isUnhealthy } from "./unhealthy.js";

export type { PlanOptions } from "./plan-options.js";

export const REASON_INSTALLED_INVALID = "installed version is not a valid semver version";
export const REASON_NOT_GATHERED = "bump data was not gathered";
export const REASON_MIGRATION_NOT_RUN = "migration was not run";
export const REASON_NO_CHANGE = "the recipe proposed no change to package.json";

type Base = Pick<RemediationPlan, "packageName" | "installedVersion" | "state" | "stateReason">;

function planMigrate(base: Base, options: PlanOptions): RemediationPlan {
  const unavailable = (reason: string): RemediationPlan => ({ ...base, kind: "migrate", status: "unavailable", reason });
  const outcome = options.migrations?.get(base.packageName);
  const recipe = (options.recipes ?? DEFAULT_RECIPE_REGISTRY).get(base.packageName);
  if (outcome === undefined || recipe === undefined) return unavailable(REASON_MIGRATION_NOT_RUN);
  if (!outcome.ok) return unavailable(outcome.reason);
  if (branchName("migrate", base.packageName) === null) return unavailable(REASON_BRANCH_TOO_LONG);
  const [first, ...rest] = outcome.result.edits;
  if (first === undefined) return unavailable(REASON_NO_CHANGE);
  const r = outcome.result;
  return {
    ...base,
    kind: "migrate",
    status: "proposed",
    edits: [first, ...rest],
    migration: {
      recipeId: recipe.id,
      from: recipe.from,
      to: recipe.to,
      reviewSites: r.reviewSites,
      filesChanged: r.filesChanged,
      scan: r.scan,
      notes: r.notes,
    },
  };
}

function noSafeVersionReason(evaluated: number): string {
  return `no safe version found among ${String(evaluated)} evaluated candidate versions`;
}

function planOne(pkg: PackageHealth & { readonly state: UnhealthyState }, options: PlanOptions, intakeByName: ReturnType<typeof indexIntake>): RemediationPlan {
  const base = { packageName: pkg.name, installedVersion: pkg.installedVersion, state: pkg.state, stateReason: pkg.stateReason };
  const check = precheck(pkg, options, intakeByName);
  if (!check.ok) return { ...base, kind: check.kind, status: "unavailable", reason: check.reason };
  if (check.kind === "migrate") return planMigrate(base, options);
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
