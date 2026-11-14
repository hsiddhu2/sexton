// Transport, User-Agent and backoff. Requirements 8, 9.

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { backoffDelay, createFetchTransport, requestWithRetry, UpstreamError, type Transport, type TransportResponse } from "../src/http.js";
import { ENGINE_VERSION, USER_AGENT } from "../src/version.js";

const noSleep = () => Promise.resolve();
const ok: TransportResponse = { status: 200, json: () => Promise.resolve({}) };
const limited: TransportResponse = { status: 429, json: () => Promise.resolve({}) };
const down: TransportResponse = { status: 503, json: () => Promise.resolve({}) };
const req = { method: "GET" as const, headers: {} };

function scripted(responses: TransportResponse[]): { transport: Transport; calls: () => number } {
  let n = 0;
  const transport: Transport = () => {
    const r = responses[Math.min(n, responses.length - 1)] as TransportResponse;
    n++;
    return Promise.resolve(r);
  };
  return { transport, calls: () => n };
}

describe("User-Agent (8)", () => {
  it("has the fixed shape with the engine version and repo URL (8.1, 8.3)", () => {
    expect(USER_AGENT).toBe(`sexton/${ENGINE_VERSION} (+https://github.com/hsiddhu2/sexton)`);
    expect(ENGINE_VERSION).toMatch(/^\d+\.\d+\.\d+/);
  });

  it("default transport stamps the header on every request (8.2)", async () => {
    const seen: string[] = [];
    const fakeFetch = ((_url: string, init: RequestInit) => {
      const headers = init.headers as Record<string, string>;
      seen.push(headers["User-Agent"] ?? "");
      return Promise.resolve(new Response("{}", { status: 200 }));
    }) as unknown as typeof fetch;
    const transport = createFetchTransport(fakeFetch);
    await transport("https://registry.npmjs.org/x", { method: "GET", headers: { Accept: "application/json" } });
    await transport("https://api.osv.dev/v1/querybatch", { method: "POST", headers: {}, body: "{}" });
    expect(seen).toEqual([USER_AGENT, USER_AGENT]);
  });
});

describe("requestWithRetry (9)", () => {
  it("retries 429 at most three times, four requests total, then throws (9.1, 9.4)", async () => {
    const s = scripted([limited]);
    await expect(requestWithRetry(s.transport, "u", req, { sleep: noSleep })).rejects.toBeInstanceOf(UpstreamError);
    expect(s.calls()).toBe(4);
  });

  it("retries 503 the same way (9.2)", async () => {
    const s = scripted([down, down, ok]);
    expect((await requestWithRetry(s.transport, "u", req, { sleep: noSleep })).status).toBe(200);
    expect(s.calls()).toBe(3);
  });

  it("returns other statuses without retrying (9.5)", async () => {
    for (const status of [200, 404, 500]) {
      const s = scripted([{ status, json: () => Promise.resolve(null) }]);
      expect((await requestWithRetry(s.transport, "u", req, { sleep: noSleep })).status).toBe(status);
      expect(s.calls()).toBe(1);
    }
  });

  it("sleeps with doubling base and full jitter (9.3)", async () => {
    const delays: number[] = [];
    const s = scripted([limited, limited, limited, ok]);
    await requestWithRetry(s.transport, "u", req, { sleep: (ms) => (delays.push(ms), Promise.resolve()), random: () => 0.5 });
    expect(delays).toEqual([250, 500, 1000]);
  });

  it("the error carries the final status", async () => {
    const s = scripted([down]);
    await expect(requestWithRetry(s.transport, "https://x", req, { sleep: noSleep })).rejects.toMatchObject({ status: 503, url: "https://x" });
  });
});

describe("backoffDelay property (9.3)", () => {
  it("stays within [0, 500 * 2^attempt) for any attempt and random draw", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 10 }), fc.double({ min: 0, max: 1, maxExcluded: true, noNaN: true }), (attempt, r) => {
        const d = backoffDelay(attempt, () => r);
        expect(d).toBeGreaterThanOrEqual(0);
        expect(d).toBeLessThan(500 * 2 ** attempt);
      }),
      { numRuns: 1000 },
    );
  });
});
