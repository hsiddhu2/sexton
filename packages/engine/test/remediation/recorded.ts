// Transport over the recorded remediation fixtures. No network. Spec: .kiro/specs/remediation, task 10.2.

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { Transport, TransportResponse } from "../../src/http.js";
import { FIXTURES_DIR } from "../helpers.js";

export const REMEDIATION_DIR = join(FIXTURES_DIR, "remediation");

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8")) as unknown;
}

const ok = (json: unknown): TransportResponse => ({ status: 200, json: () => Promise.resolve(structuredClone(json)) });
const notFound: TransportResponse = { status: 404, json: () => Promise.resolve({}) };

export interface RecordedPackage {
  readonly name: string;
  readonly installedVersion: string;
}

export function recordedPackages(): RecordedPackage[] {
  return readdirSync(join(REMEDIATION_DIR, "packages")).map((dir) => {
    const ids = readJson(join(REMEDIATION_DIR, "packages", dir, "osv-by-version.json")) as { name: string; installedVersion: string };
    return { name: ids.name, installedVersion: ids.installedVersion };
  });
}

/** Answers packument GETs, any querybatch POST from the per-version ID table, and vuln GETs. Records URLs. */
export function recordedTransport(): { transport: Transport; urls: string[] } {
  const urls: string[] = [];
  const transport: Transport = (url, request) => {
    urls.push(url);
    const registry = "https://registry.npmjs.org/";
    if (url.startsWith(registry)) {
      const dir = join(REMEDIATION_DIR, "packages", decodeURIComponent(url.slice(registry.length)).replace("/", "__"));
      return Promise.resolve(existsSync(dir) ? ok(readJson(join(dir, "packument.json"))) : notFound);
    }
    if (url === "https://api.osv.dev/v1/querybatch") {
      const body = JSON.parse(request.body ?? "{}") as { queries: { package: { name: string }; version: string }[] };
      const results = body.queries.map((q) => {
        const table = readJson(join(REMEDIATION_DIR, "packages", q.package.name.replace("/", "__"), "osv-by-version.json")) as { ids: Record<string, string[]> };
        const ids = table.ids[q.version] ?? [];
        return ids.length === 0 ? {} : { vulns: ids.map((id) => ({ id })) };
      });
      return Promise.resolve(ok({ results }));
    }
    const vulns = "https://api.osv.dev/v1/vulns/";
    if (url.startsWith(vulns)) {
      const id = decodeURIComponent(url.slice(vulns.length));
      for (const dir of readdirSync(join(REMEDIATION_DIR, "packages"))) {
        const path = join(REMEDIATION_DIR, "packages", dir, "vulns", `${id}.json`);
        if (existsSync(path)) return Promise.resolve(ok(readJson(path)));
      }
    }
    return Promise.resolve(notFound);
  };
  return { transport, urls };
}
