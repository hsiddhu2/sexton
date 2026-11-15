// Maintainers signal from the full packument. Requirement 1.

import { available, toIso, unavailable } from "../signal.js";
import type { Signal } from "../types.js";
import { describeFailure, isRecord, type ClientContext } from "./context.js";
import { packumentUrl, readFullPackument } from "./npm.js";

export type PackumentDocument =
  | { readonly ok: true; readonly doc: unknown; readonly source: string; readonly fetchedAt: string }
  | { readonly ok: false; readonly reason: string; readonly source: string; readonly fetchedAt: string };

/** Reads the full packument through the shared cache key. Never throws. Requirement 1.1, 1.2, 1.5. */
export async function fetchFullPackumentDocument(ctx: ClientContext, name: string): Promise<PackumentDocument> {
  const source = packumentUrl(name);
  const now = ctx.clock();
  try {
    const doc = await readFullPackument(ctx, name);
    return { ok: true, doc, source, fetchedAt: toIso(now) };
  } catch (error) {
    return { ok: false, reason: describeFailure(error), source, fetchedAt: toIso(now) };
  }
}

/** Names in first-appearance order, no repeats, entries without a usable name dropped. Requirement 1.4, 1.6, 1.7. */
export function extractMaintainers(packument: unknown): string[] {
  if (!isRecord(packument)) return [];
  const raw = packument["maintainers"];
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const names: string[] = [];
  for (const entry of raw as unknown[]) {
    if (!isRecord(entry)) continue;
    const name = entry["name"];
    if (typeof name !== "string" || name.length === 0 || seen.has(name)) continue;
    seen.add(name);
    names.push(name);
  }
  return names;
}

/** Pure assembly of the signal from a document read. Requirement 1.3, 1.5. */
export function maintainersSignalFrom(result: PackumentDocument): Signal<readonly string[]> {
  const fetchedAt = new Date(result.fetchedAt);
  if (!result.ok) return unavailable(result.reason, result.source, fetchedAt);
  return available<readonly string[]>(extractMaintainers(result.doc), result.source, fetchedAt);
}

export async function fetchMaintainersSignal(ctx: ClientContext, name: string): Promise<Signal<readonly string[]>> {
  return maintainersSignalFrom(await fetchFullPackumentDocument(ctx, name));
}
