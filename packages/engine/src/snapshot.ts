// Snapshot model and append-only SnapshotStore. Requirement 4.

export const MAX_SNAPSHOT_VERSIONS = 20;
export const RECENT_WINDOW_MS = 90 * 24 * 60 * 60 * 1000;

/** One published version inside a Snapshot. Requirement 4.1. */
export interface SnapshotVersion {
  readonly version: string;
  readonly publishTime: string;
  readonly hasInstallScript: boolean;
  /** null means unknown: the attestation read for this version failed. Requirement 4.13. */
  readonly provenance: boolean | null;
}

/** One dated record of a package. At most MAX_SNAPSHOT_VERSIONS versions. Requirement 4.1. */
export interface Snapshot {
  readonly name: string;
  readonly captureTime: string;
  readonly maintainers: readonly string[];
  readonly versions: readonly SnapshotVersion[];
}

/** Storage contract. No operation overwrites or deletes a Snapshot. Requirement 4.2. */
export interface SnapshotStore {
  append(snapshot: Snapshot): Promise<void>;
  history(name: string): Promise<readonly Snapshot[]>;
  recordSeen(name: string, at: Date): Promise<void>;
  listSeenWithin(reference: Date, windowMs: number): Promise<readonly string[]>;
}

/** Thrown by append when captureTime is not an ISO 8601 UTC string. Requirement 4.12. */
export class InvalidCaptureTimeError extends Error {
  constructor(captureTime: unknown) {
    super(`invalid capture time: ${typeof captureTime === "string" ? captureTime.slice(0, 64) : typeof captureTime}`);
    this.name = "InvalidCaptureTimeError";
  }
}

const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

function parseCaptureTime(value: unknown): number {
  if (typeof value !== "string" || !ISO_UTC.test(value)) {
    throw new InvalidCaptureTimeError(value);
  }
  const ms = new Date(value).getTime();
  if (!Number.isFinite(ms)) {
    throw new InvalidCaptureTimeError(value);
  }
  return ms;
}

interface StoredSnapshot {
  readonly snapshot: Snapshot;
  readonly captureMs: number;
  readonly seq: number;
}

/** In-memory store for the CLI and tests. Requirement 4.3. */
export class InMemorySnapshotStore implements SnapshotStore {
  private readonly snapshots = new Map<string, StoredSnapshot[]>();
  private readonly seen = new Map<string, number[]>();
  private nextSeq = 0;

  append(snapshot: Snapshot): Promise<void> {
    try {
      const captureMs = parseCaptureTime(snapshot.captureTime);
      const copy = structuredClone(snapshot);
      const list = this.snapshots.get(copy.name) ?? [];
      list.push({ snapshot: copy, captureMs, seq: this.nextSeq++ });
      this.snapshots.set(copy.name, list);
      return Promise.resolve();
    } catch (error) {
      return Promise.reject(error);
    }
  }

  history(name: string): Promise<readonly Snapshot[]> {
    const list = this.snapshots.get(name) ?? [];
    const ordered = [...list].sort((a, b) => a.captureMs - b.captureMs || a.seq - b.seq);
    return Promise.resolve(ordered.map((entry) => structuredClone(entry.snapshot)));
  }

  recordSeen(name: string, at: Date): Promise<void> {
    const list = this.seen.get(name) ?? [];
    list.push(at.getTime());
    this.seen.set(name, list);
    return Promise.resolve();
  }

  listSeenWithin(reference: Date, windowMs: number): Promise<readonly string[]> {
    const ref = reference.getTime();
    const names: string[] = [];
    for (const [name, times] of this.seen) {
      if (times.some((t) => t <= ref && ref - t <= windowMs)) {
        names.push(name);
      }
    }
    return Promise.resolve(names.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)));
  }
}
