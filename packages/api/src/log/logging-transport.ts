// Transport wrapper: one log line per upstream request. Spec: .kiro/specs/infra, Requirements 6.1 to 6.3.
// Logs host and path only. Never reads the query, the fragment, a header or the body.

import type { Transport } from "@sexton/engine";
import { errorName, type LogFields, type Logger } from "./logger.js";

export const MAX_LOGGED_PATH = 200;

export function upstreamFields(url: string, status: number, latencyMs: number): LogFields {
  let host = "invalid-url";
  let path = "";
  try {
    const parsed = new URL(url);
    host = parsed.host;
    path = parsed.pathname.slice(0, MAX_LOGGED_PATH);
  } catch {
    // An unparseable URL logs no part of itself.
  }
  return { msg: "upstream", host, path, status, latencyMs };
}

/** Runs a log call and swallows any error from it: logging must never change a request's outcome. */
function quietly(write: () => void): void {
  try {
    write();
  } catch {
    // A failing sink loses one line, never the response or the original error.
  }
}

export function withRequestLogging(inner: Transport, log: Logger, clock: () => number = () => Date.now()): Transport {
  return async (url, request) => {
    const started = clock();
    let response: Awaited<ReturnType<Transport>>;
    try {
      response = await inner(url, request);
    } catch (error) {
      quietly(() => log.warn({ ...upstreamFields(url, 0, Math.max(0, clock() - started)), error: errorName(error) }));
      throw error;
    }
    quietly(() => log.info(upstreamFields(url, response.status, Math.max(0, clock() - started))));
    return response;
  };
}
