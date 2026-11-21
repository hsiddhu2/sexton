// Checks that the shared generators produce what their names promise.

import fc from "fast-check";
import { InMemorySnapshotStore, isValidPackageName, parseRepoUrl } from "@sexton/engine";
import { describe, expect, it } from "vitest";
import { arbHostileRepo, arbIsoUtc, arbPackageName, arbSnapshot, arbValidRepoUrl, MAX_ISO_MS, MIN_ISO_MS } from "./arbitraries.js";

describe("arbitraries", () => {
  it("arbValidRepoUrl is always accepted by parseRepoUrl", () => {
    fc.assert(fc.property(arbValidRepoUrl, (url) => parseRepoUrl(url).ok));
  });

  it("arbPackageName gives valid npm names without '#'", () => {
    fc.assert(fc.property(arbPackageName, (name) => isValidPackageName(name) && !name.includes("#")));
  });

  it("arbIsoUtc stays in years 0000 to 9999 and is accepted by the engine's snapshot store", async () => {
    await fc.assert(
      fc.asyncProperty(arbIsoUtc, async (iso) => {
        const ms = Date.parse(iso);
        expect(ms).toBeGreaterThanOrEqual(MIN_ISO_MS);
        expect(ms).toBeLessThanOrEqual(MAX_ISO_MS);
        await new InMemorySnapshotStore().append({ name: "a", captureTime: iso, maintainers: [], versions: [] });
      }),
    );
  });

  it("arbSnapshot draws from the given pools", () => {
    fc.assert(fc.property(arbSnapshot(["a", "b"], ["2026-01-01T00:00:00Z"]), (s) => ["a", "b"].includes(s.name) && s.captureTime === "2026-01-01T00:00:00Z"));
  });

  it("arbHostileRepo marks validity the way parseRepoUrl does, and always contains its canary", () => {
    fc.assert(fc.property(arbHostileRepo, (h) => parseRepoUrl(h.repo).ok === h.valid && h.repo.includes(h.canary)));
  });
});
