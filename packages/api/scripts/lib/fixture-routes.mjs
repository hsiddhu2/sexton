// Plain JavaScript copy of the routing logic in packages/engine/test/helpers.ts.
// Reads recorded fixture data files only. Imports no TypeScript. Requirement 2.19.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ABBREVIATED_ACCEPT } from "@sexton/engine";

export function fixtureDirFor(fixturesDir, name) {
  return join(fixturesDir, "packages", name.replace("/", "__"));
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

/** Builds the routes for one package from its recorded fixtures. */
export function fixtureRoutes(fixturesDir, name, version) {
  const dir = fixtureDirFor(fixturesDir, name);
  const encoded = name.startsWith("@") ? `@${encodeURIComponent(name.slice(1))}` : encodeURIComponent(name);
  const routes = [
    { url: `https://registry.npmjs.org/${encoded}`, accept: "application/json", json: readJson(join(dir, "packument.json")) },
    { url: `https://registry.npmjs.org/${encoded}`, accept: ABBREVIATED_ACCEPT, json: readJson(join(dir, "abbreviated.json")) },
    {
      url: "https://api.osv.dev/v1/querybatch",
      body: JSON.stringify({ queries: [{ package: { name, ecosystem: "npm" }, version }] }),
      json: readJson(join(dir, "osv-querybatch.json")),
    },
  ];
  const attestationsPath = join(dir, "attestations.json");
  if (existsSync(attestationsPath)) {
    const rec = readJson(attestationsPath);
    routes.push({
      url: `https://registry.npmjs.org/-/npm/v1/attestations/${encoded}@${encodeURIComponent(version)}`,
      status: rec.status,
      json: rec.body ?? { error: "Not found" },
    });
  }
  const depsDevPath = join(dir, "deps-dev.json");
  if (existsSync(depsDevPath)) {
    const rec = readJson(depsDevPath);
    routes.push({
      url: `https://api.deps.dev/v3/systems/npm/packages/${encodeURIComponent(name)}/versions/${encodeURIComponent(version)}:dependencies`,
      status: rec.status,
      json: rec.body ?? { error: "Not found" },
    });
  }
  const vulnsDir = join(dir, "vulns");
  if (existsSync(vulnsDir)) {
    const batch = readJson(join(dir, "osv-querybatch.json"));
    for (const v of batch.results[0]?.vulns ?? []) {
      routes.push({ url: `https://api.osv.dev/v1/vulns/${encodeURIComponent(v.id)}`, json: readJson(join(vulnsDir, `${v.id}.json`)) });
    }
  }
  return routes;
}

/**
 * Transport that answers from a route table. Any unrouted request is recorded in `unrouted` and throws,
 * so a missing fixture can never reach the network. The caller must check `unrouted` after use, because
 * the engine turns a thrown transport error into an unavailable signal.
 */
export function routedTransport(routes) {
  const unrouted = [];
  const transport = (url, request) => {
    const route = routes.find(
      (r) => r.url === url && (r.accept === undefined || r.accept === request.headers?.["Accept"]) && (r.body === undefined || r.body === request.body),
    );
    if (route === undefined) {
      unrouted.push(url);
      throw new Error(`unrouted URL: ${url}`);
    }
    return Promise.resolve({ status: route.status ?? 200, json: () => Promise.resolve(JSON.parse(JSON.stringify(route.json))) });
  };
  return { transport, unrouted };
}
