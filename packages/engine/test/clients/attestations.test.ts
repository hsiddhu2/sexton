// npm attestations client. Requirement 2.

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { attestationsUrl, fetchProvenanceSignal, parseAttestations, SLSA_PROVENANCE_PREDICATE } from "../../src/clients/attestations.js";
import type { Transport } from "../../src/http.js";
import { makeContext, routedTransport } from "../helpers.js";

const NPM_PUBLISH_PREDICATE = "https://github.com/npm/attestation/tree/main/specs/publish/v0.1";
const URL_X = "https://registry.npmjs.org/-/npm/v1/attestations/x@1.0.0";
const SLSA_BODY = { attestations: [{ predicateType: NPM_PUBLISH_PREDICATE }, { predicateType: SLSA_PROVENANCE_PREDICATE }] };

describe("Property 11", () => {
  // Feature: history-signals, Property 11: Provenance present if and only if a slsa predicateType exists
  it("Feature: history-signals, Property 11: Provenance present if and only if a slsa predicateType exists", () => {
    const predicate = fc.option(
      fc.oneof(fc.constant(SLSA_PROVENANCE_PREDICATE), fc.constant(NPM_PUBLISH_PREDICATE), fc.string()),
      { nil: undefined },
    );
    const entry = predicate.map((p) => (p === undefined ? {} : { predicateType: p }));
    fc.assert(
      fc.property(fc.array(entry, { maxLength: 5 }), (entries) => {
        const parsed = parseAttestations({ attestations: entries });
        const expected = entries.some((e) => "predicateType" in e && e.predicateType === SLSA_PROVENANCE_PREDICATE);
        expect(parsed).not.toBeNull();
        expect(parsed?.present).toBe(expected);
        expect(parsed?.predicateType).toBe(expected ? SLSA_PROVENANCE_PREDICATE : null);
      }),
      { numRuns: 100 },
    );
  });
});

describe("parseAttestations", () => {
  it("returns null when the body is not an attestations document", () => {
    expect(parseAttestations(null)).toBeNull();
    expect(parseAttestations("x")).toBeNull();
    expect(parseAttestations({})).toBeNull();
    expect(parseAttestations({ attestations: "no" })).toBeNull();
  });
});

describe("attestationsUrl (2.1)", () => {
  it("builds unscoped and scoped URLs", () => {
    expect(attestationsUrl("x", "1.0.0")).toBe(URL_X);
    expect(attestationsUrl("@scope/pkg", "1.0.0-beta.1+b")).toBe(
      "https://registry.npmjs.org/-/npm/v1/attestations/@scope%2Fpkg@1.0.0-beta.1%2Bb",
    );
  });
});

describe("fetchProvenanceSignal", () => {
  it("200 with slsa is available and present (2.2, 2.8)", async () => {
    const { transport } = routedTransport([{ url: URL_X, json: SLSA_BODY }]);
    expect(await fetchProvenanceSignal(makeContext(transport), "x", "1.0.0")).toEqual({
      value: { present: true, predicateType: SLSA_PROVENANCE_PREDICATE },
      source: URL_X,
      fetchedAt: "2026-11-12T00:00:00.000Z",
      available: true,
    });
  });

  it("200 with no slsa is available and absent (2.3)", async () => {
    const { transport } = routedTransport([{ url: URL_X, json: { attestations: [{ predicateType: NPM_PUBLISH_PREDICATE }] } }]);
    const s = await fetchProvenanceSignal(makeContext(transport), "x", "1.0.0");
    expect(s).toMatchObject({ available: true, value: { present: false, predicateType: null }, source: URL_X });
  });

  it("404 is available with present false (2.4)", async () => {
    const { transport, calls } = routedTransport([]);
    const s = await fetchProvenanceSignal(makeContext(transport), "x", "1.0.0");
    expect(s).toMatchObject({ available: true, value: { present: false, predicateType: null }, source: URL_X });
    expect(calls).toHaveLength(1);
  });

  it("429 retries three times then is unavailable with the status (2.5)", async () => {
    const { transport, calls } = routedTransport([{ url: URL_X, status: 429, json: {} }]);
    const s = await fetchProvenanceSignal(makeContext(transport), "x", "1.0.0");
    expect(s).toMatchObject({ available: false, reason: "HTTP 429", source: URL_X });
    expect(calls).toHaveLength(4);
  });

  it("another status is unavailable with the status (2.5)", async () => {
    const { transport, calls } = routedTransport([{ url: URL_X, status: 500, json: {} }]);
    const s = await fetchProvenanceSignal(makeContext(transport), "x", "1.0.0");
    expect(s).toMatchObject({ available: false, reason: "HTTP 500", source: URL_X });
    expect(calls).toHaveLength(1);
  });

  it("a thrown transport error is unavailable with no status (2.6, 2.8)", async () => {
    const transport: Transport = () => Promise.reject(new Error("socket hang up"));
    const s = await fetchProvenanceSignal(makeContext(transport), "x", "1.0.0");
    expect(s).toMatchObject({ available: false, source: URL_X });
    expect(s.reason).toMatch(/^no status received: /);
  });

  it("a malformed body is unavailable (2.7, 2.8)", async () => {
    const { transport } = routedTransport([{ url: URL_X, json: { nope: true } }]);
    const s = await fetchProvenanceSignal(makeContext(transport), "x", "1.0.0");
    expect(s).toMatchObject({ available: false, reason: "malformed attestations body", source: URL_X });
  });

  it("an unparseable JSON body is unavailable (2.7)", async () => {
    const transport: Transport = () => Promise.resolve({ status: 200, json: () => Promise.reject(new SyntaxError("bad json")) });
    const s = await fetchProvenanceSignal(makeContext(transport), "x", "1.0.0");
    expect(s).toMatchObject({ available: false, reason: "malformed attestations body" });
  });

  it("two calls inside the TTL make one request with equal values (2.10)", async () => {
    const { transport, calls } = routedTransport([{ url: URL_X, json: SLSA_BODY }]);
    const ctx = makeContext(transport);
    const a = await fetchProvenanceSignal(ctx, "x", "1.0.0");
    const b = await fetchProvenanceSignal(ctx, "x", "1.0.0");
    expect(calls).toHaveLength(1);
    expect(b.value).toEqual(a.value);
  });

  it("a cached 404 also makes one request (2.10)", async () => {
    const { transport, calls } = routedTransport([]);
    const ctx = makeContext(transport);
    const a = await fetchProvenanceSignal(ctx, "x", "1.0.0");
    const b = await fetchProvenanceSignal(ctx, "x", "1.0.0");
    expect(calls).toHaveLength(1);
    expect(b.value).toEqual(a.value);
    expect(b.available).toBe(true);
  });

  it("does not cache a failure, so a later call retries", async () => {
    let fail = true;
    const calls: string[] = [];
    const transport: Transport = (url) => {
      calls.push(url);
      return fail
        ? Promise.resolve({ status: 500, json: () => Promise.resolve({}) })
        : Promise.resolve({ status: 200, json: () => Promise.resolve(SLSA_BODY) });
    };
    const ctx = makeContext(transport);
    expect((await fetchProvenanceSignal(ctx, "x", "1.0.0")).available).toBe(false);
    fail = false;
    const second = await fetchProvenanceSignal(ctx, "x", "1.0.0");
    expect(second).toMatchObject({ available: true, value: { present: true } });
    expect(calls).toHaveLength(2);
  });
});
