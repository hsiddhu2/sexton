// scan_project result. Spec: .kiro/specs/sexton-power, Requirement 3. Pure.
import type { PipelineResult } from "@sexton/cli";
import { ENGINE_VERSION, STATE_ORDER, triageOrder } from "@sexton/engine";
import { capList, CAP, clean, cleanOrNull, MAX } from "../bound.js";
import { highestAdvisory } from "./highest-advisory.js";
import { plansByPackage } from "./plan-view.js";

export function scanView(scan: PipelineResult): Record<string, unknown> {
  const { report, policy } = scan;
  const origins = new Map(scan.dependencies.map((d) => [d.name, d.origin] as const));
  const plans = plansByPackage(scan.remediations);
  const counts = Object.fromEntries(STATE_ORDER.map((state) => [state, report.packages.filter((p) => p.state === state).length]));
  const packages = capList(triageOrder(report.packages), CAP.packages);
  const metadata = report.scan;
  const unresolved = capList(metadata?.unresolved ?? [], CAP.packages);
  return {
    generatedAt: clean(report.generatedAt, 40),
    engineVersion: clean(ENGINE_VERSION, MAX.version),
    policySource: policy.source,
    unlocked: metadata?.unlocked ?? false,
    unlockedPackages: metadata?.unlockedPackages.length ?? 0,
    capped: { capped: metadata?.capped ?? false, totalDirect: metadata?.totalDirect ?? report.packages.length },
    unresolved: unresolved.items.map((n) => clean(n, MAX.name)),
    counts,
    packages: packages.items.map((p) => ({
      name: clean(p.name, MAX.name),
      version: clean(p.installedVersion, MAX.version),
      state: p.state,
      reason: clean(p.stateReason, MAX.reason),
      origin: cleanOrNull(origins.get(p.name), 40),
      highestAdvisory: cleanOrNull(highestAdvisory(p), 40),
      hasPlan: plans.get(p.name)?.status === "proposed",
    })),
    truncated: packages.truncated || unresolved.truncated,
  };
}
