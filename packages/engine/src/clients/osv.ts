// OSV advisory client. Requirement 6. querybatch returns IDs only, details come from /v1/vulns/{id}.

import { cacheKey } from "../cache.js";
import { severityFromOsv } from "../severity.js";
import { available, unavailable } from "../signal.js";
import type { Advisory, Signal } from "../types.js";
import { cachedJson, describeFailure, isRecord, type ClientContext } from "./context.js";

export const OSV_API = "https://api.osv.dev/v1";
export const OSV_QUERY_SOURCE = "osv-querybatch";
export const OSV_VULN_SOURCE = "osv-vuln";
export const OSV_MAX_PAGES = 10;

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
