// Maintainers signal client. Requirements 1.2 to 1.7.

import { describe, expect, it } from "vitest";
import { extractMaintainers, fetchMaintainersSignal } from "../../src/clients/maintainers.js";
import { fetchPackumentSignals, packumentUrl } from "../../src/clients/npm.js";
import type { Transport } from "../../src/http.js";
import { makeContext, NOW, routedTransport } from "../helpers.js";

const URL_X = packumentUrl("x");

function packument(maintainers?: unknown): unknown {
  return {
    name: "x",
    ...(maintainers === undefined ? {} : { maintainers }),
    time: { created: "2020-01-01T00:00:00.000Z", "1.0.0": "2020-01-01T00:00:00.000Z" },
    versions: { "1.0.0": {} },
  };
}

describe("fetchMaintainersSignal", () => {
  it("reuses the full packument already read: one upstream call (1.2)", async () => {
    const { transport, calls } = routedTransport([
      { url: URL_X, accept: "application/json", json: packument([{ name: "alice" }]) },
    ]);
    const ctx = makeContext(transport);
    await fetchPackumentSignals(ctx, "x", "1.0.0");
    const signal = await fetchMaintainersSignal(ctx, "x");
    expect(signal.available).toBe(true);
    expect(calls.filter((c) => c.url === URL_X)).toHaveLength(1);
  });

  it("returns names with the packument URL and an ISO UTC time (1.3)", async () => {
    const { transport } = routedTransport([
      { url: URL_X, accept: "application/json", json: packument([{ name: "alice" }, { name: "bob" }]) },
    ]);
    const signal = await fetchMaintainersSignal(makeContext(transport), "x");
    expect(signal).toEqual({
      value: ["alice", "bob"],
      source: URL_X,
      fetchedAt: NOW.toISOString(),
      available: true,
    });
    expect(signal.fetchedAt).toMatch(/Z$/);
  });

  it("a missing maintainers field gives an available empty list (1.4)", async () => {
    const { transport } = routedTransport([{ url: URL_X, accept: "application/json", json: packument() }]);
    const signal = await fetchMaintainersSignal(makeContext(transport), "x");
    expect(signal).toMatchObject({ available: true, value: [], source: URL_X });
  });

  it("a 500 after retries gives an unavailable signal with a reason (1.5)", async () => {
    const { transport } = routedTransport([{ url: URL_X, status: 500, json: {} }]);
    const signal = await fetchMaintainersSignal(makeContext(transport), "x");
    expect(signal).toMatchObject({ available: false, value: null, source: URL_X, fetchedAt: NOW.toISOString() });
    expect(signal.available ? "" : signal.reason).toBe("HTTP 500");
  });

  it("a thrown transport error gives an unavailable signal and does not throw (1.5)", async () => {
    const transport: Transport = () => Promise.reject(new Error("socket hang up"));
    const signal = await fetchMaintainersSignal(makeContext(transport), "x");
    expect(signal.available).toBe(false);
    expect(signal.source).toBe(URL_X);
    if (!signal.available) expect(signal.reason.length).toBeGreaterThan(0);
  });
});

describe("extractMaintainers", () => {
  it("drops entries without a usable name (1.6)", () => {
    const doc = {
      maintainers: [{ name: "alice" }, {}, { name: "" }, { name: 5 }, null, "bob", [], { email: "e@x" }, { name: "carol" }],
    };
    expect(extractMaintainers(doc)).toEqual(["alice", "carol"]);
  });

  it("removes duplicates and keeps first-appearance position (1.7)", () => {
    const doc = { maintainers: [{ name: "b" }, { name: "a" }, { name: "b" }, { name: "c" }, { name: "a" }] };
    expect(extractMaintainers(doc)).toEqual(["b", "a", "c"]);
  });

  it("gives equal lists in the same order on repeated calls", () => {
    const doc = { maintainers: [{ name: "z" }, { name: "y" }, { name: "z" }] };
    expect(extractMaintainers(doc)).toEqual(extractMaintainers(doc));
  });

  it("returns [] for malformed input", () => {
    expect(extractMaintainers(null)).toEqual([]);
    expect(extractMaintainers("x")).toEqual([]);
    expect(extractMaintainers([])).toEqual([]);
    expect(extractMaintainers({})).toEqual([]);
    expect(extractMaintainers({ maintainers: "alice" })).toEqual([]);
    expect(extractMaintainers({ maintainers: { name: "alice" } })).toEqual([]);
  });
});
