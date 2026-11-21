// The 5 MiB limit of GET /api/evidence with the limit lowered for the test. Spec: .kiro/specs/evidence-pack, Requirement 7.8.

import { describe, expect, it, vi } from "vitest";

vi.mock("../src/http/evidence-response.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/http/evidence-response.js")>();
  return { ...actual, MAX_EVIDENCE_BYTES: 100 };
});

const { createScanHandler } = await import("../src/scan-handler.js");
const { CACHE_TABLE, MemoryDynamo, SEEN_INDEX, SNAPSHOTS_TABLE } = await import("./fakes/memory-dynamo.js");
const { makeEvent } = await import("./support/events.js");
const { FIXTURE_NOW, fixturePackages, packageRoutes, repoRoutes, routedTransport } = await import("./support/fixture-transport.js");

describe("evidence-too-large", () => {
  it("answers 422 with the fixed message when the body is over the limit", async () => {
    const packages = fixturePackages().slice(0, 1);
    const routes = [
      ...repoRoutes("o", "r", packages),
      ...packages.flatMap((p) => packageRoutes(p.name, p.installedVersion)),
      { url: "https://raw.githubusercontent.com/o/r/HEAD/sexton.policy.yml", status: 404, text: "" },
    ];
    const handler = createScanHandler({
      environment: { cacheTable: CACHE_TABLE, snapshotsTable: SNAPSHOTS_TABLE, seenIndex: SEEN_INDEX },
      port: new MemoryDynamo(),
      transport: routedTransport(routes).transport,
      clock: () => FIXTURE_NOW,
      sink: () => undefined,
      retry: { sleep: () => Promise.resolve() },
    });
    const result = await handler(makeEvent({ rawPath: "/api/evidence", rawQueryString: "repo=https%3A%2F%2Fgithub.com%2Fo%2Fr" }), { awsRequestId: "x" });
    expect(result.statusCode).toBe(422);
    expect(JSON.parse(result.body ?? "null")).toEqual({ code: "evidence-too-large", message: "The evidence pack is larger than 5 MiB." });
  });
});
