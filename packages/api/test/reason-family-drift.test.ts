// Spec clean-site, design C3: the api half of the reason-family drift check. The web Site may not import engine code,
// so it keeps one sample reason per engine branch in packages/web/test/fixtures/engine-reasons.json. This test makes
// every branch's reason with the engine's evaluateState and fails when the two lists differ. No network.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { evaluateState, type StateInputs } from "@sexton/engine";
import { describe, expect, it } from "vitest";

const FIXTURE = fileURLToPath(new URL("../../web/test/fixtures/engine-reasons.json", import.meta.url));
const STATE_RULE = fileURLToPath(new URL("../../engine/src/state.ts", import.meta.url));
const NOW = new Date("2026-11-12T00:00:00.000Z");
const OLD = new Date("2020-01-01T00:00:00.000Z");
const RECENT = new Date("2026-10-01T00:00:00.000Z");
const T = "2026-10-01T00:00:00.000Z";

interface Sample {
  readonly family: string;
  readonly reason: string;
}

/** One input per branch of evaluateState, in rule order, keyed by the web family name. */
const BRANCHES: ReadonlyArray<readonly [string, StateInputs]> = [
  ["maintainer", { maintainerChange: { status: "history-sufficient", events: [{ kind: "live", before: ["a"], after: ["a", "b"], eventTime: T, recent: true }] } }],
  ["provenance", { provenanceRegression: { status: "regression", installedVersion: "1.14.1", earlierVersion: "1.14.0", snapshotCaptureTime: T } }],
  ["install-script", { newInstallScript: [{ version: "6.0.0", publishTime: T }] }],
  [
    "new-dependency",
    {
      newDependency: {
        status: "compared",
        installedVersion: "1.14.1",
        earlierVersion: "1.14.0",
        installedPublishTime: T,
        addedCount: 1,
        capped: false,
        added: [{ name: "plain-crypto-js", range: "^4.2.1", resolvedVersion: "4.2.1", resolvedPublishTime: T, installScript: true, fresh: true }],
      },
    },
  ],
  [
    "publisher",
    {
      publisherChange: {
        status: "changed",
        installed: { version: "1.14.1", publisher: "jasonsaayman", method: "token", publishTime: T },
        earlier: { version: "1.14.0", publisher: "github-actions", method: "trusted-publisher", publishTime: T },
      },
    },
  ],
  ["deprecated", { deprecated: true, lastPublish: RECENT, advisories: [] }],
  ["stale-advisory", { deprecated: false, lastPublish: OLD, advisories: [{ id: "A", severity: "Low", summary: "s" }] }],
  ["high", { deprecated: false, lastPublish: RECENT, advisories: [{ id: "A", severity: "High", summary: "s" }] }],
  ["stale", { deprecated: false, lastPublish: OLD, advisories: [] }],
  ["low", { deprecated: false, lastPublish: RECENT, advisories: [{ id: "A", severity: "Moderate", summary: "s" }] }],
  ["unavailable", {}],
  ["none", { deprecated: false, lastPublish: RECENT, advisories: [] }],
];

function readSamples(): Sample[] {
  const parsed = JSON.parse(readFileSync(FIXTURE, "utf8")) as unknown;
  if (!Array.isArray(parsed)) throw new Error("engine-reasons.json is not an array");
  return parsed.map((entry: unknown) => {
    const e = entry as Partial<Sample>;
    if (typeof e.family !== "string" || typeof e.reason !== "string") throw new Error("bad sample");
    return { family: e.family, reason: e.reason };
  });
}

describe("reason-family drift: the web fixture holds the engine's reason for every branch", () => {
  it("lists the same branches, in rule order, with the reason evaluateState writes", () => {
    const produced = BRANCHES.map(([family, inputs]) => ({ family, reason: evaluateState(inputs, NOW).stateReason }));
    expect(readSamples()).toEqual(produced);
  });

  it("covers every branch of the state rule: one stateReason per return in evaluateState", () => {
    const source = readFileSync(STATE_RULE, "utf8");
    const body = source.slice(source.indexOf("export function evaluateState"), source.indexOf("export function stateFromSignals"));
    expect([...body.matchAll(/stateReason:/g)]).toHaveLength(BRANCHES.length);
  });

  it("gives a distinct reason for every branch", () => {
    const reasons = BRANCHES.map(([, inputs]) => evaluateState(inputs, NOW).stateReason);
    expect(new Set(reasons).size).toBe(BRANCHES.length);
  });
});
