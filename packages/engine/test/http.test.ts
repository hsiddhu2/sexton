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

describe("text() body reader (2.11, 2.14)", () => {
  const MIB5 = 5 * 1024 * 1024;

  function chunked(totalBytes: number, chunk: number): { stream: ReadableStream<Uint8Array>; state: { pulls: number; cancelled: boolean } } {
    const state = { pulls: 0, cancelled: false };
    let sent = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        state.pulls++;
        if (sent >= totalBytes) {
          controller.close();
          return;
        }
        const n = Math.min(chunk, totalBytes - sent);
        controller.enqueue(new Uint8Array(n).fill(0x61));
        sent += n;
      },
      cancel() {
        state.cancelled = true;
      },
    });
    return { stream, state };
  }

  async function read(body: BodyInit | null, init: ResponseInit = { status: 200 }, limit = MIB5) {
    const fakeFetch = (() => Promise.resolve(new Response(body, init))) as unknown as typeof fetch;
    const response = await createFetchTransport(fakeFetch)("https://x.invalid/", { method: "GET", headers: {} });
    return (response.text as NonNullable<TransportResponse["text"]>)(limit);
  }

  it("accepts exactly the limit across several chunks", async () => {
    const { stream } = chunked(MIB5, 100_000);
    const result = await read(stream);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.text.length).toBe(MIB5);
  });

  it("rejects limit + 1, cancels the stream and stops pulling", async () => {
    const { stream, state } = chunked(MIB5 * 3, 1_000_000);
    const result = await read(stream);
    expect(result).toEqual({ ok: false, reason: "too-large" });
    expect(state.cancelled).toBe(true);
    expect(state.pulls).toBeLessThan(10);
  });

  it("rejects limit + 1 bytes exactly", async () => {
    const { stream } = chunked(MIB5 + 1, MIB5 + 1);
    expect(await read(stream)).toEqual({ ok: false, reason: "too-large" });
  });

  it("rejects on a Content-Length above the limit without pulling", async () => {
    const { stream, state } = chunked(10, 10);
    const result = await read(stream, { status: 200, headers: { "content-length": String(MIB5 + 1) } });
    expect(result).toEqual({ ok: false, reason: "too-large" });
    expect(state.pulls).toBeLessThanOrEqual(1); // the stream primes one pull at construction; text() never reads
    expect(state.cancelled).toBe(true);
  });

  it("counts bytes when Content-Length understates the body", async () => {
    const { stream } = chunked(100, 50);
    expect(await read(stream, { status: 200, headers: { "content-length": "1" } }, 60)).toEqual({ ok: false, reason: "too-large" });
  });

  it("decodes a multi-byte character split across chunks", async () => {
    const bytes = new TextEncoder().encode("a€b");
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes.slice(0, 2));
        controller.enqueue(bytes.slice(2));
        controller.close();
      },
    });
    expect(await read(stream)).toEqual({ ok: true, text: "a€b" });
  });

  it("gives invalid-encoding for invalid UTF-8", async () => {
    expect(await read(new Uint8Array([0x7b, 0xff, 0xfe]))).toEqual({ ok: false, reason: "invalid-encoding" });
  });

  it("strips a leading BOM", async () => {
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode("{}")]);
    expect(await read(bytes)).toEqual({ ok: true, text: "{}" });
  });

  it("gives the empty string for a null body", async () => {
    expect(await read(null, { status: 204 })).toEqual({ ok: true, text: "" });
  });

  it("leaves json() working", async () => {
    const fakeFetch = (() => Promise.resolve(new Response('{"a":1}', { status: 200 }))) as unknown as typeof fetch;
    const response = await createFetchTransport(fakeFetch)("https://x.invalid/", { method: "GET", headers: {} });
    expect(await response.json()).toEqual({ a: 1 });
  });

  it("a response with only status and json still satisfies TransportResponse", () => {
    const minimal: TransportResponse = { status: 200, json: () => Promise.resolve(null) };
    expect(minimal.text).toBeUndefined();
  });
});
