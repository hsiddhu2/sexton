import type { ScanResponse } from "@sexton/api";
import { makeLoadError, type LoadError } from "./load-error.js";
import { validateScanResponse } from "./validate-scan-response.js";

export const MAX_SCAN_BYTES = 5 * 1024 * 1024;

export type LoadResult =
  | { readonly ok: true; readonly value: ScanResponse }
  | { readonly ok: false; readonly error: LoadError };

export interface LoadScanOptions {
  readonly fetchFn: typeof fetch;
  readonly signal: AbortSignal;
  readonly maxBytes?: number;
}

function fail(code: Parameters<typeof makeLoadError>[0], status?: number): LoadResult {
  return { ok: false, error: status === undefined ? makeLoadError(code) : makeLoadError(code, { status }) };
}

function discard(response: Response): void {
  try {
    void response.body?.cancel().catch(() => undefined);
  } catch {
    // nothing to release
  }
}

async function readBounded(response: Response, maxBytes: number): Promise<Uint8Array | null> {
  if (response.body === null) {
    const buffer = await response.arrayBuffer();
    return buffer.byteLength > maxBytes ? null : new Uint8Array(buffer);
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

async function run(url: string, options: LoadScanOptions): Promise<LoadResult> {
  const { fetchFn, signal } = options;
  const maxBytes = options.maxBytes ?? MAX_SCAN_BYTES;
  const response = await fetchFn(url, {
    method: "GET",
    credentials: "omit",
    redirect: "error",
    referrerPolicy: "no-referrer",
    headers: { Accept: "application/json" },
    signal,
  });
  if (signal.aborted) return fail("fetch-failed");
  if (response.status < 200 || response.status > 299) {
    discard(response);
    return fail("fetch-failed", response.status);
  }
  const declared = response.headers.get("content-length");
  if (declared !== null && /^\d+$/.test(declared) && Number(declared) > maxBytes) {
    discard(response);
    return fail("too-large");
  }
  const bytes = await readBounded(response, maxBytes);
  if (signal.aborted) return fail("fetch-failed");
  if (bytes === null) return fail("too-large");
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return fail("invalid-json");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return fail("invalid-json");
  }
  const result = validateScanResponse(parsed);
  if (!result.ok) return { ok: false, error: makeLoadError("invalid-response", { contractErrors: result.errors }) };
  return { ok: true, value: result.value };
}

/** Never rejects. `url` must already have passed checkScanUrl. No input string enters an error. */
export async function loadScan(url: string, options: LoadScanOptions): Promise<LoadResult> {
  try {
    return await run(url, options);
  } catch {
    return fail("fetch-failed");
  }
}
