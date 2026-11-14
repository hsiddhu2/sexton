// Fixture scan of ten known packages against recorded upstream responses. Definition of done for spec 01.
// Record fixtures with: node scripts/record-fixtures.mjs. Expected states are reviewed by hand in expected-states.json.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { scorePackages } from "../src/score.js";
import type { PackageRef, State } from "../src/types.js";
import { FIXTURES_DIR, fixtureDirFor, fixtureRoutes, NOW, routedTransport } from "./helpers.js";

const manifest = JSON.parse(readFileSync(join(FIXTURES_DIR, "packages.json"), "utf8")) as PackageRef[];
const expectedPath = join(FIXTURES_DIR, "expected-states.json");
const recorded = manifest.every((p) => existsSync(join(fixtureDirFor(p.name), "packument.json"))) && existsSync(expectedPath);

describe.skipIf(!recorded)("fixture scan", () => {
  it("produces the expected state for each of the ten packages", async () => {
    const expected = JSON.parse(readFileSync(expectedPath, "utf8")) as Record<string, { state: State; stateReason: string; missingSignals: string[] }>;
    const { transport, calls } = routedTransport(manifest.flatMap((p) => fixtureRoutes(p.name, p.installedVersion)));
    const report = await scorePackages(manifest, { transport, clock: () => NOW, retry: { sleep: () => Promise.resolve() } });

    const actual = Object.fromEntries(report.packages.map((p) => [p.name, { state: p.state, stateReason: p.stateReason, missingSignals: [...p.missingSignals] }]));
    expect(actual).toEqual(expected);
    expect(report.packages.map((p) => p.state)).not.toContain("Possessed");
    expect(calls.every((c) => c.url.startsWith("https://registry.npmjs.org/") || c.url.startsWith("https://api.osv.dev/v1/"))).toBe(true);
  });
});

describe("fixture manifest", () => {
  it("names the ten packages from the spec", () => {
    expect(manifest.map((p) => p.name)).toEqual(["react", "lodash", "express", "request", "node-sass", "left-pad", "event-stream", "colors", "moment", "uuid"]);
  });
});
