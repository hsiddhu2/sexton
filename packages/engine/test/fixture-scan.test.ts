// Fixture scan of eleven known packages (ten from spec 01, semver from spec evidence-pack) against recorded upstream responses. Definition of done for spec 01.
// Record fixtures with: node scripts/record-fixtures.mjs. Expected states are reviewed by hand in expected-states.json.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { attestationsUrl, SLSA_PROVENANCE_PREDICATE } from "../src/clients/attestations.js";
import { dependenciesUrl } from "../src/clients/deps-dev.js";
import { ABBREVIATED_ACCEPT } from "../src/clients/npm.js";
import { scorePackages } from "../src/score.js";
import { InMemorySnapshotStore, type Snapshot } from "../src/snapshot.js";
import type { PackageRef, State } from "../src/types.js";
import { FIXTURES_DIR, fixtureDirFor, fixtureRoutes, NOW, routedTransport, type Route } from "./helpers.js";

const manifest = JSON.parse(readFileSync(join(FIXTURES_DIR, "packages.json"), "utf8")) as PackageRef[];
const expectedPath = join(FIXTURES_DIR, "expected-states.json");
const recorded = manifest.every((p) => existsSync(join(fixtureDirFor(p.name), "packument.json"))) && existsSync(expectedPath);

describe.skipIf(!recorded)("fixture scan", () => {
  it("produces the expected state for each of the eleven packages", async () => {
    const expected = JSON.parse(readFileSync(expectedPath, "utf8")) as Record<string, { state: State; stateReason: string; missingSignals: string[] }>;
    const { transport, calls } = routedTransport(manifest.flatMap((p) => fixtureRoutes(p.name, p.installedVersion)));
    const report = await scorePackages(manifest, { transport, clock: () => NOW, retry: { sleep: () => Promise.resolve() } });

    const actual = Object.fromEntries(report.packages.map((p) => [p.name, { state: p.state, stateReason: p.stateReason, missingSignals: p.missingSignals }]));
    expect(actual).toEqual(expected);
    for (const p of report.packages) {
      expect(p.signals.maintainers.available).toBe(true);
      expect(p.signals.maintainers.value?.length).toBeGreaterThan(0);
    }
    expect(report.packages.map((p) => p.state)).not.toContain("Possessed");
    expect(calls.every((c) => c.url.startsWith("https://registry.npmjs.org/") || c.url.startsWith("https://api.osv.dev/v1/") || c.url.startsWith("https://api.deps.dev/"))).toBe(true);
  });
});

describe("seeded maintainer change", () => {
  it("scores the seed fixture as Possessed from the maintainer change alone", async () => {
    const seed = JSON.parse(readFileSync(join(FIXTURES_DIR, "seed-maintainer-change.json"), "utf8")) as { name: string; snapshots: Snapshot[] };
    const store = new InMemorySnapshotStore();
    for (const snapshot of seed.snapshots) await store.append(snapshot);
    const first = seed.snapshots[0];
    const last = seed.snapshots[seed.snapshots.length - 1];
    if (first === undefined || last === undefined) throw new Error("seed has no snapshots");

    const name = seed.name;
    const version = "1.2.1";
    const url = `https://registry.npmjs.org/${name}`;
    const routes: Route[] = [
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
        body: JSON.stringify({ queries: [{ package: { name, ecosystem: "npm" }, version }] }),
        json: { results: [{}] },
      },
      { url: dependenciesUrl(name, version), json: { nodes: [{ versionKey: { system: "NPM", name, version } }], edges: [] } },
      { url: attestationsUrl(name, version), json: { attestations: [{ predicateType: SLSA_PROVENANCE_PREDICATE }] } },
    ];
    const { transport } = routedTransport(routes);
    const report = await scorePackages([{ name, installedVersion: version }], {
      transport,
      clock: () => NOW,
      retry: { sleep: () => Promise.resolve() },
      snapshotStore: store,
    });

    const health = report.packages[0];
    if (health === undefined) throw new Error("no entry");
    const change = health.signals.maintainerChange;
    expect(change.available).toBe(true);
    expect(change.value?.status).toBe("history-sufficient");
    expect(change.value?.events).toHaveLength(1);
    const event = change.value?.events[0];
    expect(event?.kind).toBe("snapshot-pair");
    expect(event?.recent).toBe(true);
    expect(event?.before).toEqual(first.maintainers);
    expect(event?.after).toEqual(last.maintainers);
    expect(health.state).toBe("Possessed");
    expect(health.stateReason).toBe("maintainer change in the last 90 days");
  });
});

describe("fixture manifest", () => {
  it("names the ten packages from the spec and semver, the provenance package of spec evidence-pack", () => {
    expect(manifest.map((p) => p.name)).toEqual(["react", "lodash", "express", "request", "node-sass", "left-pad", "event-stream", "colors", "moment", "uuid", "semver"]);
  });
});
