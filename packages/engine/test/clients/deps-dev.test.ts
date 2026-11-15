// deps.dev GetDependencies client. Requirements 3.1, 3.6, 3.8.

import { describe, expect, it } from "vitest";
import { dependenciesUrl, fetchDependencyGraph, parseDependencyGraph } from "../../src/clients/deps-dev.js";
import type { Transport } from "../../src/http.js";
import { makeContext, NOW, routedTransport } from "../helpers.js";

const URL_X = "https://api.deps.dev/v3/systems/npm/packages/x/versions/1.0.0:dependencies";

function node(name: string, version: string, relation = "DIRECT"): unknown {
  return { versionKey: { system: "NPM", name, version }, relation };
}

const GRAPH_BODY = {
  nodes: [node("x", "1.0.0", "SELF"), node("a", "2.0.0"), node("b", "3.0.0", "INDIRECT"), node("b", "3.1.0", "INDIRECT")],
  edges: [
    { fromNode: 0, toNode: 1, requirement: "^2.0.0" },
    { fromNode: 1, toNode: 2, requirement: "^3.0.0" },
    { fromNode: 0, toNode: 3, requirement: "^3.1.0" },
  ],
};

describe("dependenciesUrl", () => {
  it("builds an unscoped URL", () => {
    expect(dependenciesUrl("x", "1.0.0")).toBe(URL_X);
  });

  it("percent-encodes a scoped name and the version", () => {
    expect(dependenciesUrl("@colors/colors", "1.0.0-beta.1+b")).toBe(
      "https://api.deps.dev/v3/systems/npm/packages/%40colors%2Fcolors/versions/1.0.0-beta.1%2Bb:dependencies",
    );
  });
});

describe("parseDependencyGraph", () => {
  it("maps node indexes to distinct names and name pairs", () => {
    const graph = parseDependencyGraph(GRAPH_BODY);
    expect(graph).not.toBeNull();
    expect([...(graph?.names ?? [])].sort()).toEqual(["a", "b", "x"]);
    expect(graph?.edges).toEqual([
      ["x", "a"],
      ["a", "b"],
      ["x", "b"],
    ]);
  });

  it("drops edges with out-of-range or non-integer indexes", () => {
    const graph = parseDependencyGraph({
      nodes: [node("x", "1.0.0"), node("a", "1.0.0")],
      edges: [
        { fromNode: 0, toNode: 5 },
        { fromNode: -1, toNode: 1 },
        { fromNode: 0.5, toNode: 1 },
        { fromNode: "0", toNode: 1 },
        { fromNode: 0 },
        null,
        { fromNode: 0, toNode: 1 },
      ],
    });
    expect(graph?.edges).toEqual([["x", "a"]]);
  });

  it("drops self edges", () => {
    const graph = parseDependencyGraph({
      nodes: [node("x", "1.0.0"), node("x", "1.0.1")],
      edges: [{ fromNode: 0, toNode: 0 }, { fromNode: 0, toNode: 1 }],
    });
    expect(graph?.edges).toEqual([]);
    expect(graph?.names).toEqual(["x"]);
  });

  it("returns null when the body is not an object with a nodes array", () => {
    expect(parseDependencyGraph(null)).toBeNull();
    expect(parseDependencyGraph("x")).toBeNull();
    expect(parseDependencyGraph([])).toBeNull();
    expect(parseDependencyGraph({})).toBeNull();
    expect(parseDependencyGraph({ nodes: "no" })).toBeNull();
  });

  it("tolerates a missing edges field", () => {
    expect(parseDependencyGraph({ nodes: [node("x", "1.0.0")] })).toEqual({ names: ["x"], edges: [] });
  });
});

describe("fetchDependencyGraph", () => {
  it("returns ok with the package's own request URL as source (3.1)", async () => {
    const { transport, calls } = routedTransport([{ url: URL_X, json: GRAPH_BODY }]);
    const result = await fetchDependencyGraph(makeContext(transport), "x", "1.0.0");
    expect(result.ok).toBe(true);
    expect(result.source).toBe(URL_X);
    expect(result.fetchedAt).toBe(NOW.toISOString());
    if (result.ok) expect(result.graph.edges).toHaveLength(3);
    expect(calls).toHaveLength(1);
  });

  it("uses the encoded URL for a scoped package", async () => {
    const url = dependenciesUrl("@colors/colors", "1.0.0");
    const { transport, calls } = routedTransport([{ url, json: GRAPH_BODY }]);
    const result = await fetchDependencyGraph(makeContext(transport), "@colors/colors", "1.0.0");
    expect(result).toMatchObject({ ok: true, source: url });
    expect(calls[0]?.url).toBe(url);
  });

  it("retries a 429 and then succeeds", async () => {
    let count = 0;
    const transport: Transport = () => {
      count += 1;
      return Promise.resolve(
        count === 1
          ? { status: 429, json: () => Promise.resolve({}) }
          : { status: 200, json: () => Promise.resolve(GRAPH_BODY) },
      );
    };
    const result = await fetchDependencyGraph(makeContext(transport), "x", "1.0.0");
    expect(result.ok).toBe(true);
    expect(count).toBe(2);
  });

  it("429 on every attempt gives ok:false after three retries (3.6)", async () => {
    const { transport, calls } = routedTransport([{ url: URL_X, status: 429, json: {} }]);
    const result = await fetchDependencyGraph(makeContext(transport), "x", "1.0.0");
    expect(result).toMatchObject({ ok: false, reason: "HTTP 429", source: URL_X });
    expect(calls).toHaveLength(4);
  });

  it("a non-2xx status gives ok:false with the request URL as source (3.1, 3.6)", async () => {
    const { transport } = routedTransport([{ url: URL_X, status: 500, json: {} }]);
    const result = await fetchDependencyGraph(makeContext(transport), "x", "1.0.0");
    expect(result).toMatchObject({ ok: false, reason: "HTTP 500", source: URL_X });
  });

  it("an unrouted 404 gives ok:false", async () => {
    const { transport } = routedTransport([]);
    const result = await fetchDependencyGraph(makeContext(transport), "x", "1.0.0");
    expect(result).toMatchObject({ ok: false, reason: "HTTP 404", source: URL_X });
  });

  it("a thrown transport error gives ok:false and does not throw (3.6)", async () => {
    const transport: Transport = () => Promise.reject(new Error("socket hang up"));
    const result = await fetchDependencyGraph(makeContext(transport), "x", "1.0.0");
    expect(result.ok).toBe(false);
    expect(result.source).toBe(URL_X);
    if (!result.ok) expect(result.reason).toMatch(/^no status received: /);
  });

  it("a 200 with a malformed body gives ok:false and is not cached (3.8)", async () => {
    let good = false;
    const calls: string[] = [];
    const transport: Transport = (url) => {
      calls.push(url);
      return Promise.resolve({ status: 200, json: () => Promise.resolve(good ? GRAPH_BODY : { nope: true }) });
    };
    const ctx = makeContext(transport);
    const first = await fetchDependencyGraph(ctx, "x", "1.0.0");
    expect(first).toMatchObject({ ok: false, reason: "malformed deps.dev graph body", source: URL_X });
    good = true;
    const second = await fetchDependencyGraph(ctx, "x", "1.0.0");
    expect(second.ok).toBe(true);
    expect(calls).toHaveLength(2);
  });

  it("an unparseable JSON body gives ok:false", async () => {
    const transport: Transport = () => Promise.resolve({ status: 200, json: () => Promise.reject(new SyntaxError("bad json")) });
    const result = await fetchDependencyGraph(makeContext(transport), "x", "1.0.0");
    expect(result).toMatchObject({ ok: false, reason: "malformed deps.dev graph body" });
  });

  it("a failed status is not cached, so a later call refetches", async () => {
    let fail = true;
    let count = 0;
    const transport: Transport = () => {
      count += 1;
      return Promise.resolve(
        fail ? { status: 500, json: () => Promise.resolve({}) } : { status: 200, json: () => Promise.resolve(GRAPH_BODY) },
      );
    };
    const ctx = makeContext(transport);
    expect((await fetchDependencyGraph(ctx, "x", "1.0.0")).ok).toBe(false);
    fail = false;
    expect((await fetchDependencyGraph(ctx, "x", "1.0.0")).ok).toBe(true);
    expect(count).toBe(2);
  });

  it("a parsed graph is cached: two calls inside the TTL make one request", async () => {
    const { transport, calls } = routedTransport([{ url: URL_X, json: GRAPH_BODY }]);
    const ctx = makeContext(transport);
    const a = await fetchDependencyGraph(ctx, "x", "1.0.0");
    const b = await fetchDependencyGraph(ctx, "x", "1.0.0");
    expect(calls).toHaveLength(1);
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) expect(b.graph).toEqual(a.graph);
  });
});
