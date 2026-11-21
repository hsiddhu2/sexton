// intakeFromManifests. Spec: .kiro/specs/cli-and-action, Requirements 1.1, 1.2. Property 51. No network.

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { CachedFetcher, MemoryCacheStore } from "../../src/cache.js";
import type { ClientContext } from "../../src/clients/context.js";
import { GITHUB_RAW_HOST } from "../../src/clients/github-raw.js";
import { packumentUrl } from "../../src/clients/npm.js";
import { intakeFromManifests, intakeRepoWithManifests } from "../../src/intake/intake.js";
import { arbIntakeModel, arbPackageJson, renderLockfile, renderPackageJson, type MapEntries } from "../arbitraries.js";
import { routedTextTransport, type RouteTable } from "./routes.js";

const NOW = new Date("2026-11-12T00:00:00Z");
const REPO = { owner: "o", repo: "r", url: "https://github.com/o/r" };
const RAW_PKG = `${GITHUB_RAW_HOST}/o/r/HEAD/package.json`;
const RAW_LOCK = `${GITHUB_RAW_HOST}/o/r/HEAD/package-lock.json`;

function ctxFor(routes: RouteTable): ClientContext {
  const clock = () => NOW;
  return {
    transport: routedTextTransport(routes).transport,
    clock,
    cache: new CachedFetcher({ store: new MemoryCacheStore(), clock }),
    retry: { sleep: () => Promise.resolve(), maxRetries: 1 },
  };
}

/** package.json text, lockfile text or null, and registry routes, from the intake model or from the hostile package.json arbitrary. */
const arbTexts = fc.oneof(
  arbIntakeModel.map((model) => {
    const pick = (dev: boolean): MapEntries => model.dependencies.filter((d) => d.dev === dev).map((d) => [d.name, d.range] as const);
    const packageJsonText = renderPackageJson({ dependencies: pick(false), devDependencies: pick(true), peerDependencies: [], optionalDependencies: [], peerShape: "object" });
    const entries: MapEntries = model.dependencies.flatMap((d) => (d.locked === null ? [] : [[d.name, d.locked] as const]));
    const packageLockText = model.lockfile === null ? null : renderLockfile(model.lockfile, entries);
    const registry: Record<string, { status?: number; body?: string }> = {};
    for (const d of model.dependencies) {
      registry[packumentUrl(d.name)] =
        d.registry.kind === "versions"
          ? { body: JSON.stringify({ versions: Object.fromEntries(d.registry.versions.map((v) => [v, {}])) }) }
          : { status: d.registry.kind === "not-found" ? 404 : 500 };
    }
    return { packageJsonText, packageLockText, registry };
  }),
  fc.tuple(arbPackageJson(true).map((m) => renderPackageJson(m)), fc.constantFrom(null, "{", '{"lockfileVersion":3,"packages":{}}')).map(([packageJsonText, packageLockText]) => ({
    packageJsonText,
    packageLockText,
    registry: {},
  })),
  fc.constantFrom({ packageJsonText: "not json", packageLockText: null, registry: {} }, { packageJsonText: "[]", packageLockText: "{}", registry: {} }),
);

describe("Feature: cli-and-action, Property 51: intakeFromManifests equivalence", () => {
  it("gives the same result as intakeRepoWithManifests over a transport serving the same texts", async () => {
    await fc.assert(
      fc.asyncProperty(arbTexts, async ({ packageJsonText, packageLockText, registry }) => {
        const routes: RouteTable = { ...registry, [RAW_PKG]: { body: packageJsonText }, ...(packageLockText === null ? {} : { [RAW_LOCK]: { body: packageLockText } }) };
        const fetched = await intakeRepoWithManifests(REPO.url, ctxFor(routes));
        const local = await intakeFromManifests({ repo: REPO, packageJsonText, packageLockText }, ctxFor(registry));
        expect(local.result).toEqual(fetched.result);
        if (fetched.result.ok) expect(local.manifests).toEqual(fetched.manifests);
        else expect(local.manifests).toBeNull();
      }),
      { numRuns: 100 },
    );
  });
});

describe("intakeFromManifests", () => {
  it("reads no manifest through the transport and never rejects", async () => {
    const { transport, requests } = routedTextTransport({});
    const clock = () => NOW;
    const result = await intakeFromManifests({ repo: REPO, packageJsonText: '{"dependencies":{"a":"1.0.0"}}', packageLockText: null }, { transport, clock, cache: new CachedFetcher({ store: new MemoryCacheStore(), clock }) });
    expect(result.result.ok).toBe(true);
    expect(requests.every((r) => !r.url.startsWith(GITHUB_RAW_HOST))).toBe(true);
    expect(await intakeFromManifests(undefined as never, ctxFor({}))).toMatchObject({ result: { ok: false, code: "internal-error" }, manifests: null });
  });
});
