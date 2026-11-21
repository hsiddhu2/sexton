// The daily snapshot job inside a time budget. Spec: .kiro/specs/infra, Requirements 7.3 to 7.5.
// Lists Seen names once, then runs the engine's runSnapshotter on chunks while enough time remains.

import { RECENT_WINDOW_MS, runSnapshotter, type ClientContext, type SnapshotStore } from "@sexton/engine";
import { errorName, type Logger } from "./log/logger.js";

export const CHUNK_SIZE = 25;
export const SAFETY_MARGIN_MS = 90_000;

export interface SnapshotJobResult {
  readonly listed: number;
  readonly snapshotted: number;
  readonly failed: number;
  readonly deferred: number;
  /** The error name when listing failed. */
  readonly error?: string;
}

export interface SnapshotJobDeps {
  readonly store: SnapshotStore;
  readonly ctx: ClientContext;
  readonly remainingMs: () => number;
  readonly log: Logger;
  readonly reference: Date;
  readonly chunkSize?: number;
  /** Injectable for tests. Defaults to the engine's runSnapshotter. */
  readonly run?: typeof runSnapshotter;
}

/** Splits names into chunks of at most size, in order. Pure. */
export function planChunks(names: readonly string[], size: number): readonly (readonly string[])[] {
  const step = Math.max(1, Math.floor(size));
  const chunks: string[][] = [];
  for (let i = 0; i < names.length; i += step) chunks.push(names.slice(i, i + step));
  return chunks;
}

/** Never rejects. snapshotted + failed + deferred always equals listed. */
export async function runSnapshotJob(deps: SnapshotJobDeps): Promise<SnapshotJobResult> {
  const run = deps.run ?? runSnapshotter;
  let names: readonly string[];
  try {
    names = [...new Set(await deps.store.listSeenWithin(deps.reference, RECENT_WINDOW_MS))];
  } catch (error) {
    const result: SnapshotJobResult = { listed: 0, snapshotted: 0, failed: 0, deferred: 0, error: errorName(error) };
    deps.log.error({ msg: "snapshot-run", listed: 0, snapshotted: 0, failed: 0, deferred: 0, error: result.error ?? "Error" });
    return result;
  }

  const chunks = planChunks(names, deps.chunkSize ?? CHUNK_SIZE);
  let snapshotted = 0;
  let failed = 0;
  let deferred = 0;
  for (let index = 0; index < chunks.length; index += 1) {
    const chunk = chunks[index] ?? [];
    if (deps.remainingMs() <= SAFETY_MARGIN_MS) {
      deferred = chunks.slice(index).reduce((sum, c) => sum + c.length, 0);
      break;
    }
    let done = 0;
    try {
      const result = await run(deps.store, deps.ctx, chunk);
      done = Math.min(result.snapshotted.length, chunk.length);
    } catch (error) {
      deps.log.warn({ msg: "snapshot-chunk-failed", index, errorName: errorName(error) });
    }
    snapshotted += done;
    failed += chunk.length - done;
    deps.log.info({ msg: "snapshot-chunk", index, size: chunk.length, snapshotted: done, failed: chunk.length - done });
  }
  const result: SnapshotJobResult = { listed: names.length, snapshotted, failed, deferred };
  deps.log.info({ msg: "snapshot-run", ...result });
  return result;
}
