// Pull request marks from the remediation log. Spec: .kiro/specs/cemetery-time, Requirement 14.1.
// Pure: one mark per package of the report, the entry with the latest timestamp, at most 300.

import type { RemediationLogEntry } from "@sexton/engine";
import type { PullRequestMark } from "./contract.js";

export const MAX_PULL_REQUEST_MARKS = 300;

export function pullRequestMarks(entries: readonly RemediationLogEntry[], packageNames: readonly string[]): PullRequestMark[] {
  const wanted = new Set(packageNames);
  const latest = new Map<string, { readonly entry: RemediationLogEntry; readonly at: number }>();
  for (const entry of entries) {
    if (!wanted.has(entry.package) || !entry.prUrl.startsWith("https://")) continue;
    const at = Date.parse(entry.timestamp);
    if (!Number.isFinite(at)) continue;
    const held = latest.get(entry.package);
    if (held === undefined || at > held.at) latest.set(entry.package, { entry, at });
  }
  const marks: PullRequestMark[] = [];
  for (const name of packageNames) {
    const held = latest.get(name);
    if (held === undefined) continue;
    latest.delete(name); // a repeated name in the report yields one mark
    marks.push({ package: name, kind: held.entry.kind, prUrl: held.entry.prUrl, timestamp: held.entry.timestamp });
    if (marks.length >= MAX_PULL_REQUEST_MARKS) break;
  }
  return marks;
}
