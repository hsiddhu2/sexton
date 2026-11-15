// deps.dev GetDependencies client. Requirements 3.1, 3.6, 3.8. Never downloads a tarball.

import { cacheKey } from "../cache.js";
import { requestWithRetry, UpstreamError } from "../http.js";
import type { NameEdge, ResolvedGraph } from "../reach.js";
import { cleanReason, toIso } from "../signal.js";
import { isRecord, type ClientContext } from "./context.js";

export const DEPS_DEV_API = "https://api.deps.dev/v3";
export const DEPS_DEV_SOURCE = "deps-dev-dependencies";

const MALFORMED_REASON = "malformed deps.dev graph body";

export type GraphFetch =
  | { readonly ok: true; readonly graph: ResolvedGraph; readonly source: string; readonly fetchedAt: string }
  | { readonly ok: false; readonly reason: string; readonly source: string; readonly fetchedAt: string };

class MalformedGraphError extends Error {
  constructor() {
    super(MALFORMED_REASON);
    this.name = "MalformedGraphError";
  }
}

export function dependenciesUrl(name: string, version: string): string {
  return `${DEPS_DEV_API}/systems/npm/packages/${encodeURIComponent(name)}/versions/${encodeURIComponent(version)}:dependencies`;
}

function nodeName(node: unknown): string | null {
  if (!isRecord(node)) return null;
  const key = node["versionKey"];
  if (!isRecord(key)) return null;
  const name = key["name"];
  return typeof name === "string" && name !== "" ? name : null;
}

function nodeIndex(value: unknown, length: number): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value < length ? value : null;
}

/**
 * Pure. Null when the body is not an object with a nodes array.
 * Maps node indexes to names. Drops edges with bad indexes and self edges.
 */
export function parseDependencyGraph(body: unknown): ResolvedGraph | null {
  if (!isRecord(body) || !Array.isArray(body["nodes"])) return null;
  const nodes = body["nodes"] as unknown[];
  const names = nodes.map(nodeName);
  const distinct = new Set<string>();
  for (const name of names) {
    if (name !== null) distinct.add(name);
  }
  const edges: NameEdge[] = [];
  const rawEdges: unknown[] = Array.isArray(body["edges"]) ? (body["edges"] as unknown[]) : [];
  for (const edge of rawEdges) {
    if (!isRecord(edge)) continue;
    const from = nodeIndex(edge["fromNode"], nodes.length);
    const to = nodeIndex(edge["toNode"], nodes.length);
    if (from === null || to === null) continue;
    const dependent = names[from];
    const dependency = names[to];
    if (dependent === null || dependent === undefined || dependency === null || dependency === undefined) continue;
    if (dependent === dependency) continue;
    edges.push([dependent, dependency]);
  }
  return { names: [...distinct], edges };
}

/** Never throws. Only parsed graphs are cached, so a failure is never cached. Requirement 3.8. */
export async function fetchDependencyGraph(ctx: ClientContext, name: string, version: string): Promise<GraphFetch> {
  const source = dependenciesUrl(name, version);
  const now = ctx.clock();
  const fetchedAt = toIso(now);
  try {
    const graph = await ctx.cache.get<ResolvedGraph>(cacheKey(DEPS_DEV_SOURCE, name, version), async () => {
      const response = await requestWithRetry(ctx.transport, source, { method: "GET", headers: { Accept: "application/json" } }, ctx.retry ?? {});
      if (response.status < 200 || response.status >= 300) {
        throw new UpstreamError(source, response.status);
      }
      let body: unknown;
      try {
        body = await response.json();
      } catch {
        throw new MalformedGraphError();
      }
      const parsed = parseDependencyGraph(body);
      if (parsed === null) throw new MalformedGraphError();
      return parsed;
    });
    return { ok: true, graph, source, fetchedAt };
  } catch (error) {
    let reason: string;
    if (error instanceof UpstreamError) reason = `HTTP ${error.status}`;
    else if (error instanceof MalformedGraphError) reason = MALFORMED_REASON;
    else reason = `no status received: ${error instanceof Error ? error.message : String(error)}`;
    return { ok: false, reason: cleanReason(reason), source, fetchedAt };
  }
}
