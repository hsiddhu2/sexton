// The check command output. Spec: .kiro/specs/cli-and-action, Requirement 7.1. Pure, Safe text only.

import type { PolicyResult } from "@sexton/engine";
import { policyLine } from "./table.js";
import { safe } from "./safe-text.js";

export function renderCheck(policy: PolicyResult): string[] {
  const lines: string[] = [];
  for (const rule of policy.rules) {
    lines.push(`${rule.pass ? "PASS" : "FAIL"}  ${safe(rule.name ?? rule.type, 80)}`);
    for (const f of rule.failures) lines.push(`      fail: ${safe(f.name, 214)}@${safe(f.installedVersion, 64)}  ${safe(f.reason, 200)}`);
    for (const u of rule.unevaluated) lines.push(`      unevaluated: ${safe(u.name, 214)}@${safe(u.installedVersion, 64)}  ${safe(u.reason, 200)}`);
    for (const n of rule.notFound) lines.push(`      not found: ${safe(n, 214)}`);
  }
  lines.push(policy.pass ? "policy passed" : "policy failed", policyLine(policy));
  return lines;
}
