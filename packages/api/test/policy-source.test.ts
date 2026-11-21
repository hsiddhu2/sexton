// sexton.policy.yml fetch. Spec: .kiro/specs/infra, Requirements 4.10 to 4.12.

import { CachedFetcher, MemoryCacheStore, type ClientContext, type Transport } from "@sexton/engine";
import { describe, expect, it } from "vitest";
import { fetchPolicyText, MAX_POLICY_BYTES, policyUrl } from "../src/policy-source.js";
import { routedTransport, type Route } from "./support/fixture-transport.js";

const URL = "https://raw.githubusercontent.com/o/r/HEAD/sexton.policy.yml";
const REPO = { owner: "o", repo: "r" };

function ctx(transport: Transport, store = new MemoryCacheStore()): ClientContext {
  const clock = () => new Date("2026-11-20T00:00:00Z");
  return { transport, clock, cache: new CachedFetcher({ store, clock }), retry: { sleep: () => Promise.resolve() } };
}

function run(route: Omit<Route, "url">) {
  const routed = routedTransport([{ url: URL, ...route }]);
  return { ...routed, ctx: ctx(routed.transport) };
}

describe("fetchPolicyText", () => {
  it("returns found with the text, and sends no auth or cookie header", async () => {
    const r = run({ text: "version: 1\n" });
    expect(await fetchPolicyText(r.ctx, REPO)).toEqual({ kind: "found", text: "version: 1\n" });
    expect(r.calls).toHaveLength(1);
    const names = Object.keys(r.calls[0]?.request.headers ?? {}).map((h) => h.toLowerCase());
    expect(names).not.toContain("authorization");
    expect(names).not.toContain("cookie");
  });

  it("returns absent for 404 and caches it", async () => {
    const store = new MemoryCacheStore();
    const routed = routedTransport([{ url: URL, status: 404, text: "" }]);
    expect(await fetchPolicyText(ctx(routed.transport, store), REPO)).toEqual({ kind: "absent" });
    expect(await fetchPolicyText(ctx(routed.transport, store), REPO)).toEqual({ kind: "absent" });
    expect(routed.calls).toHaveLength(1);
  });

  it("returns failed, uncached, for 500, 403, a network error, a body over 256 KiB, invalid UTF-8 and no text()", async () => {
    for (const route of [{ status: 500, text: "" }, { status: 403, text: "" }, { throws: new TypeError("network") }, { text: "a".repeat(MAX_POLICY_BYTES + 1) }]) {
      const store = new MemoryCacheStore();
      const r = routedTransport([{ url: URL, ...route }]);
      expect(await fetchPolicyText(ctx(r.transport, store), REPO)).toEqual({ kind: "failed" });
      expect(store.size).toBe(0);
    }
    const invalidUtf8: Transport = () => Promise.resolve({ status: 200, json: () => Promise.resolve(null), text: () => Promise.resolve({ ok: false, reason: "invalid-encoding" }) });
    expect(await fetchPolicyText(ctx(invalidUtf8), REPO)).toEqual({ kind: "failed" });
    const noText: Transport = () => Promise.resolve({ status: 200, json: () => Promise.resolve(null) });
    expect(await fetchPolicyText(ctx(noText), REPO)).toEqual({ kind: "failed" });
  });

  it("accepts exactly 256 KiB", async () => {
    expect((await fetchPolicyText(run({ text: "a".repeat(MAX_POLICY_BYTES) }).ctx, REPO)).kind).toBe("found");
  });

  it("retries 503 and then succeeds", async () => {
    let calls = 0;
    const transport: Transport = () => {
      calls += 1;
      return Promise.resolve({ status: calls === 1 ? 503 : 200, json: () => Promise.resolve(null), text: () => Promise.resolve({ ok: true, text: "x" }) });
    };
    expect(await fetchPolicyText(ctx(transport), REPO)).toEqual({ kind: "found", text: "x" });
    expect(calls).toBe(2);
  });

  it("makes no request for an invalid reference", async () => {
    const r = run({ text: "x" });
    for (const repo of [{ owner: "../x", repo: "r" }, { owner: "o", repo: "r.git" }, { owner: "o", repo: "a/b" }]) {
      expect(await fetchPolicyText(r.ctx, repo)).toEqual({ kind: "failed" });
    }
    expect(r.calls).toHaveLength(0);
  });
});

describe("policyUrl", () => {
  it("builds the one URL shape and throws for an invalid reference", () => {
    expect(policyUrl(REPO)).toBe(URL);
    expect(() => policyUrl({ owner: "o", repo: "r?x" })).toThrow();
  });
});
