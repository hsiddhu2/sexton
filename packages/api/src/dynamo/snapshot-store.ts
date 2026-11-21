// DynamoDB SnapshotStore. Spec: .kiro/specs/infra, Requirement 3.
// Snapshots are written with a not-exists condition and never updated or deleted. History is sorted here,
// not by trusting the port's order. Seen records feed a sparse GSI with a Number sort key.

import { randomUUID } from "node:crypto";
import { InvalidCaptureTimeError, type Snapshot, type SnapshotStore } from "@sexton/engine";
import { errorName, type Logger } from "../log/logger.js";
import { ConditionFailedError, isS, type DynamoPort, type Item } from "./port.js";
import { SEEN_GSI_PK, decodeSnapshotSk, encodeSeenSk, encodeSnapshotSk, seenPk, snapshotPk } from "./snapshot-keys.js";

/** The engine's capture-time rule (InMemorySnapshotStore). */
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
/** Earliest Date value. Used as the lower bound for an unbounded window. */
const MIN_DATE_MS = -8.64e15;

function parseCaptureTime(value: unknown): number {
  if (typeof value !== "string" || !ISO_UTC.test(value)) throw new InvalidCaptureTimeError(value);
  const ms = new Date(value).getTime();
  if (!Number.isFinite(ms)) throw new InvalidCaptureTimeError(value);
  return ms;
}

/** `${counter}-${random}`: the counter keeps insertion order within one store, the 64 random bits keep stores apart. */
export function defaultSequenceSource(): () => string {
  let counter = 0;
  return () => {
    const sequence = `${String(counter).padStart(10, "0")}-${randomUUID().replace(/-/g, "").slice(0, 16)}`;
    counter += 1;
    return sequence;
  };
}

function compareCodeUnits(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

function isSnapshotOf(value: unknown, name: string): value is Snapshot {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    record["name"] === name &&
    typeof record["captureTime"] === "string" &&
    isStringArray(record["maintainers"]) &&
    Array.isArray(record["versions"]) &&
    record["versions"].every((v: unknown) => typeof v === "object" && v !== null && typeof (v as Record<string, unknown>)["version"] === "string")
  );
}

export class DynamoSnapshotStore implements SnapshotStore {
  constructor(
    private readonly port: DynamoPort,
    private readonly table: string,
    private readonly index: string,
    private readonly log: Logger,
    private readonly nextSequence: () => string = defaultSequenceSource(),
  ) {}

  async append(snapshot: Snapshot): Promise<void> {
    const captureMs = parseCaptureTime(snapshot.captureTime);
    const data = JSON.stringify(snapshot);
    const put = () =>
      this.port.putItem(this.table, { pk: { S: snapshotPk(snapshot.name) }, sk: { S: encodeSnapshotSk(captureMs, this.nextSequence()) }, data: { S: data } }, { ifNotExists: true });
    try {
      await put();
    } catch (error) {
      if (!(error instanceof ConditionFailedError)) throw error;
      this.log.warn({ msg: "snapshot-key-collision" });
      await put();
    }
  }

  async history(name: string): Promise<readonly Snapshot[]> {
    const items = await this.port.query({ table: this.table, partition: { name: "pk", value: snapshotPk(name) } });
    const decoded: { readonly snapshot: Snapshot; readonly captureMs: number; readonly sequence: string }[] = [];
    let corrupt = 0;
    for (const item of items) {
      const entry = this.decode(item, name);
      if (entry === undefined) corrupt += 1;
      else decoded.push(entry);
    }
    if (corrupt > 0) this.log.warn({ msg: "snapshot-corrupt", count: corrupt });
    decoded.sort((a, b) => a.captureMs - b.captureMs || compareCodeUnits(a.sequence, b.sequence));
    return decoded.map((entry) => entry.snapshot);
  }

  private decode(item: Item, name: string): { readonly snapshot: Snapshot; readonly captureMs: number; readonly sequence: string } | undefined {
    const sk = item["sk"];
    const data = item["data"];
    if (!isS(sk) || !isS(data)) return undefined;
    const key = decodeSnapshotSk(sk.S);
    if (key === undefined) return undefined;
    try {
      const parsed: unknown = JSON.parse(data.S);
      return isSnapshotOf(parsed, name) ? { snapshot: parsed, captureMs: key.captureMs, sequence: key.sequence } : undefined;
    } catch {
      return undefined;
    }
  }

  async recordSeen(name: string, at: Date): Promise<void> {
    const seenMs = at.getTime();
    await this.port.putItem(this.table, {
      pk: { S: seenPk(name) },
      sk: { S: encodeSeenSk(seenMs, this.nextSequence()) },
      gpk: { S: SEEN_GSI_PK },
      seenAt: { N: String(seenMs) },
      name: { S: name },
    });
  }

  async listSeenWithin(reference: Date, windowMs: number): Promise<readonly string[]> {
    const ref = reference.getTime();
    // Matches t <= ref && ref - t <= windowMs: nothing qualifies for a NaN input or a negative window.
    if (!Number.isFinite(ref) || Number.isNaN(windowMs) || windowMs < 0) return [];
    // Clamped to the earliest Date, so a huge or infinite window still sends a plain integer DynamoDB accepts.
    const low = Math.max(ref - windowMs, MIN_DATE_MS);
    let items: readonly Item[];
    try {
      items = await this.port.query({
        table: this.table,
        index: this.index,
        partition: { name: "gpk", value: SEEN_GSI_PK },
        sortBetween: { name: "seenAt", low: { N: String(low) }, high: { N: String(ref) } },
        projection: ["name"],
      });
    } catch (error) {
      this.log.warn({ msg: "seen-list-failed", errorName: errorName(error) });
      throw error;
    }
    const names = new Set<string>();
    for (const item of items) {
      const value = item["name"];
      if (isS(value)) names.add(value.S);
    }
    return [...names].sort(compareCodeUnits);
  }
}

