// Spec cemetery-time, task 7.2: the replay fixtures trace to the facts file and agree with the Engine. No network.
// Spec cemetery-time-fixes, task 2: the registry publish times, eight source URLs and Property 4.
import { readFileSync } from "node:fs";
import { SIGNAL_NAMES, evaluateState, possessingDependency, type StateInputs } from "@sexton/engine";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
// @ts-expect-error plain JavaScript modules without declarations
import {
  buildReplay,
  replayNewDependency,
  replayOutputPath,
  replayPublisherChange,
  replaySegments,
  serialiseDemoScan,
} from "../scripts/generate-demo-scan.mjs";
// @ts-expect-error plain JavaScript module without declarations
import { NOT_IN_PUBLIC_REPORTS, REPLAYS, REPLAY_IDS, SOURCE_URLS } from "../scripts/lib/replay-facts.mjs";
import { validateScanResponse } from "../../web/src/load/validate-scan-response.js";
import type { ScanResponse } from "../src/contract.js";

const ids = REPLAY_IDS as readonly ("axios" | "keyv")[];
const EIGHT: readonly string[] = Object.values(SOURCE_URLS as Record<string, string>);

const EXPECTED = {
  axios: {
    installed: "1.14.0",
    segments: [
      ["2026-03-30T23:21:58.168Z", "1.14.0", "Alive", "no rule matched"],
      ["2026-03-31T00:21:58.168Z", "1.14.1", "Possessed", "provenance regression: 1.14.1 has no provenance, 1.14.0 had it"],
      ["2026-03-31T03:29:00.000Z", "1.14.0", "Alive", "no rule matched"],
    ],
    versions: ["1.14.0", "1.14.1"],
  },
  keyv: {
    installed: "6.0.0",
    segments: [
      ["2026-08-04T08:35:00.763Z", "5.6.0", "Alive", "no rule matched"],
      ["2026-08-04T09:35:00.763Z", "6.0.0", "Possessed", "install script added in 6.0.0"],
    ],
    versions: ["5.6.0", "6.0.0"],
  },
} as const;

function fixture(id: string): ScanResponse {
  return JSON.parse(readFileSync(replayOutputPath(id) as string, "utf8")) as ScanResponse;
}

function strings(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) for (const v of value) strings(v, out);
  else if (typeof value === "object" && value !== null) for (const v of Object.values(value)) strings(v, out);
  return out;
}

describe("replay fixtures", () => {
  it("are byte-identical on two generator runs and equal the files on disk", () => {
    for (const id of ids) {
      const a = serialiseDemoScan(buildReplay(id)) as string;
      expect(serialiseDemoScan(buildReplay(id))).toBe(a);
      expect(readFileSync(replayOutputPath(id) as string, "utf8")).toBe(a);
    }
  });

  it("pass the web validator", () => {
    for (const id of ids) expect(validateScanResponse(fixture(id)).ok).toBe(true);
  });

  it("have the Segments, versions, states and reasons of the Replay facts tables", () => {
    for (const id of ids) {
      const response = fixture(id);
      const timeline = response.timelines?.[id];
      expect(timeline?.installed).toBe(EXPECTED[id].installed);
      expect(timeline?.coveredFrom).toBeNull();
      expect(timeline?.segments.map((s) => [s.from, s.version, s.state, s.reason])).toEqual(EXPECTED[id].segments);
      expect(timeline?.segments.every((s) => !s.ghost)).toBe(true);
      for (const s of timeline?.segments ?? []) expect(EXPECTED[id].versions as readonly string[]).toContain(s.version);
      const last = timeline?.segments[timeline.segments.length - 1];
      const health = response.report.packages[0];
      expect(response.report.packages).toHaveLength(1);
      expect(health?.state).toBe(last?.state);
      expect(health?.stateReason).toBe(last?.reason);
      expect(health?.installedVersion).toBe(last?.version);
      expect(response.report.generatedAt).toBe(REPLAYS[id].generatedAt);
    }
  });

  it("trace every field to the facts file and carry no invented field", () => {
    for (const id of ids) {
      const facts = REPLAYS[id];
      const response = fixture(id);
      expect(Object.keys(response).sort()).toEqual(["actions", "policy", "remediations", "replay", "report", "timelines"]);
      expect(response.report.scan).toBeUndefined();
      expect(response.remediations).toEqual([]);
      expect(response.actions).toEqual({ remediate: false });
      expect(response.replay).toEqual({
        id,
        title: facts.title,
        summary: facts.summary,
        sources: facts.sources.map((s: { label: string; url: string }) => ({ label: s.label, url: s.url })),
      });
      const health = response.report.packages[0];
      const installed = facts.versions.find((v: { version: string }) => v.version === EXPECTED[id].installed);
      const signals = health?.signals as unknown as Record<string, { available: boolean; value: unknown; source: string; fetchedAt: string; reason?: string }>;
      expect(Object.keys(signals).sort()).toEqual([...SIGNAL_NAMES].sort());
      const available = (name: string): boolean => signals[name]?.available === true;
      for (const name of SIGNAL_NAMES) {
        const s = signals[name];
        expect(s?.fetchedAt).toBe(facts.generatedAt);
        if (s?.available === false) {
          expect(s.reason).toBe(NOT_IN_PUBLIC_REPORTS);
          expect(s.source).toBe(facts.sources[0].url);
          expect(s.value).toBeNull();
        } else {
          expect(EIGHT).toContain(s?.source);
        }
      }
      // Advisories, deprecation, maintainers, reach and maintainer change: no source gives them.
      for (const name of ["deprecated", "advisories", "maintainers", "transitiveReach", "maintainerChange"]) expect(available(name)).toBe(false);
      expect(available("lastPublish")).toBe(installed.publishedAt !== null);
      if (installed.publishedAt !== null) expect(signals["lastPublish"]?.value).toBe(installed.publishedAt);
      expect(available("hasInstallScript")).toBe(installed.installScript !== null);
      if (installed.installScript !== null) expect(signals["hasInstallScript"]?.value).toBe(installed.installScript);
      expect(available("provenance")).toBe(installed.provenance !== null);
      if (installed.provenance !== null) expect(signals["provenance"]?.value).toEqual({ present: installed.provenance, predicateType: null });
    }
    const keyv = fixture("keyv").report.packages[0]?.signals;
    expect(keyv?.newInstallScript).toMatchObject({ available: true, value: [{ version: "6.0.0", publishTime: "2026-08-04T09:35:00.763Z" }] });
    const axios = fixture("axios").report.packages[0]?.signals;
    expect(axios?.newInstallScript.available).toBe(false);
  });

  it("use only the eight source URLs, https only, and no signal that is not on main", () => {
    for (const id of ids) {
      const response = fixture(id);
      const urls = strings(response).filter((s) => /^https?:\/\//.test(s));
      expect(urls.length).toBeGreaterThan(0);
      for (const url of urls) expect(EIGHT).toContain(url);
      for (const source of response.replay?.sources ?? []) expect(source.url.startsWith("https://")).toBe(true);
      const names = Object.keys(response.report.packages[0]?.signals ?? {});
      expect(names.every((n) => (SIGNAL_NAMES as readonly string[]).includes(n))).toBe(true);
    }
    expect(EIGHT).toHaveLength(8);
    expect(EIGHT.every((u) => u.startsWith("https://"))).toBe(true);
  });
});

// An independent model: plain loops over the facts of one version and its earlier versions.
interface Fact {
  readonly version: string;
  readonly publishedAt: string | null;
  readonly installScript: boolean | null;
  readonly provenance: boolean | null;
  readonly deprecated?: boolean | null;
}
function model(versions: readonly Fact[], version: string, at: Date): StateInputs {
  const inputs: { -readonly [K in keyof StateInputs]: StateInputs[K] } = {};
  let index = -1;
  for (let i = 0; i < versions.length; i += 1) if (versions[i]?.version === version) index = i;
  const v = versions[index] as Fact;
  if (v.publishedAt !== null) inputs.lastPublish = new Date(v.publishedAt);
  if (typeof v.deprecated === "boolean") inputs.deprecated = v.deprecated;
  if (v.provenance === false) {
    for (let i = index - 1; i >= 0; i -= 1) {
      const e = versions[i] as Fact;
      if (e.provenance === true) {
        inputs.provenanceRegression = {
          status: "regression",
          installedVersion: v.version,
          earlierVersion: e.version,
          snapshotCaptureTime: v.publishedAt ?? at.toISOString(),
        };
        break;
      }
    }
  }
  const before = versions[index - 1];
  if (v.installScript === true && before !== undefined && before.installScript === false && v.publishedAt !== null) {
    const age = at.getTime() - Date.parse(v.publishedAt);
    if (age >= 0 && age <= 90 * 86_400_000) inputs.newInstallScript = [{ version: v.version, publishTime: v.publishedAt }];
  }
  return inputs;
}

interface Stop {
  readonly from: string;
  readonly version: string;
}
/** Checks a Segment list against the model at its from, inside it and the last millisecond before the next from (or the end). */
function agrees(versions: readonly Fact[], stops: readonly Stop[], end: number, inside: number): void {
  const segments = replaySegments({ id: "x", versions, stops }) as { from: string; state: string; reason: string; version: string; ghost: boolean }[];
  expect(segments).toHaveLength(stops.length);
  segments.forEach((seg, i) => {
    const from = Date.parse(seg.from);
    const next = i + 1 < segments.length ? Date.parse((segments[i + 1] as { from: string }).from) : end;
    const instants = next > from ? [from, from + Math.floor(inside * (next - from)), next - 1] : [from];
    for (const t of instants) {
      const expected = evaluateState(model(versions, seg.version, new Date(t)), new Date(t));
      expect(seg.state).toBe(expected.state);
      expect(seg.reason).toBe(expected.stateReason);
    }
    expect(seg.ghost).toBe(false);
    expect(seg.version).toBe((stops[i] as Stop).version);
  });
}

describe("Property 13: Segments agree with state as of at every instant", () => {
  it("Feature: cemetery-time, Property 13: Segments agree with state as of at every instant", () => {
    // The two replays.
    for (const id of ids) {
      const facts = REPLAYS[id];
      const stops = facts.stops as Stop[];
      agrees(facts.versions, stops, Date.parse(facts.generatedAt), 0.5);
    }
    // Generated per-version facts. Stops are minutes apart, so no 90 day or 24 month threshold falls inside a Segment.
    const base = Date.parse("2026-06-01T00:00:00.000Z");
    const DAY = 86_400_000;
    const arbVersion = fc.record({
      published: fc.constantFrom<number | null>(null, 0, 1, 30, 89, 800, 1000),
      installScript: fc.constantFrom<boolean | null>(null, false, true),
      provenance: fc.constantFrom<boolean | null>(null, false, true),
    });
    fc.assert(
      fc.property(
        fc.array(arbVersion, { minLength: 1, maxLength: 5 }),
        fc.array(fc.tuple(fc.integer({ min: 1, max: 100 }), fc.nat()), { minLength: 1, maxLength: 6 }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        (raw, gaps, inside) => {
          const versions: Fact[] = raw.map((r, i) => ({
            version: `1.0.${String(i)}`,
            publishedAt: r.published === null ? null : new Date(base - r.published * DAY).toISOString(),
            installScript: r.installScript,
            provenance: r.provenance,
          }));
          let at = base;
          const stops: Stop[] = gaps.map(([minutes, pick]) => {
            at += minutes * 60_000;
            return { from: new Date(at).toISOString(), version: (versions[pick % versions.length] as Fact).version };
          });
          agrees(versions, stops, at + 3_600_000, inside);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// Spec cemetery-time-fixes, task 2.5. The bad publishes and scan dates come from requirements 2.1 and 2.5, not the facts file.
const BAD_PUBLISH = { axios: "2026-03-31T00:21:58.168Z", keyv: "2026-08-04T09:35:00.763Z" } as const;
const SCAN_DATE = { axios: "2026-03-31T03:29:00.000Z", keyv: "2026-08-04T09:35:00.763Z" } as const;

describe("Property 4: The replays follow the registry facts", () => {
  it("Feature: cemetery-time-fixes, Property 4: The replays follow the registry facts", () => {
    for (const id of ids) {
      const facts = REPLAYS[id];
      const response = fixture(id);
      expect(validateScanResponse(response).ok).toBe(true);
      const segments = response.timelines?.[id]?.segments ?? [];
      const stops = facts.stops as Stop[];
      const start = Date.parse(BAD_PUBLISH[id]) - 3_600_000;
      const end = Date.parse(SCAN_DATE[id]);
      expect(Date.parse(segments[0]?.from ?? "")).toBe(start);
      expect(response.report.generatedAt).toBe(SCAN_DATE[id]);
      expect(segments.map((s) => s.from)).toEqual(stops.map((s) => s.from));
      const check = (t: number): void => {
        let held: (typeof segments)[number] | undefined;
        for (const s of segments) if (Date.parse(s.from) <= t) held = s;
        let version: string | undefined;
        for (const s of stops) if (Date.parse(s.from) <= t) version = s.version;
        expect(held).toBeDefined();
        expect(held?.version).toBe(version);
        const expected = evaluateState(model(facts.versions as Fact[], version as string, new Date(t)), new Date(t));
        expect(held?.state).toBe(expected.state);
        expect(held?.reason).toBe(expected.stateReason);
      };
      for (const s of stops) {
        const at = Date.parse(s.from);
        check(at);
        if (at - 1 >= start) check(at - 1);
      }
      check(end);
      fc.assert(fc.property(fc.integer({ min: start, max: end }), check), { numRuns: 100 });
    }
  });
});

describe("the registry facts (requirements 2.1, 2.2)", () => {
  it("hold the five registry publish times and the keyv 5.6.0 flags, with no deprecated fact for axios", () => {
    const pick = (id: "axios" | "keyv") =>
      (REPLAYS[id].versions as Fact[]).map((v) => [v.version, v.publishedAt, v.deprecated ?? null, v.provenance]);
    expect(pick("axios")).toEqual([
      ["1.14.0", "2026-03-27T19:01:40.915Z", null, true],
      ["1.14.1", "2026-03-31T00:21:58.168Z", null, false],
    ]);
    expect(pick("keyv")).toEqual([
      ["5.6.0", "2026-01-21T00:39:26.982Z", false, false],
      ["6.0.0-rc.1", "2026-08-03T19:21:08.158Z", null, null],
      ["6.0.0", "2026-08-04T09:35:00.763Z", null, true],
    ]);
    expect(REPLAYS.axios.factSources.publishedAt).toBe("https://registry.npmjs.org/axios");
    expect(REPLAYS.keyv.factSources.publishedAt).toBe("https://registry.npmjs.org/keyv");
    expect(REPLAYS.keyv.factSources.deprecated).toBe("https://registry.npmjs.org/keyv");
  });
});

describe("the new signals in the replays (spec new-signals, Requirement 5)", () => {
  it("axios keeps its provenance regression reason at 00:21, and the New dependency rule matches the 1.14.1 facts as evidence (5.3)", () => {
    const segment = fixture("axios").timelines?.["axios"]?.segments.find((s) => s.from === "2026-03-31T00:21:58.168Z");
    expect(segment).toMatchObject({ state: "Possessed", reason: "provenance regression: 1.14.1 has no provenance, 1.14.0 had it", version: "1.14.1" });
    const added = replayNewDependency(REPLAYS.axios, "1.14.1");
    expect(added).toEqual({
      status: "compared",
      installedVersion: "1.14.1",
      earlierVersion: "1.14.0",
      installedPublishTime: "2026-03-31T00:21:58.168Z",
      addedCount: 1,
      capped: false,
      added: [
        { name: "plain-crypto-js", range: "^4.2.1", resolvedVersion: "4.2.1", resolvedPublishTime: "2026-03-30T23:59:12.278Z", installScript: true, fresh: true },
      ],
    });
    expect(possessingDependency(added)?.name).toBe("plain-crypto-js");
    // The 1.14.1 publisher name is left out (design.md Decisions 12), so the comparison is unknown.
    expect(replayPublisherChange(REPLAYS.axios, "1.14.1")?.status).toBe("unknown");
  });

  it("keyv keeps its install script reason, and its publisher is the same trusted publisher (5.4, 5.6)", () => {
    const segment = fixture("keyv").timelines?.["keyv"]?.segments.find((s) => s.from === "2026-08-04T09:35:00.763Z");
    expect(segment).toMatchObject({ state: "Possessed", reason: "install script added in 6.0.0" });
    const signals = fixture("keyv").report.packages[0]?.signals;
    expect(signals?.publisherChange).toMatchObject({ available: true, value: { status: "same", earlier: { version: "6.0.0-rc.1" } }, source: SOURCE_URLS.snyk });
    expect(signals?.newDependency).toMatchObject({ available: false, reason: NOT_IN_PUBLIC_REPORTS });
    expect(replayNewDependency(REPLAYS.keyv, "6.0.0")).toBeUndefined();
  });

  it("axios at the scan date (1.14.0, no Earlier version in the facts) has both signals unavailable (5.5)", () => {
    const signals = fixture("axios").report.packages[0]?.signals;
    expect(signals?.publisherChange).toMatchObject({ available: false, reason: NOT_IN_PUBLIC_REPORTS });
    expect(signals?.newDependency).toMatchObject({ available: false, reason: NOT_IN_PUBLIC_REPORTS });
    expect(replayPublisherChange(REPLAYS.axios, "1.14.0")).toBeUndefined();
  });

  it("the story text is unchanged (owner decision at go)", () => {
    expect(REPLAYS.axios.summary).toContain("Sexton marks 1.14.1 Possessed because provenance regressed.");
  });
});
