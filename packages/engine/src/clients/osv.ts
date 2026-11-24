// OSV advisory client. Requirement 6. querybatch returns IDs only, details come from /v1/vulns/{id}.

import { cacheKey } from "../cache.js";
import { severityFromOsv } from "../severity.js";
import { available, unavailable } from "../signal.js";
import type { Advisory, Signal } from "../types.js";
import { requestWithRetry, UpstreamError } from "../http.js";
import { cachedJson, describeFailure, isRecord, type ClientContext } from "./context.js";

export const OSV_API = "https://api.osv.dev/v1";
export const OSV_QUERY_SOURCE = "osv-querybatch";
export const OSV_VULN_SOURCE = "osv-vuln";
export const OSV_MAX_PAGES = 10;
/** Cache source of the batched multi-version query. Spec: .kiro/specs/remediation, Decision 4. */
export const OSV_BATCH_SOURCE = "osv-querybatch-multi";

const JSON_HEADERS = { Accept: "application/json", "Content-Type": "application/json" } as const;

/** Collects vulnerability IDs for one package version, following next_page_token up to 10 pages. Requirement 6.1, 6.3. */
export async function queryVulnIds(ctx: ClientContext, name: string, version: string): Promise<string[]> {
  const ids: string[] = [];
  let pageToken: string | undefined;
  for (let page = 0; page < OSV_MAX_PAGES; page++) {
    const query: Record<string, unknown> = { package: { name, ecosystem: "npm" }, version };
    if (pageToken !== undefined) query["page_token"] = pageToken;
    const key = cacheKey(OSV_QUERY_SOURCE, name, pageToken === undefined ? version : `${version}#${pageToken}`);
    const body = await cachedJson(ctx, key, `${OSV_API}/querybatch`, {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({ queries: [query] }),
    });
    const result = firstResult(body);
    for (const vuln of result.vulns) ids.push(vuln);
    pageToken = result.nextPageToken;
    if (pageToken === undefined) break;
  }
  return ids;
}

function firstResult(body: unknown): { vulns: string[]; nextPageToken: string | undefined } {
  if (!isRecord(body) || !Array.isArray(body["results"])) {
    throw new Error("querybatch response has no results array");
  }
  const first: unknown = body["results"][0];
  if (!isRecord(first)) return { vulns: [], nextPageToken: undefined };
  const vulns: string[] = [];
  if (Array.isArray(first["vulns"])) {
    for (const v of first["vulns"] as unknown[]) {
      if (isRecord(v) && typeof v["id"] === "string") vulns.push(v["id"]);
    }
  }
  const token = first["next_page_token"];
  return { vulns, nextPageToken: typeof token === "string" && token.length > 0 ? token : undefined };
}

/** Fetches one vulnerability record and normalises it. Requirement 6.2. */
export async function fetchAdvisory(ctx: ClientContext, id: string): Promise<Advisory> {
  const record = await cachedJson(ctx, cacheKey(OSV_VULN_SOURCE, id, "*"), `${OSV_API}/vulns/${encodeURIComponent(id)}`, {
    method: "GET",
    headers: { Accept: "application/json" },
  });
  if (!isRecord(record)) throw new Error(`vuln ${id} response is not an object`);
  const summary = typeof record["summary"] === "string" ? record["summary"] : "";
  return { id, severity: severityFromOsv(record), summary };
}

/**
 * Published time of one advisory, read from the cached `osv-vuln` document. ISO, or null when the
 * record has no parseable `published` or the read fails. Never throws. Spec cemetery-time, 8.1.
 */
export async function fetchAdvisoryPublished(ctx: ClientContext, id: string): Promise<string | null> {
  try {
    const record = await cachedJson(ctx, cacheKey(OSV_VULN_SOURCE, id, "*"), `${OSV_API}/vulns/${encodeURIComponent(id)}`, {
      method: "GET",
      headers: { Accept: "application/json" },
    });
    if (!isRecord(record) || typeof record["published"] !== "string") return null;
    const ms = new Date(record["published"]).getTime();
    return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
  } catch {
    return null;
  }
}

/** Advisories for one package version. Any failure marks the whole signal unavailable. Requirement 6.4, 6.5. */
export async function fetchAdvisoriesSignal(ctx: ClientContext, name: string, version: string): Promise<Signal<readonly Advisory[]>> {
  const source = `${OSV_API}/querybatch`;
  const now = ctx.clock();
  try {
    const ids = await queryVulnIds(ctx, name, version);
    const advisories = await Promise.all(ids.map((id) => fetchAdvisory(ctx, id)));
    return available(advisories, source, now);
  } catch (error) {
    return unavailable(describeFailure(error), source, now);
  }
}

// Batched query for several versions of one package. Spec: .kiro/specs/remediation, Requirements 2.18, 2.19, 2.21, 2.22, 8.6, 8.7.

const PLAUSIBLE_ID = /^[A-Za-z0-9._:-]{1,128}$/;
const BATCH_VERSION = /^[0-9A-Za-z.+-]{1,64}$/;

/** Thrown for a response or cached value that is not the expected shape. */
export class OsvShapeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OsvShapeError";
  }
}

/** Thrown when a token remains after OSV_MAX_PAGES requests. */
export class OsvPaginationError extends Error {
  constructor() {
    super("querybatch pagination did not finish");
    this.name = "OsvPaginationError";
  }
}

type Pairs = [string, string[]][];

function isObjectLike(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readBatchResults(body: unknown, expected: number): { ids: string[]; token: string | undefined }[] {
  if (!isObjectLike(body) || !Object.hasOwn(body, "results")) throw new OsvShapeError("querybatch response is malformed");
  const results = body["results"];
  if (!Array.isArray(results) || results.length !== expected) throw new OsvShapeError("querybatch response is malformed");
  return results.map((result: unknown) => {
    if (!isObjectLike(result)) throw new OsvShapeError("querybatch response is malformed");
    const ids: string[] = [];
    if (Object.hasOwn(result, "vulns")) {
      const vulns = result["vulns"];
      if (!Array.isArray(vulns)) throw new OsvShapeError("querybatch response is malformed");
      for (const vuln of vulns as unknown[]) {
        if (!isObjectLike(vuln) || !Object.hasOwn(vuln, "id")) throw new OsvShapeError("querybatch response is malformed");
        const id = vuln["id"];
        if (typeof id !== "string" || !PLAUSIBLE_ID.test(id)) throw new OsvShapeError("querybatch response is malformed");
        ids.push(id);
      }
    }
    const raw = Object.hasOwn(result, "next_page_token") ? result["next_page_token"] : undefined;
    return { ids, token: typeof raw === "string" && raw.length > 0 ? raw : undefined };
  });
}

function readPairs(value: unknown, versions: readonly string[]): Map<string, readonly string[]> {
  if (!Array.isArray(value) || value.length !== versions.length) throw new OsvShapeError("cached querybatch value is malformed");
  const map = new Map<string, readonly string[]>();
  value.forEach((pair: unknown, i) => {
    if (!Array.isArray(pair) || pair.length !== 2 || pair[0] !== versions[i] || !Array.isArray(pair[1])) {
      throw new OsvShapeError("cached querybatch value is malformed");
    }
    const ids = pair[1] as unknown[];
    if (!ids.every((id) => typeof id === "string" && PLAUSIBLE_ID.test(id))) throw new OsvShapeError("cached querybatch value is malformed");
    map.set(versions[i] as string, ids as string[]);
  });
  return map;
}

async function runBatch(ctx: ClientContext, name: string, versions: readonly string[]): Promise<Pairs> {
  const url = `${OSV_API}/querybatch`;
  const ids = versions.map(() => [] as string[]);
  let pending: { index: number; token?: string }[] = versions.map((_, index) => ({ index }));
  for (let sent = 0; pending.length > 0; sent++) {
    if (sent >= OSV_MAX_PAGES) throw new OsvPaginationError();
    const queries = pending.map((q) => ({
      package: { name, ecosystem: "npm" },
      version: versions[q.index],
      ...(q.token === undefined ? {} : { page_token: q.token }),
    }));
    const response = await requestWithRetry(ctx.transport, url, { method: "POST", headers: JSON_HEADERS, body: JSON.stringify({ queries }) }, ctx.retry ?? {});
    if (response.status < 200 || response.status >= 300) throw new UpstreamError(url, response.status);
    const results = readBatchResults(await response.json(), queries.length);
    const next: { index: number; token: string }[] = [];
    results.forEach((result, i) => {
      const q = pending[i] as (typeof pending)[number];
      const list = ids[q.index] as string[];
      for (const id of result.ids) if (!list.includes(id)) list.push(id);
      if (result.token !== undefined) next.push({ index: q.index, token: result.token });
    });
    pending = next;
  }
  return versions.map((v, i) => [v, ids[i] as string[]]);
}

/**
 * Advisory IDs for several versions of one package, in at most OSV_MAX_PAGES querybatch requests in total.
 * The whole exchange is cached as one value of [version, ids] pairs. Throws on any failure so the cache stores nothing.
 */
export async function queryVulnIdsBatch(ctx: ClientContext, name: string, versions: readonly string[]): Promise<ReadonlyMap<string, readonly string[]>> {
  if (versions.length === 0) return new Map();
  if (new Set(versions).size !== versions.length || !versions.every((v) => typeof v === "string" && BATCH_VERSION.test(v))) {
    throw new OsvShapeError("querybatch versions are invalid");
  }
  const stored = await ctx.cache.get(cacheKey(OSV_BATCH_SOURCE, name, versions.join(",")), () => runBatch(ctx, name, versions));
  return readPairs(stored, versions);
}
