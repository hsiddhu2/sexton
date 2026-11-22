// The request builder, review sites, responses and the log store. Spec: .kiro/specs/remediate. Properties 64 (builder), 67, 68.

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { parseAllowlist } from "../../src/remediate/allowlist.js";
import { buildWriteRequest, type WriteRequest } from "../../src/remediate/github-requests.js";
import { DynamoRemediationLog } from "../../src/remediate/log-store.js";
import { hasPrPrefix, outcomeBody, PR_PREFIX } from "../../src/remediate/response.js";
import { MAX_LISTED_SITES, reviewSiteComment } from "../../src/remediate/review-sites.js";
import { LOG_TABLE, MemoryDynamo } from "../fakes/memory-dynamo.js";

const REPO = { owner: "hsiddhu2", repo: "sexton-demo" };
const ALLOW = parseAllowlist("hsiddhu2/sexton-demo");
const TOKEN = ["github", "pat", "Q".repeat(40)].join("_");
const SHA = "a".repeat(40);

describe("buildWriteRequest (2.1 to 2.3)", () => {
  const requests: WriteRequest[] = [
    { kind: "get-repo" },
    { kind: "list-sexton-refs" },
    { kind: "list-pulls", branch: "sexton/bump-@scope__x" },
    { kind: "get-package-json", sha: SHA },
    { kind: "create-ref", branch: "sexton/bump-x", sha: SHA },
    { kind: "put-package-json", branch: "sexton/bump-x", message: "m", contentBase64: "e30=", blobSha: SHA },
    { kind: "create-pull", branch: "sexton/bump-x", base: "main", title: "t", body: "b" },
    { kind: "create-comment", number: 3, body: "b" },
  ];

  it("builds the eight shapes with the token only in Authorization and no redirect", () => {
    const urls = requests.map((r) => {
      const built = buildWriteRequest(REPO, ALLOW, TOKEN, r);
      expect(built.request.redirect).toBe("manual");
      expect(built.request.headers["Authorization"]).toBe(`Bearer ${TOKEN}`);
      expect(built.url).not.toContain(TOKEN);
      expect(built.request.body ?? "").not.toContain(TOKEN);
      return `${built.request.method} ${built.url.replace("https://api.github.com/repos/hsiddhu2/sexton-demo", "")}`;
    });
    expect(urls).toEqual([
      "GET ",
      "GET /git/matching-refs/heads/sexton/",
      "GET /pulls?head=hsiddhu2%3Asexton%2Fbump-%40scope__x&state=all&per_page=10",
      `GET /contents/package.json?ref=${SHA}`,
      "POST /git/refs",
      "PUT /contents/package.json",
      "POST /pulls",
      "POST /issues/3/comments",
    ]);
    expect(JSON.parse(buildWriteRequest(REPO, ALLOW, TOKEN, requests[4] as WriteRequest).request.body ?? "")).toEqual({ ref: "refs/heads/sexton/bump-x", sha: SHA });
    expect(JSON.parse(buildWriteRequest(REPO, ALLOW, TOKEN, requests[6] as WriteRequest).request.body ?? "")).toMatchObject({ draft: false });
  });

  it("refuses a repository off the allowlist, a bad token, and any non-Sexton branch", () => {
    expect(() => buildWriteRequest({ owner: "expressjs", repo: "express" }, ALLOW, TOKEN, { kind: "get-repo" })).toThrow();
    expect(() => buildWriteRequest(REPO, ALLOW, "nope", { kind: "get-repo" })).toThrow();
    for (const branch of ["main", "Sexton/x", "sexton/", "sexton/a..b", "refs/heads/main"]) {
      expect(() => buildWriteRequest(REPO, ALLOW, TOKEN, { kind: "create-ref", branch, sha: SHA })).toThrow();
      expect(() => buildWriteRequest(REPO, ALLOW, TOKEN, { kind: "put-package-json", branch, message: "m", contentBase64: "", blobSha: SHA })).toThrow();
    }
    expect(() => buildWriteRequest(REPO, ALLOW, TOKEN, { kind: "create-pull", branch: "sexton/x", base: "sexton/y", title: "t", body: "b" })).toThrow();
    expect(() => buildWriteRequest(REPO, ALLOW, TOKEN, { kind: "create-comment", number: 0, body: "b" })).toThrow();
  });

  it("Feature: remediate, Property 64 (builder): create-ref and put only ever target refs/heads/sexton/ (1000 runs)", () => {
    fc.assert(
      fc.property(fc.oneof(fc.string({ maxLength: 40 }), fc.string({ maxLength: 20 }).map((s) => `sexton/${s}`)), (branch) => {
        let built: ReturnType<typeof buildWriteRequest> | null;
        try {
          built = buildWriteRequest(REPO, ALLOW, TOKEN, { kind: "create-ref", branch, sha: SHA });
        } catch {
          built = null; // Refused: no request.
        }
        if (built !== null) expect((JSON.parse(built.request.body ?? "{}") as { ref: string }).ref.startsWith("refs/heads/sexton/")).toBe(true);
      }),
      { numRuns: 1000 },
    );
  });
});

describe("Feature: remediate, Property 68: review-site validation", () => {
  const arbComment = fc.record({
    path: fc.oneof(fc.constantFrom("src/a.scss", "package.json", "../x", "src/missing.scss", "a b/c.scss"), fc.string({ maxLength: 8 })),
    line: fc.oneof(fc.constant(null), fc.integer({ min: -2, max: 500 })),
    body: fc.oneof(fc.string({ maxLength: 30 }), fc.constant("x".repeat(1001))),
  });
  it("links only Safe paths in the tree, lines positive or absent, at most 50 listed, posted + dropped = input", () => {
    fc.assert(
      fc.property(fc.array(arbComment, { maxLength: 80 }), (comments) => {
        const tree = new Set(["src/a.scss", "package.json", "a b/c.scss"]);
        const result = reviewSiteComment(REPO, SHA, comments, tree);
        if (result === null) return;
        expect(result.posted + result.dropped).toBe(comments.length);
        const links = [...result.body.matchAll(/\]\((https:[^)]+)\)/g)].map((m) => m[1] as string);
        expect(links.length).toBeLessThanOrEqual(MAX_LISTED_SITES);
        for (const link of links) {
          const m = /^https:\/\/github\.com\/hsiddhu2\/sexton-demo\/blob\/a{40}\/([^#]+)(#L([1-9][0-9]*))?$/.exec(link);
          expect(m).not.toBeNull();
          expect(tree.has(decodeURIComponent(m?.[1] ?? ""))).toBe(true);
        }
      }),
      { numRuns: 100 },
    );
  });

  it("lists 50 then summarises the rest", () => {
    const comments = Array.from({ length: 53 }, (_, i) => ({ path: "src/a.scss", line: i + 1, body: "Sexton: check" }));
    const r = reviewSiteComment(REPO, SHA, comments, new Set(["src/a.scss"]));
    expect(r?.posted).toBe(53);
    expect(r?.body).toContain("and 3 more review sites were found");
  });
});

describe("Feature: remediate, Property 67: every prUrl has the PR prefix", () => {
  it("drops any URL that is not the prefix and digits", () => {
    fc.assert(
      fc.property(fc.oneof(fc.string(), fc.nat().map((n) => `${PR_PREFIX}${String(n)}`), fc.string().map((s) => `${PR_PREFIX}${s}`)), (url) => {
        for (const body of [outcomeBody({ status: "opened", prUrl: url, logged: true }), outcomeBody({ status: "existing", prUrl: url })]) {
          if ("prUrl" in body) expect(hasPrPrefix(body["prUrl"])).toBe(true);
          expect(body["prUrl"] === undefined || /^https:\/\/github\.com\/hsiddhu2\/sexton-demo\/pull\/[1-9][0-9]*$/.test(String(body["prUrl"]))).toBe(true);
        }
      }),
      { numRuns: 100 },
    );
  });
});

describe("DynamoRemediationLog (5.2)", () => {
  const entry = {
    repository: "https://github.com/hsiddhu2/sexton-demo",
    branch: "sexton/migrate-node-sass",
    prUrl: `${PR_PREFIX}1`,
    package: "node-sass",
    kind: "migrate" as const,
    timestamp: "2026-11-22T00:00:00.000Z",
  };
  it("appends a valid entry once and lists it", async () => {
    const port = new MemoryDynamo();
    const log = new DynamoRemediationLog(port, LOG_TABLE);
    expect(await log.append(entry)).toEqual({ ok: true });
    expect(await log.append(entry)).toEqual({ ok: false, reason: "write-failed" });
    expect(await log.list(entry.repository)).toEqual([entry]);
    expect(await log.list("https://github.com/o/r")).toEqual([]);
  });
  it("refuses an invalid entry without a write", async () => {
    const port = new MemoryDynamo();
    const log = new DynamoRemediationLog(port, LOG_TABLE);
    expect(await log.append({ ...entry, branch: "main" })).toEqual({ ok: false, reason: "invalid-entry" });
    expect(port.writes).toHaveLength(0);
  });
});

describe("review-site links (code review note 4)", () => {
  it("encodes parentheses so a path cannot end the link", () => {
    const r = reviewSiteComment(REPO, SHA, [{ path: "src/a)b(c.scss", line: 1, body: "x" }], new Set(["src/a)b(c.scss"]));
    expect(r?.body).toContain("/src/a%29b%28c.scss#L1)");
  });
});
