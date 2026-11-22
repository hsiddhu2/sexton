// Possessed rule: example tests. Requirements 9.1 to 9.5, 9.11, 9.12, 10.6. Properties are task 4.4.

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { available, unavailable } from "../src/signal.js";
import { evaluateState, healthRank, stateFromSignals, type StateInputs } from "../src/state.js";
import { STATE_ORDER } from "../src/types.js";
import { dateArb, inertNewInputsArb, stateInputsArb, tenSignalInputsArb } from "./arbitraries.js";
import { oracleEvaluateState } from "./support/health-scoring-oracle.js";
import type {
  Advisory,
  MaintainerChangeEvent,
  MaintainerChangeValue,
  ProvenanceRegressionValue,
} from "../src/types.js";

const NOW = new Date("2026-11-12T00:00:00Z");
const SRC = "https://registry.npmjs.org/x";
const OLD = new Date("2023-01-01T00:00:00Z");

function adv(severity: Advisory["severity"]): Advisory {
  return { id: `GHSA-${severity}`, severity, summary: "" };
}

function event(recent: boolean): MaintainerChangeEvent {
  return {
    kind: "snapshot-pair",
    before: ["alice", "bob"],
    after: ["alice", "mallory"],
    eventTime: "2026-10-31T00:00:00.000Z",
    recent,
  };
}

function change(...events: MaintainerChangeEvent[]): MaintainerChangeValue {
  return { status: "history-sufficient", events };
}

const INSUFFICIENT_CHANGE: MaintainerChangeValue = { status: "history-insufficient", events: [] };
const REGRESSION: ProvenanceRegressionValue = {
  status: "regression",
  installedVersion: "1.3.0",
  earlierVersion: "1.2.1",
  snapshotCaptureTime: "2026-10-31T00:00:00.000Z",
};
const NO_REGRESSION: ProvenanceRegressionValue = {
  status: "no-regression",
  snapshotCaptureTime: "2026-10-31T00:00:00.000Z",
};
const INSUFFICIENT_REGRESSION: ProvenanceRegressionValue = {
  status: "history-insufficient",
  reason: "history empty",
};
const SCRIPT = [{ version: "1.3.0", publishTime: "2026-10-25T10:00:00.000Z" }];

const HEALTHY: StateInputs = { lastPublish: NOW, deprecated: false, advisories: [] };

describe("Possessed conditions, each on its own", () => {
  it("a recent maintainer change gives Possessed and names it (9.2)", () => {
    const r = evaluateState({ ...HEALTHY, maintainerChange: change(event(true)) }, NOW);
    expect(r.state).toBe("Possessed");
    expect(r.stateReason).toContain("maintainer change");
  });

  it("one recent event among non-recent events gives Possessed", () => {
    const r = evaluateState({ ...HEALTHY, maintainerChange: change(event(false), event(true)) }, NOW);
    expect(r.state).toBe("Possessed");
  });

  it("a provenance regression gives Possessed and names the versions (9.3)", () => {
    const r = evaluateState({ ...HEALTHY, provenanceRegression: REGRESSION }, NOW);
    expect(r.state).toBe("Possessed");
    expect(r.stateReason).toContain("provenance regression");
    expect(r.stateReason).toContain("1.3.0");
    expect(r.stateReason).toContain("1.2.1");
  });

  it("a non-empty newInstallScript list gives Possessed and names the version (9.4)", () => {
    const r = evaluateState({ ...HEALTHY, newInstallScript: SCRIPT }, NOW);
    expect(r.state).toBe("Possessed");
    expect(r.stateReason).toContain("install script");
    expect(r.stateReason).toContain("1.3.0");
  });
});

describe("Possession inputs that never match (9.5)", () => {
  it("a maintainer change event with recent false does not match", () => {
    expect(evaluateState({ ...HEALTHY, maintainerChange: change(event(false)) }, NOW).state).toBe("Alive");
  });

  it("a maintainer change value with no events does not match", () => {
    expect(evaluateState({ ...HEALTHY, maintainerChange: change() }, NOW).state).toBe("Alive");
  });

  it("history-insufficient values do not match", () => {
    const r = evaluateState(
      { ...HEALTHY, maintainerChange: INSUFFICIENT_CHANGE, provenanceRegression: INSUFFICIENT_REGRESSION },
      NOW,
    );
    expect(r.state).toBe("Alive");
  });

  it("a no-regression value does not match", () => {
    expect(evaluateState({ ...HEALTHY, provenanceRegression: NO_REGRESSION }, NOW).state).toBe("Alive");
  });

  it("an empty newInstallScript list does not match", () => {
    expect(evaluateState({ ...HEALTHY, newInstallScript: [] }, NOW).state).toBe("Alive");
  });

  it("undefined possession inputs do not match", () => {
    const r = evaluateState(
      { ...HEALTHY, maintainerChange: undefined, provenanceRegression: undefined, newInstallScript: undefined },
      NOW,
    );
    expect(r.state).toBe("Alive");
  });
});

describe("Possessed ordering", () => {
  it("Possessed with all original signals unavailable is Possessed, not Restless (9.12)", () => {
    expect(evaluateState({ newInstallScript: SCRIPT }, NOW).state).toBe("Possessed");
    expect(evaluateState({ maintainerChange: change(event(true)) }, NOW).state).toBe("Possessed");
    expect(evaluateState({ provenanceRegression: REGRESSION }, NOW).state).toBe("Possessed");
  });

  it("Possessed beats Dead, Haunted and Restless inputs (9.1)", () => {
    const possession: StateInputs = { newInstallScript: SCRIPT };
    expect(evaluateState({ ...possession, lastPublish: OLD, deprecated: true, advisories: [] }, NOW).state).toBe("Possessed");
    expect(evaluateState({ ...possession, lastPublish: NOW, deprecated: false, advisories: [adv("Critical")] }, NOW).state).toBe("Possessed");
    expect(evaluateState({ ...possession, lastPublish: new Date("2025-06-01T00:00:00Z"), deprecated: false, advisories: [adv("Low")] }, NOW).state).toBe("Possessed");
  });

  it("a non-matching possession input leaves the lower rules in charge", () => {
    const inputs: StateInputs = { lastPublish: OLD, deprecated: false, advisories: [], maintainerChange: change(event(false)) };
    expect(evaluateState(inputs, NOW)).toEqual({ state: "Restless", stateReason: "no release in 24 months" });
  });
});

describe("no possession inputs: existing behaviour (9.11, 10.6)", () => {
  it("gives Alive, Restless, Haunted and Dead as before", () => {
    expect(evaluateState(HEALTHY, NOW).state).toBe("Alive");
    expect(evaluateState({ ...HEALTHY, lastPublish: OLD }, NOW).state).toBe("Restless");
    expect(evaluateState({ ...HEALTHY, advisories: [adv("High")] }, NOW).state).toBe("Haunted");
    expect(evaluateState({ ...HEALTHY, deprecated: true }, NOW).state).toBe("Dead");
  });

  it("all state signals unavailable gives Restless with the old reason", () => {
    expect(evaluateState({}, NOW)).toEqual({ state: "Restless", stateReason: "all state signals unavailable" });
  });
});

describe("stateFromSignals possession envelopes", () => {
  const base = {
    lastPublish: available(NOW.toISOString(), SRC, NOW),
    deprecated: available(false, SRC, NOW),
    advisories: available<readonly Advisory[]>([], SRC, NOW),
  };

  it("an available possession envelope produces Possessed", () => {
    expect(stateFromSignals({ ...base, maintainerChange: available(change(event(true)), SRC, NOW) }, NOW).state).toBe("Possessed");
    expect(stateFromSignals({ ...base, provenanceRegression: available(REGRESSION, SRC, NOW) }, NOW).state).toBe("Possessed");
    expect(stateFromSignals({ ...base, newInstallScript: available(SCRIPT, SRC, NOW) }, NOW).state).toBe("Possessed");
  });

  it("unavailable possession envelopes never produce Possessed", () => {
    const r = stateFromSignals(
      {
        ...base,
        maintainerChange: unavailable("store read failed", SRC, NOW),
        provenanceRegression: unavailable("provenance unavailable", SRC, NOW),
        newInstallScript: unavailable("packument unavailable", SRC, NOW),
      },
      NOW,
    );
    expect(r.state).toBe("Alive");
  });

  it("omitted possession envelopes behave like the original three signals", () => {
    expect(stateFromSignals(base, NOW)).toEqual({ state: "Alive", stateReason: "no rule matched" });
  });

  it("Possessed with all original envelopes unavailable is still Possessed", () => {
    const r = stateFromSignals(
      {
        lastPublish: unavailable("HTTP 503", SRC, NOW),
        deprecated: unavailable("HTTP 503", SRC, NOW),
        advisories: unavailable("HTTP 503", SRC, NOW),
        newInstallScript: available(SCRIPT, SRC, NOW),
      },
      NOW,
    );
    expect(r.state).toBe("Possessed");
  });
});

describe("properties", () => {
  it("Feature: history-signals, Property 1: Possessed determinism", () => {
    // Validates: Requirements 9.7
    fc.assert(
      fc.property(tenSignalInputsArb, dateArb, (inputs, now) => {
        expect(evaluateState(inputs, now)).toEqual(evaluateState(inputs, now));
      }),
      { numRuns: 100 },
    );
  });

  it("Feature: history-signals, Property 2: Exactly one state, and Possessed only from the Possession signals", () => {
    // Validates: Requirements 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.8, 9.12
    const matchesPossession = (i: StateInputs): boolean =>
      i.maintainerChange?.events.some((e) => e.recent) === true ||
      i.provenanceRegression?.status === "regression" ||
      (i.newInstallScript?.length ?? 0) > 0;
    fc.assert(
      fc.property(tenSignalInputsArb, dateArb, (inputs, now) => {
        const r = evaluateState(inputs, now);
        expect(STATE_ORDER).toContain(r.state);
        expect(r.stateReason.length).toBeGreaterThan(0);
        expect(r.state === "Possessed").toBe(matchesPossession(inputs));
      }),
      { numRuns: 1000 },
    );
  });

  it("Property 2 corner: a matching Possession signal wins with every original signal unavailable", () => {
    // Validates: Requirements 9.12
    fc.assert(
      fc.property(tenSignalInputsArb, dateArb, (inputs, now) => {
        const { maintainerChange, provenanceRegression, newInstallScript } = inputs;
        const stripped: StateInputs = {
          ...(maintainerChange !== undefined ? { maintainerChange } : {}),
          ...(provenanceRegression !== undefined ? { provenanceRegression } : {}),
          ...(newInstallScript !== undefined ? { newInstallScript } : {}),
        };
        const full = evaluateState(inputs, now);
        const bare = evaluateState(stripped, now);
        expect(bare.state === "Possessed").toBe(full.state === "Possessed");
      }),
      { numRuns: 1000 },
    );
  });

  it("Feature: history-signals, Property 3: Monotonic in age with all ten signals", () => {
    // Validates: Requirements 9.10
    fc.assert(
      fc.property(tenSignalInputsArb, dateArb, dateArb, dateArb, (inputs, d1, d2, now) => {
        const older = d1.getTime() <= d2.getTime() ? d1 : d2;
        const newer = d1.getTime() <= d2.getTime() ? d2 : d1;
        const rankOlder = healthRank(evaluateState({ ...inputs, lastPublish: older }, now).state);
        const rankNewer = healthRank(evaluateState({ ...inputs, lastPublish: newer }, now).state);
        expect(rankOlder).toBeLessThanOrEqual(rankNewer);
      }),
      { numRuns: 100 },
    );
  });

  it("Feature: history-signals, Property 12: Health-scoring equivalence when the new signals are unavailable", () => {
    // Validates: Requirements 10.6, 9.11
    fc.assert(
      fc.property(stateInputsArb, inertNewInputsArb, dateArb, (original, inert, now) => {
        const expected = oracleEvaluateState(original, now);
        expect(evaluateState(original, now)).toEqual(expected);
        expect(evaluateState({ ...original, ...inert }, now)).toEqual(expected);
      }),
      { numRuns: 1000 },
    );
  });
});
