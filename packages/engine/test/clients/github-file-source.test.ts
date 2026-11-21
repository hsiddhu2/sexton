// Spec hosted-plans, Requirement 3: the GitHub File source.

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { GithubFileSource, githubFileUrl } from "../../src/clients/github-file-source.js";
import type { Transport, TransportRequest, TransportResponse } from "../../src/http.js";
import { capFileSource } from "../../src/remediation/capped-source.js";
import { isSafePath } from "../../src/remediation/safe-path.js";
import { makeContext } from "../helpers.js";

const REPO = { owner: "octo", repo: "demo" };
const SHA = "0123456789abcdef0123456789abcdef01234567";
const TOKEN = "ghp_" + "b".repeat(36);
const RAW = `https://raw.githubusercontent.com/octo/demo/${SHA}/`;

interface Seen {
  url: string;
  request: TransportRequest;
}

function fake(paths: readonly string[], files: Readonly<Record<string, string>>, options: { truncated?: boolean; treeStatus?: number } = {}) {
  const seen: Seen[] = [];
  const transport: Transport = (url, request) => {
    seen.push({ url, request });
    let response: TransportResponse;
    if (url.startsWith("https://api.github.com/")) {
      const body = JSON.stringify({ tree: paths.map((path) => ({ path, type: "blob" })), truncated: options.truncated ?? false });
      response = { status: options.treeStatus ?? 200, json: () => Promise.resolve(JSON.parse(body) as unknown), text: () => Promise.resolve({ ok: true, text: body }) };
    } else {
      const path = decodeURIComponent(url.slice(RAW.length));
      const text = Object.hasOwn(files, path) ? files[path] : undefined;
      response =
        text === undefined
          ? { status: 404, json: () => Promise.reject(new Error("no")), text: () => Promise.resolve({ ok: true, text: "" }) }
          : {
              status: 200,
              json: () => Promise.reject(new Error("no")),
              text: (limit) => Promise.resolve(text.length > limit ? { ok: false, reason: "too-large" } : { ok: true, text }),
            };
    }
    return Promise.resolve(response);
  };
  return { transport, seen };
}

describe("githubFileUrl (3.4)", () => {
  it("percent-encodes each segment", () => {
    expect(githubFileUrl(REPO, SHA, "src/a b#?.scss")).toBe(`${RAW}src/a%20b%23%3F.scss`);
  });
  it("refuses an unsafe path", () => {
    expect(() => githubFileUrl(REPO, SHA, "../x")).toThrow();
    expect(() => githubFileUrl(REPO, SHA, "/x")).toThrow();
  });
});

describe("GithubFileSource (3.1 to 3.6)", () => {
  it("lists the tree, reads listed files at the commit without a token, and caches reads", async () => {
    const { transport, seen } = fake(["a.scss", "b.js"], { "a.scss": "x /deep/ y" });
    const source = new GithubFileSource(makeContext(transport), REPO, SHA, { token: TOKEN });
    expect(source.counts()).toEqual({ performed: false, capped: false, listed: 0 });
    expect(await source.listFiles()).toEqual(["a.scss", "b.js"]);
    expect(await source.readFile("a.scss")).toBe("x /deep/ y");
    expect(await source.readFile("a.scss")).toBe("x /deep/ y");
    expect(await source.readFile("b.js")).toBeUndefined();
    expect(await source.readFile("c.js")).toBeUndefined();
    const raw = seen.filter((s) => s.url.startsWith(RAW));
    expect(raw.map((s) => s.url)).toEqual([`${RAW}a.scss`, `${RAW}b.js`]);
    expect(raw.every((s) => s.request.headers["Authorization"] === undefined)).toBe(true);
    expect(source.counts()).toEqual({ performed: true, capped: false, listed: 2 });
  });

  it("reads nothing before a listing", async () => {
    const { transport, seen } = fake(["a.scss"], { "a.scss": "x" });
    const source = new GithubFileSource(makeContext(transport), REPO, SHA, { token: TOKEN });
    expect(await source.readFile("a.scss")).toBeUndefined();
    expect(seen).toEqual([]);
  });

  it("lists a capped tree and reports it through counts (handoff decision 8)", async () => {
    const { transport } = fake(["a.scss"], { "a.scss": "x" }, { truncated: true });
    const source = new GithubFileSource(makeContext(transport), REPO, SHA, { token: TOKEN });
    expect(await source.listFiles()).toEqual(["a.scss"]);
    expect(source.counts()).toEqual({ performed: true, capped: true, listed: 1 });
  });

  it("rejects a failed tree, so the Capped source reports not scanned", async () => {
    const { transport } = fake(["a.scss"], {}, { treeStatus: 404 });
    const source = new GithubFileSource(makeContext(transport), REPO, SHA, { token: TOKEN });
    await expect(source.listFiles()).rejects.toThrow();
    const capped = capFileSource(new GithubFileSource(makeContext(transport), REPO, SHA, { token: TOKEN }));
    expect(await capped.source.listFiles()).toEqual([]);
    expect(capped.counts().performed).toBe(false);
  });

  it("stops reading after the read budget, without a request (3.7)", async () => {
    let now = 1000;
    const { transport, seen } = fake(["a.scss", "b.scss"], { "a.scss": "x", "b.scss": "y" });
    const source = new GithubFileSource(makeContext(transport), REPO, SHA, { token: TOKEN }, { now: () => now, budgetMs: 50 });
    await source.listFiles();
    expect(await source.readFile("a.scss")).toBe("x");
    now = 1051;
    expect(await source.readFile("b.scss")).toBeUndefined();
    expect(seen.filter((s) => s.url.startsWith(RAW)).map((s) => s.url)).toEqual([`${RAW}a.scss`]);
  });

  it("answers undefined for a file over 256 KiB", async () => {
    const { transport } = fake(["big.scss"], { "big.scss": "x".repeat(262145) });
    const source = new GithubFileSource(makeContext(transport), REPO, SHA, { token: TOKEN });
    await source.listFiles();
    expect(await source.readFile("big.scss")).toBeUndefined();
  });
});

const segment = fc.oneof(fc.constantFrom("a", "src", "..", ".", "", "x y", "‮", "node_modules", "b.scss"), fc.string({ maxLength: 6 }));
const pathArb = fc.array(segment, { minLength: 1, maxLength: 4 }).map((s) => s.join("/"));

describe("Feature: hosted-plans, Property 56: the file source reads only listed safe paths", () => {
  it("requests a raw file only for a listed Safe path", async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(pathArb, { maxLength: 8 }), fc.array(pathArb, { maxLength: 8 }), async (listed, asked) => {
        const files = Object.fromEntries(listed.map((p) => [p, "text"]));
        const { transport, seen } = fake(listed, files);
        const source = new GithubFileSource(makeContext(transport), REPO, SHA, { token: TOKEN }, { now: () => 0 });
        await source.listFiles();
        for (const p of [...asked, ...listed]) await source.readFile(p);
        for (const s of seen.filter((x) => x.url.startsWith(RAW))) {
          const path = decodeURIComponent(s.url.slice(RAW.length));
          expect(listed.includes(path)).toBe(true);
          expect(isSafePath(path)).toBe(true);
        }
      }),
      { numRuns: 100 },
    );
  });
});
