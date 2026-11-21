// Spec hosted-plans: pinned reads (Requirement 1), the two GitHub API reads (Requirement 2) and the redirect option.

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { fetchPolicyText, policyUrl } from "../../src/clients/github-policy.js";
import { fetchManifest, manifestUrl } from "../../src/clients/github-raw.js";
import { headCommitUrl, listTree, MAX_TREE_ENTRIES, readTree, resolveHeadCommit, treeUrl } from "../../src/clients/github-api.js";
import { githubFileUrl } from "../../src/clients/github-file-source.js";
import { isValidRef } from "../../src/clients/github-ref.js";
import { createFetchTransport, type Transport, type TransportRequest, type TransportResponse } from "../../src/http.js";
import { intakeRepoWithManifests } from "../../src/intake/intake.js";
import { makeContext } from "../helpers.js";

const REPO = { owner: "octo", repo: "demo" };
const SHA = "0123456789abcdef0123456789abcdef01234567";
const TOKEN = "github_pat_" + "A".repeat(40);

interface Seen {
  url: string;
  request: TransportRequest;
}

function textResponse(status: number, text: string): TransportResponse {
  return { status, json: () => Promise.resolve(JSON.parse(text) as unknown), text: () => Promise.resolve({ ok: true, text }) };
}

function scripted(answer: (url: string, request: TransportRequest) => TransportResponse): { transport: Transport; seen: Seen[] } {
  const seen: Seen[] = [];
  return {
    seen,
    transport: (url, request) => {
      seen.push({ url, request });
      return Promise.resolve(answer(url, request));
    },
  };
}

const notRef = fc.string({ maxLength: 60 }).filter((s) => !isValidRef(s));

describe("Feature: hosted-plans, Property 54: invalid refs are refused (1000 runs)", () => {
  it("every URL builder throws and the fetchers make no request", async () => {
    await fc.assert(
      fc.asyncProperty(notRef, async (ref) => {
        expect(() => manifestUrl(REPO, "package.json", ref)).toThrow();
        expect(() => policyUrl(REPO, ref)).toThrow();
        expect(() => treeUrl(REPO, ref)).toThrow();
        expect(() => githubFileUrl(REPO, ref, "a.scss")).toThrow();
        expect(() => treeUrl(REPO, "HEAD")).toThrow();
        expect(() => githubFileUrl(REPO, "HEAD", "a.scss")).toThrow();
        const { transport, seen } = scripted(() => textResponse(200, "{}"));
        const ctx = makeContext(transport);
        expect(await fetchManifest(ctx, { ...REPO, url: "https://github.com/octo/demo" }, "package.json", ref)).toEqual({
          kind: "failed",
          failure: "invalid-reference",
          status: null,
        });
        expect(await fetchPolicyText(ctx, REPO, ref)).toEqual({ kind: "failed" });
        expect((await listTree(ctx, REPO, ref, { token: TOKEN })).ok).toBe(false);
        expect(seen).toEqual([]);
      }),
      { numRuns: 1000 },
    );
  });
});

describe("pinned raw reads (1.1 to 1.4)", () => {
  it("builds the HEAD URLs as before when no ref is given", () => {
    expect(manifestUrl(REPO, "package.json")).toBe("https://raw.githubusercontent.com/octo/demo/HEAD/package.json");
    expect(policyUrl(REPO)).toBe("https://raw.githubusercontent.com/octo/demo/HEAD/sexton.policy.yml");
  });

  it("reads both manifests at the commit and keys the cache by the commit", async () => {
    const { transport, seen } = scripted((url) =>
      url.endsWith("package.json") ? textResponse(200, '{"dependencies":{}}') : textResponse(404, "{}"),
    );
    const ctx = makeContext(transport);
    const result = await intakeRepoWithManifests("https://github.com/octo/demo", ctx, SHA);
    expect(result.result.ok).toBe(true);
    expect(seen.map((s) => s.url)).toEqual([
      `https://raw.githubusercontent.com/octo/demo/${SHA}/package.json`,
      `https://raw.githubusercontent.com/octo/demo/${SHA}/package-lock.json`,
    ]);
    // A HEAD read of the same file is a different cache entry, so it is fetched.
    await fetchManifest(ctx, { ...REPO, url: "https://github.com/octo/demo" }, "package.json");
    expect(seen.at(-1)?.url).toBe("https://raw.githubusercontent.com/octo/demo/HEAD/package.json");
    expect(seen.every((s) => s.request.headers["Authorization"] === undefined)).toBe(true);
  });

  it("reads the policy at the commit", async () => {
    const { transport, seen } = scripted(() => textResponse(404, "{}"));
    expect(await fetchPolicyText(makeContext(transport), REPO, SHA)).toEqual({ kind: "absent" });
    expect(seen[0]?.url).toBe(`https://raw.githubusercontent.com/octo/demo/${SHA}/sexton.policy.yml`);
  });
});

describe("resolveHeadCommit (2.1, 2.2, 2.6 to 2.9)", () => {
  it("sends the one allowed request and answers the SHA", async () => {
    const { transport, seen } = scripted(() => textResponse(200, SHA));
    expect(await resolveHeadCommit(makeContext(transport), REPO, { token: TOKEN })).toEqual({ ok: true, sha: SHA });
    expect(seen).toEqual([
      {
        url: "https://api.github.com/repos/octo/demo/commits/HEAD",
        request: {
          method: "GET",
          headers: { Authorization: `Bearer ${TOKEN}`, Accept: "application/vnd.github.sha", "X-GitHub-Api-Version": "2026-03-10" },
          redirect: "manual",
        },
      },
    ]);
    expect(headCommitUrl(REPO)).toBe("https://api.github.com/repos/octo/demo/commits/HEAD");
  });

  it("is not cached", async () => {
    const { transport, seen } = scripted(() => textResponse(200, SHA));
    const ctx = makeContext(transport);
    await resolveHeadCommit(ctx, REPO, { token: TOKEN });
    await resolveHeadCommit(ctx, REPO, { token: TOKEN });
    expect(seen).toHaveLength(2);
  });

  it.each([
    ["upper-case", SHA.toUpperCase()],
    ["trailing newline", `${SHA}\n`],
    ["short", SHA.slice(1)],
    ["empty", ""],
  ])("refuses a %s body", async (_, body) => {
    const { transport } = scripted(() => textResponse(200, body));
    expect(await resolveHeadCommit(makeContext(transport), REPO, { token: TOKEN })).toEqual({ ok: false, reason: "invalid-body", status: 200 });
  });

  it.each([301, 302, 304, 307, 401, 403, 404, 409, 422, 500])("answers a failure with status %i and does not retry it", async (status) => {
    const { transport, seen } = scripted(() => textResponse(status, SHA));
    expect(await resolveHeadCommit(makeContext(transport), REPO, { token: TOKEN })).toEqual({ ok: false, reason: "http-status", status });
    expect(seen).toHaveLength(1);
  });

  it("retries 429 and 503 under the existing rule", async () => {
    const { transport, seen } = scripted(() => textResponse(503, ""));
    expect(await resolveHeadCommit(makeContext(transport), REPO, { token: TOKEN })).toEqual({ ok: false, reason: "http-status", status: 503 });
    expect(seen).toHaveLength(4);
  });

  it("answers network for a transport that throws", async () => {
    const transport: Transport = () => Promise.reject(new Error(`boom ${TOKEN}`));
    expect(await resolveHeadCommit(makeContext(transport), REPO, { token: TOKEN })).toEqual({ ok: false, reason: "network", status: null });
  });

  it("makes no request for an invalid token, owner or repo", async () => {
    const { transport, seen } = scripted(() => textResponse(200, SHA));
    const ctx = makeContext(transport);
    for (const token of ["", "ghp_short", `ghp_${"a".repeat(30)}\r\nX: y`, `Bearer ghp_${"a".repeat(30)}`]) {
      expect((await resolveHeadCommit(ctx, REPO, { token })).ok).toBe(false);
    }
    expect((await resolveHeadCommit(ctx, { owner: "a/b", repo: "c" }, { token: TOKEN })).ok).toBe(false);
    expect((await resolveHeadCommit(ctx, { owner: "a", repo: ".." }, { token: TOKEN })).ok).toBe(false);
    expect(seen).toEqual([]);
  });
});

describe("listTree (2.3 to 2.7)", () => {
  const tree = (entries: unknown[], truncated = false) => JSON.stringify({ sha: SHA, tree: entries, truncated });

  it("keeps blob paths, sends the allowed request, and caches under the SHA", async () => {
    const body = tree([
      { path: "src", type: "tree" },
      { path: "src/a.scss", type: "blob" },
      { path: "sub", type: "commit" },
      { path: "README.md", type: "blob" },
    ]);
    const { transport, seen } = scripted(() => textResponse(200, body));
    const ctx = makeContext(transport);
    expect(await listTree(ctx, REPO, SHA, { token: TOKEN })).toEqual({ ok: true, paths: ["src/a.scss", "README.md"], capped: false });
    expect(await listTree(ctx, REPO, SHA, { token: TOKEN })).toEqual({ ok: true, paths: ["src/a.scss", "README.md"], capped: false });
    expect(seen).toHaveLength(1);
    expect(seen[0]?.url).toBe(`https://api.github.com/repos/octo/demo/git/trees/${SHA}?recursive=1`);
    expect(seen[0]?.request.headers["Authorization"]).toBe(`Bearer ${TOKEN}`);
    expect(seen[0]?.request.headers["Accept"]).toBe("application/vnd.github+json");
    expect(seen[0]?.request.redirect).toBe("manual");
  });

  it("is capped when truncated", () => {
    expect(readTree({ tree: [{ path: "a", type: "blob" }], truncated: true })).toEqual({ paths: ["a"], capped: true });
  });

  it("stops at 20000 raw entries and is capped", () => {
    const entries = Array.from({ length: MAX_TREE_ENTRIES + 5 }, (_, i) => ({ path: `f${String(i)}`, type: i % 2 === 0 ? "blob" : "tree" }));
    const listing = readTree({ tree: entries, truncated: false });
    expect(listing.capped).toBe(true);
    expect(listing.paths).toHaveLength(MAX_TREE_ENTRIES / 2);
    expect(listing.paths.includes(`f${String(MAX_TREE_ENTRIES)}`)).toBe(false);
    expect(readTree({ tree: entries.slice(0, MAX_TREE_ENTRIES) }).capped).toBe(false);
  });

  it("does not cache a failure", async () => {
    let status = 500;
    const { transport, seen } = scripted(() => textResponse(status, tree([{ path: "a", type: "blob" }])));
    const ctx = makeContext(transport);
    expect(await listTree(ctx, REPO, SHA, { token: TOKEN })).toEqual({ ok: false, reason: "http-status", status: 500 });
    status = 200;
    expect((await listTree(ctx, REPO, SHA, { token: TOKEN })).ok).toBe(true);
    expect(seen).toHaveLength(2);
  });

  it("answers invalid-body for a body that is not a tree, is not JSON, or is over the cap", async () => {
    for (const text of ['{"message":"x"}', "not json"]) {
      const { transport } = scripted(() => textResponse(200, text));
      expect(await listTree(makeContext(transport), REPO, SHA, { token: TOKEN })).toEqual({ ok: false, reason: "invalid-body", status: 200 });
    }
    let limit = 0;
    const big: Transport = () =>
      Promise.resolve({
        status: 200,
        json: () => Promise.resolve({ tree: [] }),
        text: (l: number) => {
          limit = l;
          return Promise.resolve({ ok: false, reason: "too-large" });
        },
      });
    expect(await listTree(makeContext(big), REPO, SHA, { token: TOKEN })).toEqual({ ok: false, reason: "invalid-body", status: 200 });
    expect(limit).toBe(8 * 1024 * 1024);
  });
});

describe("createFetchTransport redirect option (2.10)", () => {
  it("passes redirect manual only when asked", async () => {
    const inits: RequestInit[] = [];
    const fake = ((_: string, init: RequestInit) => {
      inits.push(init);
      return Promise.resolve(new Response("x", { status: 301 }));
    }) as unknown as typeof fetch;
    const transport = createFetchTransport(fake);
    const manual = await transport("https://api.github.com/x", { method: "GET", headers: {}, redirect: "manual" });
    await transport("https://registry.npmjs.org/x", { method: "GET", headers: {} });
    expect(manual.status).toBe(301);
    expect(inits[0]?.redirect).toBe("manual");
    expect(inits[1]?.redirect).toBeUndefined();
  });
});

describe("Feature: hosted-plans, Property 52 (client level): Authorization only on the two allowed shapes (1000 runs)", () => {
  const COMMIT = /^https:\/\/api\.github\.com\/repos\/[^/]+\/[^/]+\/commits\/HEAD$/;
  const TREE = /^https:\/\/api\.github\.com\/repos\/[^/]+\/[^/]+\/git\/trees\/[0-9a-f]{40}\?recursive=1$/;
  const arbToken = fc.tuple(fc.constantFrom("ghp_", "github_pat_"), fc.stringMatching(/^[A-Za-z0-9_]{20,40}$/)).map(([a, b]) => a + b);
  const arbName = fc.oneof(fc.stringMatching(/^[A-Za-z0-9-]{1,12}$/), fc.string({ maxLength: 12 }));

  it("sends the token only to api.github.com, GET, without redirects, in one of the two shapes", async () => {
    await fc.assert(
      fc.asyncProperty(
        arbToken,
        arbName,
        arbName,
        fc.oneof(fc.hexaString({ minLength: 40, maxLength: 40 }), fc.string({ maxLength: 45 })),
        fc.constantFrom(200, 301, 404, 503),
        async (token, owner, repo, sha, status) => {
          const { transport, seen } = scripted(() => textResponse(status, status === 200 ? SHA : "{}"));
          const ctx = makeContext(transport);
          await resolveHeadCommit(ctx, { owner, repo }, { token });
          await listTree(ctx, { owner, repo }, sha, { token });
          for (const s of seen) {
            expect(s.url).not.toContain(token);
            expect(s.request.body ?? "").not.toContain(token);
            const entries = Object.entries(s.request.headers);
            const auth = entries.filter(([h]) => h.toLowerCase() === "authorization");
            expect(JSON.stringify(entries.filter(([h]) => h.toLowerCase() !== "authorization"))).not.toContain(token);
            if (auth.length === 0) continue;
            expect(auth).toEqual([["Authorization", `Bearer ${token}`]]);
            expect(new URL(s.url).host).toBe("api.github.com");
            expect(s.request.method).toBe("GET");
            expect(s.request.redirect).toBe("manual");
            expect(COMMIT.test(s.url) || TREE.test(s.url)).toBe(true);
          }
        },
      ),
      { numRuns: 1000 },
    );
  });
});
