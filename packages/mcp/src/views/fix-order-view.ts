// fix_order result. Spec: .kiro/specs/sexton-power, Requirement 5. Pure.
import type { PipelineResult } from "@sexton/cli";
import { triageOrder } from "@sexton/engine";
import { capList, CAP, clean, MAX } from "../bound.js";
import { planView, plansByPackage } from "./plan-view.js";

export function fixOrderView(scan: PipelineResult): Record<string, unknown> {
  const plans = plansByPackage(scan.remediations);
  const ordered = capList(triageOrder(scan.report.packages), CAP.packages);
  return {
    generatedAt: clean(scan.report.generatedAt, 40),
    proposedCount: scan.report.packages.filter((p) => plans.get(p.name)?.status === "proposed").length,
    packages: ordered.items.map((p, i) => {
      const entry = plans.get(p.name);
      return {
        position: i + 1,
        name: clean(p.name, MAX.name),
        version: clean(p.installedVersion, MAX.version),
        state: p.state,
        reason: clean(p.stateReason, MAX.reason),
        plan: entry === undefined ? null : planView(entry, false),
      };
    }),
    truncated: ordered.truncated,
  };
}
