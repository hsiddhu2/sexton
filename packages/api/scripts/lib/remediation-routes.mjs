// Transport over the recorded remediation fixtures, for the demo scan. Plain JavaScript, no network.
// Answers the full packument GET, any querybatch POST from the recorded per-version ID table, and vuln GETs.
// Spec: .kiro/specs/remediation, Requirement 7.13, design "Decisions made during implementation" item 4.

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function packageDir(fixturesDir, name) {
  return join(fixturesDir, "remediation", "packages", name.replace("/", "__"));
}

/** True when recorded remediation data exists for the package. */
export function hasRemediationFixture(fixturesDir, name) {
  return existsSync(join(packageDir(fixturesDir, name), "osv-by-version.json"));
}

const respond = (status, json) => ({ status, json: () => Promise.resolve(JSON.parse(JSON.stringify(json))) });

/** Transport plus the list of unrouted URLs, which the caller must check is empty. */
export function remediationTransport(fixturesDir) {
  const unrouted = [];
  const registry = "https://registry.npmjs.org/";
  const vulns = "https://api.osv.dev/v1/vulns/";
  const transport = (url, request) => {
    if (url.startsWith(registry)) {
      const name = decodeURIComponent(url.slice(registry.length));
      if (hasRemediationFixture(fixturesDir, name)) return Promise.resolve(respond(200, readJson(join(packageDir(fixturesDir, name), "packument.json"))));
    } else if (url === "https://api.osv.dev/v1/querybatch") {
      const body = JSON.parse(request.body ?? "{}");
      const queries = Array.isArray(body.queries) ? body.queries : [];
      if (queries.every((q) => hasRemediationFixture(fixturesDir, q?.package?.name ?? ""))) {
        const results = queries.map((q) => {
          const table = readJson(join(packageDir(fixturesDir, q.package.name), "osv-by-version.json")).ids;
          const ids = Object.hasOwn(table, q.version) ? table[q.version] : [];
          return ids.length === 0 ? {} : { vulns: ids.map((id) => ({ id })) };
        });
        return Promise.resolve(respond(200, { results }));
      }
    } else if (url.startsWith(vulns)) {
      const id = decodeURIComponent(url.slice(vulns.length));
      if (/^[A-Za-z0-9._:-]{1,128}$/.test(id) && !id.includes("..")) {
        for (const dir of readdirSync(join(fixturesDir, "remediation", "packages"))) {
          const path = join(fixturesDir, "remediation", "packages", dir, "vulns", `${id}.json`);
          if (existsSync(path)) return Promise.resolve(respond(200, readJson(path)));
        }
      }
    }
    unrouted.push(url);
    return Promise.reject(new Error(`unrouted URL: ${url}`));
  };
  return { transport, unrouted };
}
