// Cache item encoding. Pure. Spec: .kiro/specs/infra, Requirements 2.1 to 2.5.
// Values are stored as gzip(JSON.stringify(value)). The TTL attribute exists only so DynamoDB removes old
// items; freshness is decided by CachedFetcher from storedAt, so decoding never looks at expiresAt.

import { gunzipSync, gzipSync } from "node:zlib";
import type { CacheEntry } from "@sexton/engine";
import { isB, isN, isS, type Item } from "./port.js";

export const MAX_CACHE_VALUE_BYTES = 350 * 1024;
export const CACHE_TTL_SECONDS = 24 * 60 * 60;
/** DynamoDB allows 2048 bytes in a partition key. Engine keys are far shorter. */
export const MAX_CACHE_KEY_BYTES = 1024;
export const GZIP_LEVEL = 6;
/** Guards decoding against a corrupt or hostile item that expands without bound. */
export const MAX_DECODED_BYTES = 64 * 1024 * 1024;

export type EncodeResult =
  | { readonly ok: true; readonly item: Item; readonly bytes: number }
  | { readonly ok: false; readonly reason: "too-large" | "not-json" | "invalid-entry"; readonly bytes: number };

export function expiresAtSeconds(storedAtMs: number, ttlSeconds: number): number {
  return Math.floor(storedAtMs / 1000) + ttlSeconds;
}

export function cacheKeyItem(key: string): Item {
  return { pk: { S: key } };
}

export function encodeCacheItem(key: string, entry: CacheEntry<unknown>, ttlSeconds: number = CACHE_TTL_SECONDS): EncodeResult {
  if (Buffer.byteLength(key, "utf8") > MAX_CACHE_KEY_BYTES) return { ok: false, reason: "too-large", bytes: 0 };
  if (!Number.isSafeInteger(entry.storedAt)) return { ok: false, reason: "invalid-entry", bytes: 0 };
  let json: string | undefined;
  try {
    json = JSON.stringify(entry.value);
  } catch {
    return { ok: false, reason: "not-json", bytes: 0 };
  }
  // JSON.stringify returns undefined for undefined, a function or a symbol.
  if (typeof json !== "string") return { ok: false, reason: "not-json", bytes: 0 };
  const compressed = gzipSync(Buffer.from(json, "utf8"), { level: GZIP_LEVEL });
  if (compressed.byteLength > MAX_CACHE_VALUE_BYTES) return { ok: false, reason: "too-large", bytes: compressed.byteLength };
  return {
    ok: true,
    bytes: compressed.byteLength,
    item: {
      pk: { S: key },
      v: { B: new Uint8Array(compressed.buffer, compressed.byteOffset, compressed.byteLength) },
      storedAt: { N: String(entry.storedAt) },
      expiresAt: { N: String(expiresAtSeconds(entry.storedAt, ttlSeconds)) },
    },
  };
}

/** Returns undefined for any item that is incomplete or corrupt. Never throws. */
export function decodeCacheItem(item: Item): CacheEntry<unknown> | undefined {
  try {
    const pk = item["pk"];
    const v = item["v"];
    const storedAt = item["storedAt"];
    if (!isS(pk) || !isB(v) || !isN(storedAt)) return undefined;
    if (!/^-?\d{1,16}$/.test(storedAt.N)) return undefined;
    const stored = Number(storedAt.N);
    if (!Number.isSafeInteger(stored)) return undefined;
    const json = new TextDecoder("utf-8", { fatal: true }).decode(gunzipSync(v.B, { maxOutputLength: MAX_DECODED_BYTES }));
    return { value: JSON.parse(json) as unknown, storedAt: stored };
  } catch {
    return undefined;
  }
}
