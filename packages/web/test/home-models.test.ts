// Spec clean-site, design C3 and C4: the headline (2.1 to 2.3), the counts (2.4), the notices (2.13 to 2.15) and the
// List rows (Property 5: 6.2 to 6.7, 6.11, 6.14).
import type { PackageHealth, PackageTimeline, ScanResponse, State } from "@sexton/api";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { countsAt, headline } from "../src/home/headline.js";
import { listRows, NOTHING_TO_DO, type ListSort } from "../src/home/list-rows.js";
import { NO_LOCKFILE_NOTICE, notices } from "../src/home/notices.js";
import { STATES } from "../src/load/lists.js";
import { hasGhost } from "../src/scene/layout.js";
import { formAt, timelineOf } from "../src/time/form-at.js";
import { triageOrder } from "../src/triage/triage.js";
import { arbTriagePackages, cheapScan } from "./arbitraries.js";
import { readDemoScan } from "./support/demo-scan.js";
import { arbTimeline, DAY, T0 } from "./support/timelines.js";

const counts = (c: Partial<Record<State, number>>) => ({ Possessed: 0, Dead: 0, Haunted: 0, Restless: 0, Alive: 0, ...c });
const join = (h: { count: string | null; text: string }) => `${h.count ?? ""}${h.text}`;

describe("headline", () => {
  it("counts only Possessed packages at the scan date (2.1, 2.2)", () => {
    expect(headline(counts({ Possessed: 1, Dead: 5 }), 12, null)).toEqual({ count: "1", text: " of 12 dependencies needs you now." });
    expect(join(headline(counts({ Possessed: 3 }), 12, null))).toBe("3 of 12 dependencies need you now.");
    expect(headline(counts({ Dead: 5 }), 12, null)).toEqual({ count: null, text: "Nothing needs you now." });
  });

  it("speaks in the past at an earlier date (2.3)", () => {
    expect(join(headline(counts({ Possessed: 1 }), 4, "12 Aug 2026"))).toBe("1 of 4 dependencies needed you on 12 Aug 2026.");
    expect(join(headline(counts({}), 4, "12 Aug 2026"))).toBe("Nothing needed you on 12 Aug 2026.");
  });

  it("reads 1 of 12 on the Sample scan", () => {
    const demo = readDemoScan() as ScanResponse;
    const { counts: c, total } = countsAt(demo, null);
    expect(join(headline(c, total, null))).toBe("1 of 12 dependencies needs you now.");
    expect(c).toEqual({ Possessed: 1, Dead: 5, Haunted: 1, Restless: 3, Alive: 2 });
  });

  it("counts only the packages published at an earlier date", () => {
    const response = { ...cheapScan(2), timelines: {} } as ScanResponse;
    const [a] = response.report.packages as [PackageHealth, PackageHealth];
    const late: PackageTimeline = { installed: "1.0.0", coveredFrom: null, segments: [{ from: new Date(T0 + 10 * DAY).toISOString(), state: "Dead", reason: "r", ghost: false }] };
    const withTimeline = { ...response, timelines: { [a.name]: late } } as ScanResponse;
    // pkg-0 (Possessed at the scan date) is not published before day 10; pkg-1 has no timeline and stays Dead.
    expect(countsAt(withTimeline, T0)).toEqual({ counts: counts({ Dead: 1 }), total: 1 });
    expect(countsAt(withTimeline, T0 + 20 * DAY)).toEqual({ counts: counts({ Dead: 2 }), total: 2 });
    expect(countsAt(withTimeline, null)).toEqual({ counts: counts({ Possessed: 1, Dead: 1 }), total: 2 });
  });
});

function withScan(scan: Record<string, unknown>, size = 3): ScanResponse {
  const base = cheapScan(size);
  return { ...base, report: { ...base.report, scan: { repo: { url: "https://github.com/a/b" }, unlocked: false, unlockedPackages: [], capped: false, totalDirect: size, ...scan } } } as unknown as ScanResponse;
}

describe("notices", () => {
  it("shows the lockfile, ranges and capped notices (2.13 to 2.15)", () => {
    expect(notices(cheapScan(1))).toEqual([]);
    expect(notices(withScan({}))).toEqual([]);
    expect(notices(withScan({ unlocked: true, unlockedPackages: ["a"] }))).toEqual([NO_LOCKFILE_NOTICE]);
    expect(notices(withScan({ unlockedPackages: ["a"] }))).toEqual(["1 package was resolved from package.json ranges: a"]);
    expect(notices(withScan({ unlockedPackages: ["a", "b", "c", "d", "e", "f", "g"] }))).toEqual([
      "7 packages were resolved from package.json ranges: a, b, c, d, e and 2 more",
    ]);
    expect(notices(withScan({ capped: true, totalDirect: 400 }))).toEqual(["Showing 3 of 400 direct dependencies."]);
  });
});

const QUERIES = ["", " ", "a", "B", " c ", "a-", "zz", "@a/"];
const arbListCase = arbTriagePackages(30).chain((packages) =>
  fc.record({
    packages: fc.constant(packages),
    timelines: fc.array(fc.option(arbTimeline({ versioned: "mixed" }), { nil: null }), { minLength: packages.length, maxLength: packages.length }),
    query: fc.constantFrom(...QUERIES),
    sort: fc.constantFrom<ListSort>("state", "name"),
    filter: fc.option(fc.constantFrom<State>(...STATES), { nil: null }),
    at: fc.option(fc.integer({ min: 0, max: 5000 }).map((d) => T0 + d * DAY), { nil: null }),
  }),
);

describe("Feature: clean-site, Property 5: The List shows each matching package once, in order", () => {
  it("returns exactly the published, matching packages of the filter, once each, by name or by triage order", () => {
    fc.assert(
      fc.property(arbListCase, ({ packages, timelines, query, sort, filter, at }) => {
        const record: Record<string, PackageTimeline> = {};
        packages.forEach((p, i) => {
          const t = timelines[i];
          if (t !== null && t !== undefined) record[p.name] = t;
        });
        const response = { ...cheapScan(0), report: { generatedAt: "2026-11-12T00:00:00.000Z", packages }, timelines: record } as ScanResponse;
        const rows = listRows(response, { query, sort, filter, at });
        const q = query.trim().toLowerCase();
        const stateOf = (p: PackageHealth) =>
          at === null ? p.state : formAt(timelineOf(response, p.name), at, { state: p.state, reason: p.stateReason, ghost: hasGhost(p) }).state;
        const ordered = sort === "name" ? [...packages].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)) : triageOrder(packages);
        const expected = ordered.filter((p) => {
          const s = stateOf(p);
          return s !== null && p.name.toLowerCase().includes(q) && (filter === null || s === filter);
        });
        expect(rows.map((r) => r.name)).toEqual(expected.map((p) => p.name));
        expect(new Set(rows.map((r) => r.name)).size).toBe(rows.length);
        for (const row of rows) {
          const pkg = packages.find((p) => p.name === row.name) as PackageHealth;
          expect(row.state).toBe(stateOf(pkg));
        }
      }),
      { numRuns: 100 },
    );
  });

  it("holds at 300 packages", () => {
    const big = cheapScan(300);
    expect(listRows(big, { query: "", sort: "state", filter: null, at: null })).toHaveLength(300);
    expect(listRows(big, { query: "PKG-29", sort: "name", filter: null, at: null }).map((r) => r.name)).toEqual(
      ["pkg-29", ...Array.from({ length: 10 }, (_, i) => `pkg-29${String(i)}`)],
    );
    expect(listRows(big, { query: "", sort: "state", filter: "Dead", at: null })).toHaveLength(60);
  });
});

describe("list rows examples", () => {
  it("writes the Why and Fix cells of the Sample scan (6.14)", () => {
    const demo = readDemoScan() as ScanResponse;
    const rows = listRows(demo, { query: "", sort: "state", filter: null, at: null });
    expect(rows[0]).toEqual({ name: "left-padder", version: rows[0]?.version, state: "Possessed", why: "A maintainer of this package changed in the last 90 days.", fix: "Review the maintainer change" });
    const lodash = rows.find((r) => r.name === "lodash");
    expect(lodash).toMatchObject({ state: "Haunted", why: "A High or Critical advisory is open.", fix: "Bump to 4.18.1" });
    expect(rows.find((r) => r.name === "react")?.fix).toBe(NOTHING_TO_DO);
    expect(rows.find((r) => r.name === "node-sass")?.fix).toBe("Migrate to sass");
  });

  it("leaves out a package not published at the date and shows its Segment's version", () => {
    const response = { ...cheapScan(1), timelines: {} } as ScanResponse;
    const name = response.report.packages[0]?.name ?? "";
    const timeline: PackageTimeline = {
      installed: "1.0.0",
      coveredFrom: null,
      segments: [{ from: new Date(T0 + DAY).toISOString(), state: "Alive", reason: "no rule matched", ghost: false, version: "0.9.0" }],
    };
    const r = { ...response, timelines: { [name]: timeline } } as ScanResponse;
    expect(listRows(r, { query: "", sort: "state", filter: null, at: T0 })).toEqual([]);
    expect(listRows(r, { query: "", sort: "state", filter: null, at: T0 + 2 * DAY })).toMatchObject([{ version: "0.9.0", state: "Alive", why: "No rule matched. Nothing to do." }]);
  });
});
