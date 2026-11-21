// Recorded migration fixtures and the sample repository. No network. Spec: .kiro/specs/migration-node-sass, task 8.2.

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import semver from "semver";
import { parsePackageJson } from "../../src/intake/manifest.js";
import { readPackageScripts } from "../../src/intake/scripts.js";
import type { Transport, TransportResponse } from "../../src/http.js";
import type { IntakePackage, PackageJsonView } from "../../src/types.js";
import { FIXTURES_DIR } from "../helpers.js";

export const MIGRATION_DIR = join(FIXTURES_DIR, "migration");
export const SAMPLE_DIR = join(MIGRATION_DIR, "node-sass-app");

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8")) as unknown;
}

const ok = (json: unknown): TransportResponse => ({ status: 200, json: () => Promise.resolve(structuredClone(json)) });
const notFound: TransportResponse = { status: 404, json: () => Promise.resolve({}) };

/** Answers packument GETs, querybatch POSTs from the per-version table, and vuln GETs for sass and sass-loader. */
export function migrationTransport(): { transport: Transport; urls: string[] } {
  const urls: string[] = [];
  const dir = (name: string): string => join(MIGRATION_DIR, "packages", name);
  const transport: Transport = (url, request) => {
    urls.push(url);
    const registry = "https://registry.npmjs.org/";
    if (url.startsWith(registry)) {
      const d = dir(decodeURIComponent(url.slice(registry.length)));
      return Promise.resolve(existsSync(join(d, "packument.json")) ? ok(readJson(join(d, "packument.json"))) : notFound);
    }
    if (url === "https://api.osv.dev/v1/querybatch") {
      const body = JSON.parse(request.body ?? "{}") as { queries: { package: { name: string }; version: string }[] };
      const results = body.queries.map((q) => {
        const table = readJson(join(dir(q.package.name), "osv-by-version.json")) as { ids: Record<string, string[]> };
        const ids = table.ids[q.version] ?? [];
        return ids.length === 0 ? {} : { vulns: ids.map((id) => ({ id })) };
      });
      return Promise.resolve(ok({ results }));
    }
    return Promise.resolve(notFound);
  };
  return { transport, urls };
}

function walk(root: string, at: string, out: Map<string, string>): void {
  for (const entry of readdirSync(at)) {
    const full = join(at, entry);
    if (statSync(full).isDirectory()) walk(root, full, out);
    else out.set(relative(root, full).split(sep).join("/"), readFileSync(full, "utf8"));
  }
}

/** Every file of the sample repository by repository path, including the one under node_modules. */
export function sampleFiles(): Map<string, string> {
  const out = new Map<string, string>();
  walk(SAMPLE_DIR, SAMPLE_DIR, out);
  return out;
}

/** The Package.json view of the sample repository; installed versions are the lowest of each declared range. */
export function sampleView(): PackageJsonView {
  const text = readFileSync(join(SAMPLE_DIR, "package.json"), "utf8");
  const parsed = parsePackageJson(text);
  if (!parsed.ok) throw new Error("sample package.json");
  const packages: IntakePackage[] = parsed.dependencies.map((d) => ({
    name: d.name,
    installedVersion: semver.minVersion(d.declaredRange)?.version ?? "unresolved",
    declaredRange: d.declaredRange,
    origin: d.origin,
    resolution: "locked",
  }));
  return { packages, scripts: readPackageScripts(text) };
}
