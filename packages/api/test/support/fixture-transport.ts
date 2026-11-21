// A routed transport over the engine's recorded fixtures, with text() for github-raw. No network.
// Same routing rules as packages/engine/test/helpers.ts. Unrouted requests are recorded and answer 404.

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ABBREVIATED_ACCEPT, type TextBody, type Transport, type TransportRequest, type TransportResponse } from "@sexton/engine";

export const ENGINE_FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "engine", "test", "fixtures");
export const FIXTURE_NOW = new Date("2026-11-12T00:00:00Z");

export interface Route {
  readonly url: string;
  readonly accept?: string;
  readonly body?: string;
  readonly status?: number;
  /** JSON body. */
  readonly json?: unknown;
  /** Text body, for github-raw. */
  readonly text?: string;
  readonly throws?: unknown;
}

export interface Recorded {
  readonly url: string;
  readonly request: TransportRequest;
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8")) as unknown;
}

export interface FixturePackage {
  readonly name: string;
  readonly installedVersion: string;
}

export function fixturePackages(): readonly FixturePackage[] {
  return readJson(join(ENGINE_FIXTURES, "packages.json")) as FixturePackage[];
}

/** The routes for one recorded package, as the engine's own fixture scan builds them. */
export function packageRoutes(name: string, version: string): Route[] {
  const dir = join(ENGINE_FIXTURES, "packages", name.replace("/", "__"));
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
  const attestations = join(dir, "attestations.json");
  if (existsSync(attestations)) {
    const rec = readJson(attestations) as { status: number; body?: unknown };
    routes.push({ url: `https://registry.npmjs.org/-/npm/v1/attestations/${encoded}@${encodeURIComponent(version)}`, status: rec.status, json: rec.body ?? { error: "Not found" } });
  }
  const depsDev = join(dir, "deps-dev.json");
  if (existsSync(depsDev)) {
    const rec = readJson(depsDev) as { status: number; body?: unknown };
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
  return routes;
}

/** package.json and a v3 lockfile for a repository whose direct dependencies are the given packages. */
export function repoRoutes(owner: string, repo: string, packages: readonly FixturePackage[], options: { readonly lockfile?: boolean } = {}): Route[] {
  const base = `https://raw.githubusercontent.com/${owner}/${repo}/HEAD`;
  const dependencies = Object.fromEntries(packages.map((p) => [p.name, p.installedVersion]));
  const lock = {
    name: repo,
    lockfileVersion: 3,
    packages: {
      "": { name: repo, dependencies },
      ...Object.fromEntries(packages.map((p) => [`node_modules/${p.name}`, { version: p.installedVersion }])),
    },
  };
  return [
    { url: `${base}/package.json`, text: JSON.stringify({ name: repo, version: "1.0.0", dependencies }) },
    options.lockfile === false ? { url: `${base}/package-lock.json`, status: 404, text: "" } : { url: `${base}/package-lock.json`, text: JSON.stringify(lock) },
  ];
}

function limitedText(text: string, limitBytes: number): TextBody {
  const bytes = new TextEncoder().encode(text);
  return bytes.byteLength > limitBytes ? { ok: false, reason: "too-large" } : { ok: true, text };
}

export function routedTransport(routes: readonly Route[]): { transport: Transport; calls: Recorded[]; unrouted: string[] } {
  const calls: Recorded[] = [];
  const unrouted: string[] = [];
  const transport: Transport = (url, request) => {
    calls.push({ url, request });
    const route = routes.find(
      (r) => r.url === url && (r.accept === undefined || r.accept === request.headers["Accept"]) && (r.body === undefined || r.body === request.body),
    );
    if (route === undefined) {
      unrouted.push(url);
      return Promise.resolve({ status: 404, json: () => Promise.resolve({ error: "Not found" }), text: () => Promise.resolve({ ok: true, text: "" }) });
    }
    if (route.throws !== undefined) return Promise.reject(route.throws);
    const text = route.text ?? JSON.stringify(route.json ?? null);
    const response: TransportResponse = {
      status: route.status ?? 200,
      json: () => Promise.resolve(JSON.parse(text) as unknown),
      text: (limit: number) => Promise.resolve(limitedText(text, limit)),
    };
    return Promise.resolve(response);
  };
  return { transport, calls, unrouted };
}

/**
 * Routes the hosted Plan stage adds over the fixtures (spec hosted-plans, Requirement 6): the fixture scan holds a Dead
 * node-sass, so the plan stage asks for the sass packument. A 404 makes the migration unavailable, offline.
 */
export const PLAN_ROUTES: readonly Route[] = [{ url: "https://registry.npmjs.org/sass", accept: "application/json", status: 404, json: { error: "Not found" } }];
