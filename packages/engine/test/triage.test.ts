// triageOrder. Spec sexton-power, Requirement 8.4, Property 3 (a), (c), (d).
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { available, unavailable } from "../src/signal.js";
import { compareTriage, triageOrder } from "../src/triage.js";
import { STATE_ORDER, type Advisory, type PackageHealth, type Severity, type State } from "../src/types.js";
import { arbPackage, arbTriageList } from "./arbitraries.js";

const AT = new Date("2026-11-12T00:00:00Z");
const SRC = "https://example.test/x";
function pkg(name: string, state: State, severities: readonly Severity[] | null = [], reach: number | null = 0): PackageHealth {
  const base = fc.sample(arbPackage, { seed: 1, numRuns: 1 })[0] as PackageHealth;
  const list: Advisory[] = (severities ?? []).map((severity, i) => ({ id: `X-${String(i)}`, severity, summary: "s" }));
  return {
    ...base,
    name,
    state,
    signals: {
      ...base.signals,
      advisories: severities === null ? unavailable("down", SRC, AT) : available(list, SRC, AT),
      transitiveReach: reach === null ? unavailable("down", SRC, AT) : available({ reach, graphsMissing: 0 }, SRC, AT),
    },
  };
}
const names = (list: readonly PackageHealth[]): string[] => list.map((p) => p.name);

describe("triageOrder", () => {
  it("pins the state order the rule relies on", () => {
    expect(STATE_ORDER).toEqual(["Possessed", "Dead", "Haunted", "Restless", "Alive"]);
  });
  it("puts Possessed first and Alive last", () => {
    const sorted = triageOrder(STATE_ORDER.slice().reverse().map((s) => pkg(s, s)));
    expect(names(sorted)).toEqual(["Possessed", "Dead", "Haunted", "Restless", "Alive"]);
  });
  it("breaks a state tie by highest severity, then reach, then name", () => {
    const sorted = triageOrder([
      pkg("d", "Haunted", ["Low"], 9),
      pkg("c", "Haunted", ["Critical"], 0),
      pkg("b", "Haunted", ["High"], 1),
      pkg("a", "Haunted", ["High"], 1),
      pkg("e", "Haunted", ["High"], 5),
    ]);
    expect(names(sorted)).toEqual(["c", "e", "a", "b", "d"]);
  });
  it("treats unavailable advisories and reach as 0, below Unknown severity", () => {
    const sorted = triageOrder([pkg("n", "Alive", null, null), pkg("u", "Alive", ["Unknown"], null), pkg("r", "Alive", [], 3)]);
    expect(names(sorted)).toEqual(["u", "r", "n"]);
  });
  it("returns a new array and leaves the input alone", () => {
    const input = [pkg("b", "Alive"), pkg("a", "Dead")];
    const copy = input.slice();
    const out = triageOrder(input);
    expect(out).not.toBe(input);
    expect(input).toEqual(copy);
  });
  it("Property 3 (a), (c): a permutation, deterministic and idempotent", () => {
    fc.assert(
      fc.property(arbTriageList(300), (list) => {
        const once = triageOrder(list);
        expect(names(once).slice().sort()).toEqual(names(list).slice().sort());
        expect(names(triageOrder(list))).toEqual(names(once));
        expect(names(triageOrder(once))).toEqual(names(once));
      }),
      { numRuns: 100 },
    );
  });
  it("Property 3 (d): every adjacent pair respects the rule", () => {
    fc.assert(
      fc.property(arbTriageList(60), (list) => {
        const out = triageOrder(list);
        for (let i = 1; i < out.length; i += 1) {
          expect(compareTriage(out[i - 1] as PackageHealth, out[i] as PackageHealth)).toBeLessThan(0);
        }
      }),
      { numRuns: 100 },
    );
  });
});
