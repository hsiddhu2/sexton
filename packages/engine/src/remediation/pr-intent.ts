// PR intent. Spec: .kiro/specs/remediation, Requirements 4.1, 4.10 to 4.16. Pure. Describes, never acts.

import type { PrContext, PrIntent, RemediationPlan } from "../types.js";
import { branchName } from "./branch-name.js";
import { cleanLine } from "./clean-line.js";
import { buildPrBody } from "./pr-body.js";

/** The repository's default branch, resolved by the Executor. Never a branch name. */
export const BASE_REF_DEFAULT = "@default";
export const MAX_TITLE_LENGTH = 200;

export function intentTitle(plan: RemediationPlan): string | null {
  if (plan.kind === "bump" && plan.chosenVersion !== undefined) return `Sexton: bump ${plan.packageName} to ${plan.chosenVersion}`;
  if (plan.kind === "remove") return `Sexton: remove unused ${plan.packageName}`;
  return null;
}

/** An intent for a proposed bump or remove with an Edit, otherwise null. */
export function buildPrIntent(plan: RemediationPlan, context: PrContext): PrIntent | null {
  if (plan.status !== "proposed" || (plan.kind !== "bump" && plan.kind !== "remove") || plan.edit === undefined) return null;
  const branch = branchName(plan.kind, plan.packageName);
  const title = intentTitle(plan);
  if (branch === null || title === null) return null;
  return {
    branch,
    title: cleanLine(title, MAX_TITLE_LENGTH),
    body: buildPrBody(plan, context),
    files: [plan.edit],
    baseRef: BASE_REF_DEFAULT,
  };
}
