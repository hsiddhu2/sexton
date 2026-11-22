// State function: examples per rule plus correctness properties. Requirements 11, 12, 13, 14.

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { available, unavailable } from "../src/signal.js";
import { evaluateState, healthRank, monthsBefore, stateFromSignals } from "../src/state.js";
import { STATE_ORDER, type Advisory } from "../src/types.js";
import { dateArb, stateInputsArb } from "./arbitraries.js";

const NOW = new Date("2026-11-12T00:00:00Z");
const SRC = "https://registry.npmjs.org/x";

function adv(severity: Advisory["severity"]): Advisory {
  return { id: `GHSA-${severity}`, severity, summary: "" };
}

describe("evaluateState rules", () => {
  it("deprecated gives Dead", () => {
    expect(evaluateState({ lastPublish: NOW, deprecated: true, advisories: [] }, NOW).state).toBe("Dead");
  });

  it("publish older than 24 months with no advisory gives Restless", () => {
    const old = new Date("2024-10-01T00:00:00Z");
    expect(evaluateState({ lastPublish: old, deprecated: false, advisories: [] }, NOW)).toEqual({
      state: "Restless",
      stateReason: "no release in 24 months",
    });
  });

  it("High advisory gives Haunted even when recently published", () => {
    expect(evaluateState({ lastPublish: NOW, deprecated: false, advisories: [adv("High")] }, NOW).state).toBe("Haunted");
  });

  it("Dead wins over Haunted", () => {
    expect(evaluateState({ lastPublish: NOW, deprecated: true, advisories: [adv("Critical")] }, NOW).state).toBe("Dead");
  });

  it("publish between 12 and 24 months gives Alive", () => {
    const aging = new Date("2025-06-01T00:00:00Z");
    expect(evaluateState({ lastPublish: aging, deprecated: false, advisories: [] }, NOW).state).toBe("Alive");
  });

  it("exactly 12 months ago gives Alive, one millisecond newer gives Alive", () => {
    const boundary = monthsBefore(NOW, 12);
    expect(evaluateState({ lastPublish: boundary, deprecated: false, advisories: [] }, NOW).state).toBe("Alive");
    const newer = new Date(boundary.getTime() + 1);
    expect(evaluateState({ lastPublish: newer, deprecated: false, advisories: [] }, NOW).state).toBe("Alive");
  });

  it("exactly 24 months ago gives Alive, one millisecond older gives Restless", () => {
    const boundary = monthsBefore(NOW, 24);
    expect(evaluateState({ lastPublish: boundary, deprecated: false, advisories: [] }, NOW).state).toBe("Alive");
    const older = new Date(boundary.getTime() - 1);
    expect(evaluateState({ lastPublish: older, deprecated: false, advisories: [] }, NOW).state).toBe("Restless");
  });

  it("Low or Moderate advisory gives Restless", () => {
    expect(evaluateState({ lastPublish: NOW, deprecated: false, advisories: [adv("Low")] }, NOW).state).toBe("Restless");
    expect(evaluateState({ lastPublish: NOW, deprecated: false, advisories: [adv("Moderate")] }, NOW).state).toBe("Restless");
  });

  it("Unknown severity alone gives Alive", () => {
    expect(evaluateState({ lastPublish: NOW, deprecated: false, advisories: [adv("Unknown")] }, NOW).state).toBe("Alive");
  });

  it("nothing matching gives Alive", () => {
    expect(evaluateState({ lastPublish: NOW, deprecated: false, advisories: [] }, NOW)).toEqual({ state: "Alive", stateReason: "no rule matched" });
  });

  it("null last publish skips age rules", () => {
    expect(evaluateState({ lastPublish: null, deprecated: false, advisories: [] }, NOW).state).toBe("Alive");
  });

  it("future publish date never counts as age", () => {
    const future = new Date(NOW.getTime() + 1000);
    expect(evaluateState({ lastPublish: future, deprecated: false, advisories: [] }, NOW).state).toBe("Alive");
  });
});

describe("evaluateState degradation", () => {
  it("unavailable publish skips age rules but advisory rules still run (14.4)", () => {
    expect(evaluateState({ deprecated: false, advisories: [adv("High")] }, NOW).state).toBe("Haunted");
    expect(evaluateState({ deprecated: false, advisories: [] }, NOW).state).toBe("Alive");
  });

  it("all state signals unavailable gives Restless (14.5)", () => {
    expect(evaluateState({}, NOW)).toEqual({ state: "Restless", stateReason: "all state signals unavailable" });
  });

  it("stateFromSignals maps envelopes to inputs (2.4)", () => {
    const r = stateFromSignals(
      {
        lastPublish: available("2024-01-01T00:00:00Z", SRC, NOW),
        deprecated: unavailable("HTTP 503", SRC, NOW),
        advisories: available([], SRC, NOW),
      },
      NOW,
    );
    expect(r.state).toBe("Restless");
  });
});

describe("state properties", () => {
  it("determinism: equal inputs and reference time give equal state (12.1)", () => {
    fc.assert(
      fc.property(stateInputsArb, dateArb, (inputs, now) => {
        expect(evaluateState(inputs, now)).toEqual(evaluateState(structuredClone(inputs), new Date(now.getTime())));
      }),
      { numRuns: 1000 },
    );
  });

  it("exactly one state from the allowed set, never Possessed (11.1, 11.7)", () => {
    fc.assert(
      fc.property(stateInputsArb, dateArb, (inputs, now) => {
        const { state } = evaluateState(inputs, now);
        expect(STATE_ORDER).toContain(state);
        expect(state).not.toBe("Possessed");
      }),
      { numRuns: 1000 },
    );
  });

  it("monotonic in age: an older last publish never ranks healthier (13.2)", () => {
    fc.assert(
      fc.property(stateInputsArb, dateArb, dateArb, dateArb, (inputs, now, d1, d2) => {
        const older = d1.getTime() <= d2.getTime() ? d1 : d2;
        const newer = older === d1 ? d2 : d1;
        const rankOlder = healthRank(evaluateState({ ...inputs, lastPublish: older }, now).state);
        const rankNewer = healthRank(evaluateState({ ...inputs, lastPublish: newer }, now).state);
        expect(rankOlder).toBeLessThanOrEqual(rankNewer);
      }),
      { numRuns: 1000 },
    );
  });

  it("health rank follows the fixed order (13.1)", () => {
    expect(STATE_ORDER.map(healthRank)).toEqual([0, 1, 2, 3, 4]);
  });
});
