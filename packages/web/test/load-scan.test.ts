import { act, renderHook, waitFor } from "@testing-library/react";
import fc from "fast-check";
import { describe, expect, it, vi } from "vitest";
import { LOAD_ERROR_TEXT, type LoadError } from "../src/load/load-error.js";
import { loadScan, MAX_SCAN_BYTES } from "../src/load/load-scan.js";
import { useScanLoader, type LoadState } from "../src/load/use-scan-loader.js";
import { validateScanResponse } from "../src/load/validate-scan-response.js";
import { cheapScan } from "./arbitraries.js";

const SECRET = "@@secret@@";
const enc = new TextEncoder();
const VALID = JSON.stringify(cheapScan(0));
const PAGE = "https://sexton.example";

function assertFixedMessage(error: LoadError): void {
  const text = LOAD_ERROR_TEXT[error.code];
  expect(error.message).toBe(error.status === undefined ? text : `${text} (HTTP ${String(error.status)})`);
  expect(JSON.stringify(error)).not.toContain(SECRET);
}

type Recorded = { url: unknown; init: RequestInit | undefined };

function fetchReturning(make: () => Response | Promise<Response>, record?: Recorded[]): typeof fetch {
  return ((url: unknown, init?: RequestInit) => {
    record?.push({ url, init });
    return Promise.resolve(make());
  }) as unknown as typeof fetch;
}

interface Outcome {
  status: number;
  bytes: Uint8Array;
  throws: string | null;
}

function reference(outcome: Outcome, maxBytes: number): { ok: boolean; code?: string; status?: number } {
  if (outcome.throws !== null) return { ok: false, code: "fetch-failed" };
  if (outcome.status < 200 || outcome.status > 299) return { ok: false, code: "fetch-failed", status: outcome.status };
  if (outcome.bytes.byteLength > maxBytes) return { ok: false, code: "too-large" };
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(outcome.bytes);
  } catch {
    return { ok: false, code: "invalid-json" };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, code: "invalid-json" };
  }
  return validateScanResponse(parsed).ok ? { ok: true } : { ok: false, code: "invalid-response" };
}

const MAX = 4096;
const arbBody: fc.Arbitrary<Uint8Array> = fc.oneof(
  fc.constant(enc.encode(VALID)),
  fc.string().map((s) => enc.encode(SECRET + s)),
  fc.string().map((s) => enc.encode(s)),
  fc.uint8Array(),
  fc.constant(new Uint8Array(MAX + 1).fill(0x20)),
  fc.constant(new Uint8Array(0)),
  fc.jsonValue().map((j) => enc.encode(JSON.stringify({ [SECRET]: SECRET, j }))),
  fc.constant(enc.encode(`{"report":{"generatedAt":"x${SECRET}","packages":[]},"policy":5}`)),
);

describe("loadScan properties", () => {
  it(
    "Feature: cemetery-ui, Property 12: Load errors carry fixed text and never input",
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            status: fc.constantFrom(200, 204, 301, 404, 429, 500, 503),
            bytes: arbBody,
            throws: fc.option(fc.string().map((s) => SECRET + s), { nil: null }),
          }),
          async (outcome) => {
            const record: Recorded[] = [];
            const fetchFn = ((url: unknown, init?: RequestInit) => {
              record.push({ url, init });
              if (outcome.throws !== null) return Promise.reject(new Error(outcome.throws));
              const body = outcome.status === 204 ? null : outcome.bytes;
              return Promise.resolve(new Response(body, { status: outcome.status }));
            }) as unknown as typeof fetch;
            const controller = new AbortController();
            const result = await loadScan(`https://x.example/${SECRET}`, { fetchFn, signal: controller.signal, maxBytes: MAX });
            const expected = reference(
              { ...outcome, bytes: outcome.status === 204 ? new Uint8Array(0) : outcome.bytes },
              MAX,
            );
            expect(result.ok).toBe(expected.ok);
            if (!result.ok) {
              expect(result.error.code).toBe(expected.code);
              expect(result.error.status).toBe(expected.status);
              if (result.error.contractErrors !== undefined) {
                expect(result.error.contractErrors.length).toBeLessThanOrEqual(5);
              }
              assertFixedMessage(result.error);
            }
            const init = record[0]?.init;
            expect(init?.method).toBe("GET");
            expect(init?.credentials).toBe("omit");
            expect(init?.redirect).toBe("error");
            expect(init?.headers).toEqual({ Accept: "application/json" });
          },
        ),
        { numRuns: 1000 },
      );
    },
    120000,
  );

  it(
    "Feature: cemetery-ui, Property 13: The displayed result is the result of the latest load",
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc
            .array(fc.constantFrom<"ok" | "error">("ok", "error"), { minLength: 1, maxLength: 6 })
            .chain((outcomes) =>
              fc.record({
                outcomes: fc.constant(outcomes),
                order: fc.shuffledSubarray(
                  Array.from({ length: outcomes.length + 1 }, (_, i) => i),
                  { minLength: outcomes.length + 1, maxLength: outcomes.length + 1 },
                ),
              }),
            ),
          async ({ outcomes, order }) => {
            // Load 0 is the mount load (?scan=/l0.json). Loads 1..n are started in order.
            const all: ("ok" | "error")[] = ["ok", ...outcomes];
            const resolvers = new Map<string, (r: Response) => void>();
            const fetchFn = ((url: string) =>
              new Promise<Response>((resolve) => {
                resolvers.set(new URL(url).pathname, resolve);
              })) as unknown as typeof fetch;
            const { result, unmount } = renderHook(() =>
              useScanLoader({ fetchFn, pageOrigin: PAGE, apiBase: null, initialSearch: "?scan=/l0.json" }),
            );
            for (let i = 1; i < all.length; i += 1) act(() => result.current.loadFrom(`/l${i}.json`));
            for (const index of order) {
              const resolve = resolvers.get(`/l${index}.json`);
              const marker = `2026-01-0${index + 1}T00:00:00.000Z`;
              const scan = { ...cheapScan(0), report: { generatedAt: marker, packages: [] } };
              await act(async () => {
                resolve?.(
                  all[index] === "ok"
                    ? new Response(JSON.stringify(scan), { status: 200 })
                    : new Response("x", { status: 500 }),
                );
                await Promise.resolve();
              });
            }
            const last = all.length - 1;
            await waitFor(() => expect(result.current.state.status).not.toBe("loading"));
            const state: LoadState = result.current.state;
            if (all[last] === "ok") {
              expect(state.status).toBe("ready");
              if (state.status === "ready") {
                expect(state.response.report.generatedAt).toBe(`2026-01-0${last + 1}T00:00:00.000Z`);
              }
            } else {
              expect(state.status).toBe("error");
            }
            expect(state.loadId).toBe(all.length);
            unmount();
          },
        ),
        { numRuns: 100 },
      );
    },
    120000,
  );
});

describe("loadScan examples", () => {
  it("sends a GET with the fixed init", async () => {
    const record: Recorded[] = [];
    const controller = new AbortController();
    const fetchFn = fetchReturning(() => new Response(VALID), record);
    const result = await loadScan("https://x.example/s.json", { fetchFn, signal: controller.signal });
    expect(result.ok).toBe(true);
    expect(record).toHaveLength(1);
    expect(record[0]?.init).toEqual({
      method: "GET",
      credentials: "omit",
      redirect: "error",
      referrerPolicy: "no-referrer",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
  });

  it("accepts exactly 5 MiB and rejects one byte more without parsing", async () => {
    const signal = new AbortController().signal;
    const pad = (n: number): Uint8Array => {
      const bytes = new Uint8Array(n).fill(0x20);
      bytes.set(enc.encode(VALID));
      return bytes;
    };
    const ok = await loadScan("https://x.example/s", { fetchFn: fetchReturning(() => new Response(pad(MAX_SCAN_BYTES))), signal });
    expect(ok.ok).toBe(true);
    const parse = vi.spyOn(JSON, "parse");
    const big = await loadScan("https://x.example/s", { fetchFn: fetchReturning(() => new Response(pad(MAX_SCAN_BYTES + 1))), signal });
    expect(parse).not.toHaveBeenCalled();
    parse.mockRestore();
    expect(big.ok ? null : big.error.code).toBe("too-large");
  });

  it("exits early on a declared Content-Length above the limit", async () => {
    const signal = new AbortController().signal;
    const fetchFn = fetchReturning(() => new Response(VALID, { headers: { "content-length": String(MAX_SCAN_BYTES + 1) } }));
    const result = await loadScan("https://x.example/s", { fetchFn, signal });
    expect(result.ok ? null : result.error.code).toBe("too-large");
  });

  it("reports a 503 with its status", async () => {
    const signal = new AbortController().signal;
    const result = await loadScan("https://x.example/s", { fetchFn: fetchReturning(() => new Response("x", { status: 503 })), signal });
    expect(result.ok ? null : result.error.message).toBe("The scan could not be fetched. (HTTP 503)");
  });
});

function makeLoader(
  fetchFn: typeof fetch,
  extra: { initialSearch?: string; apiBase?: string | null } = {},
) {
  return renderHook(() =>
    useScanLoader({ fetchFn, pageOrigin: PAGE, apiBase: extra.apiBase ?? null, initialSearch: extra.initialSearch ?? "" }),
  );
}

describe("useScanLoader examples", () => {
  it("loads the bundled demo address by default and marks it as demo", async () => {
    const record: Recorded[] = [];
    const { result } = makeLoader(fetchReturning(() => new Response(VALID), record));
    await waitFor(() => expect(result.current.state.status).toBe("ready"));
    expect(record.map((r) => r.url)).toEqual(["https://sexton.example/demo/scan.json"]);
    const state = result.current.state;
    expect(state.status === "ready" && state.isDemo).toBe(true);
  });

  it("does not label another address as demo even when the response names sexton-demo/fixture", async () => {
    const scan = cheapScan(0) as unknown as { report: Record<string, unknown> };
    scan.report["scan"] = {
      repo: { owner: "sexton-demo", repo: "fixture", url: "https://github.com/sexton-demo/fixture" },
      unlocked: false,
      unlockedPackages: [],
      capped: false,
      totalDirect: 0,
    };
    const { result } = makeLoader(fetchReturning(() => new Response(JSON.stringify(scan))), { initialSearch: "?scan=/other.json" });
    await waitFor(() => expect(result.current.state.status).toBe("ready"));
    const state = result.current.state;
    expect(state.status === "ready" && state.isDemo).toBe(false);
  });

  it("never falls back to the demo when an explicit scan fails", async () => {
    const record: Recorded[] = [];
    const { result } = makeLoader(fetchReturning(() => new Response("x", { status: 404 }), record), { initialSearch: "?scan=/x.json" });
    await waitFor(() => expect(result.current.state.status).toBe("error"));
    expect(record.map((r) => r.url)).toEqual(["https://sexton.example/x.json"]);
  });

  it("rejects a disallowed scan address without a request", async () => {
    const record: Recorded[] = [];
    const { result } = makeLoader(fetchReturning(() => new Response(VALID), record), { initialSearch: "?scan=javascript:alert(1)" });
    await waitFor(() => expect(result.current.state.status).toBe("error"));
    expect(record).toHaveLength(0);
    const state = result.current.state;
    expect(state.status === "error" && state.error.code).toBe("scan-url-rejected");
  });

  it("submits a repository at the 200 character boundary and refuses 201", async () => {
    const record: Recorded[] = [];
    const { result } = makeLoader(fetchReturning(() => new Response(VALID), record), { apiBase: "https://api.sexton.example" });
    await waitFor(() => expect(result.current.state.status).toBe("ready"));
    record.length = 0;
    let message: string | null = "unset";
    act(() => {
      message = result.current.submitRepo(`  ${"a".repeat(200)}  `);
    });
    expect(message).toBeNull();
    expect(record.map((r) => r.url)).toEqual([`https://api.sexton.example/scan?repo=${"a".repeat(200)}`]);
    act(() => {
      message = result.current.submitRepo("a".repeat(201));
    });
    expect(message).toBe("Enter a repository URL of 1 to 200 characters.");
    act(() => {
      message = result.current.submitRepo("   ");
    });
    expect(message).toBe("Enter a repository URL of 1 to 200 characters.");
    expect(record).toHaveLength(1);
    await waitFor(() => expect(result.current.state.status).toBe("ready"));
  });

  it("encodes the repository value and refuses to submit when no API base is configured", async () => {
    const record: Recorded[] = [];
    const { result } = makeLoader(fetchReturning(() => new Response(VALID), record), { apiBase: "https://api.sexton.example" });
    await waitFor(() => expect(result.current.state.status).toBe("ready"));
    act(() => {
      result.current.submitRepo("https://github.com/a/b?x=1&y=2");
    });
    expect(record.at(-1)?.url).toBe(`https://api.sexton.example/scan?repo=${encodeURIComponent("https://github.com/a/b?x=1&y=2")}`);
    const plain = makeLoader(fetchReturning(() => new Response(VALID)));
    let message: string | null = null;
    act(() => {
      message = plain.result.current.submitRepo("a/b");
    });
    expect(message).toBe("hosted scan arrives with release 0.1 infra");
  });

  it("submits against a path base as one same-origin GET", async () => {
    const record: Recorded[] = [];
    const { result } = makeLoader(fetchReturning(() => new Response(VALID), record), { apiBase: "/api" });
    await waitFor(() => expect(result.current.state.status).toBe("ready"));
    record.length = 0;
    let message: string | null = "unset";
    act(() => {
      message = result.current.submitRepo("https://github.com/a/b");
    });
    expect(message).toBeNull();
    await waitFor(() => expect(record).toHaveLength(1));
    expect(record[0]?.url).toBe("https://sexton.example/api/scan?repo=https%3A%2F%2Fgithub.com%2Fa%2Fb");
    expect(record[0]?.init?.method).toBe("GET");
  });

  it("accepts a same-origin scan parameter under a path base and rejects a foreign one", async () => {
    const record: Recorded[] = [];
    const good = makeLoader(fetchReturning(() => new Response(VALID), record), { apiBase: "/api", initialSearch: "?scan=/api/x.json" });
    await waitFor(() => expect(good.result.current.state.status).toBe("ready"));
    expect(record.map((r) => r.url)).toEqual(["https://sexton.example/api/x.json"]);
    const bad = makeLoader(fetchReturning(() => new Response(VALID)), {
      apiBase: "/api",
      initialSearch: "?scan=https://evil.example/x.json",
    });
    await waitFor(() => expect(bad.result.current.state.status).toBe("error"));
  });
});

// Spec fresh-site, Properties 5 and 6: one reload fetch for a stale static scan, one fetch otherwise.
// Requirements 2.4, 2.5, 3.6.

/** A JSON body that parses but fails the format check: the deploy 4 case, a scan from before newDependency and publisherChange. */
function staleScanBody(): Uint8Array {
  const scan = cheapScan(1) as unknown as { report: { packages: { signals: Record<string, unknown> }[] } };
  const signals = scan.report.packages[0]?.signals ?? {};
  delete signals["newDependency"];
  delete signals["publisherChange"];
  return enc.encode(JSON.stringify(scan));
}

const arbInvalidResponseBody: fc.Arbitrary<Uint8Array> = fc.oneof(
  fc.constant(staleScanBody()),
  fc.constant(enc.encode(`{"report":{"generatedAt":"x","packages":[]},"policy":5}`)),
  fc.jsonValue().map((j) => enc.encode(JSON.stringify({ j }))),
).filter((bytes) => reference({ status: 200, bytes, throws: null }, MAX).code === "invalid-response");

const arbOutcome: fc.Arbitrary<Outcome> = fc.record({
  status: fc.constantFrom(200, 404, 500, 503),
  bytes: arbBody,
  throws: fc.option(fc.constant("network down"), { nil: null }),
});

const segment = fc.stringMatching(/^[A-Za-z0-9_-]{1,10}$/);
const jsonAddress = fc
  .tuple(fc.constantFrom("/demo/", "/replay/", "/"), segment, fc.option(fc.constant("?v=1"), { nil: "" }))
  .map(([prefix, name, query]) => `https://x.example${prefix}${name}.json${query}`);
const otherAddress = fc.oneof(
  segment.map((s) => `https://x.example/api/scan?repo=${s}`),
  segment.map((s) => `https://x.example/${s}`),
  segment.map((s) => `https://x.example/${s}.json/more`),
);

function scripted(outcomes: readonly Outcome[], record: Recorded[]): typeof fetch {
  return ((url: unknown, init?: RequestInit) => {
    const outcome = outcomes[record.length] ?? outcomes[outcomes.length - 1];
    record.push({ url, init });
    if (outcome === undefined || outcome.throws !== null) return Promise.reject(new Error("network down"));
    return Promise.resolve(new Response(outcome.bytes, { status: outcome.status }));
  }) as unknown as typeof fetch;
}

function expectResult(result: Awaited<ReturnType<typeof loadScan>>, outcome: Outcome): void {
  const expected = reference(outcome, MAX);
  expect(result.ok).toBe(expected.ok);
  if (!result.ok) {
    expect(result.error.code).toBe(expected.code);
    expect(result.error.status).toBe(expected.status);
    assertFixedMessage(result.error);
  }
}

const FIXED_INIT = {
  method: "GET",
  credentials: "omit",
  redirect: "error",
  referrerPolicy: "no-referrer",
  headers: { Accept: "application/json" },
};

describe("Feature: fresh-site, Property 5: one reload fetch for a stale static scan", () => {
  it("fetches a .json address once more with cache reload and returns the second result", async () => {
    await fc.assert(
      fc.asyncProperty(jsonAddress, arbInvalidResponseBody, arbOutcome, async (url, first, second) => {
        const record: Recorded[] = [];
        const controller = new AbortController();
        const fetchFn = scripted([{ status: 200, bytes: first, throws: null }, second], record);
        const result = await loadScan(url, { fetchFn, signal: controller.signal, maxBytes: MAX });
        expect(record).toHaveLength(2);
        expect(record[0]?.url).toBe(url);
        expect(record[1]?.url).toBe(url);
        expect(record[0]?.init).toEqual({ ...FIXED_INIT, signal: controller.signal });
        expect(record[1]?.init).toEqual({ ...FIXED_INIT, signal: controller.signal, cache: "reload" });
        expectResult(result, second);
      }),
      { numRuns: 100 },
    );
  });

  it("loads the new demo scan after the old copy fails the format check (deploy 4)", async () => {
    const record: Recorded[] = [];
    const signal = new AbortController().signal;
    let calls = 0;
    const fetchFn = ((url: unknown, init?: RequestInit) => {
      record.push({ url, init });
      calls += 1;
      return Promise.resolve(new Response(calls === 1 ? staleScanBody() : VALID));
    }) as unknown as typeof fetch;
    const result = await loadScan("https://x.example/demo/scan.json", { fetchFn, signal });
    expect(result.ok).toBe(true);
    expect(record).toHaveLength(2);
    expect(record[1]?.init?.cache).toBe("reload");
  });
});

describe("Feature: fresh-site, Property 6: every other load is one fetch with the old result", () => {
  it("fetches once with no cache option when the address is not .json or the first result is not invalid-response", async () => {
    const outsideRetry = fc.oneof(
      fc.tuple(otherAddress, arbOutcome),
      fc.tuple(jsonAddress, arbOutcome.filter((o) => o.throws !== null || reference(o, MAX).code !== "invalid-response")),
    );
    await fc.assert(
      fc.asyncProperty(outsideRetry, async ([url, outcome]) => {
        const record: Recorded[] = [];
        const controller = new AbortController();
        const result = await loadScan(url, { fetchFn: scripted([outcome], record), signal: controller.signal, maxBytes: MAX });
        expect(record).toHaveLength(1);
        expect(record[0]?.init).toEqual({ ...FIXED_INIT, signal: controller.signal });
        expect(record[0]?.init).not.toHaveProperty("cache");
        expectResult(result, outcome);
      }),
      { numRuns: 100 },
    );
  });

  it("never fetches /api/scan twice, even when the answer fails the format check", async () => {
    const record: Recorded[] = [];
    const signal = new AbortController().signal;
    const fetchFn = fetchReturning(() => new Response(staleScanBody()), record);
    const result = await loadScan("https://x.example/api/scan?repo=a%2Fb", { fetchFn, signal });
    expect(result.ok ? null : result.error.code).toBe("invalid-response");
    expect(record).toHaveLength(1);
  });

  it("does not retry after an abort during the first fetch", async () => {
    const record: Recorded[] = [];
    const controller = new AbortController();
    const fetchFn = ((url: unknown, init?: RequestInit) => {
      record.push({ url, init });
      controller.abort();
      return Promise.resolve(new Response(staleScanBody()));
    }) as unknown as typeof fetch;
    const result = await loadScan("https://x.example/demo/scan.json", { fetchFn, signal: controller.signal });
    expect(result.ok ? null : result.error.code).toBe("fetch-failed");
    expect(record).toHaveLength(1);
  });

  it("returns fetch-failed when the load is aborted between the two fetches", async () => {
    const record: Recorded[] = [];
    const controller = new AbortController();
    const fetchFn = ((url: unknown, init?: RequestInit) => {
      record.push({ url, init });
      if (record.length === 1) return Promise.resolve(new Response(staleScanBody()));
      controller.abort();
      return Promise.reject(new DOMException("aborted", "AbortError"));
    }) as unknown as typeof fetch;
    const result = await loadScan("https://x.example/replay/axios.json", { fetchFn, signal: controller.signal });
    expect(result.ok ? null : result.error.code).toBe("fetch-failed");
    expect(record).toHaveLength(2);
    expect(record[1]?.init?.signal).toBe(controller.signal);
  });
});
