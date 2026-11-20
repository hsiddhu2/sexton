// github-raw client. Requirement 2. No network.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { CachedFetcher, MemoryCacheStore } from "../../src/cache.js";
import {
  fetchManifest,
  fetchRepoManifests,
  GITHUB_RAW_HOST,
  GITHUB_RAW_SOURCE,
  MAX_MANIFEST_BYTES,
  manifestUrl,
  type ManifestFile,
} from "../../src/clients/github-raw.js";
import type { ClientContext } from "../../src/clients/context.js";
import type { Transport } from "../../src/http.js";
import type { RepoRef } from "../../src/types.js";
import { isValidOwner, isValidRepo } from "../../src/intake/url.js";
import { arbOwner, arbRepo } from "../arbitraries.js";
import { routedTextTransport, type RouteTable } from "../intake/routes.js";

const REPO: RepoRef = { owner: "o", repo: "r", url: "https://github.com/o/r" };
const PKG = `${GITHUB_RAW_HOST}/o/r/HEAD/package.json`;
const LOCK = `${GITHUB_RAW_HOST}/o/r/HEAD/package-lock.json`;

function setup(routes: RouteTable) {
  const { transport, requests } = routedTextTransport(routes);
  const clockState = { now: new Date("2026-11-12T00:00:00Z") };
  const clock = () => clockState.now;
  const sleeps: number[] = [];
  const store = new MemoryCacheStore();
  const ctx: ClientContext = {
    transport,
    clock,
    cache: new CachedFetcher({ store, clock }),
    retry: { sleep: (ms) => (sleeps.push(ms), Promise.resolve()) },
  };
  return { ctx, requests, store, sleeps, clockState };
}

describe("manifestUrl", () => {
  it("builds the fixed URL and throws on invalid references", () => {
    expect(manifestUrl(REPO, "package.json")).toBe(PKG);
    expect(() => manifestUrl({ owner: "a/b", repo: "r" }, "package.json")).toThrow();
    expect(() => manifestUrl({ owner: "o", repo: ".." }, "package.json")).toThrow();
  });
});

describe("fetchManifest", () => {
  it("2xx gives found (2.8)", async () => {
    const { ctx } = setup({ [PKG]: { body: '{"a":1}' } });
    expect(await fetchManifest(ctx, REPO, "package.json")).toEqual({ kind: "found", text: '{"a":1}' });
  });

  it("404 gives not-found and is cached (2.9, 2.6)", async () => {
    const { ctx, requests } = setup({});
    expect(await fetchManifest(ctx, REPO, "package-lock.json")).toEqual({ kind: "not-found" });
    expect(await fetchManifest(ctx, REPO, "package-lock.json")).toEqual({ kind: "not-found" });
    expect(requests).toHaveLength(1);
  });

  it("found is cached with equal outcomes (2.6)", async () => {
    const { ctx, requests } = setup({ [PKG]: { body: "{}" } });
    const a = await fetchManifest(ctx, REPO, "package.json");
    const b = await fetchManifest(ctx, REPO, "package.json");
    expect(a).toEqual(b);
    expect(requests).toHaveLength(1);
  });

  it("429 forever gives failed with the status after four requests and is not cached (2.7)", async () => {
    const { ctx, requests, store, sleeps } = setup({ [PKG]: { status: 429 } });
    expect(await fetchManifest(ctx, REPO, "package.json")).toEqual({ kind: "failed", failure: "http-status", status: 429 });
    expect(requests).toHaveLength(4);
    expect(sleeps).toHaveLength(3);
    expect(store.size).toBe(0);
  });

  it("429 twice then 200 gives found after two sleeps", async () => {
    let n = 0;
    const { transport: inner } = routedTextTransport({ [PKG]: { body: "{}" } });
    const transport: Transport = (url, request) => {
      n++;
      if (n <= 2) return Promise.resolve({ status: 429, json: () => Promise.resolve(null) });
      return inner(url, request);
    };
    const { ctx, sleeps } = setup({});
    expect(await fetchManifest({ ...ctx, transport }, REPO, "package.json")).toEqual({ kind: "found", text: "{}" });
    expect(sleeps).toHaveLength(2);
  });

  it("a body over 5 MiB is too-large and not cached (2.12)", async () => {
    const { ctx, store } = setup({ [PKG]: { body: "a".repeat(MAX_MANIFEST_BYTES + 1) } });
    expect(await fetchManifest(ctx, REPO, "package.json")).toEqual({ kind: "too-large" });
    expect(store.size).toBe(0);
  });

  it("a body of exactly 5 MiB is accepted", async () => {
    const { ctx } = setup({ [PKG]: { body: "a".repeat(MAX_MANIFEST_BYTES) } });
    expect((await fetchManifest(ctx, REPO, "package.json")).kind).toBe("found");
  });

  it("invalid UTF-8 gives failed and is not cached", async () => {
    const { ctx, store } = setup({ [PKG]: { body: new Uint8Array([0xff, 0xfe]) } });
    expect(await fetchManifest(ctx, REPO, "package.json")).toEqual({ kind: "failed", failure: "invalid-encoding", status: null });
    expect(store.size).toBe(0);
  });

  it("a response without text() gives failed and a later 200 is fetched", async () => {
    let first = true;
    const { transport: inner } = routedTextTransport({ [PKG]: { body: "{}" } });
    const transport: Transport = (url, request) => {
      if (first) {
        first = false;
        return Promise.resolve({ status: 200, json: () => Promise.resolve({}) });
      }
      return inner(url, request);
    };
    const { ctx } = setup({});
    const c = { ...ctx, transport };
    expect(await fetchManifest(c, REPO, "package.json")).toEqual({ kind: "failed", failure: "unsupported-transport", status: null });
    expect(await fetchManifest(c, REPO, "package.json")).toEqual({ kind: "found", text: "{}" });
  });

  it("a 500 and a throwing transport give failed and are not cached (2.10)", async () => {
    const a = setup({ [PKG]: { status: 500 } });
    expect(await fetchManifest(a.ctx, REPO, "package.json")).toEqual({ kind: "failed", failure: "http-status", status: 500 });
    expect(a.store.size).toBe(0);
    const b = setup({ [PKG]: { throws: new Error("secret upstream text") } });
    const outcome = await fetchManifest(b.ctx, REPO, "package.json");
    expect(outcome).toEqual({ kind: "failed", failure: "network", status: null });
    expect(JSON.stringify(outcome)).not.toContain("secret");
    expect(b.store.size).toBe(0);
  });

  it("uses the cache key github-raw|o/r|package.json and refetches after the TTL (2.5)", async () => {
    const { ctx, store, requests, clockState } = setup({ [PKG]: { body: "{}" } });
    await fetchManifest(ctx, REPO, "package.json");
    expect(await store.get(`${GITHUB_RAW_SOURCE}|o/r|package.json`)).toBeDefined();
    clockState.now = new Date(clockState.now.getTime() + 24 * 60 * 60 * 1000 + 1);
    await fetchManifest(ctx, REPO, "package.json");
    expect(requests).toHaveLength(2);
  });

  it("sends only Accept, no Authorization or Cookie, and requests only the two Manifest URLs (2.3, 2.4)", async () => {
    const { ctx, requests } = setup({ [PKG]: { body: "{}" }, [LOCK]: { body: "{}" } });
    await fetchRepoManifests(ctx, REPO);
    expect(requests.map((r) => r.url)).toEqual([PKG, LOCK]);
    for (const r of requests) {
      expect(Object.keys(r.headers)).toEqual(["Accept"]);
      expect(r.method).toBe("GET");
    }
  });
});

describe("fetchRepoManifests gate (2.13)", () => {
  const cases: [string, RouteTable][] = [
    ["404", {}],
    ["too large", { [PKG]: { body: "a".repeat(MAX_MANIFEST_BYTES + 1) } }],
    ["failed", { [PKG]: { status: 500 } }],
    ["invalid JSON", { [PKG]: { body: "not json" } }],
  ];
  it.each(cases)("makes no lockfile request when package.json is %s", async (_name, routes) => {
    const { ctx, requests } = setup(routes);
    const result = await fetchRepoManifests(ctx, REPO);
    expect(result.lockfile).toEqual({ kind: "not-attempted" });
    expect(requests.map((r) => r.url)).toEqual([PKG]);
  });

  it("makes one lockfile request when package.json is valid", async () => {
    const { ctx, requests } = setup({ [PKG]: { body: "{}" } });
    const result = await fetchRepoManifests(ctx, REPO);
    expect(result.lockfile).toEqual({ kind: "not-found" });
    expect(requests.map((r) => r.url)).toEqual([PKG, LOCK]);
  });
});

describe("Property 18, fetchManifest arm", () => {
  it("Feature: repo-intake, Property 18: Every outbound URL has the fixed prefix", async () => {
    const hostileSegment = fc.oneof(
      fc.string(),
      fc.constantFrom("/", "..", "?", "#", " ", "a/b", "a b", "o?x", "o#x", "../x", ".", "a\n", ".x", "r.git"),
      fc.tuple(fc.string(), fc.constantFrom("/", "..", "?", "#", " ")).map(([a, b]) => a + b),
    );
    const ownerArb = fc.oneof(hostileSegment, arbOwner);
    const repoArb = fc.oneof(hostileSegment, arbRepo);
    const files = fc.constantFrom<ManifestFile>("package.json", "package-lock.json");
    let requested = 0;
    await fc.assert(
      fc.asyncProperty(ownerArb, repoArb, fc.string(), files, async (owner, repo, url, file) => {
        const { ctx, requests } = setup({});
        const outcome = await fetchManifest(ctx, { owner, repo, url }, file);
        const valid = isValidOwner(owner) && isValidRepo(repo);
        expect(requests.length > 0).toBe(valid);
        if (valid) {
          requested += 1;
          expect(requests).toHaveLength(1);
          expect(requests[0]?.url).toBe(`${GITHUB_RAW_HOST}/${owner}/${repo}/HEAD/${file}`);
        } else {
          expect(outcome).toEqual({ kind: "failed", failure: "invalid-reference", status: null });
        }
      }),
      { numRuns: 1000 },
    );
    expect(requested).toBeGreaterThan(0);
  });
  it.each([
    ["..", "r"],
    ["o", ".."],
    [".x", "r"],
  ])("makes zero requests for owner %j and repo %j", async (owner, repo) => {
    const { ctx, requests } = setup({});
    const outcome = await fetchManifest(ctx, { owner, repo, url: "https://github.com/x/y" }, "package.json");
    expect(requests).toHaveLength(0);
    expect(outcome).toEqual({ kind: "failed", failure: "invalid-reference", status: null });
  });
});
