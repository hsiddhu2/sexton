// Example tests for the pure history rules. Requirements 6.2, 6.4, 6.5, 6.6, 6.8, 7.1, 7.4, 7.8, 8.2, 8.4, 8.7, 8.8.
// Properties 5 and 9 are in task 2.6.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  compareVersionOrder,
  evaluateProvenanceRegression,
  isRecent,
  maintainerChangeValue,
  maintainerDiff,
  newInstallScriptEvents,
  publishedVersions,
  type PublishedVersion,
} from "../src/history.js";
import { available, unavailable } from "../src/signal.js";
import { RECENT_WINDOW_MS, type Snapshot, type SnapshotVersion } from "../src/snapshot.js";
import type { ProvenanceValue } from "../src/types.js";

const DAY = 24 * 60 * 60 * 1000;
const REF = new Date("2026-11-05T00:00:00.000Z");
const SRC = "https://registry.npmjs.org/-/npm/v1/attestations/pkg@1.0.0";

function iso(ms: number): string {
  return new Date(ms).toISOString();
}

function pv(version: string, publishTime: string): PublishedVersion {
  return { version, publishTime, publishMs: new Date(publishTime).getTime() };
}

function snap(captureTime: string, maintainers: readonly string[], versions: readonly SnapshotVersion[] = []): Snapshot {
  return { name: "pkg", captureTime, maintainers, versions };
}

function sv(version: string, publishTime: string, provenance: boolean | null): SnapshotVersion {
  return { version, publishTime, hasInstallScript: false, provenance };
}

function packument(times: Record<string, string>): unknown {
  const versions: Record<string, object> = {};
  for (const v of Object.keys(times)) {
    versions[v] = {};
  }
  return { versions, time: { created: "2020-01-01T00:00:00.000Z", modified: "2026-01-01T00:00:00.000Z", ...times } };
}

function abbreviated(flags: Record<string, boolean | undefined>): unknown {
  const versions: Record<string, object> = {};
  for (const [v, flag] of Object.entries(flags)) {
    versions[v] = flag === undefined ? {} : { hasInstallScript: flag };
  }
  return { versions };
}

function prov(present: boolean): ReturnType<typeof available<ProvenanceValue>> {
  return available({ present, predicateType: present ? "https://slsa.dev/provenance/v1" : null }, SRC, REF);
}

describe("version order and isRecent", () => {
  it("orders equal publish times by plain version string, greater is later", () => {
    const t = "2026-10-01T00:00:00.000Z";
    expect(compareVersionOrder(pv("1.0.9", t), pv("1.0.10", t))).toBeGreaterThan(0); // "1.0.9" > "1.0.10" as strings
    expect(compareVersionOrder(pv("1.0.10", t), pv("1.0.9", t))).toBeLessThan(0);
    expect(compareVersionOrder(pv("1.0.0", t), pv("1.0.0", t))).toBe(0);
    const list = publishedVersions(packument({ "2.0.0": t, "1.0.0": t, "10.0.0": t }));
    expect(list.map((v) => v.version)).toEqual(["1.0.0", "10.0.0", "2.0.0"]);
  });

  it("orders by publish time before version string", () => {
    expect(compareVersionOrder(pv("9.0.0", "2026-01-01T00:00:00.000Z"), pv("1.0.0", "2026-01-02T00:00:00.000Z"))).toBeLessThan(0);
  });

  it("is inclusive at exactly 90 days and false one ms beyond", () => {
    expect(RECENT_WINDOW_MS).toBe(90 * DAY);
    expect(isRecent(new Date(REF.getTime() - 90 * DAY), REF)).toBe(true);
    expect(isRecent(new Date(REF.getTime() - 90 * DAY - 1), REF)).toBe(false);
    expect(isRecent(REF, REF)).toBe(true);
    expect(isRecent(new Date(REF.getTime() + 1), REF)).toBe(false);
  });
});

describe("maintainerChangeValue", () => {
  it("returns history-insufficient with zero events for an empty History, even with a live list", () => {
    const value = maintainerChangeValue([], { maintainers: ["a"], fetchedAt: iso(REF.getTime()) }, REF);
    expect(value).toEqual({ status: "history-insufficient", events: [] });
  });

  it("compares a History of exactly one Snapshot with the live list: differ gives one live event", () => {
    const captured = iso(REF.getTime() - 10 * DAY);
    const value = maintainerChangeValue([snap(captured, ["a", "b"])], { maintainers: ["a", "c"], fetchedAt: iso(REF.getTime()) }, REF);
    expect(value.status).toBe("history-sufficient");
    expect(value.events).toEqual([
      { kind: "live", before: ["a", "b"], after: ["a", "c"], eventTime: iso(REF.getTime()), recent: true },
    ]);
  });

  it("gives no event for one Snapshot equal as a set to the live list", () => {
    const value = maintainerChangeValue(
      [snap(iso(REF.getTime() - DAY), ["a", "b"])],
      { maintainers: ["b", "a", "a"], fetchedAt: iso(REF.getTime()) },
      REF,
    );
    expect(value).toEqual({ status: "history-sufficient", events: [] });
  });

  it("judges the live event by the latest Snapshot capture time, and pair events by event time", () => {
    const old = iso(REF.getTime() - 200 * DAY);
    const mid = iso(REF.getTime() - 100 * DAY); // not recent
    const latest = iso(REF.getTime() - 91 * DAY); // not recent, so live is not recent
    const value = maintainerChangeValue(
      [snap(old, ["a"]), snap(mid, ["b"]), snap(latest, ["b"])],
      { maintainers: ["c"], fetchedAt: iso(REF.getTime()) }, // live fetchedAt is now, but recent follows the Snapshot
      REF,
    );
    expect(value.events.map((e) => [e.kind, e.recent])).toEqual([
      ["snapshot-pair", false],
      ["live", false],
    ]);
    const recentLatest = iso(REF.getTime() - 90 * DAY);
    const value2 = maintainerChangeValue(
      [snap(old, ["a"]), snap(recentLatest, ["b"])],
      { maintainers: ["c"], fetchedAt: iso(REF.getTime()) },
      REF,
    );
    expect(value2.events.map((e) => [e.kind, e.recent])).toEqual([
      ["snapshot-pair", true],
      ["live", true],
    ]);
  });

  it("derives pair events only when the live list is null", () => {
    const value = maintainerChangeValue(
      [snap(iso(REF.getTime() - 30 * DAY), ["a"]), snap(iso(REF.getTime() - 10 * DAY), ["b"])],
      null,
      REF,
    );
    expect(value.status).toBe("history-sufficient");
    expect(value.events).toHaveLength(1);
    expect(value.events[0]?.kind).toBe("snapshot-pair");
    expect(value.events[0]?.eventTime).toBe(iso(REF.getTime() - 10 * DAY));
  });

  it("orders History by numeric capture time, not input or string order, and events ascending", () => {
    const t1 = "2026-09-01T00:00:00.000Z";
    const t2 = "2026-10-01T00:00:00.000Z";
    const t3 = "2026-10-15T00:00:00.000Z";
    // Input shuffled; second-precision and millisecond strings would mis-sort as strings.
    const value = maintainerChangeValue([snap(t3, ["c"]), snap(t1, ["a"]), snap(t2, ["b"])], null, REF);
    expect(value.events.map((e) => e.eventTime)).toEqual([t2, t3]);
    expect(value.events.map((e) => [e.before, e.after])).toEqual([
      [["a"], ["b"]],
      [["b"], ["c"]],
    ]);
  });

  it("derives the same events when a Snapshot with an equal maintainer set is appended (6.8)", () => {
    const base = [snap("2026-09-01T00:00:00.000Z", ["a", "b"]), snap("2026-10-01T00:00:00.000Z", ["a", "c"])];
    const live = null;
    const before = maintainerChangeValue(base, live, REF);
    const after = maintainerChangeValue([...base, snap("2026-10-20T00:00:00.000Z", ["c", "a", "c"])], live, REF);
    const strip = (events: readonly { kind: string; before: readonly string[]; after: readonly string[]; eventTime: string }[]) =>
      events.map(({ kind, before: b, after: a, eventTime }) => ({ kind, before: b, after: a, eventTime }));
    expect(strip(after.events)).toEqual(strip(before.events));
  });
});

describe("evaluateProvenanceRegression", () => {
  const full = packument({
    "1.0.0": "2026-01-01T00:00:00.000Z",
    "1.1.0": "2026-02-01T00:00:00.000Z",
    "1.2.0": "2026-03-01T00:00:00.000Z",
    "1.3.0": "2026-04-01T00:00:00.000Z",
  });
  const history = [
    snap("2026-05-01T00:00:00.000Z", ["a"], [
      sv("1.0.0", "2026-01-01T00:00:00.000Z", true),
      sv("1.1.0", "2026-02-01T00:00:00.000Z", true),
      sv("1.2.0", "2026-03-01T00:00:00.000Z", false),
      sv("1.3.0", "2026-04-01T00:00:00.000Z", true),
    ]),
  ];

  it("names the latest earlier version with provenance true", () => {
    const out = evaluateProvenanceRegression({
      installedVersion: "1.2.0",
      provenance: prov(false),
      fullPackument: full,
      historyRead: { ok: true, history },
    });
    expect(out).toEqual({
      kind: "value",
      value: {
        status: "regression",
        installedVersion: "1.2.0",
        earlierVersion: "1.1.0",
        snapshotCaptureTime: "2026-05-01T00:00:00.000Z",
      },
    });
  });

  it("reports no-regression when the installed version has provenance", () => {
    const out = evaluateProvenanceRegression({
      installedVersion: "1.3.0",
      provenance: prov(true),
      fullPackument: full,
      historyRead: { ok: true, history },
    });
    expect(out).toEqual({ kind: "value", value: { status: "no-regression", snapshotCaptureTime: "2026-05-01T00:00:00.000Z" } });
  });

  it("reports no-regression when no earlier version has provenance true", () => {
    const out = evaluateProvenanceRegression({
      installedVersion: "1.2.0",
      provenance: prov(false),
      fullPackument: full,
      historyRead: {
        ok: true,
        history: [snap("2026-05-01T00:00:00.000Z", ["a"], [sv("1.0.0", "2026-01-01T00:00:00.000Z", false), sv("1.1.0", "2026-02-01T00:00:00.000Z", false)])],
      },
    });
    expect(out.kind === "value" && out.value.status).toBe("no-regression");
  });

  it("ignores null presence on the Snapshot side (7.1)", () => {
    const out = evaluateProvenanceRegression({
      installedVersion: "1.2.0",
      provenance: prov(false),
      fullPackument: full,
      historyRead: {
        ok: true,
        history: [snap("2026-05-01T00:00:00.000Z", ["a"], [sv("1.0.0", "2026-01-01T00:00:00.000Z", true), sv("1.1.0", "2026-02-01T00:00:00.000Z", null)])],
      },
    });
    expect(out.kind === "value" && out.value).toMatchObject({ status: "regression", earlierVersion: "1.0.0" });
  });

  it("is history-insufficient when only null earlier presences exist", () => {
    const out = evaluateProvenanceRegression({
      installedVersion: "1.2.0",
      provenance: prov(false),
      fullPackument: full,
      historyRead: { ok: true, history: [snap("2026-05-01T00:00:00.000Z", ["a"], [sv("1.0.0", "2026-01-01T00:00:00.000Z", null)])] },
    });
    expect(out.kind === "value" && out.value.status).toBe("history-insufficient");
    expect(out.kind === "value" && out.value.status === "history-insufficient" && out.value.reason).toMatch(/no earlier version/);
  });

  it("ignores Snapshot versions that are not earlier than the installed version", () => {
    const out = evaluateProvenanceRegression({
      installedVersion: "1.0.0",
      provenance: prov(false),
      fullPackument: full,
      historyRead: { ok: true, history },
    });
    expect(out.kind === "value" && out.value.status).toBe("history-insufficient");
  });

  it("is history-insufficient with a reason for an empty History", () => {
    const out = evaluateProvenanceRegression({
      installedVersion: "1.2.0",
      provenance: prov(false),
      fullPackument: full,
      historyRead: { ok: true, history: [] },
    });
    expect(out).toEqual({ kind: "value", value: { status: "history-insufficient", reason: "history is empty" } });
  });

  it("is history-insufficient with a reason when the installed version is absent or its time does not parse (7.4)", () => {
    for (const fullPackument of [full, packument({ "1.2.0": "not a date" }), null]) {
      const out = evaluateProvenanceRegression({
        installedVersion: fullPackument === full ? "9.9.9" : "1.2.0",
        provenance: prov(false),
        fullPackument,
        historyRead: { ok: true, history },
      });
      expect(out.kind).toBe("value");
      if (out.kind === "value" && out.value.status === "history-insufficient") {
        expect(out.value.reason).toMatch(/installed version/);
      } else {
        throw new Error("expected history-insufficient");
      }
    }
  });

  it("applies precedence: provenance unavailable wins over a store failure and over insufficiency (7.8)", () => {
    const unavailableProvenance = unavailable("HTTP 500", SRC, REF);
    expect(
      evaluateProvenanceRegression({
        installedVersion: "1.2.0",
        provenance: unavailableProvenance,
        fullPackument: full,
        historyRead: { ok: false, reason: "store down" },
      }),
    ).toEqual({ kind: "unavailable", reason: "provenance unavailable" });
    expect(
      evaluateProvenanceRegression({
        installedVersion: "1.2.0",
        provenance: unavailableProvenance,
        fullPackument: full,
        historyRead: { ok: true, history: [] },
      }),
    ).toEqual({ kind: "unavailable", reason: "provenance unavailable" });
    expect(
      evaluateProvenanceRegression({
        installedVersion: "1.2.0",
        provenance: prov(false),
        fullPackument: full,
        historyRead: { ok: false, reason: "store down" },
      }),
    ).toEqual({ kind: "unavailable", reason: "store down" });
  });

  it("a store failure wins over history-insufficient when the installed version is absent", () => {
    expect(
      evaluateProvenanceRegression({
        installedVersion: "9.9.9",
        provenance: prov(false),
        fullPackument: full,
        historyRead: { ok: false, reason: "store down" },
      }).kind,
    ).toBe("unavailable");
  });
});

describe("newInstallScriptEvents", () => {
  const recent = (daysAgo: number): string => iso(REF.getTime() - daysAgo * DAY);

  it("never emits for the first Published version", () => {
    const events = newInstallScriptEvents(packument({ "1.0.0": recent(1) }), abbreviated({ "1.0.0": true }), REF);
    expect(events).toEqual([]);
  });

  it("emits for a recent version that gained an install script, including a non-installed one", () => {
    const full = packument({ "1.0.0": recent(200), "1.1.0": recent(30), "1.2.0": recent(10) });
    const abbr = abbreviated({ "1.0.0": false, "1.1.0": true, "1.2.0": true });
    // 1.1.0 gained it; 1.2.0 already had it from its predecessor. Installed version could be 1.2.0.
    expect(newInstallScriptEvents(full, abbr, REF)).toEqual([{ version: "1.1.0", publishTime: recent(30) }]);
  });

  it("treats an absent predecessor entry as false", () => {
    const full = packument({ "1.0.0": recent(200), "1.1.0": recent(5) });
    expect(newInstallScriptEvents(full, abbreviated({ "1.1.0": true }), REF)).toEqual([{ version: "1.1.0", publishTime: recent(5) }]);
  });

  it("does not emit for a version that is not Recent", () => {
    const full = packument({ "1.0.0": recent(300), "1.1.0": recent(100) });
    expect(newInstallScriptEvents(full, abbreviated({ "1.0.0": false, "1.1.0": true }), REF)).toEqual([]);
  });

  it("is inclusive at exactly 90 days and excludes one ms beyond", () => {
    const at = iso(REF.getTime() - 90 * DAY);
    const beyond = iso(REF.getTime() - 90 * DAY - 1);
    const base = { "1.0.0": "2025-01-01T00:00:00.000Z" };
    const abbr = abbreviated({ "1.0.0": false, "1.1.0": true });
    expect(newInstallScriptEvents(packument({ ...base, "1.1.0": at }), abbr, REF)).toHaveLength(1);
    expect(newInstallScriptEvents(packument({ ...base, "1.1.0": beyond }), abbr, REF)).toHaveLength(0);
  });

  it("never qualifies a publish time later than the Reference time", () => {
    const future = iso(REF.getTime() + 1);
    const full = packument({ "1.0.0": recent(200), "1.1.0": future });
    expect(newInstallScriptEvents(full, abbreviated({ "1.0.0": false, "1.1.0": true }), REF)).toEqual([]);
  });

  it("ignores versions whose publish time does not parse and orders by publish time", () => {
    const full = packument({ "2.0.0": recent(20), "1.0.0": recent(40), "1.5.0": "garbage" });
    const abbr = abbreviated({ "1.0.0": false, "1.5.0": true, "2.0.0": true });
    expect(newInstallScriptEvents(full, abbr, REF)).toEqual([{ version: "2.0.0", publishTime: recent(20) }]);
  });

  it("uses the tie rule for the predecessor on equal publish time", () => {
    const t = recent(5);
    const full = packument({ "1.0.0": recent(100), "1.1.0": t, "1.2.0": t });
    // Order: 1.0.0, 1.1.0, 1.2.0. 1.1.0 has the script; 1.2.0 has it and its predecessor has it, so no event for 1.2.0.
    const events = newInstallScriptEvents(full, abbreviated({ "1.0.0": false, "1.1.0": true, "1.2.0": true }), REF);
    expect(events.map((e) => e.version)).toEqual(["1.1.0"]);
  });

  it("returns an empty list for malformed input", () => {
    expect(newInstallScriptEvents(null, null, REF)).toEqual([]);
    expect(newInstallScriptEvents(packument({ "1.0.0": recent(1), "1.1.0": recent(1) }), "x", REF)).toEqual([]);
  });
});

const NUM_RUNS = 100;

const namesArb = fc.array(fc.constantFrom("alice", "bob", "carol", "dave"), { maxLength: 8 });

/** A permutation of the distinct names of `names`, with extra repeats. Equal to `names` as a set. */
const sameSetArb = (names: readonly string[]): fc.Arbitrary<string[]> => {
  const distinct = [...new Set(names)];
  if (distinct.length === 0) return fc.constant([]);
  return fc
    .tuple(fc.shuffledSubarray(distinct, { minLength: distinct.length, maxLength: distinct.length }), fc.array(fc.constantFrom(...distinct), { maxLength: 4 }))
    .chain(([perm, extra]) => fc.shuffledSubarray([...perm, ...extra], { minLength: perm.length + extra.length, maxLength: perm.length + extra.length }));
};

const asSet = (xs: readonly string[]): Set<string> => new Set(xs);

describe("Feature: history-signals, Property 5: Maintainer difference symmetry", () => {
  it("holds for any lists A and B", () => {
    fc.assert(
      fc.property(namesArb, namesArb, (a, b) => {
        const self = maintainerDiff(a, a);
        expect(self.added).toEqual([]);
        expect(self.removed).toEqual([]);

        const ab = maintainerDiff(a, b);
        const ba = maintainerDiff(b, a);
        expect(asSet(ab.added)).toEqual(asSet(ba.removed));
        expect(asSet(ab.removed)).toEqual(asSet(ba.added));
        const removed = asSet(ab.removed);
        expect(ab.added.some((n) => removed.has(n))).toBe(false);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it("gives an empty diff and no event for lists equal as sets", () => {
    fc.assert(
      fc.property(
        namesArb.chain((a) => sameSetArb(a).map((shuffled) => [a, shuffled] as const)),
        ([a, shuffled]) => {
          const diff = maintainerDiff(a, shuffled);
          expect(diff.added).toEqual([]);
          expect(diff.removed).toEqual([]);
          const value = maintainerChangeValue(
            [snap("2026-09-01T00:00:00.000Z", a), snap("2026-10-01T00:00:00.000Z", shuffled)],
            null,
            REF,
          );
          expect(value.events).toEqual([]);
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });
});

const refMs = REF.getTime();
const timeOffsetArb: fc.Arbitrary<string> = fc.oneof(
  fc.integer({ min: -400, max: 400 }).map((d) => iso(refMs + d * DAY)),
  fc.constantFrom(iso(refMs - 90 * DAY), iso(refMs - 90 * DAY - 1), iso(refMs), iso(refMs + 1)),
  fc.constantFrom("garbage", "", "not-a-date"),
);

const versionsArb = fc
  .uniqueArray(fc.tuple(fc.nat(9), fc.nat(9), fc.nat(9)).map(([a, b, c]) => `${a}.${b}.${c}`), { maxLength: 12 })
  .chain((names) => fc.tuple(fc.constant(names), fc.array(timeOffsetArb, { minLength: names.length, maxLength: names.length })));

describe("Feature: history-signals, Property 9: newInstallScript is false when no version has an install script", () => {
  it("returns [] when every hasInstallScript is false or absent", () => {
    fc.assert(
      fc.property(
        versionsArb.chain(([names, times]) =>
          fc.tuple(
            fc.constant(names),
            fc.constant(times),
            fc.array(fc.constantFrom<boolean | undefined>(false, undefined), { minLength: names.length, maxLength: names.length }),
          ),
        ),
        ([names, times, flags]) => {
          const full = packument(Object.fromEntries(names.map((v, i) => [v, times[i] as string])));
          const abbr = abbreviated(Object.fromEntries(names.map((v, i) => [v, flags[i]])));
          expect(newInstallScriptEvents(full, abbr, REF)).toEqual([]);
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it("is deterministic and never names a version published after the Reference time", () => {
    fc.assert(
      fc.property(
        versionsArb.chain(([names, times]) =>
          fc.tuple(
            fc.constant(names),
            fc.constant(times),
            fc.array(fc.constantFrom<boolean | undefined>(true, false, undefined), { minLength: names.length, maxLength: names.length }),
          ),
        ),
        ([names, times, flags]) => {
          const full = packument(Object.fromEntries(names.map((v, i) => [v, times[i] as string])));
          const abbr = abbreviated(Object.fromEntries(names.map((v, i) => [v, flags[i]])));
          const first = newInstallScriptEvents(full, abbr, REF);
          expect(newInstallScriptEvents(full, abbr, REF)).toEqual(first);
          for (const event of first) {
            expect(new Date(event.publishTime).getTime()).toBeLessThanOrEqual(refMs);
          }
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });
});
