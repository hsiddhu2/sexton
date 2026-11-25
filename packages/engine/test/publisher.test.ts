// publisherChange and the Earlier version. Spec new-signals, Requirement 1. Properties 2 (publisher half), 4, 6 and 8.

import fc from "fast-check";
import semver from "semver";
import { describe, expect, it } from "vitest";
import { earlierVersion, publishedVersions } from "../src/history.js";
import { publisherChangeValue } from "../src/publisher.js";

const TRUSTED = { name: "GitHub Actions", email: "npm-oidc-no-reply@github.com", trustedPublisher: { id: "github" } };

/** Shaped like the axios packument around 31 March 2026, with a 0.30.x backport published in between. */
const AXIOS_LIKE = {
  time: {
    created: "2014-08-29T00:00:00.000Z",
    "1.13.6": "2026-02-27T15:35:51.983Z",
    "1.14.0": "2026-03-27T19:01:40.915Z",
    "0.30.4": "2026-03-30T10:00:00.000Z",
    "1.14.1": "2026-03-31T00:21:58.168Z",
    "1.15.0": "2026-04-08T16:09:38.623Z",
  },
  versions: {
    "1.13.6": { _npmUser: TRUSTED },
    "1.14.0": { _npmUser: TRUSTED },
    "0.30.4": { _npmUser: { name: "someone" } },
    "1.14.1": { _npmUser: { name: "someone", email: "x@example.test" } },
    "1.15.0": { _npmUser: TRUSTED },
  },
};

describe("earlierVersion", () => {
  it("skips a backport published in between and a later version (Decisions 1)", () => {
    expect(earlierVersion(AXIOS_LIKE, "1.14.1")?.version).toBe("1.14.0");
    expect(earlierVersion(AXIOS_LIKE, "1.13.6")).toBeNull();
  });

  it("includes a prerelease below a release, as semver does", () => {
    const doc = {
      time: { "6.0.0-rc.1": "2026-08-03T19:21:08.158Z", "6.0.0": "2026-08-04T09:35:00.763Z" },
      versions: { "6.0.0-rc.1": {}, "6.0.0": {} },
    };
    expect(earlierVersion(doc, "6.0.0")?.version).toBe("6.0.0-rc.1");
  });

  it("accepts a version with build metadata (review defect 2)", () => {
    const doc = { time: { "1.0.0": "2026-01-01T00:00:00.000Z", "2.0.0+b1": "2026-02-01T00:00:00.000Z" }, versions: { "1.0.0": {}, "2.0.0+b1": {} } };
    expect(earlierVersion(doc, "2.0.0+b1")?.version).toBe("1.0.0");
  });

  it("is null for a non-semver or unpublished installed version", () => {
    expect(earlierVersion(AXIOS_LIKE, "latest")).toBeNull();
    expect(earlierVersion(AXIOS_LIKE, "9.9.9")).toBeNull();
  });

  it("Feature: new-signals, Property 6: Earlier version", () => {
    // Validates: Requirements 1.2, 1.6, 2.1
    const versionArb = fc.tuple(fc.nat(3), fc.nat(3), fc.nat(3)).map(([a, b, c]) => `${a}.${b}.${c}`);
    const docArb = fc
      .uniqueArray(fc.tuple(versionArb, fc.integer({ min: 0, max: 1000 })), { selector: ([v]) => v, maxLength: 12 })
      .map((entries) => ({
        time: Object.fromEntries(entries.map(([v, d]) => [v, new Date(Date.UTC(2026, 0, 1) + d * 3_600_000).toISOString()])),
        versions: Object.fromEntries(entries.map(([v]) => [v, {}])),
      }));
    fc.assert(
      fc.property(docArb, versionArb, (doc, installed) => {
        const result = earlierVersion(doc, installed);
        const all = publishedVersions(doc);
        const current = all.find((v) => v.version === installed);
        const qualifying =
          current === undefined ? [] : all.filter((v) => v.publishMs < current.publishMs && semver.lt(v.version, installed));
        if (qualifying.length === 0) {
          expect(result).toBeNull();
          return;
        }
        expect(result).not.toBeNull();
        if (result === null || current === undefined) return;
        expect(result.publishMs).toBeLessThan(current.publishMs);
        expect(semver.lt(result.version, installed)).toBe(true);
        for (const q of qualifying) expect(semver.gt(q.version, result.version)).toBe(false);
      }),
      { numRuns: 100 },
    );
  });
});

describe("publisherChangeValue", () => {
  it("records a trusted publisher to token change with both names, methods and times (1.2, 1.4)", () => {
    expect(publisherChangeValue(AXIOS_LIKE, "1.14.1")).toEqual({
      status: "changed",
      installed: { version: "1.14.1", publisher: "someone", method: "token", publishTime: "2026-03-31T00:21:58.168Z" },
      earlier: { version: "1.14.0", publisher: "GitHub Actions", method: "trusted-publisher", publishTime: "2026-03-27T19:01:40.915Z" },
    });
  });

  it("is same for two trusted publishes (1.3)", () => {
    expect(publisherChangeValue(AXIOS_LIKE, "1.14.0").status).toBe("same");
  });

  it("is unknown when a name is missing, and the method is unknown without _npmUser (1.5)", () => {
    const doc = structuredClone(AXIOS_LIKE) as { versions: Record<string, Record<string, unknown>> };
    doc.versions["1.14.0"] = {};
    const v = publisherChangeValue(doc, "1.14.1");
    expect(v.status).toBe("unknown");
    if (v.status !== "no-earlier-version") expect(v.earlier).toMatchObject({ publisher: null, method: "unknown" });
  });

  it("treats a non-object trustedPublisher as a token and an empty name as no name", () => {
    const doc = structuredClone(AXIOS_LIKE) as { versions: Record<string, Record<string, unknown>> };
    doc.versions["1.14.1"] = { _npmUser: { name: "", trustedPublisher: "yes" } };
    const v = publisherChangeValue(doc, "1.14.1");
    if (v.status === "no-earlier-version") throw new Error("expected a comparison");
    expect(v.installed).toMatchObject({ publisher: null, method: "token" });
  });

  it("gives no-earlier-version with the installed record for the first version (1.6)", () => {
    expect(publisherChangeValue(AXIOS_LIKE, "1.13.6")).toEqual({
      status: "no-earlier-version",
      installed: { version: "1.13.6", publisher: "GitHub Actions", method: "trusted-publisher", publishTime: "2026-02-27T15:35:51.983Z" },
    });
    expect(publisherChangeValue(AXIOS_LIKE, "2.0.0")).toEqual({ status: "no-earlier-version", installed: null });
  });

  it("Feature: new-signals, Property 4 (publisher half) and Property 8: never throws, deterministic", () => {
    // Validates: Requirements 1.8
    fc.assert(
      fc.property(fc.jsonValue(), fc.string(), (doc, version) => {
        const a = publisherChangeValue(doc, version);
        expect(publisherChangeValue(doc, version)).toEqual(a);
      }),
      { numRuns: 100 },
    );
    fc.assert(
      fc.property(fc.anything(), fc.constantFrom("1.14.0", "1.14.1"), (user, version) => {
        const doc = structuredClone(AXIOS_LIKE) as { versions: Record<string, Record<string, unknown>> };
        doc.versions[version] = { _npmUser: user };
        expect(() => publisherChangeValue(doc, "1.14.1")).not.toThrow();
      }),
      { numRuns: 100 },
    );
  });

  it("Feature: new-signals, Property 2 (publisher half): equal _npmUser never gives changed", () => {
    // Validates: Requirements 3.7
    const userArb = fc.option(
      fc.record({ name: fc.string({ maxLength: 8 }), trustedPublisher: fc.option(fc.constant({ id: "github" }), { nil: undefined }) }, { requiredKeys: [] }),
      { nil: undefined },
    );
    fc.assert(
      fc.property(userArb, (user) => {
        const doc = {
          time: { "1.0.0": "2026-01-01T00:00:00.000Z", "1.0.1": "2026-01-02T00:00:00.000Z" },
          versions: { "1.0.0": user === undefined ? {} : { _npmUser: user }, "1.0.1": user === undefined ? {} : { _npmUser: structuredClone(user) } },
        };
        expect(["same", "unknown"]).toContain(publisherChangeValue(doc, "1.0.1").status);
      }),
      { numRuns: 1000 },
    );
  });
});
