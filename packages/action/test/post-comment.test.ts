// The comment step. Spec: .kiro/specs/cli-and-action, Requirements 9.5 to 9.9. Properties 49 and 50.

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { API_BASE, BOT_LOGIN, MARKER } from "../src/comment-client.js";
import { prNumberFromEvent } from "../src/event.js";
import { postComment, type PostDeps } from "../src/post-comment.js";

interface Sent {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: string;
}

type Reply = { status: number; json: unknown } | "throw";

function harness(env: Record<string, string>, files: Record<string, string>, replies: Reply[]) {
  const sent: Sent[] = [];
  const logs: string[] = [];
  let i = 0;
  const deps: PostDeps = {
    env,
    readText: (path) => (Object.hasOwn(files, path) ? Promise.resolve(files[path] as string) : Promise.reject(new Error(`ENOENT ${path}`))),
    fetch: (url, init) => {
      sent.push({ url, ...init });
      const reply = replies[i++] ?? { status: 500, json: null };
      if (reply === "throw") return Promise.reject(new Error(`network failed for ${url} with ${init.headers["Authorization"] ?? ""}`));
      return Promise.resolve({ status: reply.status, json: () => Promise.resolve(reply.json) });
    },
    log: (line) => logs.push(line),
  };
  return { deps, sent, logs };
}

const BASE_ENV = {
  GITHUB_EVENT_NAME: "pull_request",
  SEXTON_COMMENT: "true",
  SEXTON_TOKEN: "ghs_secretTOKEN123",
  GITHUB_REPOSITORY: "acme/app",
  GITHUB_EVENT_PATH: "/e.json",
  SEXTON_SUMMARY: "/s.md",
};
const FILES = { "/e.json": JSON.stringify({ pull_request: { number: 7 } }), "/s.md": `${MARKER}\n## Sexton check: pass\n` };
const bot = (id: number, body = `${MARKER}\nold`) => ({ id, body, user: { login: BOT_LOGIN, type: "Bot" } });

describe("postComment examples", () => {
  it("creates a comment when none of ours exists", async () => {
    const h = harness(BASE_ENV, FILES, [{ status: 200, json: [] }, { status: 201, json: {} }]);
    expect(await postComment(h.deps)).toBe(0);
    expect(h.sent.map((s) => `${s.method} ${s.url}`)).toEqual([
      `GET ${API_BASE}/repos/acme/app/issues/7/comments?per_page=100&page=1`,
      `POST ${API_BASE}/repos/acme/app/issues/7/comments`,
    ]);
    expect(JSON.parse(h.sent[1]?.body ?? "{}")).toEqual({ body: FILES["/s.md"] });
    expect(h.sent[0]?.headers).toMatchObject({ Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2026-03-10", Authorization: "Bearer ghs_secretTOKEN123" });
    expect(h.logs).toEqual(["sexton: comment created"]);
  });

  it("updates our own marker comment and never one planted by someone else", async () => {
    const planted = { id: 5, body: `${MARKER}\nfake pass`, user: { login: "mallory", type: "User" } };
    const h = harness(BASE_ENV, FILES, [{ status: 200, json: [planted, bot(9)] }, { status: 200, json: {} }]);
    await postComment(h.deps);
    expect(h.sent[1]).toMatchObject({ method: "PATCH", url: `${API_BASE}/repos/acme/app/issues/comments/9` });
    const only = harness(BASE_ENV, FILES, [{ status: 200, json: [planted] }, { status: 201, json: {} }]);
    await postComment(only.deps);
    expect(only.sent[1]?.method).toBe("POST");
  });

  it("reads at most three pages", async () => {
    const full = Array.from({ length: 100 }, (_, i) => ({ id: i + 1, body: "x", user: { login: "u", type: "User" } }));
    const h = harness(BASE_ENV, FILES, [{ status: 200, json: full }, { status: 200, json: full }, { status: 200, json: full }, { status: 201, json: {} }]);
    await postComment(h.deps);
    expect(h.sent.filter((s) => s.method === "GET")).toHaveLength(3);
    expect(h.sent[3]?.method).toBe("POST");
  });

  it("warns and exits 0 on a read-only token, a missing token, another event and comment off", async () => {
    const forbidden = harness(BASE_ENV, FILES, [{ status: 403, json: { message: "Resource not accessible by integration" } }]);
    expect(await postComment(forbidden.deps)).toBe(0);
    expect(forbidden.logs).toEqual(["::warning::sexton: comment not posted (HTTP 403)"]);
    for (const env of [{ ...BASE_ENV, SEXTON_TOKEN: "" }, { ...BASE_ENV, GITHUB_EVENT_NAME: "push" }, { ...BASE_ENV, SEXTON_COMMENT: "false" }]) {
      const h = harness(env, FILES, []);
      expect(await postComment(h.deps)).toBe(0);
      expect(h.sent).toHaveLength(0);
    }
  });

  it("takes the pull request number only when it is a positive integer", () => {
    expect(prNumberFromEvent('{"pull_request":{"number":12}}')).toBe(12);
    expect(prNumberFromEvent('{"number":3}')).toBe(3);
    for (const text of ['{"pull_request":{"number":0}}', '{"number":-1}', '{"number":1.5}', '{"number":"7"}', '{"number":9007199254740993}', "[]", "x", "null"]) {
      expect(prNumberFromEvent(text)).toBeNull();
    }
  });
});

const arbEvent = fc.oneof(
  fc.integer({ min: -5, max: 1e6 }).map((n) => JSON.stringify({ pull_request: { number: n } })),
  fc.anything().map((v) => JSON.stringify(v) ?? "null"),
  fc.string({ maxLength: 20 }),
  fc.constantFrom('{"pull_request":{"number":"7"}}', '{"number":2.5}', '{"pull_request":{"number":1e400}}'),
);
const arbRepository = fc.oneof(fc.constantFrom("acme/app", "a/b", "../x", "a/b/c", "a", "evil.com/x?y", "a b/c", "acme/app#1"), fc.string({ maxLength: 20 }));
const arbComment = fc.oneof(
  fc.record({ id: fc.oneof(fc.integer({ min: -2, max: 1e9 }), fc.string()), body: fc.oneof(fc.constant(`${MARKER}\nx`), fc.string()), user: fc.record({ login: fc.constantFrom(BOT_LOGIN, "mallory"), type: fc.constantFrom("Bot", "User") }) }),
  fc.anything(),
);
const arbReply: fc.Arbitrary<Reply> = fc.oneof(
  fc.record({ status: fc.constantFrom(200, 201, 403, 404, 500, Number.NaN), json: fc.oneof(fc.array(arbComment, { maxLength: 4 }), fc.anything()) }),
  fc.constant<Reply>("throw"),
);

describe("Feature: cli-and-action, Property 50: Only allowed requests", () => {
  it("sends only the three shapes to api.github.com, at most 3 lists, nothing without a valid number, and updates only our comment", async () => {
    await fc.assert(
      fc.asyncProperty(arbEvent, arbRepository, fc.array(arbReply, { maxLength: 5 }), async (event, repository, replies) => {
        const h = harness({ ...BASE_ENV, GITHUB_REPOSITORY: repository }, { ...FILES, "/e.json": event }, replies);
        expect(await postComment(h.deps)).toBe(0);
        const shapes = [
          /^GET https:\/\/api\.github\.com\/repos\/[A-Za-z0-9-]+\/[A-Za-z0-9._-]+\/issues\/[1-9]\d*\/comments\?per_page=100&page=[123]$/,
          /^POST https:\/\/api\.github\.com\/repos\/[A-Za-z0-9-]+\/[A-Za-z0-9._-]+\/issues\/[1-9]\d*\/comments$/,
          /^PATCH https:\/\/api\.github\.com\/repos\/[A-Za-z0-9-]+\/[A-Za-z0-9._-]+\/issues\/comments\/[1-9]\d*$/,
        ];
        for (const s of h.sent) expect(shapes.some((re) => re.test(`${s.method} ${s.url}`))).toBe(true);
        expect(h.sent.filter((s) => s.method === "GET").length).toBeLessThanOrEqual(3);
        const n = prNumberFromEvent(event);
        if (n === null) expect(h.sent).toHaveLength(0);
        const patch = h.sent.find((s) => s.method === "PATCH");
        if (patch !== undefined) {
          const id = Number(patch.url.split("/").pop());
          const pages = replies.flatMap((r) => (r !== "throw" && Array.isArray(r.json) ? (r.json as unknown[]) : []));
          expect(pages.some((c) => typeof c === "object" && c !== null && (c as { id?: unknown }).id === id && (c as { user?: { login?: unknown } }).user?.login === BOT_LOGIN)).toBe(true);
        }
      }),
      { numRuns: 1000 },
    );
  });
});

describe("Feature: cli-and-action, Property 49: The token is never output", () => {
  it("never appears in logs or a thrown message, even when a response or an error echoes it", async () => {
    await fc.assert(
      fc.asyncProperty(fc.stringMatching(/^[A-Za-z0-9_]{8,40}$/), arbEvent, fc.array(arbReply, { maxLength: 5 }), fc.boolean(), async (token, event, replies, echo) => {
        const echoed = replies.map((r) => (r !== "throw" && echo ? { status: r.status, json: { message: token, token } } : r));
        const h = harness({ ...BASE_ENV, SEXTON_TOKEN: token }, { ...FILES, "/e.json": event }, echoed);
        let thrown = "";
        try {
          await postComment(h.deps);
        } catch (error) {
          thrown = String(error);
        }
        expect(h.logs.join("\n")).not.toContain(token);
        expect(thrown).not.toContain(token);
      }),
      { numRuns: 1000 },
    );
  });
});
