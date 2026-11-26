// One Remediation entry as a bounded plan object. Spec: .kiro/specs/sexton-power, Requirements 4.3, 5.2. Pure.
import type { RemediationEntry } from "@sexton/engine";
import { clean, cleanOrNull, MAX } from "../bound.js";

export function planView(entry: RemediationEntry, withBody: boolean): Record<string, unknown> {
  const plan: Record<string, unknown> = {
    kind: entry.kind,
    status: entry.status,
    title: clean(entry.title, MAX.reason),
    summary: clean(entry.summary, MAX.summary),
    chosenVersion: cleanOrNull(entry.chosenVersion, MAX.version),
    majorUpgrade: entry.majorUpgrade === true,
  };
  if (withBody) plan["prBodyPreview"] = clean(entry.prBody, MAX.prBodyPreview);
  return plan;
}

/** Remediation entries by package name. The Engine proposes at most one per package. */
export function plansByPackage(entries: readonly RemediationEntry[]): ReadonlyMap<string, RemediationEntry> {
  const map = new Map<string, RemediationEntry>();
  for (const entry of entries) if (!map.has(entry.packageName)) map.set(entry.packageName, entry);
  return map;
}
