// npm registry clients. Requirements 4, 5. Never downloads a tarball.

import { cacheKey } from "../cache.js";
import { available, unavailable } from "../signal.js";
import type { Signal } from "../types.js";
import { cachedJson, describeFailure, isRecord, type ClientContext } from "./context.js";

export const NPM_REGISTRY = "https://registry.npmjs.org";
export const NPM_PACKUMENT_SOURCE = "npm-packument";
export const NPM_ABBREVIATED_SOURCE = "npm-abbreviated";
export const ABBREVIATED_ACCEPT = "application/vnd.npm.install-v1+json";

const META_KEYS = new Set(["created", "modified"]);

export function packumentUrl(name: string): string {
  return `${NPM_REGISTRY}/${encodePackageName(name)}`;
}

/** Scoped names keep the slash, npm expects @scope%2Fname. */
export function encodePackageName(name: string): string {
  return name.startsWith("@") ? `@${encodeURIComponent(name.slice(1))}` : encodeURIComponent(name);
}

/**
 * Greatest version-keyed time entry, ignoring created and modified. Null when nothing parses.
 * Deterministic for any packument. Requirement 4.2, 4.4, 4.6.
 */
export function extractLastPublish(packument: unknown): Date | null {
  if (!isRecord(packument) || !isRecord(packument["time"])) return null;
  let best: number | null = null;
  for (const [key, raw] of Object.entries(packument["time"])) {
    if (META_KEYS.has(key) || typeof raw !== "string") continue;
    const ms = new Date(raw).getTime();
    if (!Number.isFinite(ms)) continue;
    if (best === null || ms > best) best = ms;
  }
  return best === null ? null : new Date(best);
}

/** True only for a non-empty deprecated string on the installed version. Requirement 4.3. */
export function extractDeprecated(packument: unknown, version: string): boolean {
  if (!isRecord(packument) || !isRecord(packument["versions"])) return false;
  const entry = packument["versions"][version];
  if (!isRecord(entry)) return false;
  const flag = entry["deprecated"];
  return typeof flag === "string" && flag.length > 0;
}

export interface PackumentSignals {
  readonly lastPublish: Signal<string | null>;
  readonly deprecated: Signal<boolean>;
}

/** Reads last publish and deprecated from the full packument. One failure marks both unavailable. Requirement 4.5. */
export async function fetchPackumentSignals(ctx: ClientContext, name: string, version: string): Promise<PackumentSignals> {
  const url = packumentUrl(name);
  const now = ctx.clock();
  try {
    const packument = await cachedJson(ctx, cacheKey(NPM_PACKUMENT_SOURCE, name, "*"), url, {
      method: "GET",
      headers: { Accept: "application/json" },
    });
    const last = extractLastPublish(packument);
    return {
      lastPublish: available(last === null ? null : last.toISOString(), url, now),
      deprecated: available(extractDeprecated(packument, version), url, now),
    };
  } catch (error) {
    const reason = describeFailure(error);
    return { lastPublish: unavailable(reason, url, now), deprecated: unavailable(reason, url, now) };
  }
}

/** Reads hasInstallScript from the abbreviated packument. Requirement 5. */
export async function fetchInstallScriptSignal(ctx: ClientContext, name: string, version: string): Promise<Signal<boolean>> {
  const url = packumentUrl(name);
  const now = ctx.clock();
  try {
    const doc = await cachedJson(ctx, cacheKey(NPM_ABBREVIATED_SOURCE, name, "*"), url, {
      method: "GET",
      headers: { Accept: ABBREVIATED_ACCEPT },
    });
    if (!isRecord(doc) || !isRecord(doc["versions"])) {
      return unavailable("abbreviated packument has no versions map", url, now);
    }
    const entry = doc["versions"][version];
    if (!isRecord(entry)) {
      return unavailable("version not found", url, now);
    }
    return available(entry["hasInstallScript"] === true, url, now);
  } catch (error) {
    return unavailable(describeFailure(error), url, now);
  }
}
