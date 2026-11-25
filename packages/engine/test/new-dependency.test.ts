// newDependency, pure half. Spec new-signals, Requirement 2. Properties 2 (dependency half), 4 (pure half), 7 and 8.

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  dependencyDiff,
  detailNames,
  FRESH_WINDOW_MS,
  isFresh,
  NEW_DEPENDENCY_CAP,
  newDependencyValue,
  resolveDependency,
  type DocRead,
} from "../src/new-dependency.js";

const PARENT = Date.parse("2026-03-31T00:21:58.168Z");

function parent(before: Record<string, unknown>, after: Record<string, unknown>): unknown {
  return {
    time: { "1.14.0": "2026-03-27T19:01:40.915Z", "1.14.1": "2026-03-31T00:21:58.168Z" },
    versions: { "1.14.0": { dependencies: before }, "1.14.1": { dependencies: after } },
  };
}

const PLAIN_FULL: DocRead = {
  ok: true,
  doc: {
    time: { "4.2.0": "2026-03-30T05:57:32.867Z", "4.2.1": "2026-03-30T23:59:12.278Z", "4.2.2": "2026-04-02T00:00:00.000Z" },
    versions: { "4.2.0": {}, "4.2.1": {}, "4.2.2": {} },
  },
};
const PLAIN_ABBREVIATED: DocRead = { ok: true, doc: { versions: { "4.2.0": {}, "4.2.1": { hasInstallScript: true }, "4.2.2": {} } } };
const THREE = { "form-data": "^4.0.5", "proxy-from-env": "^2.1.0", "follow-redirects": "^1.15.11" };

describe("dependencyDiff and resolveDependency", () => {
  it("finds plain-crypto-js and resolves it at the parent publish time (2.2, 2.4)", () => {
    const diff = dependencyDiff(parent(THREE, { ...THREE, "plain-crypto-js": "^4.2.1" }), "1.14.1");
    expect(diff).toMatchObject({ status: "compared", earlierVersion: "1.14.0", added: [{ name: "plain-crypto-js", range: "^4.2.1" }] });
    const entry = resolveDependency({ name: "plain-crypto-js", range: "^4.2.1" }, PARENT, PLAIN_FULL, PLAIN_ABBREVIATED);
    expect(entry).toEqual({
      name: "plain-crypto-js",
      range: "^4.2.1",
      resolvedVersion: "4.2.1",
      resolvedPublishTime: "2026-03-30T23:59:12.278Z",
      installScript: true,
      fresh: true,
    });
  });

  it("records a non-semver range and an invalid name without a resolved version (2.6, 2.8)", () => {
    expect(resolveDependency({ name: "x", range: "git+https://example.test/x.git" }, PARENT, PLAIN_FULL, PLAIN_ABBREVIATED)).toMatchObject({
      resolvedVersion: null,
      reason: "range is not a semver range",
    });
    expect(resolveDependency({ name: "Bad Name", range: "^1.0.0" }, PARENT, PLAIN_FULL, PLAIN_ABBREVIATED)).toMatchObject({
      resolvedVersion: null,
      reason: "invalid package name",
    });
  });

  it("records a failed read with null fields and a reason (2.7)", () => {
    expect(resolveDependency({ name: "x", range: "^4.0.0" }, PARENT, { ok: false, reason: "HTTP 404" }, PLAIN_ABBREVIATED)).toEqual({
      name: "x",
      range: "^4.0.0",
      resolvedVersion: null,
      resolvedPublishTime: null,
      installScript: null,
      fresh: false,
      reason: "packument unavailable: HTTP 404",
    });
    const onlyAbbr = resolveDependency({ name: "x", range: "^4.2.1" }, PARENT, PLAIN_FULL, { ok: false, reason: "HTTP 503" });
    expect(onlyAbbr).toMatchObject({ resolvedVersion: "4.2.1", installScript: null, fresh: true, reason: "abbreviated packument unavailable: HTTP 503" });
  });

  it("finds no version when every match was published after the parent", () => {
    expect(resolveDependency({ name: "x", range: "^4.2.2" }, PARENT, PLAIN_FULL, PLAIN_ABBREVIATED)).toMatchObject({
      resolvedVersion: null,
      reason: "no version satisfies the range at the parent publish time",
    });
  });

  it("gives no-earlier-version for the first version and an empty list for equal names (2.9, 2.12)", () => {
    expect(dependencyDiff(parent(THREE, THREE), "1.14.0")).toEqual({ status: "no-earlier-version", installedVersion: "1.14.0" });
    const same = dependencyDiff(parent(THREE, { ...THREE, "form-data": "^5.0.0" }), "1.14.1");
    expect(same.status === "compared" && same.added).toEqual([]);
  });

  it("cuts a range to 256 characters and never resolves it, even when the cut text is a valid range (review defect 1)", () => {
    const long = `>=1.0.0${" ".repeat(250)}<0.0.0-0`;
    const diff = dependencyDiff(parent({}, { x: long }), "1.14.1");
    if (diff.status !== "compared") throw new Error("expected a comparison");
    const added = diff.added[0];
    if (added === undefined) throw new Error("expected one added name");
    expect(added.range.length).toBe(256);
    const full: DocRead = { ok: true, doc: { time: { "1.0.0": "2026-01-01T00:00:00.000Z", "2.0.0": "2026-03-30T00:00:00.000Z" }, versions: { "1.0.0": {}, "2.0.0": {} } } };
    expect(resolveDependency(added, PARENT, full, { ok: true, doc: {} })).toMatchObject({ resolvedVersion: null, reason: "range is not a semver range" });
  });
});

describe("isFresh", () => {
  it("is inclusive at 7 days and false after the parent (Glossary)", () => {
    expect(isFresh(PARENT - FRESH_WINDOW_MS, PARENT)).toBe(true);
    expect(isFresh(PARENT - FRESH_WINDOW_MS - 1, PARENT)).toBe(false);
    expect(isFresh(PARENT, PARENT)).toBe(true);
    expect(isFresh(PARENT + 1, PARENT)).toBe(false);
    expect(isFresh(Number.NaN, PARENT)).toBe(false);
  });
});

describe("properties", () => {
  const nameArb = fc.stringMatching(/^[a-z]{1,6}$/);
  const mapArb = fc.dictionary(nameArb, fc.constantFrom("^1.0.0", "~2.0.0", "*"), { maxKeys: 9 });

  it("Feature: new-signals, Property 7: Cap and order", () => {
    // Validates: Requirements 2.2, 2.3, 2.11
    fc.assert(
      fc.property(mapArb, mapArb, (before, after) => {
        const diff = dependencyDiff(parent(before, after), "1.14.1");
        if (diff.status !== "compared") throw new Error("expected a comparison");
        const expected = Object.keys(after).filter((n) => !Object.hasOwn(before, n)).sort();
        expect(diff.added.map((d) => d.name)).toEqual(expected);
        const details = detailNames(diff);
        expect(details.length).toBe(Math.min(expected.length, NEW_DEPENDENCY_CAP));
        const value = newDependencyValue(diff, details.map((d) => resolveDependency(d, PARENT, { ok: false, reason: "x" }, { ok: false, reason: "x" })));
        if (value.status !== "compared") throw new Error("expected a comparison");
        expect(value.addedCount).toBe(expected.length);
        expect(value.capped).toBe(expected.length > NEW_DEPENDENCY_CAP);
        expect(value.added.length).toBeLessThanOrEqual(NEW_DEPENDENCY_CAP);
      }),
      { numRuns: 100 },
    );
  });

  it("Feature: new-signals, Property 2 (dependency half): the same names give no new dependency", () => {
    // Validates: Requirements 2.12
    fc.assert(
      fc.property(mapArb, fc.constantFrom("^9.0.0", "1.2.3"), (before, otherRange) => {
        const after = Object.fromEntries(Object.keys(before).map((k) => [k, otherRange]));
        const diff = dependencyDiff(parent(before, after), "1.14.1");
        expect(diff.status === "compared" && diff.added).toEqual([]);
        expect(detailNames(diff)).toEqual([]);
      }),
      { numRuns: 1000 },
    );
  });

  it("Feature: new-signals, Property 4 (pure half) and Property 8: never throws, deterministic", () => {
    // Validates: Requirements 2.11
    const readArb: fc.Arbitrary<DocRead> = fc.oneof(
      fc.jsonValue().map((doc): DocRead => ({ ok: true, doc })),
      fc.string().map((reason): DocRead => ({ ok: false, reason })),
    );
    fc.assert(
      fc.property(fc.jsonValue(), fc.string(), fc.string(), fc.string(), readArb, readArb, fc.double(), (doc, v, name, range, full, abbr, ms) => {
        const diff = dependencyDiff(doc, v);
        expect(dependencyDiff(doc, v)).toEqual(diff);
        const entry = resolveDependency({ name, range }, ms, full, abbr);
        expect(resolveDependency({ name, range }, ms, full, abbr)).toEqual(entry);
        const value = newDependencyValue(diff, [entry]);
        expect(value.status === "compared" ? value.added.length : 0).toBeLessThanOrEqual(NEW_DEPENDENCY_CAP);
      }),
      { numRuns: 100 },
    );
  });
});
