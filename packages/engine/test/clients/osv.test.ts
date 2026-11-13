// OSV client. Requirement 6.

import { describe, expect, it } from "vitest";
import { fetchAdvisoriesSignal, OSV_MAX_PAGES, queryVulnIds } from "../../src/clients/osv.js";
import { makeContext, routedTransport, type Route } from "../helpers.js";

const QB = "https://api.osv.dev/v1/querybatch";
const body = (version: string, token?: string) =>
  JSON.stringify({ queries: [{ package: { name: "x", ecosystem: "npm" }, version, ...(token === undefined ? {} : { page_token: token }) }] });

const vuln = (id: string, severity: string) => ({
  url: `https://api.osv.dev/v1/vulns/${id}`,
  json: { id, summary: `${id} summary`, database_specific: { severity }, severity: [{ type: "CVSS_V3", score: "CVSS:3.1/AV:N" }] },
});

describe("queryVulnIds", () => {
  it("collects ids and follows next_page_token (6.3)", async () => {
    const routes: Route[] = [
      { url: QB, body: body("1.0.0"), json: { results: [{ vulns: [{ id: "A" }], next_page_token: "t1" }] } },
      { url: QB, body: body("1.0.0", "t1"), json: { results: [{ vulns: [{ id: "B" }, { id: "C" }] }] } },
    ];
    const { transport, calls } = routedTransport(routes);
    expect(await queryVulnIds(makeContext(transport), "x", "1.0.0")).toEqual(["A", "B", "C"]);
    expect(calls).toHaveLength(2);
  });

  it("stops after ten pages", async () => {
    const routes: Route[] = Array.from({ length: 20 }, (_, i) => ({
      url: QB,
      body: body("1.0.0", i === 0 ? undefined : `t${i}`),
      json: { results: [{ vulns: [{ id: `V${i}` }], next_page_token: `t${i + 1}` }] },
    }));
    const { transport, calls } = routedTransport(routes);
    const ids = await queryVulnIds(makeContext(transport), "x", "1.0.0");
    expect(ids).toHaveLength(OSV_MAX_PAGES);
    expect(calls).toHaveLength(OSV_MAX_PAGES);
  });
});

describe("fetchAdvisoriesSignal", () => {
  it("returns normalised advisories (6.1, 6.2)", async () => {
    const { transport } = routedTransport([
      { url: QB, body: body("1.0.0"), json: { results: [{ vulns: [{ id: "GHSA-1" }, { id: "MAL-2" }] }] } },
      vuln("GHSA-1", "HIGH"),
      vuln("MAL-2", "nonsense"),
    ]);
    const r = await fetchAdvisoriesSignal(makeContext(transport), "x", "1.0.0");
    expect(r.available).toBe(true);
    expect(r.value).toEqual([
      { id: "GHSA-1", severity: "High", summary: "GHSA-1 summary" },
      { id: "MAL-2", severity: "Unknown", summary: "MAL-2 summary" },
    ]);
  });

  it("empty result is an available empty list (6.4)", async () => {
    const { transport } = routedTransport([{ url: QB, body: body("1.0.0"), json: { results: [{}] } }]);
    expect(await fetchAdvisoriesSignal(makeContext(transport), "x", "1.0.0")).toMatchObject({ available: true, value: [] });
  });

  it("a failed detail fetch marks the whole signal unavailable (6.5)", async () => {
    const { transport } = routedTransport([
      { url: QB, body: body("1.0.0"), json: { results: [{ vulns: [{ id: "GHSA-1" }, { id: "GHSA-2" }] }] } },
      vuln("GHSA-1", "LOW"),
    ]);
    expect(await fetchAdvisoriesSignal(makeContext(transport), "x", "1.0.0")).toMatchObject({ available: false, reason: "HTTP 404" });
  });

  it("a 503 on querybatch retries then marks unavailable (9.2, 9.4)", async () => {
    const { transport, calls } = routedTransport([{ url: QB, status: 503, json: {} }]);
    expect(await fetchAdvisoriesSignal(makeContext(transport), "x", "1.0.0")).toMatchObject({ available: false, reason: "HTTP 503" });
    expect(calls).toHaveLength(4);
  });
});
