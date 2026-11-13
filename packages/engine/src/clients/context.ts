// Shared dependencies for signal clients. Requirement 10.3.

import type { CachedFetcher, Clock } from "../cache.js";
import { requestWithRetry, UpstreamError, type RetryOptions, type Transport, type TransportRequest } from "../http.js";

export interface ClientContext {
  readonly transport: Transport;
  readonly cache: CachedFetcher;
  readonly clock: Clock;
  readonly retry?: RetryOptions;
}

/** Fetches JSON through the cache. Throws on non-success status or non-JSON body so the caller can mark the signal unavailable. */
export async function cachedJson(ctx: ClientContext, key: string, url: string, request: TransportRequest): Promise<unknown> {
  return ctx.cache.get(key, async () => {
    const response = await requestWithRetry(ctx.transport, url, request, ctx.retry ?? {});
    if (response.status < 200 || response.status >= 300) {
      throw new UpstreamError(url, response.status);
    }
    return response.json();
  });
}

/** Turns any thrown value into a short reason string. Requirement 9.4. */
export function describeFailure(error: unknown): string {
  if (error instanceof UpstreamError) return `HTTP ${error.status}`;
  if (error instanceof Error) return error.message;
  return String(error);
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
