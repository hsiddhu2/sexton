// The Executor against an in-memory GitHub. Spec: .kiro/specs/remediate, Requirements 2 to 5.
// Properties 60, 63, 64, 65 and the concurrent create-ref case (3.6).

import fc from "fast-check";
import { CachedFetcher, MemoryCacheStore, type RemediationEntry, type Transport } from "@sexton/engine";
import { describe, expect, it } from "vitest";
import { parseAllowlist } from "../../src/remediate/allowlist.js";
import { execute, MIN_REMAINING_MS, REASONS, type ExecutorDeps } from "../../src/remediate/executor.js";
import type { LogAppend, RemediationLogWriter } from "../../src/remediate/log-store.js";
import { fakeGithub, type FakeGithubOptions, type FakeKind } from "../support/fake-github.js";

const OWNER = "hsiddhu2";
const NAME = "sexton-demo";
const REPO = { owner: OWNER, repo: NAME, url: `https://github.com/${OWNER}/${NAME}` };
const SHA = "1234567890abcdef1234567890abcdef12345678";
const TOKEN = ["github", "pat", "W".repeat(40)].join("_");
const ALLOW = parseAllowlist(`${OWNER}/${NAME}`);
const PKG = '{\n  "name": "sexton-demo",\n  "dependencies": {\n    "lodash": "^4.17.21"\n  },\n  "devDependencies": {\n    "node-sass": "^7.0.3"\n  }\n}\n';

const ENTRY: RemediationEntry = {
  packageName: "node-sass",
  kind: "migrate",
  status: "proposed",
  title: "Sexton: migrate node-sass to sass",
  summary: "Migrate node-sass to sass",
  prBody: "## body",
  intent: {
    branch: "sexton/migrate-node-sass",
    title: "Sexton: migrate node-sass to sass",
    body: "## body",
    files: [
      { path: "package.json", op: "remove-dependency", section: "devDependencies", name: "node-sass" },
      { path: "package.json", op: "add-dependency", section: "devDependencies", name: "sass", range: "^1.80.0" },
    ],
    baseRef: "@default",
    reviewComments: [{ path: "src/app.scss", line: 3, body: "Sexton: this line uses the `/deep/` combinator. Line: `x`" }],
  },
};

const noFallback: Transport = () => Promise.reject(new Error("no other host in executor tests"));

function memoryLog(): RemediationLogWriter & { entries: unknown[] } {
  const entries: unknown[] = [];
  return {
    entries,
    append: (e): Promise<LogAppend> => {
      entries.push(e);
      return Promise.resolve({ ok: true });
    },
  };
}

function setup(options: Partial<FakeGithubOptions> = {}, deps: Partial<ExecutorDeps> = {}) {
  const gh = fakeGithub({ owner: OWNER, repo: NAME, commit: SHA, packageJson: PKG, tree: ["package.json", "src/app.scss"], ...options }, noFallback);
  const clock = () => new Date("2026-11-22T00:00:00Z");
  const log = memoryLog();
  const run = () =>
    execute(REPO, SHA, ENTRY, {
      ctx: { transport: gh.transport, clock, cache: new CachedFetcher({ store: new MemoryCacheStore(), clock }), retry: { sleep: () => Promise.resolve() } },
      token: TOKEN,
      allow: ALLOW,
      log,
      clock,
      ...deps,
    });
  return { gh, log, run };
}

describe("execute (3.2 to 3.11, 4.1, 5.2)", () => {
  it("opens one pull request from the plan, comments the review sites and logs the entry", async () => {
    const { gh, log, run } = setup();
    const outcome = await run();
    expect(outcome).toEqual({ status: "opened", prUrl: `https://github.com/${OWNER}/${NAME}/pull/1`, logged: true, reviewSites: { posted: 1, dropped: 0 } });
    expect(gh.sent.map((s) => s.kind)).toEqual(["get-repo", "list-sexton-refs", "get-package-json", "create-ref", "put-package-json", "create-pull", "tree", "create-comment"]);
    expect(gh.pulls[0]).toMatchObject({ head: "sexton/migrate-node-sass", base: "main", title: ENTRY.title, body: "## body" });
    const changed = JSON.parse(gh.files.get("sexton/migrate-node-sass") ?? "{}") as Record<string, Record<string, string>>;
    expect(changed["devDependencies"]).toEqual({ sass: "^1.80.0" });
    expect(gh.comments[0]?.body).toContain(`https://github.com/${OWNER}/${NAME}/blob/${SHA}/src/app.scss#L3`);
    expect(log.entries).toEqual([
      { repository: REPO.url, branch: "sexton/migrate-node-sass", prUrl: `https://github.com/${OWNER}/${NAME}/pull/1`, package: "node-sass", kind: "migrate", timestamp: "2026-11-22T00:00:00.000Z" },
    ]);
  });

  it("answers existing for a colliding branch with an open pull request, in any letter case, and creates nothing", async () => {
    const { gh, run } = setup({ refs: ["refs/heads/sexton/Migrate-Node-Sass"], openPulls: ["sexton/Migrate-Node-Sass"] });
    expect(await run()).toEqual({ status: "existing", prUrl: `https://github.com/${OWNER}/${NAME}/pull/1` });
    expect(gh.sent.some((s) => s.kind === "create-ref")).toBe(false);
  });

  it("refuses a colliding branch without an open pull request", async () => {
    const { gh, run } = setup({ refs: ["refs/heads/sexton/migrate-node-sass"] });
    expect(await run()).toEqual({ status: "refused", reason: REASONS.branchExists });
    expect(gh.sent.some((s) => s.kind === "create-ref")).toBe(false);
  });

  it("refuses when the change is already in package.json", async () => {
    const noop: RemediationEntry = { ...ENTRY, intent: { ...(ENTRY.intent as NonNullable<RemediationEntry["intent"]>), files: [{ path: "package.json", op: "set-range", section: "devDependencies", name: "sass", range: "^1.80.0" }] } };
    const gh = fakeGithub({ owner: OWNER, repo: NAME, commit: SHA, packageJson: '{"devDependencies":{"sass":"^1.80.0"}}' }, noFallback);
    const clock = () => new Date();
    expect(await execute(REPO, SHA, noop, { ctx: { transport: gh.transport, clock, cache: new CachedFetcher({ store: new MemoryCacheStore(), clock }) }, token: TOKEN, allow: ALLOW, log: memoryLog(), clock })).toEqual({
      status: "refused",
      reason: REASONS.noChange,
    });
    expect(gh.sent.some((s) => s.kind === "create-ref")).toBe(false);
  });

  it("fails at apply-edits when the edits cannot be applied", async () => {
    const { run } = setup({ packageJson: '{"dependencies":{}}' });
    expect(await run()).toMatchObject({ status: "failed", step: "apply-edits" });
  });

  it("refuses before the branch when too little time is left", async () => {
    const { gh, run } = setup({}, { remainingMs: () => MIN_REMAINING_MS - 1 });
    expect(await run()).toEqual({ status: "refused", reason: REASONS.tooSlow });
    expect(gh.sent.some((s) => s.kind === "create-ref")).toBe(false);
  });

  it("answers failed at the step and leaves the branch when a later step fails", async () => {
    const { gh, run } = setup({ statuses: { "create-pull": 422 } });
    expect(await run()).toEqual({ status: "failed", step: "open-pull-request", reason: REASONS.stepFailed });
    expect(gh.refs.has("refs/heads/sexton/migrate-node-sass")).toBe(true);
  });

  it("answers opened with logged false when the log write fails", async () => {
    const { run } = setup({}, { log: { append: () => Promise.reject(new Error("dynamo down")) } });
    expect(await run()).toMatchObject({ status: "opened", logged: false });
  });

  it("refuses a plan that is not proposed or has no intent, with no request", async () => {
    const { gh } = setup();
    const clock = () => new Date();
    const deps = { ctx: { transport: gh.transport, clock, cache: new CachedFetcher({ store: new MemoryCacheStore(), clock }) }, token: TOKEN, allow: ALLOW, log: memoryLog(), clock };
    expect(await execute(REPO, SHA, { ...ENTRY, status: "no-safe-version" }, deps)).toEqual({ status: "refused", reason: REASONS.notProposed });
    const noIntent: RemediationEntry = { ...ENTRY };
    Reflect.deleteProperty(noIntent, "intent");
    expect(await execute(REPO, SHA, noIntent, deps)).toEqual({ status: "refused", reason: REASONS.notProposed });
    expect(gh.sent).toEqual([]);
  });

  it("two concurrent requests open one pull request (3.6)", async () => {
    const { gh, run } = setup();
    const [a, b] = await Promise.all([run(), run()]);
    expect(gh.pulls).toHaveLength(1);
    const statuses = [a.status, b.status].sort();
    expect(statuses[0] === "existing" || statuses[0] === "opened").toBe(true);
    expect(statuses).toContain("opened");
    const other = a.status === "opened" ? b : a;
    expect(["existing", "refused"]).toContain(other.status);
    if (other.status === "refused") expect(other.reason).toBe(REASONS.inProgress);
  });
});

const STATUS_KINDS: FakeKind[] = ["get-repo", "list-sexton-refs", "list-pulls", "get-package-json", "create-ref", "put-package-json", "create-pull", "create-comment", "tree"];
const arbStatuses = fc.dictionary(fc.constantFrom(...STATUS_KINDS), fc.constantFrom(200, 201, 301, 403, 404, 409, 422, 500, 503), { maxKeys: 3 });
const arbRefs = fc.subarray(["refs/heads/sexton/migrate-node-sass", "refs/heads/sexton/MIGRATE-node-sass", "refs/heads/sexton/bump-x", "refs/heads/main"]);
const arbToken = fc.tuple(fc.constantFrom("ghp_", "github_pat_"), fc.stringMatching(/^[A-Za-z0-9_]{20,40}$/)).map(([a, b]) => a + b);
const COMMIT_OR_TREE = /^https:\/\/api\.github\.com\/repos\/hsiddhu2\/sexton-demo\/(commits\/HEAD|git\/trees\/[0-9a-f]{40}\?recursive=1)$/;
const WRITE_PATH =
  /^https:\/\/api\.github\.com\/repos\/hsiddhu2\/sexton-demo(|\/git\/matching-refs\/heads\/sexton\/|\/pulls\?head=[^&]+&state=all&per_page=10|\/contents\/package\.json\?ref=[0-9a-f]{40}|\/git\/refs|\/contents\/package\.json|\/pulls|\/issues\/[1-9][0-9]*\/comments)$/;

describe("Feature: remediate, Properties 60, 63, 64 and 65 over any GitHub answers (1000 runs)", () => {
  it("sends only allowed shapes on the allowed repository, never leaks the token, never deletes or touches the default branch, and never creates a colliding branch", async () => {
    await fc.assert(
      fc.asyncProperty(arbStatuses, arbRefs, arbToken, fc.constantFrom("main", "trunk", "Sexton-Main"), async (statuses, refs, token, defaultBranch) => {
        const gh = fakeGithub(
          { owner: OWNER, repo: NAME, commit: SHA, packageJson: PKG, tree: ["package.json", "src/app.scss"], refs, statuses, defaultBranch },
          noFallback,
        );
        const clock = () => new Date("2026-11-22T00:00:00Z");
        const log = memoryLog();
        const outcome = await execute(REPO, SHA, ENTRY, {
          ctx: { transport: gh.transport, clock, cache: new CachedFetcher({ store: new MemoryCacheStore(), clock }), retry: { sleep: () => Promise.resolve() } },
          token,
          allow: ALLOW,
          log,
          clock,
        });
        const collision = refs.some((r) => r.toLowerCase() === "refs/heads/sexton/migrate-node-sass");
        for (const s of gh.sent) {
          // Property 60
          expect(s.kind).not.toBe("unexpected");
          expect(COMMIT_OR_TREE.test(s.url) || WRITE_PATH.test(s.url)).toBe(true);
          expect(s.request.redirect).toBe("manual");
          // Property 63
          expect(s.url).not.toContain(token);
          expect(s.request.body ?? "").not.toContain(token);
          expect(s.request.headers["Authorization"]).toBe(`Bearer ${token}`);
          // Property 64
          expect(["GET", "POST", "PUT"]).toContain(s.request.method);
          expect(s.url.toLowerCase()).not.toContain(`refs/heads/${defaultBranch.toLowerCase()}`);
          if (s.kind === "create-ref" || s.kind === "put-package-json") {
            const body = JSON.parse(s.request.body ?? "{}") as { ref?: string; branch?: string };
            const branch = s.kind === "create-ref" ? (body.ref ?? "").replace("refs/heads/", "") : (body.branch ?? "");
            expect(branch.startsWith("sexton/")).toBe(true);
            expect(branch.toLowerCase()).not.toBe(defaultBranch.toLowerCase());
          }
          // Property 65
          if (collision) expect(s.kind).not.toBe("create-ref");
        }
        expect(JSON.stringify(outcome)).not.toContain(token);
        expect(JSON.stringify(log.entries)).not.toContain(token);
      }),
      { numRuns: 1000 },
    );
  }, 300_000);
});
