// The scan cache (spec home-page, design C4, requirement 13): finished Live scans kept in the browser for 15 minutes,
// keyed by the lower-case owner/name, newest first, at most 10 Entries and 2,000,000 characters of stored text. An
// Entry past 15 minutes keeps its key, label and time for Recent scans and loses its response at the next write.
// Pure: the localStorage edge is cache/scan-store.ts.
import type { ScanResponse } from "@sexton/api";
import { normaliseRepo } from "../header/repo-input.js";
import { validateScanResponse } from "../load/validate-scan-response.js";

export const CACHE_KEY = "sexton:scans";
export const CACHE_VERSION = 1;
export const TTL_MS = 15 * 60 * 1000;
export const MAX_ENTRIES = 10;
export const MAX_CHARS = 2_000_000;

export interface Entry {
  /** The Repo key: owner/name in lower case. */
  readonly key: string;
  /** The owner/name as header/repo-input.ts writes it. */
  readonly label: string;
  /** Milliseconds since the epoch at save. */
  readonly savedAt: number;
  readonly response: ScanResponse | null;
}

/** Pure. The Repo key of an owner/name label. */
export function repoKey(label: string): string {
  return label.toLowerCase();
}

/** Pure. True when the Entry holds a response saved less than TTL_MS before `now`, and not after it (13.11). */
export function isFresh(entry: Entry, now: number): boolean {
  const age = now - entry.savedAt;
  return entry.response !== null && age >= 0 && age < TTL_MS;
}

/** Pure. The stored text of `entries`. */
export function serialise(entries: readonly Entry[]): string {
  return JSON.stringify({ v: CACHE_VERSION, entries });
}

/**
 * Pure. Adds a finished scan as the newest Entry (13.1, 13.6, 13.7): one Entry per key, at most MAX_ENTRIES, no
 * response kept past TTL_MS, and the oldest responses dropped first until the text fits MAX_CHARS. A response that
 * alone does not fit is not kept.
 */
export function addScan(entries: readonly Entry[], label: string, response: ScanResponse, now: number): Entry[] {
  const key = repoKey(label);
  // A response that alone does not fit is not kept, and costs the older Entries nothing.
  const fits = serialise([{ key, label, savedAt: now, response }]).length <= MAX_CHARS;
  const added: Entry = { key, label, savedAt: now, response: fits ? response : null };
  let next: Entry[] = [added, ...entries.filter((e) => e.key !== key)]
    .slice(0, MAX_ENTRIES)
    .map((e) => (e.response !== null && !isFresh(e, now) ? { ...e, response: null } : e));
  for (let i = next.length - 1; i >= 0 && serialise(next).length > MAX_CHARS; i -= 1) {
    const entry = next[i];
    if (entry?.response !== null && entry !== undefined) next = next.map((e, j) => (j === i ? { ...e, response: null } : e));
  }
  return next;
}

/** Pure. The response and save time of the Fresh Entry for `key`, or null (13.2). */
export function freshResponse(entries: readonly Entry[], key: string, now: number): { readonly response: ScanResponse; readonly savedAt: number } | null {
  const entry = entries.find((e) => e.key === key);
  return entry !== undefined && entry.response !== null && isFresh(entry, now) ? { response: entry.response, savedAt: entry.savedAt } : null;
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function entryOf(raw: unknown): Entry | null {
  if (!isObj(raw)) return null;
  const { key, label, savedAt, response } = raw;
  if (typeof key !== "string" || typeof label !== "string" || typeof savedAt !== "number" || !Number.isFinite(savedAt)) return null;
  const repo = normaliseRepo(label);
  if (!repo.ok || repo.label !== label || repoKey(label) !== key) return null;
  if (response === null) return { key, label, savedAt, response: null };
  const checked = validateScanResponse(response);
  return { key, label, savedAt, response: checked.ok ? checked.value : null };
}

/** Pure, never throws. The Entries of the stored text; anything missing, of another version or invalid is skipped (13.8). */
export function parseStore(text: string | null): Entry[] {
  if (text === null) return [];
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return [];
  }
  if (!isObj(data) || data["v"] !== CACHE_VERSION || !Array.isArray(data["entries"])) return [];
  const out: Entry[] = [];
  for (const raw of data["entries"] as unknown[]) {
    if (out.length === MAX_ENTRIES) break;
    const entry = entryOf(raw);
    if (entry !== null && !out.some((e) => e.key === entry.key)) out.push(entry);
  }
  return out;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Pure. An age as Recent scans and the cached line show it (13.3, 14.1). A negative age reads "just now". */
export function ageText(ms: number): string {
  if (!(ms >= MINUTE)) return "just now";
  if (ms < HOUR) return `${String(Math.floor(ms / MINUTE))} min ago`;
  if (ms < DAY) return `${String(Math.floor(ms / HOUR))} h ago`;
  return `${String(Math.floor(ms / DAY))} d ago`;
}

/** Pure. The cached line of 13.3. */
export function scannedText(ms: number): string {
  return `Scanned ${ageText(ms)}`;
}
