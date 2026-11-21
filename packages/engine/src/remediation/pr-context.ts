// What a PR body needs for one package. Spec: .kiro/specs/remediation, Requirements 5.1, 7.7. Pure.

import type { HealthReport, PolicyResult, PrContext } from "../types.js";
import { ENGINE_VERSION } from "../version.js";
import { failingRulesFor } from "./failing-rules.js";

export function buildPrContext(report: HealthReport, policy: PolicyResult, packageName: string): PrContext | null {
  const entry = report.packages.find((p) => p.name === packageName);
  if (entry === undefined) return null;
  return { entry, failingRules: failingRulesFor(policy, packageName), generatedAt: report.generatedAt, engineVersion: ENGINE_VERSION };
}
