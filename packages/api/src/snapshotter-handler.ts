// The snapshotter handler, built from injected dependencies. Spec: .kiro/specs/infra, Requirements 7.3 to 7.6.
// Publishes its counts with CloudWatch Embedded Metric Format, so it needs no PutMetricData permission.
// Never throws, so the schedule (no retries) reports a bad run through metrics and the alarm.

import { CachedFetcher, type RetryOptions, type Transport } from "@sexton/engine";
import { DynamoCacheStore } from "./dynamo/cache-store.js";
import type { DynamoPort } from "./dynamo/port.js";
import { DynamoSnapshotStore } from "./dynamo/snapshot-store.js";
import { createLogger, errorName } from "./log/logger.js";
import { withRequestLogging } from "./log/logging-transport.js";
import type { ScanEnvironment } from "./scan-handler.js";
import { SCAN_CACHE_TTL_MS } from "./scan.js";
import { runSnapshotJob, type SnapshotJobDeps, type SnapshotJobResult } from "./snapshot-run.js";

export const METRIC_NAMESPACE = "Sexton";

/** One EMF line with SnapshotterFailed, SnapshotterDeferred and SnapshotterError. Pure. */
export function emfLine(result: SnapshotJobResult, now: Date): string {
  return JSON.stringify({
    _aws: {
      Timestamp: now.getTime(),
      CloudWatchMetrics: [
        {
          Namespace: METRIC_NAMESPACE,
          Dimensions: [[]],
          Metrics: [
            { Name: "SnapshotterFailed", Unit: "Count" },
            { Name: "SnapshotterDeferred", Unit: "Count" },
            { Name: "SnapshotterError", Unit: "Count" },
          ],
        },
      ],
    },
    SnapshotterFailed: result.failed,
    SnapshotterDeferred: result.deferred,
    SnapshotterError: result.error === undefined ? 0 : 1,
  });
}

export interface SnapshotterHandlerDeps {
  readonly environment: ScanEnvironment;
  readonly port: DynamoPort;
  readonly transport: Transport;
  readonly clock?: () => Date;
  readonly sink?: (line: string) => void;
  /** Where the EMF line goes. Defaults to the sink when one is given, else bare stdout with no runtime prefix. */
  readonly metricSink?: (line: string) => void;
  readonly retry?: RetryOptions;
  readonly run?: SnapshotJobDeps["run"];
}

/** Lambda's text log format prefixes console.log lines; EMF extraction needs the JSON document alone on its line. */
export function stdoutLine(line: string): void {
  process.stdout.write(`${line}\n`);
}

export interface SnapshotterContext {
  readonly awsRequestId: string;
  getRemainingTimeInMillis(): number;
}

export type SnapshotterHandler = (event: unknown, context: SnapshotterContext) => Promise<SnapshotJobResult>;

export function createSnapshotterHandler(deps: SnapshotterHandlerDeps): SnapshotterHandler {
  const clock = deps.clock ?? (() => new Date());
  const sink = deps.sink ?? console.log;
  const metricSink = deps.metricSink ?? deps.sink ?? stdoutLine;
  return async (_event, context) => {
    let result: SnapshotJobResult;
    try {
      const log = createLogger(`snap-${context.awsRequestId}`, sink, clock);
      const store = new DynamoSnapshotStore(deps.port, deps.environment.snapshotsTable, deps.environment.seenIndex, log);
      const cache = new CachedFetcher({ store: new DynamoCacheStore(deps.port, deps.environment.cacheTable, log), clock, ttlMs: SCAN_CACHE_TTL_MS });
      result = await runSnapshotJob({
        store,
        ctx: { transport: withRequestLogging(deps.transport, log), clock, cache, ...(deps.retry !== undefined ? { retry: deps.retry } : {}) },
        remainingMs: () => context.getRemainingTimeInMillis(),
        log,
        reference: clock(),
        ...(deps.run !== undefined ? { run: deps.run } : {}),
      });
    } catch (error) {
      result = { listed: 0, snapshotted: 0, failed: 0, deferred: 0, error: errorName(error) };
    }
    try {
      metricSink(emfLine(result, clock()));
    } catch {
      // Metrics are best effort; the handler must not throw.
    }
    return result;
  };
}
