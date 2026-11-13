// npm clients. Requirements 4, 5.

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { ABBREVIATED_ACCEPT, encodePackageName, extractDeprecated, extractLastPublish, fetchInstallScriptSignal, fetchPackumentSignals } from "../../src/clients/npm.js";
import { makeContext, routedTransport } from "../helpers.js";

const URL_X = "https://registry.npmjs.org/x";

const packument = {
  name: "x",
  "dist-tags": { latest: "9.9.9" },
  time: {
    created: "2010-01-01T00:00:00.000Z",
    modified: "2030-01-01T00:00:00.000Z",
    "1.0.0": "2020-05-01T00:00:00.000Z",
    "1.1.0": "2021-06-01T00:00:00.000Z",
    "0.9.0-beta": "2019-01-01T00:00:00.000Z",
  },
  versions: { "1.0.0": { deprecated: "use 1.1.0" }, "1.1.0": {} },
};

describe("extractLastPublish (4.2, 4.6)", () => {
  it("takes the greatest version time and ignores created and modified", () => {
    expect(extractLastPublish(packument)?.toISOString()).toBe("2021-06-01T00:00:00.000Z");
  });

  it("gives null when nothing parses", () => {
    expect(extractLastPublish({ time: { created: "2010-01-01T00:00:00Z", "1.0.0": "not a date" } })).toBeNull();
    expect(extractLastPublish({})).toBeNull();
    expect(extractLastPublish("junk")).toBeNull();
  });

  it("is deterministic for any time map (4.4)", () => {
    const timeArb = fc.dictionary(fc.string({ minLength: 1 }), fc.oneof(fc.string(), fc.date().map((d) => d.toISOString())));
    fc.assert(
      fc.property(timeArb, (time) => {
        const a = extractLastPublish({ time });
        const b = extractLastPublish({ time: structuredClone(time) });
        expect(a?.getTime() ?? null).toBe(b?.getTime() ?? null);
      }),
      { numRuns: 300 },
    );
  });
});

describe("extractDeprecated (4.3)", () => {
  it("true only for a non-empty string on the installed version", () => {
    expect(extractDeprecated(packument, "1.0.0")).toBe(true);
    expect(extractDeprecated(packument, "1.1.0")).toBe(false);
    expect(extractDeprecated(packument, "7.0.0")).toBe(false);
    expect(extractDeprecated({ versions: { "1.0.0": { deprecated: "" } } }, "1.0.0")).toBe(false);
    expect(extractDeprecated({ versions: { "1.0.0": { deprecated: true } } }, "1.0.0")).toBe(false);
  });
});

describe("fetchPackumentSignals", () => {
  it("returns available signals with source and fetchedAt (1.4, 1.5)", async () => {
    const { transport } = routedTransport([{ url: URL_X, accept: "application/json", json: packument }]);
    const r = await fetchPackumentSignals(makeContext(transport), "x", "1.0.0");
    expect(r.lastPublish).toEqual({ value: "2021-06-01T00:00:00.000Z", source: URL_X, fetchedAt: "2026-11-12T00:00:00.000Z", available: true });
    expect(r.deprecated).toEqual({ value: true, source: URL_X, fetchedAt: "2026-11-12T00:00:00.000Z", available: true });
  });

  it("marks both signals unavailable with the HTTP status after retries (4.5, 9.4)", async () => {
    const { transport, calls } = routedTransport([{ url: URL_X, status: 429, json: {} }]);
    const r = await fetchPackumentSignals(makeContext(transport), "x", "1.0.0");
    expect(r.lastPublish).toMatchObject({ available: false, value: null, reason: "HTTP 429", source: URL_X });
    expect(r.deprecated).toMatchObject({ available: false, reason: "HTTP 429" });
    expect(calls).toHaveLength(4);
  });

  it("marks unavailable on 404 without retrying", async () => {
    const { transport, calls } = routedTransport([]);
    const r = await fetchPackumentSignals(makeContext(transport), "missing", "1.0.0");
    expect(r.lastPublish).toMatchObject({ available: false, reason: "HTTP 404" });
    expect(calls).toHaveLength(1);
  });

  it("uses the cache for a second call (7.2)", async () => {
    const { transport, calls } = routedTransport([{ url: URL_X, accept: "application/json", json: packument }]);
    const ctx = makeContext(transport);
    await fetchPackumentSignals(ctx, "x", "1.0.0");
    await fetchPackumentSignals(ctx, "x", "1.1.0");
    expect(calls).toHaveLength(1);
  });
});

describe("fetchInstallScriptSignal (5)", () => {
  const abbreviated = { name: "x", versions: { "1.0.0": { hasInstallScript: true }, "1.1.0": {} } };

  it("sends the abbreviated Accept header and reads hasInstallScript", async () => {
    const { transport, calls } = routedTransport([{ url: URL_X, accept: ABBREVIATED_ACCEPT, json: abbreviated }]);
    const ctx = makeContext(transport);
    expect((await fetchInstallScriptSignal(ctx, "x", "1.0.0")).value).toBe(true);
    expect((await fetchInstallScriptSignal(ctx, "x", "1.1.0")).value).toBe(false);
    expect(calls[0]?.request.headers["Accept"]).toBe(ABBREVIATED_ACCEPT);
    expect(calls).toHaveLength(1);
  });

  it("is unavailable when the version is missing (5.6) or the request fails (5.5)", async () => {
    const { transport } = routedTransport([{ url: URL_X, accept: ABBREVIATED_ACCEPT, json: abbreviated }]);
    expect(await fetchInstallScriptSignal(makeContext(transport), "x", "2.0.0")).toMatchObject({ available: false, reason: "version not found" });
    const failing = routedTransport([{ url: URL_X, accept: ABBREVIATED_ACCEPT, status: 500, json: {} }]);
    expect(await fetchInstallScriptSignal(makeContext(failing.transport), "x", "1.0.0")).toMatchObject({ available: false, reason: "HTTP 500" });
  });
});

describe("encodePackageName", () => {
  it("keeps the scope marker and encodes the slash", () => {
    expect(encodePackageName("@types/node")).toBe("@types%2Fnode");
    expect(encodePackageName("lodash")).toBe("lodash");
  });
});
