// The Markdown summary of sexton check --summary, also the pull request comment. Spec: .kiro/specs/cli-and-action,
// Requirements 7.3 to 7.5. Every outside string through escapeField. Pure.

import { escapeField, STATE_ORDER, type HealthReport, type PolicyResult, type RemediationEntry } from "@sexton/engine";

export const SUMMARY_MARKER = "<!-- sexton:check -->";
export const MAX_SUMMARY_CHARS = 60000;
export const SUMMARY_CUT_NOTE = "Summary cut at 60000 characters. Run sexton check locally for the full result.";

const F = escapeField;

export function renderSummary(report: HealthReport, policy: PolicyResult, remediations: readonly RemediationEntry[]): string {
  const lines: string[] = [SUMMARY_MARKER, `## Sexton check: ${policy.pass ? "pass" : "fail"}`, ""];
  lines.push(policy.source === "default" ? "Policy: the default policy, no `sexton.policy.yml` found" : "Policy: `sexton.policy.yml`");
  const counts = STATE_ORDER.map((s) => `${s} ${String(report.packages.filter((p) => p.state === s).length)}`);
  lines.push(`States: ${counts.join(", ")}`, "");
  const failing = policy.rules.filter((r) => !r.pass);
  lines.push("### Failing rules", "");
  if (failing.length === 0) lines.push("none");
  for (const rule of failing) {
    const packages = rule.failures.map((f) => `${F(f.name)} ${F(f.installedVersion)}`).join(", ");
    lines.push(`- ${F(rule.type)}${rule.name === undefined ? "" : ` ${F(rule.name)}`}: ${packages === "" ? "packages not found" : packages}`);
  }
  lines.push("", "### Proposed remediations", "");
  if (remediations.length === 0) lines.push("none");
  for (const r of remediations) lines.push(`- ${F(r.title)}`);
  lines.push("");
  const text = lines.join("\n");
  if (text.length <= MAX_SUMMARY_CHARS) return text;
  const room = MAX_SUMMARY_CHARS - SUMMARY_CUT_NOTE.length - 2;
  const cut = text.slice(0, room);
  return `${cut.slice(0, cut.lastIndexOf("\n"))}\n\n${SUMMARY_CUT_NOTE}`;
}
