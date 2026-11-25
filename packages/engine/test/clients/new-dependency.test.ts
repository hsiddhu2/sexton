// newDependency client. Spec new-signals, Requirements 2.5 to 2.10, 2.13. Property 4 (client half).

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { PackumentDocument } from "../../src/clients/maintainers.js";
import { fetchNewDependencySignal } from "../../src/clients/new-dependency.js";
import { ABBREVIATED_ACCEPT, packumentUrl } from "../../src/clients/npm.js";
import type { Transport } from "../../src/http.js";
import { makeContext, NOW, routedTransport } from "../helpers.js";

const SOURCE = packumentUrl("parent");
const FETCHED = "2026-11-12T00:00:00.000Z";

function parentDoc(added: Record<string, string>): PackumentDocument {
  return {
    ok: true,
    source: SOURCE,
    fetchedAt: FETCHED,
    doc: {
      time: { "1.0.0": "2026-03-01T00:00:00.000Z", "1.0.1": "2026-03-31T00:00:00.000Z" },
      versions: { "1.0.0": { dependencies: { keep: "^1.0.0" } }, "1.0.1": { dependencies: { keep: "^1.0.0", ...added } } },
    },
  };
}

function depRoutes(name: string, publishedAt: string, hasInstallScript: boolean) {
  const url = packumentUrl(name);
  return [
    { url, accept: "application/json", json: { time: { "1.0.0": publishedAt }, versions: { "1.0.0": {} } } },
    { url, accept: ABBREVIATED_ACCEPT, json: { versions: { "1.0.0": hasInstallScript ? { hasInstallScript: true } : {} } } },
  ];
}

describe("fetchNewDependencySignal", () => {
  it("reads both packuments of a new name and records it with the parent's source and time (2.5, 2.13)", async () => {
    const { transport, calls } = routedTransport(depRoutes("fresh", "2026-03-30T00:00:00.000Z", true));
    const signal = await fetchNewDependencySignal(makeContext(transport), "1.0.1", parentDoc({ fresh: "^1.0.0" }));
    expect(signal).toEqual({
      value: {
        status: "compared",
        installedVersion: "1.0.1",
        earlierVersion: "1.0.0",
        installedPublishTime: "2026-03-31T00:00:00.000Z",
        addedCount: 1,
        capped: false,
        added: [
          { name: "fresh", range: "^1.0.0", resolvedVersion: "1.0.0", resolvedPublishTime: "2026-03-30T00:00:00.000Z", installScript: true, fresh: true },
        ],
      },
      source: SOURCE,
      fetchedAt: FETCHED,
      available: true,
    });
    expect(calls).toHaveLength(2);
  });

  it("reads at most five names, records the cap, and asks nothing for an invalid name or a non-semver range (2.3, 2.6, 2.8)", async () => {
    const names = ["a", "b", "c", "d", "e", "f"];
    const { transport, calls } = routedTransport(names.flatMap((n) => depRoutes(n, "2025-01-01T00:00:00.000Z", false)));
    const signal = await fetchNewDependencySignal(
      makeContext(transport),
      "1.0.1",
      parentDoc({ ...Object.fromEntries(names.map((n) => [n, "^1.0.0"])), "Bad Name": "^1.0.0", "a-git": "github:x/y" }),
    );
    if (!signal.available || signal.value.status !== "compared") throw new Error("expected a comparison");
    expect(signal.value.addedCount).toBe(8);
    expect(signal.value.capped).toBe(true);
    expect(signal.value.added.map((d) => d.name)).toEqual(["Bad Name", "a", "a-git", "b", "c"]);
    expect(signal.value.added[0]?.reason).toBe("invalid package name");
    expect(signal.value.added[2]?.reason).toBe("range is not a semver range");
    expect(new Set(calls.map((c) => c.url))).toEqual(new Set(["a", "b", "c"].map(packumentUrl)));
    expect(calls).toHaveLength(6);
  });

  it("keeps the signal available when a dependency read fails (2.7)", async () => {
    const { transport, calls } = routedTransport([]);
    const signal = await fetchNewDependencySignal(makeContext(transport), "1.0.1", parentDoc({ gone: "^1.0.0" }));
    expect(signal.available).toBe(true);
    expect(calls).toHaveLength(1);
    if (signal.available && signal.value.status === "compared") expect(signal.value.added[0]?.reason).toBe("packument unavailable: HTTP 404");
  });

  it("is unavailable with the reason when the parent packument failed, and asks nothing (2.10)", async () => {
    const { transport, calls } = routedTransport([]);
    const signal = await fetchNewDependencySignal(makeContext(transport), "1.0.1", { ok: false, reason: "HTTP 503", source: SOURCE, fetchedAt: FETCHED });
    expect(signal).toEqual({ value: null, source: SOURCE, fetchedAt: FETCHED, available: false, reason: "HTTP 503" });
    expect(calls).toHaveLength(0);
  });

  it("asks nothing when there is no earlier version or no new name (2.9, 2.12)", async () => {
    const { transport, calls } = routedTransport([]);
    const ctx = makeContext(transport);
    expect((await fetchNewDependencySignal(ctx, "1.0.0", parentDoc({ x: "^1.0.0" }))).value).toEqual({ status: "no-earlier-version", installedVersion: "1.0.0" });
    await fetchNewDependencySignal(ctx, "1.0.1", parentDoc({}));
    expect(calls).toHaveLength(0);
  });

  it("serves a repeated name from the cache (2.5)", async () => {
    const { transport, calls } = routedTransport(depRoutes("x", "2025-01-01T00:00:00.000Z", false));
    const ctx = makeContext(transport);
    await fetchNewDependencySignal(ctx, "1.0.1", parentDoc({ x: "^1.0.0" }));
    await fetchNewDependencySignal(ctx, "1.0.1", parentDoc({ x: "^1.0.0" }));
    expect(calls).toHaveLength(2);
  });

  it("Feature: new-signals, Property 4 (client half): any answer or failure resolves to a signal", async () => {
    // Validates: Requirements 1.7, 2.7, 2.10
    await fc.assert(
      fc.asyncProperty(fc.jsonValue(), fc.integer({ min: 100, max: 599 }), fc.boolean(), async (body, status, reject) => {
        const transport: Transport = () =>
          reject ? Promise.reject(new Error("socket closed")) : Promise.resolve({ status, json: () => Promise.resolve(body) });
        const signal = await fetchNewDependencySignal(makeContext(transport, NOW), "1.0.1", parentDoc({ a: "^1.0.0", b: "^1.0.0" }));
        if (signal.available) {
          expect(signal.value.status).toBe("compared");
          if (signal.value.status === "compared") {
            expect(signal.value.added.map((d) => d.name)).toEqual(["a", "b"]);
            for (const d of signal.value.added) if (d.resolvedVersion === null) expect(d.reason).toBeDefined();
          }
        } else {
          expect(signal.reason.length).toBeGreaterThan(0);
        }
      }),
      { numRuns: 100 },
    );
  });
});
