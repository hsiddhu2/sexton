// The remediate handler, built from injected dependencies. Spec: .kiro/specs/remediate, Requirements 3, 6.
// Order: parse, allowlist (before any scan or GitHub request), token, hosted scan with the token, executor.
// One log line per request with counts and fixed values only: no repository, branch, URL or body.

import { CachedFetcher, parseRepoUrl, type ClientContext, type RetryOptions, type Transport } from "@sexton/engine";
import type { LambdaFunctionURLEvent } from "aws-lambda";
import { DynamoCacheStore } from "./dynamo/cache-store.js";
import type { DynamoPort } from "./dynamo/port.js";
import { DynamoSnapshotStore } from "./dynamo/snapshot-store.js";
import type { FunctionUrlResponse } from "./http/responses.js";
import { correlationId, createLogger, errorName } from "./log/logger.js";
import { withRequestLogging } from "./log/logging-transport.js";
import { isAllowed } from "./remediate/allowlist.js";
import { execute, REASONS, type RemediateOutcome } from "./remediate/executor.js";
import { DynamoRemediationLog } from "./remediate/log-store.js";
import { parseRemediateRequest } from "./remediate/request.js";
import { outcomeResponse, remediateError } from "./remediate/response.js";
import { SCAN_CACHE_TTL_MS, scanWithInputs, type Summary } from "./scan.js";

export interface RemediateEnvironment {
  readonly cacheTable: string;
  readonly snapshotsTable: string;
  readonly seenIndex: string;
  readonly logTable: string;
}

/** Reads the four table variables. Throws at init when one is missing, so the function fails fast. */
export function readRemediateEnvironment(env: Readonly<Record<string, string | undefined>>): RemediateEnvironment {
  const read = (name: string): string => {
    const value = env[name];
    if (value === undefined || value === "") throw new Error(`missing environment variable ${name}`);
    return value;
  };
  return { cacheTable: read("CACHE_TABLE"), snapshotsTable: read("SNAPSHOTS_TABLE"), seenIndex: read("SEEN_INDEX"), logTable: read("REMEDIATION_LOG_TABLE") };
}

export interface RemediateHandlerDeps {
  readonly environment: RemediateEnvironment;
  readonly allow: ReadonlySet<string>;
  readonly port: DynamoPort;
  /** The base transport, without request logging. */
  readonly transport: Transport;
  readonly githubToken: () => Promise<string | null>;
  readonly clock?: () => Date;
  readonly sink?: (line: string) => void;
  readonly retry?: RetryOptions;
}

export type RemediateHandler = (
  event: LambdaFunctionURLEvent,
  context: { readonly awsRequestId: string; readonly getRemainingTimeInMillis?: () => number },
) => Promise<FunctionUrlResponse>;

export function createRemediateHandler(deps: RemediateHandlerDeps): RemediateHandler {
  const clock = deps.clock ?? (() => new Date());
  return async (event, context) => {
    const requestId = correlationId(event.headers, context.awsRequestId);
    const log = createLogger(requestId, deps.sink);
    const started = Date.now();
    const line = (fields: Record<string, string | number | boolean>): void => log.info({ msg: "remediate", ...fields, durationMs: Math.max(0, Date.now() - started) });
    try {
      const request = parseRemediateRequest(event);
      if (!request.ok) {
        line({ status: request.status, outcome: "rejected" });
        return remediateError(request.status, request.code, requestId);
      }
      if (!isAllowed(deps.allow, request.repo)) {
        line({ status: 422, outcome: "not-allowed", bodyHash: request.bodyHash });
        return remediateError(422, "repository-not-allowed", requestId);
      }
      // One form for the scan, GitHub and the log partition (design decision 9).
      const lower = parseRepoUrl(request.repo.url.toLowerCase());
      if (!lower.ok) return remediateError(400, "invalid-request", requestId);
      const repo = lower.repo;

      const finish = (outcome: RemediateOutcome): FunctionUrlResponse => {
        line({
          status: 200,
          outcome: outcome.status,
          bodyHash: request.bodyHash,
          ...(outcome.status === "failed" ? { step: outcome.step } : {}),
          ...(outcome.status === "opened" ? { logged: outcome.logged, posted: outcome.reviewSites?.posted ?? 0, dropped: outcome.reviewSites?.dropped ?? 0 } : {}),
        });
        return outcomeResponse(outcome, requestId);
      };

      let token: string | null;
      try {
        token = await deps.githubToken();
      } catch {
        token = null;
      }
      if (token === null) return finish({ status: "refused", reason: REASONS.noToken });

      const transport = withRequestLogging(deps.transport, log);
      const cacheStore = new DynamoCacheStore(deps.port, deps.environment.cacheTable, log);
      const retry = deps.retry !== undefined ? { retry: deps.retry } : {};
      const summary: Summary = { status: 500, packages: 0, capped: false, unlocked: false, policySource: "none" };
      const scanned = await scanWithInputs(
        repo.url,
        {
          transport,
          cacheStore,
          snapshotStore: new DynamoSnapshotStore(deps.port, deps.environment.snapshotsTable, deps.environment.seenIndex, log),
          clock,
          log,
          githubToken: () => Promise.resolve(token),
          ...retry,
        },
        summary,
      );
      if (!scanned.ok) return finish({ status: "refused", reason: REASONS.scanFailed });
      if (scanned.commit === null) return finish({ status: "refused", reason: REASONS.headUnknown });
      const entry = scanned.body.remediations?.find((r) => r.packageName === request.packageName);
      if (entry === undefined) return finish({ status: "refused", reason: REASONS.notProposed });

      const ctx: ClientContext = { transport, clock, cache: new CachedFetcher({ store: cacheStore, clock, ttlMs: SCAN_CACHE_TTL_MS }), ...retry };
      const remaining = context.getRemainingTimeInMillis;
      const outcome = await execute(repo, scanned.commit, entry, {
        ctx,
        token,
        allow: deps.allow,
        log: new DynamoRemediationLog(deps.port, deps.environment.logTable),
        clock,
        ...(remaining !== undefined ? { remainingMs: () => remaining.call(context) } : {}),
      });
      return finish(outcome);
    } catch (error) {
      try {
        log.error({ msg: "remediate-failed", errorName: errorName(error) });
      } catch {
        // Logging never changes the answer.
      }
      return remediateError(500, "internal-error", requestId);
    }
  };
}
