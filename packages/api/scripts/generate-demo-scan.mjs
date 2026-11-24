// Builds the demo scan offline from the recorded engine fixtures. Requirements 2.19, 2.20.

import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ABBREVIATED_ACCEPT,
  CachedFetcher,
  DEFAULT_POLICY,
  InMemoryFileSource,
  InMemorySnapshotStore,
  MemoryCacheStore,
  attachRemediations,
  available,
  buildEvidencePack,
  buildHealth,
  buildTimeline,
  bumpTargets,
  evaluatePolicy,
  evaluateState,
  gatherBumpData,
  gatherMigrationData,
  planRemediation,
  readPackageScripts,
  renderEvidenceMarkdown,
  runMigrations,
  scorePackages,
  serialiseEvidencePack,
  timelineFacts,
  unavailable,
} from "@sexton/engine";
import { fixtureRoutes, routedTransport } from "./lib/fixture-routes.mjs";
import { hasRemediationFixture, remediationTransport } from "./lib/remediation-routes.mjs";
import { NOT_IN_PUBLIC_REPORTS, REPLAYS, REPLAY_IDS } from "./lib/replay-facts.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_FIXTURES_DIR = join(HERE, "..", "..", "engine", "test", "fixtures");
export const OUTPUT_PATH = join(HERE, "..", "..", "web", "public", "demo", "scan.json");
// Spec evidence-pack, Requirement 8.1: the evidence pack of the same demo scan, beside scan.json.
export const EVIDENCE_JSON_PATH = join(HERE, "..", "..", "web", "public", "demo", "evidence.json");
export const EVIDENCE_MD_PATH = join(HERE, "..", "..", "web", "public", "demo", "evidence.md");
/** Spec cemetery-time, 17.1: the two replay fixtures, served from the page origin. */
export const REPLAY_DIR = join(HERE, "..", "..", "web", "public", "replay");
export function replayOutputPath(id) {
  return join(REPLAY_DIR, `${id}.json`);
}
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
  const sinkInputs = new Map();
  const scored = await scorePackages(all, {
    timelineSink: (input) => void sinkInputs.set(input.name, input),
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
      totalDirect: all.length,
      skipped: { peer: 0, optional: 0, invalidName: 0 },
      unresolved: [],
    },
  };
  const policy = evaluatePolicy(DEFAULT_POLICY, report, "default");
  const remediations = await demoRemediations(fixturesDir, report, policy, now);
  const timelines = demoTimelines(report, sinkInputs, now);
  return { report, policy, remediations, timelines };
}

/**
 * One Timeline per package from the documents scoring held. Offline: every advisory date is null, so the advisory
 * list is unavailable before the scan date (spec cemetery-time, 8.14). Own keys only, in report order.
 */
function demoTimelines(report, sinkInputs, now) {
  const timelines = {};
  for (const health of report.packages) {
    const input = sinkInputs.get(health.name);
    if (input === undefined) continue;
    const advisoryDates = new Map();
    if (health.signals.advisories.available) for (const a of health.signals.advisories.value) advisoryDates.set(a.id, null);
    const facts = timelineFacts({
      fullPackument: input.fullPackument,
      abbreviatedPackument: input.abbreviatedPackument,
      installed: input.installedVersion,
      provenance: input.provenance,
      advisories: health.signals.advisories,
      advisoryDates,
      scanDate: now,
    });
    Object.defineProperty(timelines, health.name, { value: buildTimeline(facts, health, now), enumerable: true, writable: true, configurable: true });
  }
  return timelines;
}

const NINETY_DAYS_MS = 90 * 24 * 3_600_000;

/**
 * The StateInputs of one Resolved version at one instant, from the facts of that version and its earlier versions
 * (spec cemetery-time, design.md "Replay Segments follow the Resolved version"). A field that the facts do not give,
 * or do not trigger, is left out. Last publish is given only when the version has a publish time.
 */
export function replayStateInputs(replay, version, at) {
  const index = replay.versions.findIndex((v) => v.version === version);
  const current = replay.versions[index];
  if (current === undefined) throw new Error(`replay ${replay.id} has no version ${version}`);
  const atMs = at.getTime();
  const inputs = {};
  if (current.publishedAt !== null) inputs.lastPublish = new Date(current.publishedAt);
  if (typeof current.deprecated === "boolean") inputs.deprecated = current.deprecated;
  if (current.provenance === false) {
    const earlier = replay.versions.slice(0, index).reverse().find((v) => v.provenance === true);
    if (earlier !== undefined) {
      inputs.provenanceRegression = {
        status: "regression",
        installedVersion: current.version,
        earlierVersion: earlier.version,
        snapshotCaptureTime: current.publishedAt ?? at.toISOString(),
      };
    }
  } else if (current.provenance === true) {
    // snapshotCaptureTime is required by the contract and no source gives one: it is derived (the publish time when
    // the facts have it, else the instant asked about), not a sourced fact. It does not change the state.
    inputs.provenanceRegression = { status: "no-regression", snapshotCaptureTime: current.publishedAt ?? at.toISOString() };
  }
  const previous = replay.versions[index - 1];
  if (current.installScript === true && previous?.installScript === false && current.publishedAt !== null) {
    const seenMs = Date.parse(current.publishedAt);
    if (seenMs <= atMs && atMs - seenMs <= NINETY_DAYS_MS) {
      inputs.newInstallScript = [{ version: current.version, publishTime: current.publishedAt }];
    }
  }
  return inputs;
}

/** The ten signals of the installed version at the Scan date. A fact no source gives is unavailable. */
function replaySignals(replay, installed, at) {
  const first = replay.sources[0].url;
  const none = () => unavailable(NOT_IN_PUBLIC_REPORTS, first, at);
  const src = replay.factSources;
  const inputs = replayStateInputs(replay, installed.version, at);
  const regression = inputs.provenanceRegression;
  return {
    lastPublish: installed.publishedAt === null ? none() : available(installed.publishedAt, src.publishedAt, at),
    deprecated: typeof installed.deprecated === "boolean" ? available(installed.deprecated, src.deprecated, at) : none(),
    hasInstallScript: installed.installScript === null ? none() : available(installed.installScript, src.installScript, at),
    advisories: none(),
    maintainers: none(),
    provenance:
      installed.provenance === null ? none() : available({ present: installed.provenance, predicateType: null }, src.provenance, at),
    transitiveReach: none(),
    maintainerChange: none(),
    provenanceRegression: regression === undefined ? none() : available(regression, src.provenance, at),
    newInstallScript:
      installed.installScript === null ? none() : available(inputs.newInstallScript ?? [], src.installScript, at),
  };
}

/** One Segment for each Stop: the state and reason of evaluateState on the Resolved version at the Stop. Ghost is false: advisories are unavailable. */
export function replaySegments(replay) {
  return replay.stops.map((stop) => {
    const at = new Date(stop.from);
    const { state, stateReason } = evaluateState(replayStateInputs(replay, stop.version, at), at);
    return { from: stop.from, state, reason: stateReason, ghost: false, version: stop.version };
  });
}

/**
 * One replay response (spec cemetery-time, 17). Segments follow the Resolved version and take their state and reason
 * from evaluateState. The report is the installed version at the Scan date. No scan metadata: the repository is not in the facts.
 */
export function buildReplay(id) {
  const replay = REPLAYS[id];
  if (replay === undefined) throw new Error(`unknown replay ${String(id)}`);
  const scanDate = new Date(replay.generatedAt);
  const segments = replaySegments(replay);
  const installedVersion = replay.stops[replay.stops.length - 1].version;
  const installed = replay.versions.find((v) => v.version === installedVersion);
  const health = buildHealth({ name: replay.package, installedVersion }, replaySignals(replay, installed, scanDate), scanDate);
  const report = { generatedAt: replay.generatedAt, packages: [health] };
  const policy = evaluatePolicy(DEFAULT_POLICY, report, "default");
  return {
    report,
    policy,
    remediations: [],
    actions: { remediate: false },
    timelines: { [replay.package]: { installed: installedVersion, coveredFrom: null, segments } },
    replay: { id: replay.id, title: replay.title, summary: replay.summary, sources: replay.sources.map((s) => ({ label: s.label, url: s.url })) },
  };
}



/** The demo intake list: each package declared as ^installed in dependencies, locked. The demo has no package.json. */
export function demoIntake(report) {
  return report.packages.map((p) => ({
    name: p.name,
    installedVersion: p.installedVersion,
    declaredRange: `^${p.installedVersion}`,
    origin: "dependencies",
    resolution: "locked",
  }));
}

/**
 * The evidence pack of the demo scan through the engine. Spec evidence-pack, Requirement 8.1: commit null with the note,
 * no manifest or policy digests (the demo has neither file), the demo remediations as plans, no remediation log.
 */
export async function buildDemoEvidence(scan) {
  const result = await buildEvidencePack({
    report: scan.report,
    dependencies: demoIntake(scan.report),
    policyResult: scan.policy,
    policyDigest: null,
    commit: null,
    manifestDigests: { packageJson: null, packageLock: null },
    remediations: scan.remediations,
    remediationLog: null,
  });
  if (!result.ok) throw new Error(`demo evidence pack failed: ${result.reason}`);
  return { pack: result.pack, json: serialiseEvidencePack(result.pack), markdown: renderEvidenceMarkdown(result.pack) };
}

/**
 * Plans the demo report offline from the recorded remediation fixtures. Spec remediation, Requirement 7.13.
 * The demo has no package.json, so each package is declared as ^installed in dependencies, and no import sites
 * are known, so no plan is a remove. Packages without recorded remediation data get no bump data.
 * node-sass is migrated by the default recipe (spec migration-node-sass, Requirement 7.3): its view is the demo intake
 * plus the scripts of the sample repository, and its File source is the sample repository.
 */
/** Every file of the sample repository by repository path. Spec migration-node-sass, Requirement 7.3. */
function sampleRepository(fixturesDir) {
  const root = join(fixturesDir, "migration", "node-sass-app");
  const files = new Map();
  const walk = (at) => {
    for (const entry of readdirSync(at).sort()) {
      const full = join(at, entry);
      if (statSync(full).isDirectory()) walk(full);
      else files.set(relative(root, full).split(sep).join("/"), readFileSync(full, "utf8"));
    }
  };
  walk(root);
  return files;
}

async function demoRemediations(fixturesDir, report, policy, now) {
  const intake = demoIntake(report);
  const options = { intake };
  const targets = bumpTargets(report, options).filter((t) => hasRemediationFixture(fixturesDir, t.name));
  const { transport, unrouted } = remediationTransport(fixturesDir);
  const clock = () => now;
  const ctx = { transport, clock, cache: new CachedFetcher({ store: new MemoryCacheStore(), clock }), retry: { sleep: () => Promise.resolve() } };
  const bumpData = await gatherBumpData(ctx, targets);
  const files = sampleRepository(fixturesDir);
  const packageJson = { packages: intake, scripts: readPackageScripts(files.get("package.json") ?? "") };
  const data = await gatherMigrationData(ctx, packageJson);
  const migrations = await runMigrations(report, options, { packageJson, files: new InMemoryFileSource(files), data });
  if (unrouted.length > 0) throw new Error(`unrouted URLs: ${[...new Set(unrouted)].join(", ")}`);
  return attachRemediations(report, policy, planRemediation(report, { ...options, bumpData, migrations }));
}

export function serialiseDemoScan(scan) {
  return JSON.stringify(scan, null, 2) + "\n";
}

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1]) {
  const scan = await buildDemoScan({});
  mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
  writeFileSync(OUTPUT_PATH, serialiseDemoScan(scan));
  console.log(`wrote ${OUTPUT_PATH}`);
  const evidence = await buildDemoEvidence(scan);
  writeFileSync(EVIDENCE_JSON_PATH, evidence.json);
  writeFileSync(EVIDENCE_MD_PATH, evidence.markdown);
  console.log(`wrote ${EVIDENCE_JSON_PATH} and ${EVIDENCE_MD_PATH}, digest ${evidence.pack.integrity.digest}`);
  mkdirSync(REPLAY_DIR, { recursive: true });
  for (const id of REPLAY_IDS) {
    writeFileSync(replayOutputPath(id), serialiseDemoScan(buildReplay(id)));
    console.log(`wrote ${replayOutputPath(id)}`);
  }
}
