// The remediation log over DynamoDB. Spec: .kiro/specs/remediate, Requirement 5, decision 7.
// Append-only: one put per entry with a not-exists condition, and a partition read. Every entry passes isValidLogEntry.

import { isValidLogEntry, type RemediationLogEntry } from "@sexton/engine";
import { isS, type DynamoPort, type Item } from "../dynamo/port.js";

export const LOG_TABLE_VARIABLE = "REMEDIATION_LOG_TABLE";
export const LOG_PARTITION_KEY = "repository";
export const LOG_SORT_KEY = "sk";

export type LogAppend = { readonly ok: true } | { readonly ok: false; readonly reason: "invalid-entry" | "write-failed" };

export interface RemediationLogWriter {
  append(entry: RemediationLogEntry): Promise<LogAppend>;
}

export interface RemediationLogReader {
  /** Rejects when the read fails, so the caller can tell "no entries" from "unknown". */
  list(repository: string): Promise<readonly RemediationLogEntry[]>;
}

export function logItem(entry: RemediationLogEntry): Item {
  return {
    [LOG_PARTITION_KEY]: { S: entry.repository },
    [LOG_SORT_KEY]: { S: `${entry.timestamp}#${entry.branch}` },
    branch: { S: entry.branch },
    prUrl: { S: entry.prUrl },
    package: { S: entry.package },
    kind: { S: entry.kind },
    timestamp: { S: entry.timestamp },
  };
}

function entryFrom(item: Item): RemediationLogEntry | null {
  const fields = ["repository", "branch", "prUrl", "package", "kind", "timestamp"] as const;
  const out: Record<string, string> = {};
  for (const f of fields) {
    const v = item[f];
    if (!isS(v)) return null;
    out[f] = v.S;
  }
  return isValidLogEntry(out) ? out : null;
}

export class DynamoRemediationLog implements RemediationLogWriter, RemediationLogReader {
  constructor(
    private readonly port: DynamoPort,
    private readonly table: string,
  ) {}

  async append(entry: RemediationLogEntry): Promise<LogAppend> {
    if (!isValidLogEntry(entry)) return { ok: false, reason: "invalid-entry" };
    try {
      await this.port.putItem(this.table, logItem(entry), { ifNotExists: true, conditionKey: LOG_PARTITION_KEY });
      return { ok: true };
    } catch {
      return { ok: false, reason: "write-failed" };
    }
  }

  async list(repository: string): Promise<readonly RemediationLogEntry[]> {
    const items = await this.port.query({ table: this.table, partition: { name: LOG_PARTITION_KEY, value: repository } });
    return items.flatMap((item) => {
      const entry = entryFrom(item);
      return entry === null ? [] : [entry];
    });
  }
}
