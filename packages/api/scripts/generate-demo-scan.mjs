// Builds the demo scan offline from the recorded engine fixtures. Requirements 2.19, 2.20.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ABBREVIATED_ACCEPT, DEFAULT_POLICY, InMemorySnapshotStore, evaluatePolicy, scorePackages } from "@sexton/engine";
import { fixtureRoutes, routedTransport } from "./lib/fixture-routes.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_FIXTURES_DIR = join(HERE, "..", "..", "engine", "test", "fixtures");
export const OUTPUT_PATH = join(HERE, "..", "..", "web", "public", "demo", "scan.json");
export const DEMO_NOW = new Date("2026-11-12T00:00:00Z");
const SEED_VERSION = "1.2.1";
const SLSA_PROVENANCE_PREDICATE = "https://slsa.dev/provenance/v1";

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function seedRoutes(name, last) {
  const url = `https://registry.npmjs.org/${name}`;
  return [
    {
      url,
      accept: "application/json",
      json: {
        time: { "1.2.0": "2026-09-01T10:00:00.000Z", "1.2.1": "2026-09-20T10:00:00.000Z" },
        versions: { "1.2.0": {}, "1.2.1": {} },
        maintainers: last.maintainers.map((n) => ({ name: n })),
      },
    },
    { url, accept: ABBREVIATED_ACCEPT, json: { versions: { "1.2.0": {}, "1.2.1": {} } } },
    {
      url: "https://api.osv.dev/v1/querybatch",
      body: JSON.stringify({ queries: [{ package: { name, ecosystem: "npm" }, version: SEED_VERSION }] }),
      json: { results: [{}] },
    },
    {
      url: `https://api.deps.dev/v3/systems/npm/packages/${encodeURIComponent(name)}/versions/${encodeURIComponent(SEED_VERSION)}:dependencies`,
      json: { nodes: [{ versionKey: { system: "NPM", name, version: SEED_VERSION } }], edges: [] },
    },
    {
      url: `https://registry.npmjs.org/-/npm/v1/attestations/${encodeURIComponent(name)}@${encodeURIComponent(SEED_VERSION)}`,
      json: { attestations: [{ predicateType: SLSA_PROVENANCE_PREDICATE }] },
    },
  ];
}

/** Scores the fixtures offline and returns a ScanResponse. Throws if any request was not routed. */
export async function buildDemoScan({ fixturesDir = DEFAULT_FIXTURES_DIR, now = DEMO_NOW } = {}) {
  const refs = readJson(join(fixturesDir, "packages.json"));
  const seed = readJson(join(fixturesDir, "seed-maintainer-change.json"));
  const store = new InMemorySnapshotStore();
  for (const snapshot of seed.snapshots) await store.append(snapshot);
  const last = seed.snapshots[seed.snapshots.length - 1];
  if (last === undefined) throw new Error("seed has no snapshots");

  const routes = [...refs.flatMap((p) => fixtureRoutes(fixturesDir, p.name, p.installedVersion)), ...seedRoutes(seed.name, last)];
  const { transport, unrouted } = routedTransport(routes);
  const all = [...refs, { name: seed.name, installedVersion: SEED_VERSION }];
  const scored = await scorePackages(all, {
    transport,
    clock: () => now,
    retry: { sleep: () => Promise.resolve() },
    snapshotStore: store,
  });
  if (unrouted.length > 0) throw new Error(`unrouted URLs: ${[...new Set(unrouted)].join(", ")}`);

  const report = {
    ...scored,
    scan: {
      repo: { owner: "sexton-demo", repo: "fixture", url: "https://github.com/sexton-demo/fixture" },
      unlocked: false,
      unlockedPackages: [],
      lockfileVersion: 3,
      capped: false,
      totalDirect: 11,
      skipped: { peer: 0, optional: 0, invalidName: 0 },
      unresolved: [],
    },
  };
  const policy = evaluatePolicy(DEFAULT_POLICY, report, "default");
  return { report, policy };
}

export function serialiseDemoScan(scan) {
  return JSON.stringify(scan, null, 2) + "\n";
}

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1]) {
  const scan = await buildDemoScan({});
  mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
  writeFileSync(OUTPUT_PATH, serialiseDemoScan(scan));
  console.log(`wrote ${OUTPUT_PATH}`);
}
