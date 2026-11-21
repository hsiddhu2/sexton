// GET /api/evidence end to end through createScanHandler. Spec: .kiro/specs/evidence-pack, Requirements 7.1 to 7.11.
// No network: every upstream answer is a recorded fixture or a route.

import { createHash } from "node:crypto";
import { DEFAULT_POLICY, formatPolicy, renderEvidenceMarkdown, verifyEvidencePack, type EvidencePack, type IntakeResult } from "@sexton/engine";
import type { LambdaFunctionURLEvent } from "aws-lambda";
import { describe, expect, it } from "vitest";
import { FIXED_MESSAGES, type FunctionUrlResponse } from "../src/http/responses.js";
import { createScanHandler, type ScanHandlerDeps } from "../src/scan-handler.js";
import { CACHE_TABLE, MemoryDynamo, SEEN_INDEX, SNAPSHOTS_TABLE } from "./fakes/memory-dynamo.js";
import { makeEvent } from "./support/events.js";
import { FIXTURE_NOW, fixturePackages, packageRoutes, repoRoutes, routedTransport, type Route } from "./support/fixture-transport.js";

const OWNER = "sexton-demo";
const REPO = "fixture";
const URL_REPO = `https://github.com/${OWNER}/${REPO}`;
const POLICY_URL = `https://raw.githubusercontent.com/${OWNER}/${REPO}/HEAD/sexton.policy.yml`;
const sha = (text: string): string => createHash("sha256").update(text, "utf8").digest("hex");

function harness(routes: readonly Route[], extra: Partial<ScanHandlerDeps> = {}) {
  const routed = routedTransport(routes);
  const lines: Record<string, unknown>[] = [];
  const handler = createScanHandler({
    environment: { cacheTable: CACHE_TABLE, snapshotsTable: SNAPSHOTS_TABLE, seenIndex: SEEN_INDEX },
    port: new MemoryDynamo(),
    transport: routed.transport,
    clock: () => FIXTURE_NOW,
    sink: (line) => lines.push(JSON.parse(line) as Record<string, unknown>),
    retry: { sleep: () => Promise.resolve() },
    ...extra,
  });
  return { handle: (event: LambdaFunctionURLEvent): Promise<FunctionUrlResponse> => handler(event, { awsRequestId: "lambda-req-1" }), lines, unrouted: routed.unrouted };
}

function evidenceEvent(query: string, headers: Record<string, string> = {}): LambdaFunctionURLEvent {
  return makeEvent({ rawPath: "/api/evidence", rawQueryString: query, headers });
}

const packages = fixturePackages();
const repoRoutesAll = () => repoRoutes(OWNER, REPO, packages);
const allRoutes = (policy: Route = { url: POLICY_URL, status: 404, text: "" }): Route[] => [
  ...repoRoutesAll(),
  ...packages.flatMap((p) => packageRoutes(p.name, p.installedVersion)),
  policy,
];
const query = (format?: string) => `repo=${encodeURIComponent(URL_REPO)}${format === undefined ? "" : `&format=${format}`}`;

describe("GET /api/evidence, JSON", () => {
  it("returns the pack file with the download headers, a digest header equal to integrity.digest, and the pack verifies", async () => {
    const h = harness(allRoutes());
    const result = await h.handle(evidenceEvent(query(), { "x-amz-cf-id": "cf-1" }));
    expect(h.unrouted).toEqual([]);
    expect(result.statusCode).toBe(200);
    const pack = JSON.parse(result.body ?? "null") as EvidencePack;
    expect(result.headers).toEqual({
      "content-type": "application/json; charset=utf-8",
      "content-disposition": 'attachment; filename="sexton-evidence-sexton-demo-fixture.json"',
      "x-sexton-evidence-digest": pack.integrity.digest,
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      "x-sexton-request-id": "cf-1",
    });
    expect(result.body).toBe(JSON.stringify(pack, null, 2) + "\n");
    expect(await verifyEvidencePack(pack)).toEqual({ ok: true });
    expect(pack.body.packages).toHaveLength(packages.length);
    expect(pack.body.sbom.components).toHaveLength(packages.length);
    expect(pack.body.scan).toMatchObject({ repository: URL_REPO, commit: null, policy: { version: 1, source: "default", digest: null } });
    expect(pack.body.remediation).toEqual({ plans: [], log: { available: false, entries: [] } });
  });

  it("records the manifest digests of the texts intake read, and the policy file digest", async () => {
    const policyText = formatPolicy(DEFAULT_POLICY);
    const h = harness(allRoutes({ url: POLICY_URL, text: policyText }));
    const pack = JSON.parse((await h.handle(evidenceEvent(query("json")))).body ?? "null") as EvidencePack;
    const [pkg, lock] = repoRoutesAll();
    expect(pack.body.scan.manifests).toEqual({ packageJson: sha(pkg?.text ?? ""), packageLock: sha(lock?.text ?? "") });
    expect(pack.body.scan.policy).toEqual({ version: 1, source: "file", digest: sha(policyText) });
  });

  it("leaves the manifest digests null when an injected intake runs", async () => {
    const { intakeRepo } = await import("@sexton/engine");
    const intake = (url: string, ctx: Parameters<typeof intakeRepo>[1]): Promise<IntakeResult> => intakeRepo(url, ctx);
    const h = harness(allRoutes(), { intake });
    const pack = JSON.parse((await h.handle(evidenceEvent(query()))).body ?? "null") as EvidencePack;
    expect(pack.body.scan.manifests).toEqual({ packageJson: null, packageLock: null });
  });
});

describe("GET /api/evidence, Markdown", () => {
  it("returns the report rendered from the same pack", async () => {
    const json = await harness(allRoutes()).handle(evidenceEvent(query("json")));
    const md = await harness(allRoutes()).handle(evidenceEvent(query("md")));
    expect(md.statusCode).toBe(200);
    expect(md.headers?.["content-type"]).toBe("text/markdown; charset=utf-8");
    expect(md.headers?.["content-disposition"]).toBe('attachment; filename="sexton-evidence-sexton-demo-fixture.md"');
    const pack = JSON.parse(json.body ?? "null") as EvidencePack;
    expect(md.headers?.["x-sexton-evidence-digest"]).toBe(pack.integrity.digest);
    expect(md.body).toBe(renderEvidenceMarkdown(pack));
  });
});

describe("GET /api/evidence errors and logging", () => {
  it("answers a bad request with the evidence message and logs no repository", async () => {
    const h = harness([]);
    const result = await h.handle(evidenceEvent(`${query()}&format=pdf`));
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body ?? "null")).toEqual({ code: "invalid-request", message: FIXED_MESSAGES["invalid-evidence-request"] });
    expect(h.lines.filter((l) => l["msg"] === "evidence")).toHaveLength(1);
  });

  it("passes a scan error through", async () => {
    const h = harness([{ url: `https://raw.githubusercontent.com/${OWNER}/${REPO}/HEAD/package.json`, status: 404, text: "" }]);
    const result = await h.handle(evidenceEvent(query("md")));
    expect(result.statusCode).toBe(422);
    expect((JSON.parse(result.body ?? "null") as { code: string }).code).toBe("missing-package-json");
  });

  it("writes one evidence line with counts and never the repository", async () => {
    const h = harness(allRoutes());
    const result = await h.handle(evidenceEvent(query("md")));
    const lines = h.lines.filter((l) => l["msg"] === "evidence");
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ status: 200, format: "md", packages: packages.length, bytes: Buffer.byteLength(result.body ?? "", "utf8") });
    expect(typeof lines[0]?.["durationMs"]).toBe("number");
    expect(h.lines.some((l) => l["msg"] === "scan")).toBe(false);
    expect(JSON.stringify(h.lines)).not.toContain(OWNER);
  });

  it("leaves GET /api/scan unchanged beside it", async () => {
    const result = await harness(allRoutes()).handle(makeEvent({ rawQueryString: query() }));
    expect(result.statusCode).toBe(200);
    expect(result.headers?.["cache-control"]).toBe("public, max-age=300");
  });
});
