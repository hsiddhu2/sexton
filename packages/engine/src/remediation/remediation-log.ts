// Append-only remediation log contract. Spec: .kiro/specs/remediation, Requirement 6.2.
// Two methods, no update and no delete, so the api can implement it over DynamoDB.

import type { RemediationLogEntry } from "../types.js";

export type AppendResult = { readonly ok: true } | { readonly ok: false; readonly reason: string };

export interface RemediationLog {
  append(entry: RemediationLogEntry): Promise<AppendResult>;
  list(): Promise<readonly RemediationLogEntry[]>;
}

export const LOG_REJECTED_REASON = "log entry rejected: it does not satisfy the entry rules";
