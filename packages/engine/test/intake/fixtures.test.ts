// Recorded and synthetic fixture replay through intakeRepo. Spec: .kiro/specs/repo-intake, task 8.3.
// Requirements 1.1, 3.6, 3.9, 4.8, 6.2, 7.3, 8.4, 8.5, 8.10. No network: every response comes from a file or is generated here.
//
// NOTE: the files under test/fixtures/intake/synthetic/ are SYNTHETIC. They were written by hand to be hostile
// and do not describe any real repository. JSON has no comments, so this is where that is stated.
// The files under repos/ and packuments/ are recorded, and expected/ holds the proposed results of replaying them.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CachedFetcher, MemoryCacheStore } from "../../src/cache.js";
import type { ClientContext } from "../../src/clients/context.js";
import { GITHUB_RAW_HOST, MAX_MANIFEST_BYTES } from "../../src/clients/github-raw.js";
import { packumentUrl } from "../../src/clients/npm.js";
import { intakeRepo, intakeRepoWithManifests } from "../../src/intake/intake.js";
import { parseManifests } from "../../src/intake/manifest.js";
import { UNRESOLVED_VERSION } from "../../src/intake/resolve.js";
import type { IntakeResult, IntakeSuccess } from "../../src/types.js";
import { routedTextTransport, type RecordedRequest, type RouteTable } from "./routes.js";

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "..", "fixtures", "intake");
const NOW = new Date("2026-11-12T00:00:00Z");
const REPOS = [
  ["expressjs", "express"],
  ["chalk", "chalk"],
  ["lodash", "lodash"],
] as const;

interface RecordedFile {
  readonly status: number;
  readonly body?: string;
  readonly tooLarge?: boolean;
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8")) as unknown;
}

function readSynthetic(file: string): string {
  return readFileSync(join(FIXTURES, "synthetic", file), "utf8");
}

function fileRoute(recorded: RecordedFile): RouteTable[string] {
  if (recorded.tooLarge === true) return { status: 200, body: new Uint8Array(MAX_MANIFEST_BYTES + 1).fill(0x20) };
  return recorded.status === 200 ? { status: 200, body: recorded.body ?? "" } : { status: recorded.status };
}

/** Raw URLs from repos/{owner}__{repo}, packument URLs from packuments/*. A packument with no fixture answers 404. */
function recordedRoutes(owner: string, repo: string, packumentNames: readonly string[]): RouteTable {
  const routes: Record<string, RouteTable[string]> = {};
  for (const file of ["package.json", "package-lock.json"] as const) {
    const recorded = readJson(join(FIXTURES, "repos", `${owner}__${repo}`, `${file}.json`)) as RecordedFile;
    routes[`${GITHUB_RAW_HOST}/${owner}/${repo}/HEAD/${file}`] = fileRoute(recorded);
  }
  for (const name of packumentNames) {
    const path = join(FIXTURES, "packuments", `${name.replace("/", "__")}.json`);
    try {
      const recorded = readJson(path) as { status: number; body: unknown };
      routes[packumentUrl(name)] = { status: recorded.status, body: JSON.stringify(recorded.body) };
    } catch {
      // No fixture: the route is absent and the transport answers 404.
    }
  }
  return routes;
}

function makeCtx(routes: RouteTable): { ctx: ClientContext; requests: RecordedRequest[] } {
  const { transport, requests } = routedTextTransport(routes);
  const clock = () => NOW;
  const ctx: ClientContext = {
    transport,
    clock,
    cache: new CachedFetcher({ store: new MemoryCacheStore(), clock }),
    retry: { sleep: () => Promise.resolve(), maxRetries: 1 },
  };
  return { ctx, requests };
}

/** Every dependency name that could be asked of the registry, taken from the recorded package.json itself. */
function candidateNames(owner: string, repo: string): string[] {
  const recorded = readJson(join(FIXTURES, "repos", `${owner}__${repo}`, "package.json.json")) as RecordedFile;
  const parsed = parseManifests(recorded.body ?? "", null);
  return parsed.ok ? parsed.dependencies.map((d) => d.name) : [];
}

function success(result: IntakeResult): IntakeSuccess {
  if (!result.ok) throw new Error(`expected success, got ${result.code}`);
  return result;
}

function replaySynthetic(file: string, body: string | Uint8Array = readSynthetic(file)) {
  const routes: RouteTable = { [`${GITHUB_RAW_HOST}/o/r/HEAD/package.json`]: { status: 200, body } };
  const { ctx, requests } = makeCtx(routes);
  return { requests, result: intakeRepo("https://github.com/o/r", ctx) };
}

describe("recorded repositories replayed through intakeRepo", () => {
  for (const [owner, repo] of REPOS) {
    it(`${owner}/${repo} equals expected/${owner}__${repo}.json`, async () => {
      const { ctx } = makeCtx(recordedRoutes(owner, repo, candidateNames(owner, repo)));
      const result = await intakeRepo(`https://github.com/${owner}/${repo}`, ctx);
      expect(success(result)).toBeDefined();
      const expected = readJson(join(FIXTURES, "expected", `${owner}__${repo}.json`));
      expect(JSON.parse(JSON.stringify(result))).toEqual(expected);
    });
  }
});

describe("synthetic fixtures (hand-written, not recorded)", () => {
  it("305 dependencies: capped, totalDirect 305, 300 kept, the dropped ones are devDependencies", async () => {
    const text = readSynthetic("too-many-deps.package.json");
    const parsed = parseManifests(text, null);
    if (!parsed.ok) throw new Error("synthetic manifest must parse");
    const ok = success(await replaySynthetic("too-many-deps.package.json").result);
    expect(ok.capped).toBe(true);
    expect(ok.totalDirect).toBe(305);
    expect(ok.packages).toHaveLength(300);
    expect(parsed.dependencies).toHaveLength(305);
    expect(parsed.dependencies.slice(300).every((d) => d.origin === "devDependencies")).toBe(true);
    expect(ok.packages.map((p) => p.name)).toEqual(parsed.dependencies.slice(0, 300).map((d) => d.name));
  });

  it("prototype keys: Object.prototype unchanged, __proto__ counted invalid, constructor and prototype keep their ranges", async () => {
    const before = Object.getOwnPropertyNames(Object.prototype).sort();
    const ok = success(await replaySynthetic("prototype-keys.package.json").result);
    expect(Object.getOwnPropertyNames(Object.prototype).sort()).toEqual(before);
    expect(ok.skipped.invalidName).toBeGreaterThanOrEqual(1);
    const byName = new Map(ok.packages.map((p) => [p.name, p]));
    expect(byName.has("__proto__")).toBe(false);
    expect(byName.get("constructor")?.declaredRange).toBe("^1.0.0");
    expect(byName.get("prototype")?.declaredRange).toBe("^1.0.0");
    expect(byName.get("left-pad")?.declaredRange).toBe("^1.3.0");
  });

  it("git range and tag range are unresolved and make no registry request", async () => {
    const { result, requests } = replaySynthetic("git-and-tag-ranges.package.json");
    const ok = success(await result);
    const byName = new Map(ok.packages.map((p) => [p.name, p]));
    expect(byName.get("from-git")?.installedVersion).toBe(UNRESOLVED_VERSION);
    expect(byName.get("from-git")?.resolution).toBe("unresolved");
    expect(byName.get("tagged")?.installedVersion).toBe(UNRESOLVED_VERSION);
    expect(byName.get("tagged")?.resolution).toBe("unresolved");
    const registryUrls = requests.map((r) => r.url).filter((u) => !u.startsWith(GITHUB_RAW_HOST));
    expect(registryUrls).not.toContain(packumentUrl("from-git"));
    expect(registryUrls).not.toContain(packumentUrl("tagged"));
    expect(registryUrls).toEqual([packumentUrl("plain")]);
  });

  it("JSONStream is kept", async () => {
    const ok = success(await replaySynthetic("uppercase-name.package.json").result);
    expect(ok.packages.map((p) => p.name)).toEqual(["JSONStream"]);
    expect(ok.skipped.invalidName).toBe(0);
  });

  it("a body of 5 MiB + 1 bytes gives manifest-too-large", async () => {
    const result = await replaySynthetic("uppercase-name.package.json", new Uint8Array(MAX_MANIFEST_BYTES + 1).fill(0x20)).result;
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("manifest-too-large");
      expect(result.file).toBe("package.json");
    }
  });
});

// Spec evidence-pack, Requirements 6.1, 6.2: the manifest texts intake read, beside an unchanged result.
describe("intakeRepoWithManifests over the recorded repositories", () => {
  for (const [owner, repo] of REPOS) {
    it(`${owner}/${repo} gives the intakeRepo result and the recorded texts`, async () => {
      const names = candidateNames(owner, repo);
      const url = `https://github.com/${owner}/${repo}`;
      const plain = await intakeRepo(url, makeCtx(recordedRoutes(owner, repo, names)).ctx);
      const { result, manifests } = await intakeRepoWithManifests(url, makeCtx(recordedRoutes(owner, repo, names)).ctx);
      expect(result).toEqual(plain);
      const dir = join(FIXTURES, "repos", `${owner}__${repo}`);
      const pkg = readJson(join(dir, "package.json.json")) as RecordedFile;
      const lock = readJson(join(dir, "package-lock.json.json")) as RecordedFile;
      expect(manifests).toEqual({ packageJson: pkg.body, packageLock: lock.status === 200 ? lock.body : null });
    });
  }

  it("gives null manifests when intake fails, and strips a byte order mark as the transport does", async () => {
    const missing = makeCtx({});
    expect(await intakeRepoWithManifests("https://github.com/o/r", missing.ctx)).toEqual({ result: await intakeRepo("https://github.com/o/r", makeCtx({}).ctx), manifests: null });
    const text = '{"dependencies":{}}';
    const withBom = makeCtx({ [`${GITHUB_RAW_HOST}/o/r/HEAD/package.json`]: { status: 200, body: `\ufeff${text}` } });
    const { manifests } = await intakeRepoWithManifests("https://github.com/o/r", withBom.ctx);
    expect(manifests).toEqual({ packageJson: text, packageLock: null });
  });
});
