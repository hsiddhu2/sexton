// Test helpers: a scripted transport and a fixed clock. No network anywhere in tests.

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CachedFetcher, MemoryCacheStore } from "../src/cache.js";
import type { ClientContext } from "../src/clients/context.js";
import { ABBREVIATED_ACCEPT } from "../src/clients/npm.js";
import type { Transport, TransportRequest, TransportResponse } from "../src/http.js";

export const FIXTURES_DIR = join(dirname(fileURLToPath(import.meta.url)), "fixtures");
export const NOW = new Date("2026-11-12T00:00:00Z");

export interface Route {
  readonly url: string;
  readonly accept?: string;
  readonly body?: string;
  readonly status?: number;
  readonly json: unknown;
}

export interface Call {
  readonly url: string;
  readonly request: TransportRequest;
}

/** Transport that answers from a route table and records every call. Unknown routes return 404. */
export function routedTransport(routes: readonly Route[]): { transport: Transport; calls: Call[] } {
  const calls: Call[] = [];
  const transport: Transport = (url, request) => {
    calls.push({ url, request });
    const route = routes.find(
      (r) => r.url === url && (r.accept === undefined || r.accept === request.headers["Accept"]) && (r.body === undefined || r.body === request.body),
    );
    const response: TransportResponse =
      route === undefined
        ? { status: 404, json: () => Promise.resolve({ error: "Not found" }) }
        : { status: route.status ?? 200, json: () => Promise.resolve(structuredClone(route.json)) };
    return Promise.resolve(response);
  };
  return { transport, calls };
}

export function makeContext(transport: Transport, now: Date = NOW): ClientContext {
  const clock = () => now;
  return { transport, clock, cache: new CachedFetcher({ store: new MemoryCacheStore(), clock }), retry: { sleep: () => Promise.resolve() } };
}

export function fixtureDirFor(name: string): string {
  return join(FIXTURES_DIR, "packages", name.replace("/", "__"));
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8")) as unknown;
}

/**
 * Routes for the recorded packuments of new dependency names (spec new-signals, task 7.2). A name that is itself a
 * fixture package is answered by that package's own routes, so it is left out here.
 */
export function newDependencyRoutes(): Route[] {
  const root = join(FIXTURES_DIR, "new-dependencies");
  if (!existsSync(root)) return [];
  return readdirSync(root)
    .sort()
    .filter((folder) => !existsSync(join(FIXTURES_DIR, "packages", folder)))
    .flatMap((folder) => {
      const name = folder.replace("__", "/");
      const encoded = name.startsWith("@") ? `@${encodeURIComponent(name.slice(1))}` : encodeURIComponent(name);
      const dir = join(root, folder);
      return [
        { url: `https://registry.npmjs.org/${encoded}`, accept: "application/json", json: readJson(join(dir, "packument.json")) },
        { url: `https://registry.npmjs.org/${encoded}`, accept: ABBREVIATED_ACCEPT, json: readJson(join(dir, "abbreviated.json")) },
      ];
    });
}

/** Builds routes for one package from its recorded fixtures, followed by the new-dependency routes. */
export function fixtureRoutes(name: string, version: string): Route[] {
  const dir = fixtureDirFor(name);
  const encoded = name.startsWith("@") ? `@${encodeURIComponent(name.slice(1))}` : encodeURIComponent(name);
  const routes: Route[] = [
    { url: `https://registry.npmjs.org/${encoded}`, accept: "application/json", json: readJson(join(dir, "packument.json")) },
    { url: `https://registry.npmjs.org/${encoded}`, accept: ABBREVIATED_ACCEPT, json: readJson(join(dir, "abbreviated.json")) },
    {
      url: "https://api.osv.dev/v1/querybatch",
      body: JSON.stringify({ queries: [{ package: { name, ecosystem: "npm" }, version }] }),
      json: readJson(join(dir, "osv-querybatch.json")),
    },
  ];
  // Recorded as { status, body? }. Added only when the recorder has produced them.
  const attestationsPath = join(dir, "attestations.json");
  if (existsSync(attestationsPath)) {
    const rec = readJson(attestationsPath) as { status: number; body?: unknown };
    routes.push({
      url: `https://registry.npmjs.org/-/npm/v1/attestations/${encoded}@${encodeURIComponent(version)}`,
      status: rec.status,
      json: rec.body ?? { error: "Not found" },
    });
  }
  const depsDevPath = join(dir, "deps-dev.json");
  if (existsSync(depsDevPath)) {
    const rec = readJson(depsDevPath) as { status: number; body?: unknown };
    routes.push({
      url: `https://api.deps.dev/v3/systems/npm/packages/${encodeURIComponent(name)}/versions/${encodeURIComponent(version)}:dependencies`,
      status: rec.status,
      json: rec.body ?? { error: "Not found" },
    });
  }
  const vulnsDir = join(dir, "vulns");
  if (existsSync(vulnsDir)) {
    const batch = readJson(join(dir, "osv-querybatch.json")) as { results: { vulns?: { id: string }[] }[] };
    for (const v of batch.results[0]?.vulns ?? []) {
      routes.push({ url: `https://api.osv.dev/v1/vulns/${encodeURIComponent(v.id)}`, json: readJson(join(vulnsDir, `${v.id}.json`)) });
    }
  }
  routes.push(...newDependencyRoutes());
  return routes;
}
