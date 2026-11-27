// Spec clean-site, design C3: the web half of the reason-family drift check, the plain sentences (3.9, 3.10) and the
// Inspector's three signals (3.11, 3.25). The api half (packages/api/test/reason-family-drift.test.ts) checks the same
// fixture against the engine.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { PackageHealth, State } from "@sexton/api";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { SIGNAL_NAMES } from "../src/load/lists.js";
import { NOT_AVAILABLE, pickKeys, pickSignals } from "../src/panel/pick-signals.js";
import { FAMILIES, reasonFamily, reasonSentence, type Family } from "../src/panel/reason-family.js";
import { SIGNAL_LABELS } from "../src/drawer/signal-labels.js";
import { arbPackage, cheapPackage } from "./arbitraries.js";

interface Sample {
  readonly family: Family;
  readonly reason: string;
}
const SAMPLES = JSON.parse(readFileSync(join(process.cwd(), "test", "fixtures", "engine-reasons.json"), "utf8")) as Sample[];

describe("reason families", () => {
  it("finds the family of every engine branch's sample reason, and covers every family once", () => {
    expect(SAMPLES.map((s) => s.family)).toEqual([...FAMILIES]);
    for (const sample of SAMPLES) expect(reasonFamily(sample.reason), sample.reason).toBe(sample.family);
  });

  it("writes the plain sentence of each family with the facts of the reason", () => {
    const sentences = Object.fromEntries(SAMPLES.map((s) => [s.family, reasonSentence(s.reason)]));
    expect(sentences).toEqual({
      maintainer: "A maintainer of this package changed in the last 90 days.",
      provenance: "1.14.1 was published without provenance, though 1.14.0 had it.",
      "install-script": "6.0.0 added an install script that earlier versions did not have.",
      "new-dependency": "1.14.1 added a new dependency, plain-crypto-js, that looks risky.",
      publisher: "1.14.1 was published by a different account than before, github-actions to jasonsaayman.",
      deprecated: "The authors have marked this version as deprecated.",
      "stale-advisory": "No release in 24 months, and a known advisory is still open.",
      high: "A High or Critical advisory is open.",
      stale: "No release in 24 months.",
      low: "A Moderate or Low advisory is open.",
      unavailable: "None of its health signals could be read.",
      none: "No rule matched. Nothing to do.",
    });
  });

  it("gives a reason of no family back with its first letter capitalised (3.10)", () => {
    expect(reasonFamily("installed version not yet published")).toBeNull();
    expect(reasonSentence("installed version not yet published")).toBe("Installed version not yet published");
    expect(reasonSentence("maintainer change in the last 90 days, and more")).toBe("Maintainer change in the last 90 days, and more");
    expect(reasonSentence("")).toBe("");
    fc.assert(
      fc.property(fc.string({ maxLength: 80 }), (reason) => {
        fc.pre(reasonFamily(reason) === null);
        expect(reasonSentence(reason)).toBe(reason.charAt(0).toUpperCase() + reason.slice(1));
      }),
      { numRuns: 100 },
    );
  });
});

function withSignal(pkg: PackageHealth, key: string, envelope: unknown): PackageHealth {
  return { ...pkg, signals: { ...pkg.signals, [key]: envelope } } as unknown as PackageHealth;
}
const on = (value: unknown) => ({ value, source: "s", fetchedAt: "2026-11-12T00:00:00.000Z", available: true });
const off = { value: null, source: "s", fetchedAt: "2026-11-12T00:00:00.000Z", available: false, reason: "r" };

describe("the Inspector's three signals", () => {
  it("chooses the keys by State, the Possessed family's signal first", () => {
    const pkg = (state: State, stateReason: string) => ({ ...cheapPackage("a", state), stateReason });
    expect(pickKeys(pkg("Possessed", "maintainer change in the last 90 days"))).toEqual(["maintainerChange", "maintainers", "provenance"]);
    expect(pickKeys(pkg("Possessed", "install script added in 6.0.0"))).toEqual(["newInstallScript", "maintainers", "provenance"]);
    expect(pickKeys(pkg("Possessed", "publisher changed in 2.0.0: a to b"))).toEqual(["publisherChange", "maintainers", "provenance"]);
    expect(pickKeys(pkg("Possessed", "something new"))).toEqual(["maintainers", "provenance", "hasInstallScript"]);
    expect(pickKeys(pkg("Dead", "installed version is deprecated"))).toEqual(["deprecated", "lastPublish", "advisories"]);
    for (const s of ["Haunted", "Restless", "Alive"] as const) expect(pickKeys(pkg(s, "x"))).toEqual(["advisories", "deprecated", "lastPublish"]);
  });

  it("shows an unavailable signal as not available (3.25)", () => {
    const pkg = withSignal(cheapPackage("a", "Dead"), "deprecated", off);
    expect(pickSignals(pkg)[0]).toEqual({ key: "deprecated", label: "Deprecated", value: NOT_AVAILABLE, tone: "warn" });
  });

  it("writes short values with a tone from the value alone", () => {
    const base = cheapPackage("a", "Haunted");
    const advised = withSignal(base, "advisories", on([{ id: "G", severity: "Low", summary: "s" }, { id: "H", severity: "High", summary: "s" }]));
    expect(pickSignals(advised)[0]).toMatchObject({ label: "Advisories", value: "2 open, worst High", tone: "bad" });
    const changed = withSignal(
      { ...cheapPackage("a", "Possessed"), stateReason: "maintainer change in the last 90 days" },
      "maintainerChange",
      on({ status: "history-sufficient", events: [{ kind: "live", before: ["alice", "bob"], after: ["alice", "mallory"], eventTime: "2026-10-01T00:00:00.000Z", recent: true }] }),
    );
    expect(pickSignals(changed)[0]).toMatchObject({ label: "Maintainer change", value: "alice, bob became alice, mallory", tone: "bad" });
    expect(pickSignals(base)[2]).toMatchObject({ label: "Last publish", value: "1 Jan 2026", tone: "ok" });
    // A blank maintainer name is no name: the row reads "none", never an empty value (seed 995333568 found it).
    const blank = pickSignals(withSignal(cheapPackage("a", "Possessed"), "maintainers", on(["", " "])));
    expect(blank.find((row) => row.key === "maintainers")).toMatchObject({ value: "none", tone: "ok" });
  });

  it("gives three labelled rows for any package and never throws, whatever the signal values hold", () => {
    fc.assert(
      fc.property(arbPackage, fc.constantFrom(...SIGNAL_NAMES), fc.anything(), (pkg, key, junk) => {
        const rows = pickSignals(withSignal(pkg, key, on(junk)));
        expect(rows).toHaveLength(3);
        for (const row of rows) {
          expect(row.label).toBe(SIGNAL_LABELS[row.key]);
          expect(row.value.length).toBeGreaterThan(0);
          expect(["bad", "warn", "ok"]).toContain(row.tone);
        }
      }),
      { numRuns: 100 },
    );
  });
});
