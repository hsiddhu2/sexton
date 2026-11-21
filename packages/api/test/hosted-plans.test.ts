// The hosted scan with a token and without one. Spec: .kiro/specs/hosted-plans, Requirements 4.5, 5, 6, 7.
// Properties 52, 53, 55, 57 and 58. No network: every upstream answer is a recorded fixture or a route.

import { join } from "node:path";
import { pathToFileURL } from "node:url";
import fc from "fast-check";
import type { EvidencePack } from "@sexton/engine";
import { describe, expect, it } from "vitest";
import type { ScanResponse } from "../src/contract.js";
import type { FunctionUrlResponse } from "../src/http/responses.js";
import { createScanHandler } from "../src/scan-handler.js";
import { decodeCacheItem } from "../src/dynamo/cache-item.js";
import { CACHE_TABLE, MemoryDynamo, SEEN_INDEX, SNAPSHOTS_TABLE } from "./fakes/memory-dynamo.js";
import { makeEvent, repoQuery } from "./support/events.js";
import {
  ENGINE_FIXTURES,
  FIXTURE_NOW,
  fixturePackages,
  packageRoutes,
  PLAN_ROUTES,
  repoRoutes,
  routedTransport,
  type FixturePackage,
  type Route,
} from "./support/fixture-transport.js";

const ENVIRONMENT = { cacheTable: CACHE_TABLE, snapshotsTable: SNAPSHOTS_TABLE, seenIndex: SEEN_INDEX };
const OWNER = "sexton-demo";
const REPO = "fixture";
const URL = `https://github.com/${OWNER}/${REPO}`;
const SHA = "43fca52d28a422c8be48fd489cbd4f2d6152bab6";
const TOKEN = ["github", "pat", "Z9".repeat(20)].join("_");
const COMMIT_URL = `https://api.github.com/repos/${OWNER}/${REPO}/commits/HEAD`;
const TREE_URL = `https://api.github.com/repos/${OWNER}/${REPO}/git/trees/${SHA}?recursive=1`;
const RAW = "https://raw.githubusercontent.com/";

const atSha = (routes: readonly Route[]): Route[] => routes.map((r) => ({ ...r, url: r.url.replace("/HEAD/", `/${SHA}/`) }));
const policyRoute = (ref: string): Route => ({ url: `${RAW}${OWNER}/${REPO}/${ref}/sexton.policy.yml`, status: 404, text: "" });

interface GithubAnswers {
  readonly commitStatus: number;
  readonly commitBody: string;
  readonly treeStatus: number;
  readonly truncated: boolean;
  readonly rawThrows: boolean;
}

const HAPPY: GithubAnswers = { commitStatus: 200, commitBody: SHA, treeStatus: 200, truncated: false, rawThrows: false };

function routesFor(packages: readonly FixturePackage[], github: GithubAnswers): Route[] {
  // sass has no recorded fixture; its scoring requests answer 404 and its signals are unavailable, which is enough here.
  const recorded = packages.filter((p) => p.name !== SASS.name);
  const packageRoutesAll = [...recorded.flatMap((p) => packageRoutes(p.name, p.installedVersion)), ...PLAN_ROUTES];
  const repo = repoRoutes(OWNER, REPO, packages);
  return [
    { url: COMMIT_URL, status: github.commitStatus, text: github.commitBody },
    { url: TREE_URL, status: github.treeStatus, json: { sha: SHA, tree: [{ path: "src/app.scss", type: "blob" }], truncated: github.truncated } },
    ...atSha(repo),
    ...repo,
    policyRoute(SHA),
    policyRoute("HEAD"),
    github.rawThrows
      ? { url: `${RAW}${OWNER}/${REPO}/${SHA}/src/app.scss`, throws: new Error("raw read failed") }
      : { url: `${RAW}${OWNER}/${REPO}/${SHA}/src/app.scss`, text: "a { b: c }" },
    ...packageRoutesAll,
  ];
}

interface Run {
  readonly response: FunctionUrlResponse;
  readonly calls: ReturnType<typeof routedTransport>["calls"];
  readonly lines: string[];
  readonly port: MemoryDynamo;
}

async function run(packages: readonly FixturePackage[], token: string | null, github: GithubAnswers = HAPPY, rawPath = "/api/scan"): Promise<Run> {
  const routed = routedTransport(routesFor(packages, github));
  const lines: string[] = [];
  const port = new MemoryDynamo();
  const handler = createScanHandler({
    environment: ENVIRONMENT,
    port,
    transport: routed.transport,
    clock: () => FIXTURE_NOW,
    sink: (line) => lines.push(line),
    retry: { sleep: () => Promise.resolve() },
    githubToken: () => Promise.resolve(token),
  });
  const query = rawPath === "/api/scan" ? repoQuery(URL) : `${repoQuery(URL)}&format=json`;
  const response = await handler(makeEvent({ rawPath, rawQueryString: query }), { awsRequestId: "req-1" });
  return { response, calls: routed.calls, lines, port };
}

const json = (r: FunctionUrlResponse): unknown => JSON.parse(r.body ?? "null") as unknown;
const ALL = fixturePackages();
const NODE_SASS = ALL.filter((p) => p.name === "node-sass");
// sass already declared: the node-sass recipe skips choosing a sass version and goes on to read the files (6.5).
const SASS: FixturePackage = { name: "sass", installedVersion: "1.80.0" };
const arbPackages = fc.oneof(fc.subarray([...ALL], { minLength: 1, maxLength: 3 }), fc.constant([...NODE_SASS, SASS]));
const arbAnswers: fc.Arbitrary<GithubAnswers> = fc.record({
  commitStatus: fc.constantFrom(200, 200, 301, 302, 401, 403, 404, 409, 500, 503),
  commitBody: fc.constantFrom(SHA, SHA, `${SHA}\n`, "nope"),
  treeStatus: fc.constantFrom(200, 200, 301, 403, 404, 500),
  truncated: fc.boolean(),
  rawThrows: fc.boolean(),
});
const arbToken = fc.tuple(fc.constantFrom("ghp_", "github_pat_"), fc.stringMatching(/^[A-Za-z0-9_]{20,60}$/)).map(([a, b]) => a + b);

const validatorPath = join(ENGINE_FIXTURES, "..", "..", "..", "web", "src", "load", "validate-scan-response.ts");
async function validate(input: unknown): Promise<boolean> {
  const validator = (await import(pathToFileURL(validatorPath).href)) as { validateScanResponse: (i: unknown) => { ok: boolean } };
  return validator.validateScanResponse(input).ok;
}

describe("hosted scan with a token (5.2, 5.3, 6.1, 6.5, 7.1)", () => {
  it("resolves the head commit, reads the manifests and the policy at it, and answers plans", async () => {
    const r = await run(ALL, TOKEN);
    expect(r.response.statusCode).toBe(200);
    const urls = r.calls.map((c) => c.url);
    expect(urls[0]).toBe(COMMIT_URL);
    expect(urls).toContain(`${RAW}${OWNER}/${REPO}/${SHA}/package.json`);
    expect(urls).toContain(`${RAW}${OWNER}/${REPO}/${SHA}/package-lock.json`);
    expect(urls).toContain(`${RAW}${OWNER}/${REPO}/${SHA}/sexton.policy.yml`);
    expect(urls.some((u) => u.includes("/HEAD/"))).toBe(false);
    const body = json(r.response) as ScanResponse;
    expect(body.remediations?.length).toBeGreaterThan(0);
    expect(body.remediations?.some((e) => e.kind === "remove")).toBe(false);
    expect(await validate(body)).toBe(true);
  });

  it("puts the commit and the plans in the evidence pack", async () => {
    const r = await run(ALL, TOKEN, HAPPY, "/api/evidence");
    expect(r.response.statusCode).toBe(200);
    const pack = json(r.response) as EvidencePack;
    expect(pack.body.scan.commit).toBe(SHA);
    expect(pack.body.remediation.plans.length).toBeGreaterThan(0);
    expect(pack.body.remediation.log).toEqual({ available: false, entries: [] });
  });

  it("builds the File source when a recipe needs files: one tree read with the token, raw reads at the commit without it", async () => {
    const withSass = await run([...NODE_SASS, SASS], TOKEN);
    expect(withSass.response.statusCode).toBe(200);
    const tree = withSass.calls.filter((c) => c.url === TREE_URL);
    expect(tree).toHaveLength(1);
    expect(tree[0]?.request.headers["Authorization"]).toBe(`Bearer ${TOKEN}`);
    expect(tree[0]?.request.redirect).toBe("manual");
    const file = withSass.calls.filter((c) => c.url === `${RAW}${OWNER}/${REPO}/${SHA}/src/app.scss`);
    expect(file).toHaveLength(1);
    expect(file[0]?.request.headers["Authorization"]).toBeUndefined();
    const migrate = (json(withSass.response) as ScanResponse).remediations?.find((e) => e.packageName === "node-sass");
    expect(migrate?.kind).toBe("migrate");
    expect(migrate?.status).toBe("proposed");
    // Without a token there is no File source: no tree read, no raw file read.
    const anonymous = await run([...NODE_SASS, SASS], null);
    expect(anonymous.calls.some((c) => c.url.includes("/src/app.scss") || c.url === TREE_URL)).toBe(false);
    const without = await run(ALL.filter((p) => p.name !== "node-sass"), TOKEN);
    expect(without.calls.some((c) => c.url === TREE_URL)).toBe(false);
  });

  it("falls back to HEAD with commit null and one status-only warn line when the head commit fails", async () => {
    const r = await run(ALL, TOKEN, { ...HAPPY, commitStatus: 403 });
    expect(r.response.statusCode).toBe(200);
    expect(r.calls.map((c) => c.url)).toContain(`${RAW}${OWNER}/${REPO}/HEAD/package.json`);
    const warns = r.lines.map((l) => JSON.parse(l) as Record<string, unknown>).filter((l) => l["msg"] === "github-api-unavailable");
    expect(warns).toHaveLength(1);
    expect(Object.keys(warns[0] ?? {}).sort()).toEqual(["correlationId", "level", "msg", "status", "time"]);
    expect(warns[0]?.["status"]).toBe(403);
    const pack = json((await run(ALL, TOKEN, { ...HAPPY, commitStatus: 404 }, "/api/evidence")).response) as EvidencePack;
    expect(pack.body.scan.commit).toBeNull();
  });
});

describe("hosted scan without a token (5.1, 7.1)", () => {
  it("reads at HEAD, makes no api.github.com request, records commit null and still plans", async () => {
    const r = await run(ALL, null);
    expect(r.response.statusCode).toBe(200);
    expect(r.calls.some((c) => c.url.startsWith("https://api.github.com/"))).toBe(false);
    expect(r.calls.map((c) => c.url)).toContain(`${RAW}${OWNER}/${REPO}/HEAD/package.json`);
    expect(((json(r.response) as ScanResponse).remediations ?? []).length).toBeGreaterThan(0);
    const pack = json((await run(ALL, null, HAPPY, "/api/evidence")).response) as EvidencePack;
    expect(pack.body.scan.commit).toBeNull();
  });

  it("treats a provider that rejects as no token", async () => {
    const routed = routedTransport(routesFor(ALL, HAPPY));
    const handler = createScanHandler({
      environment: ENVIRONMENT,
      port: new MemoryDynamo(),
      transport: routed.transport,
      clock: () => FIXTURE_NOW,
      sink: () => undefined,
      retry: { sleep: () => Promise.resolve() },
      githubToken: () => Promise.reject(new Error("secret down")),
    });
    const response = await handler(makeEvent({ rawQueryString: repoQuery(URL) }), { awsRequestId: "r" });
    expect(response.statusCode).toBe(200);
    expect(routed.calls.some((c) => c.url.startsWith("https://api.github.com/"))).toBe(false);
  });
});

const COMMIT_SHAPE = /^https:\/\/api\.github\.com\/repos\/[^/]+\/[^/]+\/commits\/HEAD$/;
const TREE_SHAPE = /^https:\/\/api\.github\.com\/repos\/[^/]+\/[^/]+\/git\/trees\/[0-9a-f]{40}\?recursive=1$/;

describe("Feature: hosted-plans, Property 52: Authorization only on the two allowed shapes (1000 runs)", () => {
  it("every request that carries Authorization is a GET to api.github.com of one allowed shape, without redirects", async () => {
    await fc.assert(
      fc.asyncProperty(arbPackages, arbToken, arbAnswers, async (packages, token, answers) => {
        const r = await run(packages, token, answers);
        for (const c of r.calls) {
          const auth = Object.keys(c.request.headers).some((h) => h.toLowerCase() === "authorization");
          if (!auth) {
            expect(JSON.stringify(c.request)).not.toContain(token);
            continue;
          }
          const others = Object.entries(c.request.headers).filter(([h]) => h.toLowerCase() !== "authorization");
          expect(JSON.stringify(others)).not.toContain(token);
          expect(c.request.body ?? "").not.toContain(token);
          expect(new globalThis.URL(c.url).host).toBe("api.github.com");
          expect(c.request.method).toBe("GET");
          expect(c.request.redirect).toBe("manual");
          expect(COMMIT_SHAPE.test(c.url) || TREE_SHAPE.test(c.url)).toBe(true);
        }
      }),
      { numRuns: 1000 },
    );
  }, 300_000);
});

describe("Feature: hosted-plans, Property 53: the token never leaks (1000 runs)", () => {
  it("is in no log line, URL, cache key, cached value or response body", async () => {
    await fc.assert(
      fc.asyncProperty(arbPackages, arbToken, arbAnswers, fc.boolean(), async (packages, token, answers, evidence) => {
        const r = await run(packages, token, answers, evidence ? "/api/evidence" : "/api/scan");
        expect(r.response.body ?? "").not.toContain(token);
        expect(JSON.stringify(r.response.headers ?? {})).not.toContain(token);
        for (const line of r.lines) expect(line).not.toContain(token);
        for (const c of r.calls) expect(c.url).not.toContain(token);
        for (const w of r.port.writes) {
          expect(JSON.stringify(w.item["pk"] ?? null)).not.toContain(token);
          const decoded = w.table === CACHE_TABLE ? decodeCacheItem(w.item) : undefined;
          expect(JSON.stringify(decoded?.value ?? null)).not.toContain(token);
        }
      }),
      { numRuns: 1000 },
    );
  }, 300_000);
});

describe("Feature: hosted-plans, Property 55: no token, no API call", () => {
  it("makes no api.github.com request and reads at HEAD", async () => {
    await fc.assert(
      fc.asyncProperty(arbPackages, arbAnswers, async (packages, answers) => {
        const r = await run(packages, null, answers);
        expect(r.calls.some((c) => new globalThis.URL(c.url).host === "api.github.com")).toBe(false);
        expect(r.calls.filter((c) => c.url.startsWith(RAW)).every((c) => c.url.includes("/HEAD/"))).toBe(true);
      }),
      { numRuns: 100 },
    );
  });
});

describe("Feature: hosted-plans, Property 57: failures still give a 200 scan", () => {
  it("answers 200 with a body the web validator accepts for any GitHub API or File-source failure", async () => {
    await fc.assert(
      fc.asyncProperty(arbPackages, fc.option(arbToken, { nil: null }), arbAnswers, async (packages, token, answers) => {
        const r = await run(packages, token, answers);
        expect(r.response.statusCode).toBe(200);
        expect(await validate(json(r.response))).toBe(true);
      }),
      { numRuns: 100 },
    );
  });
});

describe("Feature: hosted-plans, Property 58: hosted plans never remove", () => {
  it("proposes no remove for any hosted scan", async () => {
    await fc.assert(
      fc.asyncProperty(arbPackages, fc.option(arbToken, { nil: null }), async (packages, token) => {
        const body = json((await run(packages, token)).response) as ScanResponse;
        expect((body.remediations ?? []).some((e) => e.kind === "remove")).toBe(false);
      }),
      { numRuns: 100 },
    );
  });
});
