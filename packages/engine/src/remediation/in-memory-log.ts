// In-memory remediation log. Spec: .kiro/specs/remediation, Requirements 6.3 to 6.8.

import type { RemediationLogEntry } from "../types.js";
import { isValidLogEntry } from "./log-entry.js";
import { LOG_REJECTED_REASON, type AppendResult, type RemediationLog } from "./remediation-log.js";

export function createInMemoryRemediationLog(): RemediationLog {
  const entries: RemediationLogEntry[] = [];
  return {
    append(entry: RemediationLogEntry): Promise<AppendResult> {
      if (!isValidLogEntry(entry)) return Promise.resolve({ ok: false, reason: LOG_REJECTED_REASON });
      const { repository, branch, prUrl, kind, timestamp } = entry;
      entries.push(Object.freeze({ repository, branch, prUrl, package: entry.package, kind, timestamp }));
      return Promise.resolve({ ok: true });
    },
    list(): Promise<readonly RemediationLogEntry[]> {
      return Promise.resolve(Object.freeze(entries.slice()));
    },
  };
}
