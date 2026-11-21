// The scan table and the lines under it. Spec: .kiro/specs/cli-and-action, Requirements 6.3 to 6.5. Pure.
// Every string from the scan is Safe text, cut at 40 code points per cell. No colour.

import { SEVERITIES, STATE_ORDER, type HealthReport, type PolicyResult, type RemediationEntry, type Signal } from "@sexton/engine";
import { safe } from "./safe-text.js";

/** 39 code points plus the ellipsis, so a cut cell is at most 40 code points. */
export const CELL_MAX = 39;
const HEADERS = ["Package", "Version", "State", "Reason", "Advisories", "Install script", "Provenance", "Last publish"] as const;

function width(text: string): number {
  return Array.from(text).length;
}

function signalCell<T>(signal: Signal<T>, show: (value: T) => string): string {
  return signal.available ? show(signal.value) : "unavailable";
}

function rank(state: string): number {
  const i = (STATE_ORDER as readonly string[]).indexOf(state);
  return i === -1 ? STATE_ORDER.length : i;
}

export function renderTable(report: HealthReport): string[] {
  const rows = [...report.packages]
    .sort((a, b) => rank(a.state) - rank(b.state) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
    .map((p) => [
      p.name,
      p.installedVersion,
      p.state,
      p.stateReason,
      signalCell(p.signals.advisories, (list) => {
        if (list.length === 0) return "0";
        const highest = SEVERITIES.find((s) => list.some((a) => a.severity === s)) ?? "Unknown";
        return `${String(list.length)} ${highest}`;
      }),
      signalCell(p.signals.hasInstallScript, (v) => (v ? "yes" : "no")),
      signalCell(p.signals.provenance, (v) => (v.present ? "yes" : "no")),
      signalCell(p.signals.lastPublish, (v) => v ?? "unknown"),
    ].map((cell) => safe(cell, CELL_MAX)));
  const all = [[...HEADERS] as string[], ...rows];
  const widths = HEADERS.map((_, i) => Math.max(...all.map((r) => width(r[i] ?? ""))));
  return all.map((r) => r.map((cell, i) => cell + " ".repeat((widths[i] ?? 0) - width(cell))).join("  ").trimEnd());
}

export function policyLine(policy: PolicyResult): string {
  const source = policy.source === "default" ? "default policy, no sexton.policy.yml found" : "sexton.policy.yml";
  return `policy: ${policy.pass ? "passed" : "failed"} (${source})`;
}

export function renderScanFooter(report: HealthReport, policy: PolicyResult, remediations: readonly RemediationEntry[]): string[] {
  const lines: string[] = [];
  const scan = report.scan;
  if (scan !== undefined) {
    if (scan.unlocked) lines.push("unlocked: no lockfile, versions were resolved from declared ranges");
    else if (scan.unlockedPackages.length > 0) lines.push(`unlocked: ${String(scan.unlockedPackages.length)} packages resolved from declared ranges`);
    if (scan.capped) lines.push(`capped: showing ${String(report.packages.length)} of ${String(scan.totalDirect)} direct dependencies`);
    if (scan.unresolved.length > 0) lines.push(`unresolved: ${scan.unresolved.map((n) => safe(n, 214)).join(", ")}`);
  }
  lines.push(policyLine(policy));
  for (const r of remediations) lines.push(`remediation: ${safe(r.title, 200)}`);
  return lines;
}
