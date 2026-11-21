// Failing rules that name a package. Spec: .kiro/specs/remediation, Requirements 5.13, 7.6. Pure.

import type { FailingRule, PolicyResult } from "../types.js";

export function failingRulesFor(policy: PolicyResult, packageName: string): readonly FailingRule[] {
  const out: FailingRule[] = [];
  for (const rule of policy.rules) {
    if (rule.pass) continue;
    const failure = rule.failures.find((f) => f.name === packageName);
    if (failure === undefined) continue;
    out.push({ index: rule.index, type: rule.type, ...(rule.name !== undefined ? { name: rule.name } : {}), reason: failure.reason });
  }
  return out;
}
