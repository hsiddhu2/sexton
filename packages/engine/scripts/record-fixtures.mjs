#!/usr/bin/env node
// Records trimmed upstream responses for the fixture scan. Run from packages/engine with network access.
// Usage: node scripts/record-fixtures.mjs [--intake]
// --intake records only the repo-intake fixtures (raw manifests and full packuments) and skips the package loop.
// Trimming keeps only the fields the engine reads so the fixtures stay small and reviewable.

import { mkdir, writeFile, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { TextEncoder } from "node:util";

const here = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(here, "..", "test", "fixtures");
const manifestPath = join(fixturesDir, "packages.json");

const pkg = JSON.parse(await readFile(join(here, "..", "package.json"), "utf8"));
const userAgent = `sexton/${pkg.version} (+https://github.com/hsiddhu2/sexton)`;

const ABBREVIATED_ACCEPT = "application/vnd.npm.install-v1+json";

const MAX_RETRIES = 3;
const BACKOFF_BASE_MS = 500;

// Exponential backoff from 500 ms with full jitter on 429 and 503, at most 3 retries.
async function fetchWithBackoff(url, init = {}) {
  const headers = { "User-Agent": userAgent, Accept: "application/json", ...(init.headers ?? {}) };
  for (let attempt = 0; ; attempt++) {
    const response = await fetch(url, { ...init, headers });
    if ((response.status !== 429 && response.status !== 503) || attempt >= MAX_RETRIES) return response;
    const delay = Math.random() * BACKOFF_BASE_MS * 2 ** attempt;
    await sleep(delay);
  }
}

async function getJson(url, init = {}) {
  const response = await fetchWithBackoff(url, init);
  if (!response.ok) throw new Error(`HTTP ${response.status} from ${url}`);
  return response.json();
}

// Same URL as attestationsUrl in src/clients/attestations.ts.
function attestationsUrl(name, version) {
  return `https://registry.npmjs.org/-/npm/v1/attestations/${encodeName(name)}@${encodeURIComponent(version)}`;
}

// Same URL as dependenciesUrl in src/clients/deps-dev.ts.
function dependenciesUrl(name, version) {
  return `https://api.deps.dev/v3/systems/npm/packages/${encodeURIComponent(name)}/versions/${encodeURIComponent(version)}:dependencies`;
}

// Records { status } and, on 200, { body } after trimming. Any other status is recorded as is so it can be replayed.
async function getRecorded(url, trim) {
  const response = await fetchWithBackoff(url);
  if (response.status !== 200) return { status: response.status };
  return { status: 200, body: trim(await response.json()) };
}

function trimAttestations(doc) {
  const entries = Array.isArray(doc?.attestations) ? doc.attestations : [];
  return { attestations: entries.map((e) => ({ predicateType: e?.predicateType })) };
}

function trimGraph(doc) {
  const nodes = Array.isArray(doc?.nodes) ? doc.nodes : [];
  const edges = Array.isArray(doc?.edges) ? doc.edges : [];
  return {
    nodes: nodes.map((n) => ({ versionKey: { name: n?.versionKey?.name, version: n?.versionKey?.version } })),
    edges: edges.map((e) => ({ fromNode: e?.fromNode, toNode: e?.toNode })),
  };
}

function encodeName(name) {
  return name.startsWith("@") ? `@${encodeURIComponent(name.slice(1))}` : encodeURIComponent(name);
}

function trimPackument(doc, version) {
  const entry = doc.versions?.[version];
  return {
    name: doc.name,
    time: doc.time ?? {},
    maintainers: (Array.isArray(doc.maintainers) ? doc.maintainers : [])
      .filter((m) => typeof m?.name === "string")
      .map((m) => ({ name: m.name })),
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

const INTAKE_REPOS = [
  ["expressjs", "express"],
  ["chalk", "chalk"],
  ["lodash", "lodash"],
];
const INTAKE_FILES = ["package.json", "package-lock.json"];
const MAX_MANIFEST_BYTES = 5 * 1024 * 1024;
// Minimal copy of isValidPackageName in src/intake/names.ts (the 8.2 name rules).
function validPart(part, allowUpper) {
  if (part.length === 0 || part.startsWith(".") || part.startsWith("_")) return false;
  return new RegExp(allowUpper ? "^[a-zA-Z0-9._~-]+$" : "^[a-z0-9._~-]+$").test(part);
}
function isValidPackageName(name) {
  if (typeof name !== "string" || name.length === 0 || name.length > 214) return false;
  if (name.startsWith("@")) {
    const slash = name.indexOf("/");
    if (slash === -1 || name.indexOf("/", slash + 1) !== -1) return false;
    return validPart(name.slice(1, slash), false) && validPart(name.slice(slash + 1), true);
  }
  return validPart(name, true);
}
// Raw text from raw.githubusercontent.com. No token, no cookies, HEAD ref only.
async function recordRaw(owner, repo, file) {
  const url = `https://raw.githubusercontent.com/${owner}/${repo}/HEAD/${file}`;
  const response = await fetchWithBackoff(url, { headers: { Accept: "text/plain" } });
  if (response.status !== 200) return { status: response.status };
  const text = await response.text();
  if (new TextEncoder().encode(text).byteLength > MAX_MANIFEST_BYTES) return { status: 200, tooLarge: true };
  return { status: 200, body: text };
}
function parseObject(text) {
  try {
    const value = JSON.parse(text);
    return typeof value === "object" && value !== null && !Array.isArray(value) ? value : undefined;
  } catch {
    return undefined;
  }
}
function ownEntries(obj) {
  return obj !== undefined && typeof obj === "object" && obj !== null ? Object.keys(obj) : [];
}
// True when the lockfile is unusable or lacks an installed version for any direct dependency.
function needsPackuments(lock, names) {
  if (lock === undefined) return true;
  const packages = lock.packages;
  const legacy = lock.dependencies;
  return names.some((name) => {
    const v2 = packages?.[`node_modules/${name}`]?.version;
    const v1 = legacy?.[name]?.version;
    return typeof v2 !== "string" && typeof v1 !== "string";
  });
}
async function recordIntake() {
  const packumentNames = new Set();
  for (const [owner, repo] of INTAKE_REPOS) {
    const dir = join(fixturesDir, "intake", "repos", `${owner}__${repo}`);
    const recorded = {};
    for (const file of INTAKE_FILES) {
      const result = await recordRaw(owner, repo, file);
      recorded[file] = result;
      await write(join(dir, `${file}.json`), result);
      console.log(`recorded ${owner}/${repo} ${file}: status ${result.status}${result.tooLarge ? " tooLarge" : ""}`);
    }
    const pkgJson = recorded["package.json"].body === undefined ? undefined : parseObject(recorded["package.json"].body);
    if (pkgJson === undefined) continue;
    const names = [...new Set([...ownEntries(pkgJson.dependencies), ...ownEntries(pkgJson.devDependencies)])].filter(isValidPackageName);
    const lock = recorded["package-lock.json"].body === undefined ? undefined : parseObject(recorded["package-lock.json"].body);
    if (needsPackuments(lock, names)) for (const name of names) packumentNames.add(name);
  }
  for (const name of [...packumentNames].sort()) {
    const response = await fetchWithBackoff(`https://registry.npmjs.org/${encodeName(name)}`);
    let result = { status: response.status };
    if (response.status === 200) {
      const doc = await response.json();
      const versions = {};
      for (const v of Object.keys(doc.versions ?? {})) versions[v] = {};
      result = { status: 200, body: { name: doc.name, versions } };
    }
    await write(join(fixturesDir, "intake", "packuments", `${name.replace("/", "__")}.json`), result);
    console.log(`recorded packument ${name}: status ${result.status}`);
  }
}
if (process.argv.includes("--intake")) {
  await recordIntake();
  console.log(`recorded at ${new Date().toISOString()}`);
} else {
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
    const attestations = await getRecorded(attestationsUrl(name, installedVersion), trimAttestations);
    await write(join(dir, "attestations.json"), attestations);
    const graph = await getRecorded(dependenciesUrl(name, installedVersion), trimGraph);
    await write(join(dir, "deps-dev.json"), graph);
    console.log(
      `recorded ${name}@${installedVersion}: ${batch.results?.[0]?.vulns?.length ?? 0} advisories, attestations ${attestations.status}, deps.dev ${graph.status}`,
    );
  }
  console.log(`recorded at ${new Date().toISOString()}`);
}
