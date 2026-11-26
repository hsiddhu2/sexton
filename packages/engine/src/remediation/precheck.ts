// Pre-check shared by the planner and the bump-target list. Spec: .kiro/specs/remediation, Requirements 1.9, 1.10, 8.2, and .kiro/specs/remediation-safety, bugfix 2.1 and 2.2. Pure.

import { isValidPackageName } from "../intake/names.js";
import { isResolvableRange } from "../intake/resolve.js";
import type { IntakePackage, PackageHealth, RemediationKind } from "../types.js";
import { branchName } from "./branch-name.js";
import { chooseKind, type KindOptions } from "./choose-kind.js";

export const REASON_INVALID_NAME = "package name is not a valid npm package name";
export const REASON_NO_INTAKE = "no intake entry for this package, so the section of package.json is unknown";
export const REASON_BRANCH_TOO_LONG = "branch name too long";
/** Spec remediation-safety, D1: a bump would replace a file:, git, URL, npm: alias, workspace: or dist-tag source. */
export const REASON_RANGE_NOT_REGISTRY = "declared range is not a registry semver range, so a bump would replace its source";

export type PrecheckResult =
  | { readonly ok: true; readonly kind: RemediationKind; readonly intake: IntakePackage | undefined; readonly branch: string | null }
  | { readonly ok: false; readonly kind: RemediationKind; readonly reason: string };

/** Checks in order, first failure wins: name, migrate, intake entry, a registry range for a bump, branch length. */
export function precheck(pkg: PackageHealth, options: KindOptions, intakeByName: ReadonlyMap<string, IntakePackage>): PrecheckResult {
  const kind = chooseKind(pkg.name, options);
  if (typeof pkg.name !== "string" || !isValidPackageName(pkg.name)) return { ok: false, kind, reason: REASON_INVALID_NAME };
  if (kind === "migrate") return { ok: true, kind, intake: undefined, branch: null };
  const intake = intakeByName.get(pkg.name);
  if (intake === undefined) return { ok: false, kind, reason: REASON_NO_INTAKE };
  if (kind === "bump" && !isResolvableRange(intake.declaredRange)) return { ok: false, kind, reason: REASON_RANGE_NOT_REGISTRY };
  const branch = branchName(kind, pkg.name);
  if (branch === null) return { ok: false, kind, reason: REASON_BRANCH_TOO_LONG };
  return { ok: true, kind, intake, branch };
}

/** First entry wins for a repeated name. */
export function indexIntake(intake: readonly IntakePackage[] | undefined): Map<string, IntakePackage> {
  const map = new Map<string, IntakePackage>();
  for (const entry of intake ?? []) if (!map.has(entry.name)) map.set(entry.name, entry);
  return map;
}
