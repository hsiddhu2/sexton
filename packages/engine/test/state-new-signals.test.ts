// The two Possessed rules of spec new-signals. Requirements 3.1 to 3.8. Properties 1, 2 (state half) and 5.

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { available, unavailable } from "../src/signal.js";
import { evaluateState, stateFromSignals, type StateInputs } from "../src/state.js";
import type { NewDependencyEntry, NewDependencyValue, PublisherChangeValue, PublishRecord } from "../src/types.js";
import { dateArb, twelveSignalInputsArb } from "./arbitraries.js";

const NOW = new Date("2026-11-12T00:00:00Z");
const SRC = "https://registry.npmjs.org/x";
const HEALTHY: StateInputs = { lastPublish: new Date("2026-10-01T00:00:00Z"), deprecated: false, advisories: [] };

function record(version: string, publisher: string | null, method: PublishRecord["method"]): PublishRecord {
  return { version, publisher, method, publishTime: "2026-03-01T00:00:00.000Z" };
}

const TRUSTED_TO_TOKEN: PublisherChangeValue = {
  status: "changed",
  earlier: record("1.0.0", "GitHub Actions", "trusted-publisher"),
  installed: record("1.0.1", "someone", "token"),
};

function dep(name: string, installScript: boolean | null, fresh: boolean): NewDependencyEntry {
  return { name, range: "^1.0.0", resolvedVersion: "1.0.0", resolvedPublishTime: "2026-03-01T00:00:00.000Z", installScript, fresh };
}

function compared(added: NewDependencyEntry[]): NewDependencyValue {
  return {
    status: "compared",
    installedVersion: "1.0.1",
    earlierVersion: "1.0.0",
    installedPublishTime: "2026-03-02T00:00:00.000Z",
    addedCount: added.length,
    capped: false,
    added,
  };
}

/** Oracle of the two new rules, written from Requirement 3.1 and 3.2. */
function newRuleReason(i: StateInputs): string | null {
  const nd = i.newDependency;
  if (nd?.status === "compared") {
    const hit = nd.added.find((d) => d.installScript === true || d.fresh);
    if (hit !== undefined) return `new dependency in ${nd.installedVersion}: ${hit.name}`;
  }
  const pc = i.publisherChange;
  if (pc !== undefined && pc.status === "changed" && pc.earlier.method === "trusted-publisher" && pc.installed.method === "token") {
    return `publisher changed in ${pc.installed.version}: ${pc.earlier.publisher ?? "unknown"} to ${pc.installed.publisher ?? "unknown"}`;
  }
  return null;
}

function withoutNew(i: StateInputs): StateInputs {
  const rest: { -readonly [K in keyof StateInputs]: StateInputs[K] } = { ...i };
  delete rest.publisherChange;
  delete rest.newDependency;
  return rest;
}

describe("new-signals Possessed rules: examples", () => {
  it("a trusted publisher to token change with a new name gives Possessed (3.1)", () => {
    expect(evaluateState({ ...HEALTHY, publisherChange: TRUSTED_TO_TOKEN }, NOW)).toEqual({
      state: "Possessed",
      stateReason: "publisher changed in 1.0.1: GitHub Actions to someone",
    });
  });

  it("names a missing publisher \"unknown\", never an empty gap (owner decision, 25 Nov 2026)", () => {
    const value: PublisherChangeValue = { ...TRUSTED_TO_TOKEN, installed: record("1.0.1", null, "token") };
    const r = evaluateState({ ...HEALTHY, publisherChange: value }, NOW);
    expect(r).toEqual({ state: "Possessed", stateReason: "publisher changed in 1.0.1: GitHub Actions to unknown" });
    expect(r.stateReason).not.toMatch(/: {2}|: to | to $/);
    const both = evaluateState({ ...HEALTHY, publisherChange: { ...value, earlier: record("1.0.0", null, "trusted-publisher") } }, NOW);
    expect(both.stateReason).toBe("publisher changed in 1.0.1: unknown to unknown");
  });

  it.each([
    ["token to token", { ...TRUSTED_TO_TOKEN, earlier: record("1.0.0", "alice", "token") }],
    ["token to trusted publisher", { ...TRUSTED_TO_TOKEN, earlier: record("1.0.0", "alice", "token"), installed: record("1.0.1", "GitHub Actions", "trusted-publisher") }],
    ["trusted to unknown method", { ...TRUSTED_TO_TOKEN, installed: record("1.0.1", "someone", "unknown") }],
    ["same publisher", { ...TRUSTED_TO_TOKEN, status: "same" as const }],
    ["unknown status", { ...TRUSTED_TO_TOKEN, status: "unknown" as const }],
  ])("%s is evidence only (3.3)", (_label, value) => {
    expect(evaluateState({ ...HEALTHY, publisherChange: value }, NOW).state).toBe("Alive");
  });

  it("a new dependency with an install script gives Possessed and names it (3.2)", () => {
    const r = evaluateState({ ...HEALTHY, newDependency: compared([dep("a", false, false), dep("b", true, false)]) }, NOW);
    expect(r).toEqual({ state: "Possessed", stateReason: "new dependency in 1.0.1: b" });
  });

  it("a fresh new dependency gives Possessed, the first by name (3.2)", () => {
    const r = evaluateState({ ...HEALTHY, newDependency: compared([dep("a", false, true), dep("b", true, true)]) }, NOW);
    expect(r.stateReason).toBe("new dependency in 1.0.1: a");
  });

  it("an old new dependency without an install script, or with it unknown, is evidence only (3.3)", () => {
    expect(evaluateState({ ...HEALTHY, newDependency: compared([dep("a", false, false), dep("b", null, false)]) }, NOW).state).toBe("Alive");
  });

  it("the existing rules come first and keep their reasons (3.4, 3.5)", () => {
    const both = { publisherChange: TRUSTED_TO_TOKEN, newDependency: compared([dep("a", true, true)]) };
    expect(evaluateState({ ...HEALTHY, ...both, newInstallScript: [{ version: "1.0.1", publishTime: "2026-11-01T00:00:00.000Z" }] }, NOW).stateReason).toBe(
      "install script added in 1.0.1",
    );
    expect(
      evaluateState(
        {
          ...HEALTHY,
          ...both,
          provenanceRegression: { status: "regression", installedVersion: "1.14.1", earlierVersion: "1.14.0", snapshotCaptureTime: "2026-03-31T00:21:58.168Z" },
        },
        NOW,
      ).stateReason,
    ).toBe("provenance regression: 1.14.1 has no provenance, 1.14.0 had it");
  });

  it("new dependency comes before publisher change (3.4)", () => {
    const r = evaluateState({ ...HEALTHY, publisherChange: TRUSTED_TO_TOKEN, newDependency: compared([dep("a", true, false)]) }, NOW);
    expect(r.stateReason).toBe("new dependency in 1.0.1: a");
  });

  it("a match wins over the all-unavailable shortcut", () => {
    expect(evaluateState({ publisherChange: TRUSTED_TO_TOKEN }, NOW).state).toBe("Possessed");
  });

  it("stateFromSignals reads available signals and ignores unavailable ones (3.8)", () => {
    const base = {
      lastPublish: available<string | null>("2026-10-01T00:00:00.000Z", SRC, NOW),
      deprecated: available(false, SRC, NOW),
      advisories: available([], SRC, NOW),
    };
    expect(stateFromSignals({ ...base, publisherChange: available(TRUSTED_TO_TOKEN, SRC, NOW) }, NOW).state).toBe("Possessed");
    expect(stateFromSignals({ ...base, newDependency: available(compared([dep("a", true, false)]), SRC, NOW) }, NOW).state).toBe("Possessed");
    expect(
      stateFromSignals({ ...base, publisherChange: unavailable("HTTP 503", SRC, NOW), newDependency: unavailable("HTTP 503", SRC, NOW) }, NOW).state,
    ).toBe("Alive");
  });
});

describe("new-signals Possessed rules: properties", () => {
  it("Feature: new-signals, Property 1: The new rules only ever produce Possessed", () => {
    // Validates: Requirements 3.3, 3.6
    fc.assert(
      fc.property(twelveSignalInputsArb, dateArb, (inputs, now) => {
        const withNew = evaluateState(inputs, now);
        const without = evaluateState(withoutNew(inputs), now);
        const changed = withNew.state !== without.state || withNew.stateReason !== without.stateReason;
        if (changed) expect(withNew.state).toBe("Possessed");
      }),
      { numRuns: 1000 },
    );
  });

  it("Feature: new-signals, Property 2 (state half): no change gives no new reason", () => {
    // Validates: Requirements 3.7, 3.8
    const inert = fc.record({
      publisherChange: fc.oneof(
        fc.constant<PublisherChangeValue>({ status: "same", earlier: record("1.0.0", "a", "token"), installed: record("1.0.1", "a", "token") }),
        fc.constant<PublisherChangeValue>({
          status: "same",
          earlier: record("1.0.0", "GitHub Actions", "trusted-publisher"),
          installed: record("1.0.1", "GitHub Actions", "trusted-publisher"),
        }),
        fc.constant<PublisherChangeValue>({ status: "no-earlier-version", installed: null }),
      ),
      newDependency: fc.constant<NewDependencyValue>(compared([])),
    });
    fc.assert(
      fc.property(twelveSignalInputsArb, inert, dateArb, (inputs, extra, now) => {
        const base = withoutNew(inputs);
        expect(evaluateState({ ...base, ...extra }, now)).toEqual(evaluateState(base, now));
      }),
      { numRuns: 1000 },
    );
  });

  it("Feature: new-signals, Property 5: Rule precise", () => {
    // Validates: Requirements 3.1, 3.2, 3.4
    fc.assert(
      fc.property(twelveSignalInputsArb, dateArb, (inputs, now) => {
        const before = evaluateState(withoutNew(inputs), now);
        const result = evaluateState(inputs, now);
        if (before.state === "Possessed") {
          expect(result).toEqual(before);
          return;
        }
        const expected = newRuleReason(inputs);
        if (expected === null) expect(result).toEqual(before);
        else expect(result).toEqual({ state: "Possessed", stateReason: expected });
      }),
      { numRuns: 1000 },
    );
  });
});
