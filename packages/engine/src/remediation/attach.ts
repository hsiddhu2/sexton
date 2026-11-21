// API remediations list. Spec: .kiro/specs/remediation, Requirements 7.2 to 7.9. Pure.

import type { HealthReport, PolicyResult, RemediationEntry, RemediationPlan } from "../types.js";
import { cleanLine } from "./clean-line.js";
import { buildPrBody } from "./pr-body.js";
import { buildPrContext } from "./pr-context.js";
import { buildPrIntent } from "./pr-intent.js";

export const MAX_SUMMARY_LENGTH = 200;

function summarise(plan: RemediationPlan): string {
  if (plan.status === "proposed") {
    if (plan.kind === "bump") return `Bump ${plan.packageName} from ${plan.installedVersion} to ${plan.chosenVersion ?? ""}`;
    if (plan.kind === "remove") return `Remove unused ${plan.packageName} from ${plan.edit?.section ?? "package.json"}`;
    return `Migration proposed for ${plan.packageName}`;
  }
  return `No change proposed for ${plan.packageName}: ${plan.reason ?? ""}`;
}

/** One entry per plan in plan order; absent and repeated names are skipped. */
export function attachRemediations(report: HealthReport, policyResult: PolicyResult, plans: readonly RemediationPlan[]): RemediationEntry[] {
  const seen = new Set<string>();
  const entries: RemediationEntry[] = [];
  for (const plan of plans) {
    if (seen.has(plan.packageName)) continue;
    const context = buildPrContext(report, policyResult, plan.packageName);
    if (context === null) continue;
    seen.add(plan.packageName);
    const intent = buildPrIntent(plan, context);
    entries.push({
      packageName: plan.packageName,
      kind: plan.kind,
      status: plan.status,
      title: intent?.title ?? cleanLine(`Sexton: no change proposed for ${plan.packageName}`, MAX_SUMMARY_LENGTH),
      summary: cleanLine(summarise(plan), MAX_SUMMARY_LENGTH),
      prBody: buildPrBody(plan, context),
      ...(plan.chosenVersion !== undefined ? { chosenVersion: plan.chosenVersion } : {}),
      ...(plan.majorUpgrade !== undefined ? { majorUpgrade: plan.majorUpgrade } : {}),
      ...(intent !== null ? { intent } : {}),
    });
  }
  return entries;
}
