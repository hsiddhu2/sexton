// The scan handler, built from injected dependencies. Spec: .kiro/specs/infra, Requirements 4, 6.4, 6.5.
// handlers/scan.ts builds the real dependencies once per container; tests build fakes.

import type { RetryOptions, Transport } from "@sexton/engine";
import type { LambdaFunctionURLEvent } from "aws-lambda";
import { DynamoCacheStore } from "./dynamo/cache-store.js";
import type { DynamoPort } from "./dynamo/port.js";
import { DynamoSnapshotStore } from "./dynamo/snapshot-store.js";
import { runEvidence } from "./evidence.js";
import { EVIDENCE_PATH, parseEvidenceRequest } from "./http/evidence-request.js";
import { errorResponse, evidenceRequestErrorSpec, internalErrorSpec, okResponse, requestErrorSpec, type FunctionUrlResponse } from "./http/responses.js";
import { parseScanRequest } from "./http/scan-request.js";
import { correlationId, createLogger } from "./log/logger.js";
import { withRequestLogging } from "./log/logging-transport.js";
import { runScan, type ScanDeps } from "./scan.js";

export interface ScanEnvironment {
  readonly cacheTable: string;
  readonly snapshotsTable: string;
  readonly seenIndex: string;
}

/** Reads the three variables the edge stack sets. Throws at init when one is missing, so the function fails fast. */
export function readScanEnvironment(env: Readonly<Record<string, string | undefined>>): ScanEnvironment {
  const read = (name: string): string => {
    const value = env[name];
    if (value === undefined || value === "") throw new Error(`missing environment variable ${name}`);
    return value;
  };
  return { cacheTable: read("CACHE_TABLE"), snapshotsTable: read("SNAPSHOTS_TABLE"), seenIndex: read("SEEN_INDEX") };
}

export interface ScanHandlerDeps {
  readonly environment: ScanEnvironment;
  readonly port: DynamoPort;
  /** The base transport, without request logging. */
  readonly transport: Transport;
  readonly clock?: () => Date;
  readonly sink?: (line: string) => void;
  readonly retry?: RetryOptions;
  readonly intake?: ScanDeps["intake"];
}

export type ScanHandler = (event: LambdaFunctionURLEvent, context: { readonly awsRequestId: string }) => Promise<FunctionUrlResponse>;

export function createScanHandler(deps: ScanHandlerDeps): ScanHandler {
  const clock = deps.clock ?? (() => new Date());
  return async (event, context) => {
    const requestId = correlationId(event.headers, context.awsRequestId);
    const log = createLogger(requestId, deps.sink);
    try {
      const scanDeps = (): ScanDeps => ({
        transport: withRequestLogging(deps.transport, log),
        cacheStore: new DynamoCacheStore(deps.port, deps.environment.cacheTable, log),
        snapshotStore: new DynamoSnapshotStore(deps.port, deps.environment.snapshotsTable, deps.environment.seenIndex, log),
        clock,
        log,
        ...(deps.retry !== undefined ? { retry: deps.retry } : {}),
        ...(deps.intake !== undefined ? { intake: deps.intake } : {}),
      });
      // GET /api/evidence on the same function (spec evidence-pack, Requirement 7.1). Every other path is the scan path.
      if (event.rawPath === EVIDENCE_PATH) {
        const evidenceRequest = parseEvidenceRequest(event);
        if (!evidenceRequest.ok) {
          log.info({ msg: "evidence", status: evidenceRequest.status, format: "none", packages: 0, bytes: 0, durationMs: 0 });
          return errorResponse(evidenceRequestErrorSpec(evidenceRequest.code), requestId);
        }
        return await runEvidence(evidenceRequest, scanDeps(), requestId);
      }
      const request = parseScanRequest(event);
      if (!request.ok) {
        log.info({ msg: "scan", status: request.status, packages: 0, capped: false, unlocked: false, policySource: "none", durationMs: 0 });
        return errorResponse(requestErrorSpec(request.code), requestId);
      }
      const outcome = await runScan(request.repoUrl, scanDeps());
      return outcome.ok ? okResponse(outcome.body, requestId) : errorResponse(outcome.response, requestId);
    } catch {
      return errorResponse(internalErrorSpec(), requestId);
    }
  };
}
