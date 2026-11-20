// HTTP transport with User-Agent stamping and backoff. Requirements 8, 9.

import { USER_AGENT } from "./version.js";

export interface TransportRequest {
  readonly method: "GET" | "POST";
  readonly headers: Readonly<Record<string, string>>;
  readonly body?: string;
}

export type TextBody =
  | { readonly ok: true; readonly text: string }
  | { readonly ok: false; readonly reason: "too-large" | "invalid-encoding" };

export interface TransportResponse {
  readonly status: number;
  /** Parses the body as JSON. Rejects when the body is not JSON. */
  json(): Promise<unknown>;
  /** Reads the body as UTF-8 text, stopping once more than limitBytes bytes arrive. Optional so existing fakes still compile. */
  readonly text?: (limitBytes: number) => Promise<TextBody>;
}

/** The only thing that touches the network. Injectable so tests never do. Requirement 10.3. */
export type Transport = (url: string, request: TransportRequest) => Promise<TransportResponse>;

export type Sleep = (ms: number) => Promise<void>;
export type Random = () => number;

export interface RetryOptions {
  readonly sleep?: Sleep;
  readonly random?: Random;
  readonly maxRetries?: number;
  readonly baseDelayMs?: number;
}

export const RETRY_STATUSES: ReadonlySet<number> = new Set([429, 503]);
export const DEFAULT_MAX_RETRIES = 3;
export const DEFAULT_BASE_DELAY_MS = 500;

export class UpstreamError extends Error {
  constructor(
    readonly url: string,
    readonly status: number,
  ) {
    super(`HTTP ${status} from ${url}`);
    this.name = "UpstreamError";
  }
}

/** Default transport over global fetch. Stamps the User-Agent on every request. Requirement 8.2. */
export function createFetchTransport(fetchImpl: typeof fetch = fetch): Transport {
  return async (url, request) => {
    const init: RequestInit = {
      method: request.method,
      headers: { ...request.headers, "User-Agent": USER_AGENT },
    };
    if (request.body !== undefined) init.body = request.body;
    const response = await fetchImpl(url, init);
    return {
      status: response.status,
      json: () => response.json() as Promise<unknown>,
      text: (limitBytes) => readLimitedText(response, limitBytes),
    };
  };
}

async function cancelQuietly(target: { cancel(): Promise<void> } | null): Promise<void> {
  if (target === null) return;
  try {
    await target.cancel();
  } catch {
    // Cancelling is best effort.
  }
}

/** Reads a body as UTF-8 under an inclusive byte limit. Requirement 2.11. */
async function readLimitedText(response: Response, limitBytes: number): Promise<TextBody> {
  const declared = response.headers.get("content-length");
  if (declared !== null && /^\d+$/.test(declared)) {
    const length = Number(declared);
    if (Number.isSafeInteger(length) && length > limitBytes) {
      await cancelQuietly(response.body);
      return { ok: false, reason: "too-large" };
    }
  }
  if (response.body === null) return { ok: true, text: "" };
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limitBytes) {
      await cancelQuietly(reader);
      return { ok: false, reason: "too-large" };
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return { ok: true, text: new TextDecoder("utf-8", { fatal: true }).decode(bytes) };
  } catch {
    return { ok: false, reason: "invalid-encoding" };
  }
}

/** Full-jitter delay for a retry attempt. Attempt 0 is the first retry. Requirement 9.3. */
export function backoffDelay(attempt: number, random: Random, baseDelayMs = DEFAULT_BASE_DELAY_MS): number {
  const base = baseDelayMs * 2 ** attempt;
  return Math.floor(random() * base);
}

/**
 * Sends a request and retries on 429 or 503 at most maxRetries times.
 * Any other status returns at once. Throws UpstreamError when retries run out. Requirement 9.
 */
export async function requestWithRetry(
  transport: Transport,
  url: string,
  request: TransportRequest,
  options: RetryOptions = {},
): Promise<TransportResponse> {
  const sleep = options.sleep ?? defaultSleep;
  const random = options.random ?? Math.random;
  const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
  const baseDelayMs = options.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;

  let response = await transport(url, request);
  for (let attempt = 0; attempt < maxRetries && RETRY_STATUSES.has(response.status); attempt++) {
    await sleep(backoffDelay(attempt, random, baseDelayMs));
    response = await transport(url, request);
  }
  if (RETRY_STATUSES.has(response.status)) {
    throw new UpstreamError(url, response.status);
  }
  return response;
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
