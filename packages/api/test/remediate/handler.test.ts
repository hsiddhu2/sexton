// POST /api/remediate end to end over the fixtures and an in-memory GitHub, plus the scan's actions and the
// evidence log. Spec: .kiro/specs/remediate, Requirements 3, 6, 7. Properties 61 and 62. No network.

import fc from "fast-check";
import type { EvidencePack } from "@sexton/engine";
import type { LambdaFunctionURLEvent } from "aws-lambda";
import { describe, expect, it } from "vitest";
import type { ScanResponse } from "../../src/contract.js";
import type { FunctionUrlResponse } from "../../src/http/responses.js";
import { parseAllowlist } from "../../src/remediate/allowlist.js";
import { REASONS } from "../../src/remediate/executor.js";
import { createRemediateHandler } from "../../src/remediate-handler.js";
import { createScanHandler } from "../../src/scan-handler.js";
import { CACHE_TABLE, LOG_TABLE, MemoryDynamo, SEEN_INDEX, SNAPSHOTS_TABLE } from "../fakes/memory-dynamo.js";
import { fakeGithub, type FakeGithub } from "../support/fake-github.js";
import { makeEvent, repoQuery } from "../support/events.js";
import { FIXTURE_NOW, fixturePackages, packageRoutes, PLAN_ROUTES, repoRoutes, routedTransport, type Route } from "../support/fixture-transport.js";

const OWNER = "hsiddhu2";
const NAME = "sexton-demo";
const REPO_URL = `https://github.com/${OWNER}/${NAME}`;
const SHA = "43fca52d28a422c8be48fd489cbd4f2d6152bab6";
const TOKEN = ["github", "pat", "R".repeat(40)].join("_");
const ALLOW = parseAllowlist(`${OWNER}/${NAME}`);
const PACKAGES = [...fixturePackages().filter((p) => p.name === "node-sass"), { name: "sass", installedVersion: "1.80.0" }];
const ENV = { cacheTable: CACHE_TABLE, snapshotsTable: SNAPSHOTS_TABLE, seenIndex: SEEN_INDEX, logTable: LOG_TABLE };

function world(port = new MemoryDynamo()) {
  const repo = repoRoutes(OWNER, NAME, PACKAGES);
  const pkgText = repo[0]?.text ?? "";
  const routes: Route[] = [
    ...repo.map((r) => ({ ...r, url: r.url.replace("/HEAD/", `/${SHA}/`) })),
    { url: `https://raw.githubusercontent.com/${OWNER}/${NAME}/${SHA}/sexton.policy.yml`, status: 404, text: "" },
    { url: `https://raw.githubusercontent.com/${OWNER}/${NAME}/${SHA}/src/app.scss`, text: "a {\n}\n.card /deep/ .title { color: red; }\n" },
    ...PACKAGES.filter((p) => p.name !== "sass").flatMap((p) => packageRoutes(p.name, p.installedVersion)),
    ...PLAN_ROUTES,
  ];
  const routed = routedTransport(routes);
  const gh: FakeGithub = fakeGithub({ owner: OWNER, repo: NAME, commit: SHA, packageJson: pkgText, tree: ["package.json", "src/app.scss"] }, routed.transport);
  const lines: string[] = [];
  const common = { port, transport: gh.transport, clock: () => FIXTURE_NOW, sink: (l: string) => lines.push(l), retry: { sleep: () => Promise.resolve() } };
  const remediate = createRemediateHandler({ environment: ENV, allow: ALLOW, githubToken: () => Promise.resolve(TOKEN), ...common });
  const scan = createScanHandler({
    environment: { cacheTable: CACHE_TABLE, snapshotsTable: SNAPSHOTS_TABLE, seenIndex: SEEN_INDEX },
    allowlist: ALLOW,
    remediationLogTable: LOG_TABLE,
    githubToken: () => Promise.resolve(TOKEN),
    ...common,
  });
  return { gh, routed, lines, remediate, scan, port };
}

function post(body: unknown): LambdaFunctionURLEvent {
  return {
    ...makeEvent({ method: "POST", rawPath: "/api/remediate", headers: { "content-type": "application/json", "x-amz-content-sha256": "h" } }),
    body: typeof body === "string" ? body : JSON.stringify(body),
    isBase64Encoded: false,
  };
}

const CTX = { awsRequestId: "req-1" };
const json = (r: FunctionUrlResponse): Record<string, unknown> => JSON.parse(r.body ?? "null") as Record<string, unknown>;

describe("POST /api/remediate end to end (definition of done)", () => {
  it("opens a pull request, answers existing on the second call, and refuses another repository with zero requests", async () => {
    const w = world();
    const first = await w.remediate(post({ repo: REPO_URL, package: "node-sass" }), CTX);
    expect(first.statusCode).toBe(200);
    expect(json(first)).toEqual({ status: "opened", prUrl: `${REPO_URL}/pull/1`, logged: true, reviewSites: { posted: 1, dropped: 0 } });
    expect(first.headers).toMatchObject({ "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
    expect(Object.keys(first.headers ?? {}).some((h) => h.toLowerCase().startsWith("access-control-"))).toBe(false);
    expect(w.gh.pulls).toHaveLength(1);
    expect(w.gh.pulls[0]).toMatchObject({ head: "sexton/migrate-node-sass", base: "main" });
    expect(w.gh.comments).toHaveLength(1);

    const second = await w.remediate(post({ repo: REPO_URL, package: "node-sass" }), CTX);
    expect(json(second)).toEqual({ status: "existing", prUrl: `${REPO_URL}/pull/1` });
    expect(w.gh.pulls).toHaveLength(1);

    const before = w.gh.sent.length;
    const other = await w.remediate(post({ repo: "https://github.com/expressjs/express", package: "debug" }), CTX);
    expect(other.statusCode).toBe(422);
    expect(json(other)["code"]).toBe("repository-not-allowed");
    expect(w.gh.sent.length).toBe(before);
  });

  it("shows the log in the hosted evidence pack and sets actions.remediate on the scan", async () => {
    const w = world();
    await w.remediate(post({ repo: REPO_URL, package: "node-sass" }), CTX);
    const scan = json(await w.scan(makeEvent({ rawQueryString: repoQuery(REPO_URL) }), CTX)) as unknown as ScanResponse;
    expect(scan.actions).toEqual({ remediate: true });
    // Spec cemetery-time, 14.1: prUrl now appears in the scan, only inside the pullRequests marks.
    expect(scan.pullRequests).toEqual([{ package: "node-sass", kind: "migrate", prUrl: `${REPO_URL}/pull/1`, timestamp: expect.any(String) as string }]);
    expect(JSON.stringify({ ...scan, pullRequests: undefined })).not.toContain("prUrl");
    const ev = await w.scan(makeEvent({ rawPath: "/api/evidence", rawQueryString: `${repoQuery(REPO_URL)}&format=json` }), CTX);
    const pack = json(ev) as unknown as EvidencePack;
    expect(pack.body.remediation.log.available).toBe(true);
    expect(pack.body.remediation.log.entries).toHaveLength(1);
  });

  it("sets actions.remediate false for a repository off the allowlist (7.2)", async () => {
    const w = world();
    const scanner = createScanHandler({
      environment: { cacheTable: CACHE_TABLE, snapshotsTable: SNAPSHOTS_TABLE, seenIndex: SEEN_INDEX },
      allowlist: parseAllowlist("someone/else"),
      port: w.port,
      transport: w.gh.transport,
      clock: () => FIXTURE_NOW,
      retry: { sleep: () => Promise.resolve() },
      githubToken: () => Promise.resolve(TOKEN),
    });
    const scan = json(await scanner(makeEvent({ rawQueryString: repoQuery(REPO_URL) }), CTX)) as unknown as ScanResponse;
    expect(scan.actions).toEqual({ remediate: false });
  });

  it("passes a null log and writes one warn line when the log read fails (7.1)", async () => {
    const w = world();
    const failing = new MemoryDynamo(undefined, { fail: (op) => (op === "query" ? new Error("log read failed") : undefined) });
    const lines: string[] = [];
    const scanner = createScanHandler({
      environment: { cacheTable: CACHE_TABLE, snapshotsTable: SNAPSHOTS_TABLE, seenIndex: SEEN_INDEX },
      allowlist: ALLOW,
      remediationLogTable: LOG_TABLE,
      port: failing,
      transport: w.gh.transport,
      clock: () => FIXTURE_NOW,
      sink: (l) => lines.push(l),
      retry: { sleep: () => Promise.resolve() },
      githubToken: () => Promise.resolve(TOKEN),
    });
    const pack = json(await scanner(makeEvent({ rawPath: "/api/evidence", rawQueryString: `${repoQuery(REPO_URL)}&format=json` }), CTX)) as unknown as EvidencePack;
    expect(pack.body.remediation.log).toEqual({ available: false, entries: [] });
    expect(lines.filter((l) => l.includes('"msg":"remediation-log-unavailable"'))).toHaveLength(1);
  });

  it("logs one remediate line without the repository, branch, URL or token", async () => {
    const w = world();
    await w.remediate(post({ repo: REPO_URL, package: "node-sass" }), CTX);
    const line = w.lines.map((l) => JSON.parse(l) as Record<string, unknown>).find((l) => l["msg"] === "remediate");
    expect(line).toMatchObject({ status: 200, outcome: "opened", logged: true, posted: 1, dropped: 0, bodyHash: true });
    const all = w.lines.join("\n");
    for (const secret of [TOKEN, NAME, "sexton/migrate", "/pull/"]) expect(all).not.toContain(secret);
  });

  it("refuses without a token and makes no GitHub request", async () => {
    const w = world();
    const handler = createRemediateHandler({ environment: ENV, allow: ALLOW, githubToken: () => Promise.resolve(null), port: w.port, transport: w.gh.transport, clock: () => FIXTURE_NOW });
    expect(json(await handler(post({ repo: REPO_URL, package: "node-sass" }), CTX))).toEqual({ status: "refused", reason: REASONS.noToken });
    expect(w.gh.sent).toEqual([]);
  });

  it("refuses a package with no proposed plan, with no write", async () => {
    const w = world();
    expect(json(await w.remediate(post({ repo: REPO_URL, package: "sass" }), CTX))).toEqual({ status: "refused", reason: REASONS.notProposed });
    expect(w.gh.sent.some((s) => ["create-ref", "put-package-json", "create-pull", "create-comment"].includes(s.kind))).toBe(false);
  });

  it("uses the lower-cased repository URL (3.12)", async () => {
    const w = world();
    expect(json(await w.remediate(post({ repo: "https://github.com/HSiddhu2/Sexton-Demo", package: "node-sass" }), CTX))["status"]).toBe("opened");
  });
});

const arbOwner = fc.stringMatching(/^[A-Za-z0-9][A-Za-z0-9-]{0,10}$/);
const arbName = fc.stringMatching(/^[A-Za-z0-9._-]{1,12}$/).filter((n) => n !== "." && n !== ".." && !n.endsWith(".git"));

describe("Feature: remediate, Property 61: outside the allowlist, no request (1000 runs)", () => {
  it("answers 422 or 400 and sends nothing", async () => {
    const w = world();
    await fc.assert(
      fc.asyncProperty(arbOwner, arbName, fc.constantFrom("node-sass", "lodash", "@a/b"), async (owner, name, pkg) => {
        fc.pre(`${owner}/${name}`.toLowerCase() !== `${OWNER}/${NAME}`);
        const before = w.gh.sent.length;
        const r = await w.remediate(post({ repo: `https://github.com/${owner}/${name}`, package: pkg }), CTX);
        expect([400, 422]).toContain(r.statusCode);
        expect(w.gh.sent.length).toBe(before);
      }),
      { numRuns: 1000 },
    );
  });
});

describe("Feature: remediate, Property 62: the client body cannot steer the change (1000 runs)", () => {
  it("sends only the plan's branch, title, body and edits, whatever the client sends", async () => {
    const port = new MemoryDynamo();
    const reference = world(port);
    await reference.remediate(post({ repo: REPO_URL, package: "node-sass" }), CTX);
    const expected = {
      pull: reference.gh.pulls[0],
      file: reference.gh.files.get("sexton/migrate-node-sass"),
      comment: reference.gh.comments[0]?.body,
    };
    const arbBody = fc.oneof(
      fc.record({ repo: fc.constantFrom(REPO_URL, REPO_URL.toUpperCase().replace("HTTPS://GITHUB.COM", "https://github.com")), package: fc.constantFrom("node-sass", "sass", "lodash", "@x/y") }),
      fc.record({ repo: fc.constant(REPO_URL), package: fc.constant("node-sass"), branch: fc.string(), title: fc.string(), body: fc.string(), edits: fc.string() }),
      fc.string({ maxLength: 60 }),
    );
    await fc.assert(
      fc.asyncProperty(arbBody, async (body) => {
        const w = world(port);
        await w.remediate(post(body), CTX);
        for (const p of w.gh.pulls) expect(p).toEqual(expected.pull);
        for (const f of w.gh.files.values()) expect(f).toBe(expected.file);
        for (const c of w.gh.comments) expect(c.body).toBe(expected.comment);
        for (const s of w.gh.sent.filter((x) => x.kind === "create-ref")) expect(JSON.parse(s.request.body ?? "{}")).toEqual({ ref: "refs/heads/sexton/migrate-node-sass", sha: SHA });
      }),
      { numRuns: 1000 },
    );
  }, 600_000);
});
