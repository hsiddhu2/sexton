#!/usr/bin/env node
// Records trimmed upstream responses for the fixture scan. Run from packages/engine with network access.
// Usage: node scripts/record-fixtures.mjs
// Trimming keeps only the fields the engine reads so the fixtures stay small and reviewable.

import { mkdir, writeFile, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(here, "..", "test", "fixtures");
const manifestPath = join(fixturesDir, "packages.json");

const pkg = JSON.parse(await readFile(join(here, "..", "package.json"), "utf8"));
const userAgent = `sexton/${pkg.version} (+https://github.com/hsiddhu2/sexton)`;

const ABBREVIATED_ACCEPT = "application/vnd.npm.install-v1+json";

async function getJson(url, init = {}) {
  const headers = { "User-Agent": userAgent, Accept: "application/json", ...(init.headers ?? {}) };
  const response = await fetch(url, { ...init, headers });
  if (!response.ok) throw new Error(`HTTP ${response.status} from ${url}`);
  return response.json();
}

function encodeName(name) {
  return name.startsWith("@") ? `@${encodeURIComponent(name.slice(1))}` : encodeURIComponent(name);
}

function trimPackument(doc, version) {
  const entry = doc.versions?.[version];
  return {
    name: doc.name,
    time: doc.time ?? {},
    versions: entry === undefined ? {} : { [version]: entry.deprecated === undefined ? {} : { deprecated: entry.deprecated } },
  };
}

function trimAbbreviated(doc, version) {
  const entry = doc.versions?.[version];
  return {
    name: doc.name,
    versions: entry === undefined ? {} : { [version]: entry.hasInstallScript === undefined ? {} : { hasInstallScript: entry.hasInstallScript } },
  };
}

function trimVuln(doc) {
  return {
    id: doc.id,
    summary: doc.summary ?? "",
    severity: doc.severity ?? [],
    database_specific: { severity: doc.database_specific?.severity },
  };
}

async function write(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(value, null, 2) + "\n");
}

const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
for (const { name, installedVersion } of manifest) {
  const dir = join(fixturesDir, "packages", name.replace("/", "__"));
  const url = `https://registry.npmjs.org/${encodeName(name)}`;
  const full = await getJson(url);
  await write(join(dir, "packument.json"), trimPackument(full, installedVersion));
  const abbreviated = await getJson(url, { headers: { Accept: ABBREVIATED_ACCEPT } });
  await write(join(dir, "abbreviated.json"), trimAbbreviated(abbreviated, installedVersion));

  const batch = await getJson("https://api.osv.dev/v1/querybatch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ queries: [{ package: { name, ecosystem: "npm" }, version: installedVersion }] }),
  });
  await write(join(dir, "osv-querybatch.json"), batch);
  for (const v of batch.results?.[0]?.vulns ?? []) {
    const detail = await getJson(`https://api.osv.dev/v1/vulns/${encodeURIComponent(v.id)}`);
    await write(join(dir, "vulns", `${v.id}.json`), trimVuln(detail));
  }
  console.log(`recorded ${name}@${installedVersion}: ${batch.results?.[0]?.vulns?.length ?? 0} advisories`);
}
console.log(`recorded at ${new Date().toISOString()}`);
