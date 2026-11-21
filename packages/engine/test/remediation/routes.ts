// Scripted upstream for remediation tests: packument GET, OSV querybatch POST with page tokens, OSV vuln GET.
// Records every call. No network. Spec: .kiro/specs/remediation, Testing Strategy.

import { CachedFetcher, MemoryCacheStore } from "../../src/cache.js";
import type { ClientContext } from "../../src/clients/context.js";
import type { Transport, TransportRequest, TransportResponse } from "../../src/http.js";

export const FAULTS = [
  "packument-404",
  "packument-500",
  "packument-503",
  "packument-not-json",
  "no-versions",
  "versions-array",
  "versions-string",
  "versions-null",
  "batch-500",
  "batch-wrong-length",
  "batch-wrong-types",
  "batch-bad-id",
  "batch-endless",
  "vuln-500",
] as const;
export type Fault = (typeof FAULTS)[number];
/** Faults that leave the data usable: hostile keys are ignored, a non-string deprecated is not a deprecation. */
export const BENIGN_FAULTS = ["hostile-keys", "nonstring-deprecated"] as const;
export type BenignFault = (typeof BENIGN_FAULTS)[number];

export interface PackageModel {
  readonly name: string;
  /** Version key to deprecation message (empty string means not deprecated). */
  readonly versions: Readonly<Record<string, string>>;
  /** Advisory IDs per version. */
  readonly ids: Readonly<Record<string, readonly string[]>>;
  /** Number of pages per version beyond the first (0 means no token). */
  readonly extraPages?: Readonly<Record<string, number>>;
  readonly fault?: Fault | BenignFault;
}

export interface VulnRecord {
  readonly id: string;
  readonly summary: string;
  readonly database_specific?: { readonly severity?: string };
  readonly severity?: readonly { readonly type: string; readonly score: string }[];
}

export interface Call {
  readonly url: string;
  readonly method: string;
  readonly body?: string;
}

const REGISTRY = "https://registry.npmjs.org/";
const BATCH = "https://api.osv.dev/v1/querybatch";
const VULNS = "https://api.osv.dev/v1/vulns/";

function respond(status: number, json: unknown): TransportResponse {
  return { status, json: () => Promise.resolve(structuredClone(json)) };
}

function encode(name: string): string {
  return name.startsWith("@") ? `@${encodeURIComponent(name.slice(1))}` : encodeURIComponent(name);
}

function packumentFor(m: PackageModel): unknown {
  const versions: Record<string, unknown> = {};
  for (const [v, dep] of Object.entries(m.versions)) versions[v] = dep === "" ? {} : { deprecated: dep };
  switch (m.fault) {
    case "no-versions":
      return { name: m.name };
    case "versions-array":
      return { name: m.name, versions: Object.keys(versions) };
    case "versions-string":
      return { name: m.name, versions: "1.0.0" };
    case "versions-null":
      return { name: m.name, versions: null };
    case "hostile-keys":
      return JSON.parse(
        JSON.stringify({ name: m.name, versions: { ...versions, constructor: { deprecated: "x" }, toString: {}, "1.0.0+build": {}, v9: {}, ["1".repeat(70)]: {} } }).replace(
          '"constructor"',
          '"__proto__":{"polluted":true},"constructor"',
        ),
      ) as unknown;
    case "nonstring-deprecated":
      return { name: m.name, versions: Object.fromEntries(Object.entries(versions).map(([k, v]) => [k, { ...(v as object), deprecated: 7 }])) };
    default:
      return { name: m.name, versions };
  }
}

/** Builds a transport over the package models and vuln records, and records every call. */
export function scriptedUpstream(models: readonly PackageModel[], vulns: ReadonlyMap<string, VulnRecord>): { transport: Transport; calls: Call[] } {
  const calls: Call[] = [];
  const byEncoded = new Map(models.map((m) => [encode(m.name), m]));
  const byName = new Map(models.map((m) => [m.name, m]));
  const vulnFault = new Set(models.filter((m) => m.fault === "vuln-500").flatMap((m) => Object.values(m.ids).flat()));
  const transport: Transport = (url: string, request: TransportRequest) => {
    calls.push({ url, method: request.method, ...(request.body !== undefined ? { body: request.body } : {}) });
    if (url.startsWith(REGISTRY)) {
      const m = byEncoded.get(url.slice(REGISTRY.length));
      if (m === undefined || m.fault === "packument-404") return Promise.resolve(respond(404, { error: "Not found" }));
      if (m.fault === "packument-500") return Promise.resolve(respond(500, {}));
      if (m.fault === "packument-503") return Promise.resolve(respond(503, {}));
      if (m.fault === "packument-not-json") return Promise.resolve({ status: 200, json: () => Promise.reject(new SyntaxError("Unexpected token")) });
      return Promise.resolve(respond(200, packumentFor(m)));
    }
    if (url === BATCH) {
      const body = JSON.parse(request.body ?? "{}") as { queries: { package: { name: string }; version: string; page_token?: string }[] };
      const first = body.queries[0];
      const m = first === undefined ? undefined : byName.get(first.package.name);
      if (m?.fault === "batch-500") return Promise.resolve(respond(500, {}));
      if (m?.fault === "batch-wrong-length") return Promise.resolve(respond(200, { results: [] }));
      if (m?.fault === "batch-wrong-types") return Promise.resolve(respond(200, { results: body.queries.map(() => ({ vulns: "nope" })) }));
      const results = body.queries.map((q) => {
        if (m?.fault === "batch-bad-id") return { vulns: [{ id: "<script>@@zx@@</script>" }] };
        if (m?.fault === "batch-endless") return { vulns: [], next_page_token: `e${String(calls.length)}` };
        const all = m?.ids[q.version] ?? [];
        const pages = 1 + (m?.extraPages?.[q.version] ?? 0);
        const page = q.page_token === undefined ? 0 : Number(q.page_token.slice(1));
        const per = Math.ceil(all.length / pages) || 0;
        const slice = all.slice(page * per, (page + 1) * per);
        return {
          ...(slice.length > 0 ? { vulns: slice.map((id) => ({ id, modified: "2026-01-01T00:00:00Z" })) } : {}),
          ...(page + 1 < pages ? { next_page_token: `p${String(page + 1)}` } : {}),
        };
      });
      return Promise.resolve(respond(200, { results }));
    }
    if (url.startsWith(VULNS)) {
      const id = decodeURIComponent(url.slice(VULNS.length));
      if (vulnFault.has(id)) return Promise.resolve(respond(500, {}));
      const record = vulns.get(id);
      return Promise.resolve(record === undefined ? respond(404, {}) : respond(200, record));
    }
    return Promise.resolve(respond(404, {}));
  };
  return { transport, calls };
}

export const NOW = new Date("2026-11-12T00:00:00Z");

export function contextFor(transport: Transport, store: MemoryCacheStore = new MemoryCacheStore()): ClientContext {
  const clock = (): Date => NOW;
  return { transport, clock, cache: new CachedFetcher({ store, clock }), retry: { sleep: () => Promise.resolve() } };
}
