// The scan API end to end through createScanHandler. Spec: .kiro/specs/infra, Requirements 4.1 to 4.13, 6.5.
// Properties 9 (handler half) and 10. No network: every upstream answer is a recorded fixture or a route.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import fc from "fast-check";
import { DEFAULT_POLICY, formatPolicy, formatRepoUrl, intakeRepo, parsePolicy, parseRepoUrl, type IntakeResult } from "@sexton/engine";
import type { LambdaFunctionURLEvent } from "aws-lambda";
import { describe, expect, it } from "vitest";
import type { ScanResponse } from "../src/contract.js";
import { FIXED_MESSAGES, type FunctionUrlResponse } from "../src/http/responses.js";
import { createScanHandler, readScanEnvironment, type ScanHandlerDeps } from "../src/scan-handler.js";
import { arbEvent, arbHostileRepo } from "./arbitraries.js";
import { CACHE_TABLE, MemoryDynamo, SEEN_INDEX, SNAPSHOTS_TABLE } from "./fakes/memory-dynamo.js";
import { makeEvent, repoQuery } from "./support/events.js";
import { ENGINE_FIXTURES, FIXTURE_NOW, fixturePackages, packageRoutes, repoRoutes, routedTransport, type Route } from "./support/fixture-transport.js";

const ENVIRONMENT = { cacheTable: CACHE_TABLE, snapshotsTable: SNAPSHOTS_TABLE, seenIndex: SEEN_INDEX };
const CONTEXT = { awsRequestId: "lambda-req-1" };
const OWNER = "sexton-demo";
const REPO = "fixture";
const POLICY_URL = (owner: string, repo: string) => `https://raw.githubusercontent.com/${owner}/${repo}/HEAD/sexton.policy.yml`;
const NO_SLEEP = { sleep: () => Promise.resolve() };

interface Harness {
  readonly handle: (event: LambdaFunctionURLEvent) => Promise<FunctionUrlResponse>;
  readonly port: MemoryDynamo;
  readonly calls: ReturnType<typeof routedTransport>["calls"];
  readonly unrouted: string[];
  readonly lines: Record<string, unknown>[];
}

function harness(routes: readonly Route[], extra: Partial<ScanHandlerDeps> = {}, port = new MemoryDynamo()): Harness {
  const routed = routedTransport(routes);
  const lines: Record<string, unknown>[] = [];
  const handler = createScanHandler({
    environment: ENVIRONMENT,
    port,
    transport: routed.transport,
    clock: () => FIXTURE_NOW,
    sink: (line) => lines.push(JSON.parse(line) as Record<string, unknown>),
    retry: NO_SLEEP,
    ...extra,
  });
  return { handle: (event) => handler(event, CONTEXT), port, calls: routed.calls, unrouted: routed.unrouted, lines };
}

function scanEvent(url: string, headers: Record<string, string> = {}): LambdaFunctionURLEvent {
  return makeEvent({ rawQueryString: repoQuery(url), headers });
}

function json(result: FunctionUrlResponse): Record<string, unknown> {
  return JSON.parse(result.body ?? "null") as Record<string, unknown>;
}

const allPackageRoutes = () => fixturePackages().flatMap((p) => packageRoutes(p.name, p.installedVersion));

describe("Feature: infra, Property 9: Request validation is exclusive (handler)", () => {
  it("either rejects with no I/O, or calls intake exactly once with the Canonical URL", async () => {
    await fc.assert(
      fc.asyncProperty(arbEvent, async (event) => {
        const intakeCalls: string[] = [];
        const intake: typeof intakeRepo = (url) => {
          intakeCalls.push(url);
          return Promise.resolve({ ok: false, code: "missing-package-json", message: "m", file: "package.json" } satisfies IntakeResult);
        };
        const h = harness([], { intake });
        const result = await h.handle(event);
        if (result.statusCode === 400 || result.statusCode === 405) {
          expect(intakeCalls).toHaveLength(0);
          expect(h.calls).toHaveLength(0);
          expect(h.port.calls).toHaveLength(0);
          const body = json(result);
          expect(Object.values(FIXED_MESSAGES)).toContain(body["message"]);
        } else {
          expect(intakeCalls).toHaveLength(1);
          const value = new URLSearchParams(event.rawQueryString).get("repo") ?? "";
          const parsed = parseRepoUrl(value);
          expect(parsed.ok).toBe(true);
          if (parsed.ok) expect(intakeCalls[0]).toBe(formatRepoUrl(parsed.repo));
          expect(result.statusCode).toBe(422);
        }
      }),
      { numRuns: 1000 },
    );
  });
});

describe("Feature: infra, Property 10: Error bodies never echo input", () => {
  // Policy keys use only characters that no repository parameter window can be made of (see arbCanary).
  const BAD_POLICY = "version: 1\nrules: []\nl0l0_o1o1: x\n";

  type Scenario = (owner: string, repo: string) => { routes: Route[]; intake?: typeof intakeRepo };
  const raw = (owner: string, repo: string, file: string) => `https://raw.githubusercontent.com/${owner}/${repo}/HEAD/${file}`;
  const one = [{ name: "left-pad", installedVersion: "1.3.0" }];
  const scenarios: Record<string, Scenario> = {
    "missing package.json": () => ({ routes: [] }),
    "invalid package.json": (o, r) => ({ routes: [{ url: raw(o, r, "package.json"), text: `{"name": "${o}${r}", "dependencies": "${r}"` }] }),
    "invalid lockfile": (o, r) => ({ routes: [repoRoutes(o, r, one)[0] as Route, { url: raw(o, r, "package-lock.json"), text: `{"lockfileVersion": "${r}"}` }] }),
    "package.json too large": (o, r) => ({ routes: [{ url: raw(o, r, "package.json"), text: `${r}`.repeat(1 + (5 * 1024 * 1024) / Math.max(1, r.length)) }] }),
    "package.json fetch 500": (o, r) => ({ routes: [{ url: raw(o, r, "package.json"), status: 500, text: r }] }),
    "package.json network error": (o, r) => ({ routes: [{ url: raw(o, r, "package.json"), throws: new Error(`${o}/${r}`) }] }),
    "invalid policy": (o, r) => ({ routes: [...repoRoutes(o, r, one), ...packageRoutes("left-pad", "1.3.0"), { url: POLICY_URL(o, r), text: BAD_POLICY }] }),
    "policy fetch 500": (o, r) => ({ routes: [...repoRoutes(o, r, one), ...packageRoutes("left-pad", "1.3.0"), { url: POLICY_URL(o, r), status: 500, text: `${o}${r}` }] }),
    "intake throws": (o, r) => ({ routes: [], intake: () => Promise.reject(new Error(`${o}${r}`)) }),
  };

  async function bodyFor(url: string, scenario: Scenario): Promise<{ status: number; body: string }> {
    const parsed = parseRepoUrl(url);
    const { routes, intake } = parsed.ok ? scenario(parsed.repo.owner, parsed.repo.repo) : { routes: [], intake: undefined };
    const result = await harness(routes, intake !== undefined ? { intake } : {}).handle(scanEvent(url));
    return { status: result.statusCode ?? 0, body: result.body ?? "" };
  }

  it("a failing response contains no 4-character window of the repo parameter outside the fixed text", async () => {
    // Fixed text: what each scenario answers for a repository whose names are too short to form a window.
    const fixed: string[] = [JSON.stringify(FIXED_MESSAGES)];
    for (const scenario of Object.values(scenarios)) fixed.push((await bodyFor("https://github.com/o/r", scenario)).body);
    const fixedText = fixed.join("\n");
    expect(BAD_POLICY.length).toBeGreaterThan(0);
    expect(parsePolicy(BAD_POLICY).ok).toBe(false);

    await fc.assert(
      fc.asyncProperty(arbHostileRepo, fc.constantFrom(...Object.keys(scenarios)), async (hostile, name) => {
        const scenario = scenarios[name];
        if (scenario === undefined) throw new Error("unknown scenario");
        const { status, body } = await bodyFor(hostile.repo, scenario);
        expect(status).not.toBe(200);
        for (let i = 0; i + 4 <= hostile.repo.length; i += 1) {
          const window = hostile.repo.slice(i, i + 4);
          if (body.includes(window)) expect(fixedText).toContain(window);
        }
        expect(body).not.toContain(hostile.canary);
      }),
      { numRuns: 1000 },
    );
  });
});

describe("end to end over the engine fixtures", () => {
  const url = `https://github.com/${OWNER}/${REPO}`;
  const packages = fixturePackages();

  it("returns 200 with a ScanResponse the cemetery UI validator accepts, the expected states and the default policy", async () => {
    const h = harness([...repoRoutes(OWNER, REPO, packages), ...allPackageRoutes(), { url: POLICY_URL(OWNER, REPO), status: 404, text: "" }]);
    const result = await h.handle(scanEvent(url, { "x-amz-cf-id": "cf-abc_123==" }));
    expect(h.unrouted).toEqual([]);
    expect(result.statusCode).toBe(200);
    expect(result.headers).toMatchObject({ "content-type": "application/json; charset=utf-8", "cache-control": "public, max-age=300", "x-sexton-request-id": "cf-abc_123==" });
    const body = json(result) as unknown as ScanResponse;
    expect(JSON.parse(JSON.stringify(body))).toEqual(body);

    const expected = JSON.parse(readFileSync(join(ENGINE_FIXTURES, "expected-states.json"), "utf8")) as Record<string, { state: string }>;
    expect(Object.fromEntries(body.report.packages.map((p) => [p.name, p.state]))).toEqual(Object.fromEntries(Object.entries(expected).map(([n, e]) => [n, e.state])));
    expect(body.report.scan?.repo).toEqual({ owner: OWNER, repo: REPO, url });
    expect(body.policy.source).toBe("default");

    // The web app's own validator, loaded at run time so the API's type-check stays inside its package.
    const validatorPath = join(ENGINE_FIXTURES, "..", "..", "..", "web", "src", "load", "validate-scan-response.ts");
    const validator = (await import(pathToFileURL(validatorPath).href)) as { validateScanResponse: (input: unknown) => { ok: boolean; errors?: unknown } };
    expect(validator.validateScanResponse(JSON.parse(result.body ?? "null"))).toMatchObject({ ok: true });
  });

  it("writes one summary line with counts and no repository, and one line per upstream request", async () => {
    const h = harness([...repoRoutes(OWNER, REPO, packages), ...allPackageRoutes(), { url: POLICY_URL(OWNER, REPO), status: 404, text: "" }]);
    await h.handle(scanEvent(url));
    const summaries = h.lines.filter((l) => l["msg"] === "scan");
    expect(summaries).toHaveLength(1);
    expect(summaries[0]).toMatchObject({ status: 200, packages: 10, capped: false, unlocked: false, policySource: "default", correlationId: "lambda-req-1" });
    expect(typeof summaries[0]?.["durationMs"]).toBe("number");
    expect(JSON.stringify(summaries)).not.toContain(OWNER);
    expect(h.lines.filter((l) => l["msg"] === "upstream")).toHaveLength(h.calls.length);
    expect(JSON.stringify(h.lines)).not.toContain(OWNER);
  });

  it("evaluates a policy file from the repository with source file", async () => {
    const policyText = formatPolicy(DEFAULT_POLICY);
    const h = harness([...repoRoutes(OWNER, REPO, packages), ...allPackageRoutes(), { url: POLICY_URL(OWNER, REPO), text: policyText }]);
    const result = await h.handle(scanEvent(url));
    expect(result.statusCode).toBe(200);
    expect((json(result)["policy"] as { source: string }).source).toBe("file");
  });

  it("answers 422 invalid-policy with code and path only, and no partial scan", async () => {
    const h = harness([...repoRoutes(OWNER, REPO, packages), ...allPackageRoutes(), { url: POLICY_URL(OWNER, REPO), text: "version: 2\nrules: []\nextra_key: 1\n" }]);
    const result = await h.handle(scanEvent(url));
    expect(result.statusCode).toBe(422);
    expect(result.headers?.["cache-control"]).toBe("no-store");
    const body = json(result);
    expect(body["code"]).toBe("invalid-policy");
    expect(body["report"]).toBeUndefined();
    for (const e of body["errors"] as Record<string, unknown>[]) expect(Object.keys(e).sort()).toEqual(["code", "path"]);
  });

  it("answers 502 fetch-failed for a policy file that returns 500, with no fallback", async () => {
    const h = harness([...repoRoutes(OWNER, REPO, packages), ...allPackageRoutes(), { url: POLICY_URL(OWNER, REPO), status: 500, text: "" }]);
    const result = await h.handle(scanEvent(url));
    expect(result.statusCode).toBe(502);
    expect(json(result)).toEqual({ code: "fetch-failed", message: "sexton.policy.yml could not be fetched.", file: "sexton.policy.yml" });
  });

  it("answers 422 missing-package-json for a repository with no package.json", async () => {
    const result = await harness([]).handle(scanEvent(url));
    expect(result.statusCode).toBe(422);
    expect(json(result)).toMatchObject({ code: "missing-package-json", file: "package.json" });
  });

  it("shares one cache store: scoring makes no packument request for names intake already read", async () => {
    const h = harness([...repoRoutes(OWNER, REPO, packages, { lockfile: false }), ...allPackageRoutes(), { url: POLICY_URL(OWNER, REPO), status: 404, text: "" }]);
    const result = await h.handle(scanEvent(url));
    expect(result.statusCode).toBe(200);
    for (const p of packages) {
      const full = h.calls.filter((c) => c.url === `https://registry.npmjs.org/${p.name}` && c.request.headers["Accept"] === "application/json");
      expect(full).toHaveLength(1);
    }
  });

  it("a second scan with the same store repeats only the upstream requests that failed, which are never cached", async () => {
    const port = new MemoryDynamo();
    const routes = [...repoRoutes(OWNER, REPO, packages), ...allPackageRoutes(), { url: POLICY_URL(OWNER, REPO), status: 404, text: "" }];
    await harness(routes, {}, port).handle(scanEvent(url));
    const second = harness(routes, {}, port);
    expect((await second.handle(scanEvent(url))).statusCode).toBe(200);
    const failed = new Set(routes.filter((r) => (r.status ?? 200) >= 300).map((r) => r.url));
    expect(second.calls.length).toBeGreaterThan(0);
    for (const call of second.calls) expect(failed.has(call.url)).toBe(true);
    expect(second.calls.length).toBeLessThan(5);
  });

  it("answers 500 internal-error when a step throws, and never a partial scan", async () => {
    const h = harness([], { intake: () => Promise.reject(new Error("boom")) });
    const result = await h.handle(scanEvent(url));
    expect(result.statusCode).toBe(500);
    expect(json(result)).toEqual({ code: "internal-error", message: "The scan failed unexpectedly." });
    expect(h.lines.find((l) => l["msg"] === "scan")).toMatchObject({ status: 500 });
  });

  it("still scans when every DynamoDB call fails", async () => {
    const port = new MemoryDynamo(undefined, { fail: () => new Error("dynamo down") });
    const h = harness([...repoRoutes(OWNER, REPO, packages), ...allPackageRoutes(), { url: POLICY_URL(OWNER, REPO), status: 404, text: "" }], {}, port);
    expect((await h.handle(scanEvent(url))).statusCode).toBe(200);
  });
});

describe("request rejections", () => {
  it("405 and 400 carry the fixed body, no-store and the request ID, and log a summary line", async () => {
    const h = harness([]);
    const r405 = await h.handle(makeEvent({ method: "POST", rawQueryString: repoQuery("https://github.com/a/b") }));
    expect(r405.statusCode).toBe(405);
    expect(r405.headers).toMatchObject({ "cache-control": "no-store", "x-sexton-request-id": "lambda-req-1" });
    expect(json(r405)).toEqual({ code: "method-not-allowed", message: "Only GET is supported." });
    const r400 = await h.handle(makeEvent({ rawPath: "/api/scan/x" }));
    expect(r400.statusCode).toBe(400);
    expect(h.lines.filter((l) => l["msg"] === "scan").map((l) => l["status"])).toEqual([405, 400]);
  });
});

describe("a throwing log sink", () => {
  const sink = () => {
    throw new Error("sink down");
  };

  it("keeps 405 and 400 as they are", async () => {
    const h = harness([], { sink });
    expect((await h.handle(makeEvent({ method: "POST" }))).statusCode).toBe(405);
    expect((await h.handle(makeEvent({ rawPath: "/x" }))).statusCode).toBe(400);
  });

  it("runScan still resolves with internal-error when a step throws", async () => {
    const { runScan } = await import("../src/scan.js");
    const { createLogger } = await import("../src/log/logger.js");
    const { MemoryCacheStore, InMemorySnapshotStore } = await import("@sexton/engine");
    const outcome = await runScan("https://github.com/a/b", {
      transport: () => Promise.reject(new Error("no network")),
      cacheStore: new MemoryCacheStore(),
      snapshotStore: new InMemorySnapshotStore(),
      clock: () => FIXTURE_NOW,
      log: createLogger("c", sink),
      intake: () => Promise.reject(new Error("boom")),
    });
    expect(outcome).toMatchObject({ ok: false, response: { status: 500 } });
  });
});

describe("readScanEnvironment", () => {
  it("reads the three variables and throws naming a missing one", () => {
    expect(readScanEnvironment({ CACHE_TABLE: "c", SNAPSHOTS_TABLE: "s", SEEN_INDEX: "i" })).toEqual({ cacheTable: "c", snapshotsTable: "s", seenIndex: "i" });
    expect(() => readScanEnvironment({ CACHE_TABLE: "c", SNAPSHOTS_TABLE: "s" })).toThrow("SEEN_INDEX");
    expect(() => readScanEnvironment({ CACHE_TABLE: "", SNAPSHOTS_TABLE: "s", SEEN_INDEX: "i" })).toThrow("CACHE_TABLE");
  });
});
