// Spec: .kiro/specs/remediation, Requirements 2.17 to 2.22, 3.6, 8.2, 8.6, 8.7, properties 6 and 19.

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { cacheKey, MemoryCacheStore } from "../../src/cache.js";
import { OSV_BATCH_SOURCE, queryVulnIdsBatch } from "../../src/clients/osv.js";
import { bumpTargets } from "../../src/remediation/bump-targets.js";
import { orderCandidates } from "../../src/remediation/candidates.js";
import { gatherBumpData, type BumpDataResult, type BumpTarget } from "../../src/remediation/gather-bump-data.js";
import { planRemediation } from "../../src/remediation/plan.js";
import { arbReportAndOptions, healthySignals, MARKER } from "./arbitraries.js";
import { BENIGN_FAULTS, contextFor, FAULTS, scriptedUpstream, type Fault, type PackageModel, type VulnRecord } from "./routes.js";

const SEVERITY_WORDS = ["LOW", "MODERATE", "HIGH", "CRITICAL", "BOGUS"];
const REASON_SET =
  /^(packument request failed( \(HTTP \d{3}\))?|packument has no versions|OSV querybatch failed( \(HTTP \d{3}\))?|OSV querybatch response is malformed|OSV querybatch pagination did not finish|OSV advisory detail failed( \(HTTP \d{3}\))?|OSV advisory detail response is malformed|packument request response is malformed|bump data could not be read|too many advisories)$/;

const arbModel = (name: string): fc.Arbitrary<PackageModel> =>
  fc
    .record({
      versions: fc.uniqueArray(fc.tuple(fc.nat(3), fc.nat(9), fc.nat(3)).map(([a, b, c]) => `${String(a)}.${String(b)}.${String(c)}`), { minLength: 1, maxLength: 60 }),
      idPool: fc.uniqueArray(fc.stringMatching(/^GHSA-[a-z]{4}$/), { maxLength: 8 }),
      seed: fc.array(fc.nat(), { minLength: 60, maxLength: 60 }),
      pages: fc.array(fc.nat(12), { minLength: 60, maxLength: 60 }),
      deprecatedEvery: fc.integer({ min: 2, max: 7 }),
    })
    .map(({ versions, idPool, seed, pages, deprecatedEvery }): PackageModel => {
      const ids: Record<string, string[]> = {};
      const extraPages: Record<string, number> = {};
      const vmap: Record<string, string> = {};
      versions.forEach((v, i) => {
        vmap[v] = i % deprecatedEvery === 0 ? "deprecated" : "";
        const s = seed[i] ?? 0;
        ids[v] = idPool.filter((_, j) => ((s >> j) & 1) === 1);
        extraPages[v] = Math.min(pages[i] ?? 0, ids[v].length);
      });
      return { name, versions: vmap, ids, extraPages };
    });

function vulnsFor(models: readonly PackageModel[]): Map<string, VulnRecord> {
  const out = new Map<string, VulnRecord>();
  for (const m of models)
    for (const id of Object.values(m.ids).flat())
      out.set(id, { id, summary: `summary ${MARKER}`, database_specific: { severity: SEVERITY_WORDS[id.charCodeAt(5) % SEVERITY_WORDS.length] as string } });
  return out;
}

const target = (m: PackageModel, installed = "0.0.0", range?: string): BumpTarget => ({
  name: m.name,
  installedVersion: installed,
  ...(range === undefined ? {} : { declaredRange: range }),
});

describe("gatherBumpData", () => {
  it("Feature: remediation, Property 6: Candidate and OSV call bounds", async () => {
    await fc.assert(
      fc.asyncProperty(arbModel("pkg"), fc.constantFrom(undefined, "^0.0.0", "^1.0.0", ">=0.1.0", "latest"), fc.boolean(), async (model, range, warm) => {
        const vulns = vulnsFor([model]);
        const { transport, calls } = scriptedUpstream([model], vulns);
        const store = new MemoryCacheStore();
        const preCached = new Set<string>();
        if (warm) {
          const first = [...vulns.keys()][0];
          if (first !== undefined) {
            await store.set(cacheKey("osv-vuln", first, "*"), { value: vulns.get(first), storedAt: Date.parse("2026-11-12T00:00:00Z") });
            preCached.add(first);
          }
        }
        const ctx = contextFor(transport, store);
        const result = await gatherBumpData(ctx, [target(model, "0.0.0", range)]);
        const entry = result.get("pkg") as BumpDataResult;
        expect(entry.ok).toBe(true);
        const packumentGets = calls.filter((c) => c.url.startsWith("https://registry.npmjs.org/"));
        const batches = calls.filter((c) => c.url.endsWith("/querybatch"));
        const details = calls.filter((c) => c.url.includes("/v1/vulns/"));
        expect(packumentGets.length).toBe(1);
        expect(batches.length).toBeLessThanOrEqual(10);
        const candidates = orderCandidates("0.0.0", range, Object.keys(model.versions)).map((c) => c.version);
        if (candidates.length === 0) expect(batches.length).toBe(0);
        else {
          const firstBody = JSON.parse(batches[0]?.body ?? "{}") as { queries: { version: string }[] };
          expect(firstBody.queries.map((q) => q.version)).toEqual(candidates);
          expect(firstBody.queries.length).toBeLessThanOrEqual(20);
          const anyToken = candidates.some((v) => (model.extraPages?.[v] ?? 0) > 0);
          if (!anyToken) expect(batches.length).toBe(1);
          for (const later of batches.slice(1)) {
            const b = JSON.parse(later.body ?? "{}") as { queries: { page_token?: string }[] };
            expect(b.queries.every((q) => typeof q.page_token === "string")).toBe(true);
          }
        }
        const perId = new Map<string, number>();
        for (const d of details) perId.set(d.url, (perId.get(d.url) ?? 0) + 1);
        for (const [url, n] of perId) {
          expect(n).toBe(1);
          for (const id of preCached) expect(url.endsWith(`/${id}`)).toBe(false);
        }
        for (const c of calls) expect(Object.keys(c)).not.toContain("authorization");
        // A second run on the same context sends nothing.
        const before = calls.length;
        expect(await gatherBumpData(ctx, [target(model, "0.0.0", range)])).toEqual(result);
        expect(calls.length).toBe(before);
      }),
      { numRuns: 100 },
    );
  });

  it("Feature: remediation, Property 6 (no-request arm): packages that cannot be bumped cost nothing", async () => {
    await fc.assert(
      fc.asyncProperty(arbReportAndOptions, async ({ report, options }) => {
        const targets = bumpTargets(report, options);
        const plans = planRemediation(report, options);
        const names = new Set(targets.map((t) => t.name));
        for (const t of targets) {
          const plan = plans.find((p) => p.packageName === t.name);
          expect(plan?.kind).toBe("bump");
          expect(["Possessed", "Dead", "Haunted"]).toContain(plan?.state);
          expect(plan?.reason ?? "").not.toMatch(/name|intake|branch|installed/);
        }
        const models: PackageModel[] = [...new Set(report.packages.map((p) => p.name))].map((name) => ({
          name,
          versions: { "9.9.9": "" },
          ids: { "9.9.9": [] },
        }));
        const { transport, calls } = scriptedUpstream(models, new Map());
        await gatherBumpData(contextFor(transport), targets);
        for (const c of calls) {
          if (c.url.startsWith("https://registry.npmjs.org/")) {
            const enc = c.url.slice("https://registry.npmjs.org/".length);
            expect([...names].some((n) => enc === (n.startsWith("@") ? `@${encodeURIComponent(n.slice(1))}` : encodeURIComponent(n)))).toBe(true);
          } else if (c.url.endsWith("/querybatch")) {
            const body = JSON.parse(c.body ?? "{}") as { queries: { package: { name: string } }[] };
            for (const q of body.queries) expect(names.has(q.package.name)).toBe(true);
          }
        }
      }),
      { numRuns: 100 },
    );
  });

  it("Feature: remediation, Property 19: Bump data failure isolation and untrusted upstream data", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.constantFrom<Fault | (typeof BENIGN_FAULTS)[number] | "none">("none", ...FAULTS, ...BENIGN_FAULTS), { minLength: 2, maxLength: 4 }),
        async (faults) => {
          const protoKeys = Object.getOwnPropertyNames(Object.prototype).sort();
          const models: PackageModel[] = faults.map((fault, i) => ({
            name: `p${String(i)}`,
            versions: { "1.0.0": "", "1.0.1": "", "1.1.0": "", "2.0.0": "" },
            ids: { "1.0.1": [`GHSA-${"wxyz"[i] as string}aaa`], "1.1.0": [`GHSA-${"wxyz"[i] as string}bbb`, `GHSA-${"wxyz"[i] as string}aaa`], "2.0.0": [] },
            extraPages: { "1.1.0": 1 },
            ...(fault === "none" ? {} : { fault }),
          }));
          const vulns = vulnsFor(models);
          const targets = models.map((m) => target(m, "1.0.0", "^1.0.0"));
          const { transport } = scriptedUpstream(models, vulns);
          const results = await gatherBumpData(contextFor(transport), targets);
          expect([...results.keys()]).toEqual(models.map((m) => m.name));
          for (const [i, m] of models.entries()) {
            const r = results.get(m.name) as BumpDataResult;
            const fault = faults[i];
            if (fault === "none" || (BENIGN_FAULTS as readonly string[]).includes(fault as string)) {
              expect(r.ok).toBe(true);
              const alone = await gatherBumpData(contextFor(scriptedUpstream([m], vulns).transport), [target(m, "1.0.0", "^1.0.0")]);
              expect(r).toEqual(alone.get(m.name));
              if (r.ok) expect([...r.advisories.keys()].sort()).toEqual(["1.0.1", "1.1.0", "2.0.0"]);
            } else {
              expect(r.ok).toBe(false);
              if (!r.ok) {
                expect(r.reason).toMatch(REASON_SET);
                expect(r.reason).not.toContain(MARKER);
              }
              const plans = planRemediation(
                { generatedAt: "2026-11-12T00:00:00.000Z", packages: [{ name: m.name, installedVersion: "1.0.0", state: "Dead", stateReason: "x", signals: healthySignals(), missingSignals: [] }] },
                { intake: [{ name: m.name, installedVersion: "1.0.0", declaredRange: "^1.0.0", origin: "dependencies", resolution: "locked" }], bumpData: results },
              );
              expect(plans[0]?.status).toBe("unavailable");
              expect(plans[0]?.chosenVersion).toBeUndefined();
            }
          }
          expect(Object.getOwnPropertyNames(Object.prototype).sort()).toEqual(protoKeys);
          expect(({} as Record<string, unknown>)["polluted"]).toBeUndefined();
        },
      ),
      { numRuns: 1000 },
    );
  });

  it("re-checks names and versions without a request", async () => {
    const { transport, calls } = scriptedUpstream([], new Map());
    const r = await gatherBumpData(contextFor(transport), [
      { name: "Bad Name", installedVersion: "1.0.0" },
      { name: "ok", installedVersion: "unresolved" },
    ]);
    expect(calls).toHaveLength(0);
    expect([...r.values()].every((x) => !x.ok)).toBe(true);
  });

  it("fails with too many advisories above 200 distinct IDs and fetches no detail (migration-node-sass 9.2)", async () => {
    const many = (n: number): PackageModel => ({
      name: "flood",
      versions: { "1.0.0": "", "1.1.0": "" },
      ids: { "1.1.0": Array.from({ length: n }, (_, i) => `GHSA-${String(i).padStart(4, "0")}`) },
    });
    const over = many(201);
    const a = scriptedUpstream([over], vulnsFor([over]));
    const r = await gatherBumpData(contextFor(a.transport), [{ name: "flood", installedVersion: "1.0.0" }]);
    expect(r.get("flood")).toEqual({ ok: false, reason: "too many advisories" });
    expect(a.calls.filter((c) => c.url.includes("/v1/vulns/"))).toHaveLength(0);
    const at = many(200);
    const b = scriptedUpstream([at], vulnsFor([at]));
    const ok = await gatherBumpData(contextFor(b.transport), [{ name: "flood", installedVersion: "1.0.0" }]);
    expect(ok.get("flood")?.ok).toBe(true);
    expect(b.calls.filter((c) => c.url.includes("/v1/vulns/"))).toHaveLength(200);
  });

  it("shares the npm-packument and osv-vuln keys with scoring", async () => {
    const model: PackageModel = { name: "shared", versions: { "1.0.0": "", "1.1.0": "" }, ids: { "1.1.0": ["GHSA-cccc"] } };
    const vulns = vulnsFor([model]);
    const { transport, calls } = scriptedUpstream([model], vulns);
    const store = new MemoryCacheStore();
    const at = Date.parse("2026-11-12T00:00:00Z");
    await store.set(cacheKey("npm-packument", "shared", "*"), { value: { versions: { "1.0.0": {}, "1.1.0": {} } }, storedAt: at });
    await store.set(cacheKey("osv-vuln", "GHSA-cccc", "*"), { value: vulns.get("GHSA-cccc"), storedAt: at });
    await gatherBumpData(contextFor(transport, store), [{ name: "shared", installedVersion: "1.0.0" }]);
    expect(calls.map((c) => c.url)).toEqual(["https://api.osv.dev/v1/querybatch"]);
  });
});

describe("queryVulnIdsBatch", () => {
  const model: PackageModel = { name: "b", versions: {}, ids: { "1.0.0": ["GHSA-aaaa", "GHSA-bbbb"], "1.1.0": [] }, extraPages: { "1.0.0": 1 } };

  it("sends one request plus a continuation that carries only the token queries", async () => {
    const { transport, calls } = scriptedUpstream([model], new Map());
    const ids = await queryVulnIdsBatch(contextFor(transport), "b", ["1.0.0", "1.1.0"]);
    expect([...ids.entries()]).toEqual([
      ["1.0.0", ["GHSA-aaaa", "GHSA-bbbb"]],
      ["1.1.0", []],
    ]);
    expect(calls).toHaveLength(2);
    const second = JSON.parse(calls[1]?.body ?? "{}") as { queries: { version: string; page_token: string }[] };
    expect(second.queries).toEqual([{ package: { name: "b", ecosystem: "npm" }, version: "1.0.0", page_token: "p1" }]);
  });

  it("stops after ten requests when tokens never end", async () => {
    const { transport, calls } = scriptedUpstream([{ ...model, fault: "batch-endless" }], new Map());
    await expect(queryVulnIdsBatch(contextFor(transport), "b", ["1.0.0"])).rejects.toThrow("pagination did not finish");
    expect(calls).toHaveLength(10);
  });

  it("caches the exchange as pairs under the multi key and a hit sends nothing", async () => {
    const { transport, calls } = scriptedUpstream([model], new Map());
    const store = new MemoryCacheStore();
    const ctx = contextFor(transport, store);
    await queryVulnIdsBatch(ctx, "b", ["1.0.0", "1.1.0"]);
    const stored = await store.get(cacheKey(OSV_BATCH_SOURCE, "b", "1.0.0,1.1.0"));
    expect(stored?.value).toEqual([
      ["1.0.0", ["GHSA-aaaa", "GHSA-bbbb"]],
      ["1.1.0", []],
    ]);
    const n = calls.length;
    await queryVulnIdsBatch(ctx, "b", ["1.0.0", "1.1.0"]);
    expect(calls.length).toBe(n);
  });

  it("rejects a malformed cached value and empty input sends nothing", async () => {
    const { transport, calls } = scriptedUpstream([model], new Map());
    const store = new MemoryCacheStore();
    await store.set(cacheKey(OSV_BATCH_SOURCE, "b", "1.0.0"), { value: { "1.0.0": [] }, storedAt: Date.parse("2026-11-12T00:00:00Z") });
    await expect(queryVulnIdsBatch(contextFor(transport, store), "b", ["1.0.0"])).rejects.toThrow("malformed");
    expect(await queryVulnIdsBatch(contextFor(transport), "b", [])).toEqual(new Map());
    expect(calls).toHaveLength(0);
  });

  it.each(["batch-wrong-length", "batch-wrong-types", "batch-bad-id"] as const)("%s is malformed", async (fault) => {
    const { transport } = scriptedUpstream([{ ...model, fault }], new Map());
    await expect(queryVulnIdsBatch(contextFor(transport), "b", ["1.0.0"])).rejects.toThrow("malformed");
  });
});
