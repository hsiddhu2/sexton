// check_policy result. Spec: .kiro/specs/sexton-power, Requirement 6. Pure.
import type { PipelineResult } from "@sexton/cli";
import { capList, CAP, clean, MAX } from "../bound.js";

export function checkView(scan: PipelineResult): Record<string, unknown> {
  let truncated = false;
  const rules = scan.policy.rules.map((rule) => {
    const failures = capList(rule.failures, CAP.failures);
    const unevaluated = capList(rule.unevaluated, CAP.failures);
    const notFound = capList(rule.notFound, CAP.failures);
    if (failures.truncated || unevaluated.truncated || notFound.truncated) truncated = true;
    return {
      type: rule.type,
      name: clean(rule.name ?? rule.type, MAX.ruleName),
      pass: rule.pass,
      failures: failures.items.map((f) => ({ name: clean(f.name, MAX.name), installedVersion: clean(f.installedVersion, MAX.version), reason: clean(f.reason, MAX.reason) })),
      unevaluated: unevaluated.items.map((u) => ({ name: clean(u.name, MAX.name), installedVersion: clean(u.installedVersion, MAX.version), reason: clean(u.reason, MAX.reason) })),
      notFound: notFound.items.map((n) => clean(n, MAX.name)),
    };
  });
  return { exitCode: scan.policy.pass ? 0 : 1, pass: scan.policy.pass, policySource: scan.policy.source, rules, truncated };
}
