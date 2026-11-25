// Spec cemetery-time, task 3.6. Property 5 and the fixture examples. No network.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { available, unavailable } from "../../src/signal.js";
import { timelineFacts, type TimelineFactsInput } from "../../src/timeline/facts.js";
import { TIMELINE_MAX_ADVISORIES, TIMELINE_MAX_MAINTAINERS, TIMELINE_MAX_VERSIONS } from "../../src/timeline/types.js";
import { fixtureDirFor, NOW } from "../helpers.js";
import { BASE, DAY, iso, SCAN } from "./support.js";

const SOURCE = "https://registry.npmjs.org/pkg";

interface Spec {
  readonly count: number;
  readonly installedPick: number;
  readonly abbreviatedMask: readonly boolean[];
  readonly scripts: readonly boolean[];
  readonly names: readonly (readonly string[] | undefined)[];
  readonly provenance: boolean | null;
  readonly advisoryCount: number;
  readonly datedMask: readonly boolean[];
  readonly installedInTime: boolean;
}

const arbSpec: fc.Arbitrary<Spec> = fc.record({
  count: fc.integer({ min: 0, max: 130 }),
  installedPick: fc.nat(),
  abbreviatedMask: fc.array(fc.boolean(), { minLength: 30, maxLength: 30 }),
  scripts: fc.array(fc.boolean(), { minLength: 30, maxLength: 30 }),
  names: fc.array(fc.option(fc.array(fc.constantFrom("a", "b", "c", "d"), { maxLength: 14 }), { nil: undefined }), {
    minLength: 30,
    maxLength: 30,
  }),
  provenance: fc.constantFrom(true, false, null),
  advisoryCount: fc.integer({ min: 0, max: 25 }),
  datedMask: fc.array(fc.boolean(), { minLength: 25, maxLength: 25 }),
  installedInTime: fc.boolean(),
});

function inputFor(spec: Spec): { input: TimelineFactsInput; names: string[] } {
  const names = Array.from({ length: spec.count }, (_, i) => `1.0.${i}`);
  const time: Record<string, string> = { created: iso(BASE), modified: iso(BASE + 1) };
  const versions: Record<string, unknown> = {};
  const abbreviated: Record<string, unknown> = {};
  const installed = names.length === 0 ? "9.9.9" : (names[spec.installedPick % names.length] as string);
  const undatedInstalled = names.length === 0 || !spec.installedInTime;
  names.forEach((n, i) => {
    if (!(undatedInstalled && n === installed)) time[n] = iso(BASE + i * DAY);
    const list = spec.names[i % 30];
    versions[n] = list === undefined ? {} : { maintainers: list.map((name) => ({ name })) };
    if (spec.abbreviatedMask[i % 30] === true) abbreviated[n] = { hasInstallScript: spec.scripts[i % 30] === true };
  });
  const advisories = Array.from({ length: spec.advisoryCount }, (_, i) => ({ id: `A-${i}`, severity: "Low" as const, summary: "s" }));
  const advisoryDates = new Map<string, string | null>(advisories.map((a, i) => [a.id, spec.datedMask[i % 25] === true ? iso(BASE + i) : null]));
  return {
    names,
    input: {
      fullPackument: { time, versions },
      abbreviatedPackument: { versions: abbreviated },
      installed,
      provenance: spec.provenance === null ? unavailable("x", SOURCE, NOW) : available({ present: spec.provenance, predicateType: null }, SOURCE, NOW),
      advisories: available(advisories, SOURCE, NOW),
      advisoryDates,
      scanDate: SCAN,
    },
  };
}

describe("timelineFacts", () => {
  it("Feature: cemetery-time, Property 5: Timeline facts respect their caps", () => {
    fc.assert(
      fc.property(arbSpec, (spec) => {
        const { input } = inputFor(spec);
        const out = timelineFacts(input);
        const ms = out.versions.filter((v) => v.publishedAt !== null).map((v) => new Date(v.publishedAt as string).getTime());
        const inOrder = ms.every((m, i) => i === 0 || (ms[i - 1] as number) <= m);
        const others = out.versions.filter((v) => v.version !== input.installed);
        const ok =
          out.versions.length <= TIMELINE_MAX_VERSIONS &&
          inOrder &&
          out.versions.some((v) => v.version === input.installed) &&
          out.versions.every((v) => v.version !== "created" && v.version !== "modified") &&
          out.versions.every((v) => (v.maintainers?.length ?? 0) <= TIMELINE_MAX_MAINTAINERS) &&
          out.versions.every((v) => v.provenance === null || v.version === input.installed) &&
          (out.advisories === null || out.advisories.length <= TIMELINE_MAX_ADVISORIES);
        const coveredOk =
          out.coveredFrom === null
            ? true
            : others.every((v) => new Date(v.publishedAt as string).getTime() >= new Date(out.coveredFrom as string).getTime());
        // The installed version is one of the `count` names, so `count - 1` others are dated.
        const dropped = Math.max(spec.count - 1, 0) > TIMELINE_MAX_VERSIONS - 1;
        expect(ok && coveredOk).toBe(true);
        expect(out.coveredFrom !== null).toBe(dropped);
      }),
      { numRuns: 100 },
    );
  });

  it("sets flags only from the abbreviated packument and provenance only for the installed version", () => {
    const { input } = inputFor({
      count: 3,
      installedPick: 2,
      abbreviatedMask: Array.from({ length: 30 }, (_, i) => i === 1),
      scripts: Array.from({ length: 30 }, () => true),
      names: Array.from({ length: 30 }, () => ["x"]),
      provenance: false,
      advisoryCount: 0,
      datedMask: [],
      installedInTime: true,
    });
    const out = timelineFacts(input);
    expect(out.versions.map((v) => v.installScript)).toEqual([null, true, null]);
    expect(out.versions.map((v) => v.provenance)).toEqual([null, null, false]);
  });

  it("sets the advisory list to null when one has no published time, or the signal is unavailable", () => {
    const { input } = inputFor({
      count: 2,
      installedPick: 1,
      abbreviatedMask: [],
      scripts: [],
      names: [],
      provenance: null,
      advisoryCount: 2,
      datedMask: [true, false],
      installedInTime: true,
    });
    expect(timelineFacts(input).advisories).toBeNull();
    expect(timelineFacts({ ...input, advisories: unavailable("down", SOURCE, NOW) }).advisories).toBeNull();
  });

  it("does not throw on malformed documents and keeps the installed version", () => {
    const out = timelineFacts({
      fullPackument: "x",
      abbreviatedPackument: null,
      installed: "1.0.0",
      provenance: null,
      advisories: null,
      advisoryDates: new Map(),
      scanDate: SCAN,
    });
    expect(out.versions).toEqual([{ version: "1.0.0", publishedAt: null, installScript: null, provenance: null, maintainers: null }]);
    expect(out.advisories).toBeNull();
  });
});

describe("timelineFacts on the recorded fixtures", () => {
  function load(name: string, installed: string): TimelineFactsInput {
    const dir = fixtureDirFor(name);
    const read = (file: string): unknown => JSON.parse(readFileSync(join(dir, file), "utf8")) as unknown;
    return {
      fullPackument: read("packument.json"),
      abbreviatedPackument: read("abbreviated.json"),
      installed,
      provenance: null,
      advisories: available([], SOURCE, NOW),
      advisoryDates: new Map(),
      scanDate: NOW,
    };
  }

  it("react keeps 49 versions plus the installed one and sets coveredFrom", () => {
    const out = timelineFacts(load("react", "18.3.1"));
    expect(out.versions).toHaveLength(50);
    expect(out.versions.filter((v) => v.version === "18.3.1")).toHaveLength(1);
    expect(out.coveredFrom).not.toBeNull();
  });

  it("left-pad keeps all 15 versions and coveredFrom is null", () => {
    const out = timelineFacts(load("left-pad", "1.3.0"));
    expect(out.versions).toHaveLength(15);
    expect(out.coveredFrom).toBeNull();
  });

  it("node-sass has the install script flag true for 7.0.3 and its Earlier version 7.0.2, and null for the others", () => {
    // Spec new-signals, task 7.1: the recorder adds the Earlier version's flag.
    const out = timelineFacts(load("node-sass", "7.0.3"));
    for (const v of out.versions) expect(v.installScript).toBe(v.version === "7.0.3" || v.version === "7.0.2" ? true : null);
    expect(out.versions.some((v) => v.version === "7.0.3")).toBe(true);
  });
});
