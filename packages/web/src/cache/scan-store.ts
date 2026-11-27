// The scan cache's localStorage edge (spec home-page, design C4, requirement 13.9): every access is guarded, so a
// blocked or full store reads as empty and writes nothing. Nothing here leaves the browser.
import type { ScanResponse } from "@sexton/api";
import { addScan, CACHE_KEY, parseStore, serialise, type Entry } from "./scan-cache.js";

export type CacheStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/** The page's localStorage, or null when reading it throws or there is none. */
export function localStore(): CacheStorage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function readCache(storage: CacheStorage | null = localStore()): Entry[] {
  try {
    return parseStore(storage?.getItem(CACHE_KEY) ?? null);
  } catch {
    return [];
  }
}

/** Saves a finished Live scan and returns the Entries now stored, or the Entries read when the write fails. */
export function saveScan(label: string, response: ScanResponse, now: number, storage: CacheStorage | null = localStore()): Entry[] {
  const before = readCache(storage);
  const next = addScan(before, label, response, now);
  try {
    if (storage === null) return before;
    storage.setItem(CACHE_KEY, serialise(next));
    return next;
  } catch {
    return before;
  }
}

/** Clear (14.4): removes the stored item. */
export function clearCache(storage: CacheStorage | null = localStore()): void {
  try {
    storage?.removeItem(CACHE_KEY);
  } catch {
    // Storage blocked: there is nothing to clear.
  }
}
