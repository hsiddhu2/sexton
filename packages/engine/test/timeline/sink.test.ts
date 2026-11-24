// Spec cemetery-time, tasks 3.2 and 3.5 (review notes). The timeline sink, fetchAdvisoryPublished,
// prototype-key safety and the reason clip. No network.

import { describe, expect, it } from "vitest";
import { fetchAdvisoryPublished } from "../../src/clients/osv.js";
import { scorePackages, type TimelineSinkInput } from "../../src/score.js";
import { buildTimeline } from "../../src/timeline/build.js";
import { timelineFacts } from "../../src/timeline/facts.js";
import { fixtureRoutes, makeContext, NOW, routedTransport } from "../helpers.js";
import { facts, healthOf, SCAN, version } from "./support.js";

const PACKAGES = [
  { name: "left-pad", installedVersion: "1.3.0" },
  { name: "semver", installedVersion: "7.8.6" },
];

async function score(sink?: (input: TimelineSinkInput) => void) {
  const { transport, calls } = routedTransport(PACKAGES.flatMap((p) => fixtureRoutes(p.name, p.installedVersion)));
  const report = await scorePackages(PACKAGES, {
    transport,
    clock: () => NOW,
    retry: { sleep: () => Promise.resolve() },
    ...(sink === undefined ? {} : { timelineSink: sink }),
  });
  return { report, calls: calls.length };
}

describe("timelineSink", () => {
  it("is called once per package and adds no request", async () => {
    const seen: TimelineSinkInput[] = [];
    const withSink = await score((input) => seen.push(input));
    const without = await score();
    expect(seen.map((s) => s.name).sort()).toEqual(["left-pad", "semver"]);
    expect(seen.every((s) => s.fullPackument !== null && s.abbreviatedPackument !== null)).toBe(true);
    expect(withSink.calls).toBe(without.calls);
    expect(withSink.report).toEqual(without.report);
  });

  it("leaves scoring unchanged when the sink throws", async () => {
    const throwing = await score(() => {
      throw new Error("boom");
    });
    expect(throwing.report).toEqual((await score()).report);
  });
});

describe("fetchAdvisoryPublished", () => {
  const url = "https://api.osv.dev/v1/vulns/GHSA-aaaa";
  const run = (route: { status?: number; json: unknown }) =>
    fetchAdvisoryPublished(makeContext(routedTransport([{ url, ...route }]).transport), "GHSA-aaaa");

  it("returns the published time as ISO", async () => {
    expect(await run({ json: { published: "2024-05-01T10:00:00Z" } })).toBe("2024-05-01T10:00:00.000Z");
  });

  it("returns null for a missing or unparseable time and for a failed read", async () => {
    expect(await run({ json: {} })).toBeNull();
    expect(await run({ json: { published: "not a date" } })).toBeNull();
    expect(await run({ json: { published: 5 } })).toBeNull();
    expect(await run({ status: 404, json: {} })).toBeNull();
  });
});

describe("timelineFacts prototype keys", () => {
  it("reads __proto__, constructor and toString as plain version names", () => {
    const time = JSON.parse(
      '{"created":"2020-01-01T00:00:00Z","__proto__":"2020-02-01T00:00:00Z","constructor":"2020-03-01T00:00:00Z","toString":"2020-04-01T00:00:00Z"}',
    ) as unknown;
    const out = timelineFacts({
      fullPackument: { time, versions: {} },
      abbreviatedPackument: null,
      installed: "toString",
      provenance: null,
      advisories: null,
      advisoryDates: new Map(),
      scanDate: SCAN,
    });
    expect(out.versions.map((v) => v.version)).toEqual(["__proto__", "constructor", "toString"]);
    expect(Object.getPrototypeOf({}) as unknown).toBe(Object.prototype);
  });

  it("treats a maintainer list of more than 10 names or of no names as unknown", () => {
    const many = Array.from({ length: 11 }, (_, i) => ({ name: `m${i}` }));
    const out = timelineFacts({
      fullPackument: {
        time: { "1.0.0": "2020-01-01T00:00:00Z", "1.1.0": "2020-02-01T00:00:00Z", "1.2.0": "2020-03-01T00:00:00Z" },
        versions: { "1.0.0": { maintainers: many }, "1.1.0": { maintainers: [] }, "1.2.0": { maintainers: [{ name: "a" }] } },
      },
      abbreviatedPackument: null,
      installed: "1.2.0",
      provenance: null,
      advisories: null,
      advisoryDates: new Map(),
      scanDate: SCAN,
    });
    expect(out.versions.map((v) => v.maintainers)).toEqual([null, null, ["a"]]);
  });
});

describe("buildTimeline reasons", () => {
  it("clips a long reason by code point within 200 characters", () => {
    const reason = "😀".repeat(150);
    const t = buildTimeline(facts([version("1.0.0", Date.UTC(2026, 0, 1))], "1.0.0"), healthOf("Alive", false, reason), SCAN);
    const last = t.segments[t.segments.length - 1];
    expect(last?.reason.length).toBeLessThanOrEqual(200);
    expect(last?.reason).toBe("😀".repeat(100));
  });
});
