// Shared fast-check generators for the API tests. Spec: .kiro/specs/infra, task 2.5.

import fc from "fast-check";
import type { Snapshot, SnapshotVersion } from "@sexton/engine";
import type { LambdaFunctionURLEvent } from "aws-lambda";
import { makeEvent, repoQuery } from "./support/events.js";

/** Milliseconds of 0000-01-01T00:00:00.000Z and 9999-12-31T23:59:59.999Z. */
export const MIN_ISO_MS = -62_167_219_200_000;
export const MAX_ISO_MS = 253_402_300_799_999;

const LOWER = "abcdefghijklmnopqrstuvwxyz0123456789".split("");
const SEGMENT = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-".split("");

/** Engine-shaped cache keys and arbitrary strings up to 300 characters. */
export const arbCacheKey: fc.Arbitrary<string> = fc.oneof(
  fc
    .tuple(fc.constantFrom("npm-packument", "npm-abbreviated", "osv-vuln", "github-raw"), fc.string({ minLength: 1, maxLength: 40 }), fc.string({ maxLength: 20 }))
    .map(([source, pkg, version]) => `${source}|${pkg}|${version}`),
  fc.string({ minLength: 1, maxLength: 300 }),
);

/** JSON values, including large strings and nested objects. Normalised through a JSON round trip. */
export const arbJsonValue: fc.Arbitrary<unknown> = fc
  .oneof(
    fc.jsonValue({ maxDepth: 4 }),
    fc.string({ minLength: 1000, maxLength: 20_000 }),
    fc.dictionary(fc.string({ maxLength: 10 }), fc.jsonValue({ maxDepth: 2 }), { maxKeys: 20 }),
  )
  .map((value) => JSON.parse(JSON.stringify(value)) as unknown);

export const arbStoredAt: fc.Arbitrary<number> = fc.integer({ min: 0, max: 8.64e15 });
export const arbTtlSeconds: fc.Arbitrary<number> = fc.integer({ min: 1, max: 31_536_000 });

/** Valid npm names, scoped and unscoped, with punctuation but no '#'. */
export const arbPackageName: fc.Arbitrary<string> = fc.oneof(
  fc.tuple(fc.constantFrom(...LOWER), fc.array(fc.constantFrom(...LOWER, ".", "_", "-"), { maxLength: 20 })).map(([head, tail]) => head + tail.join("")),
  fc
    .tuple(fc.array(fc.constantFrom(...LOWER), { minLength: 1, maxLength: 8 }), fc.array(fc.constantFrom(...LOWER, "-"), { minLength: 1, maxLength: 12 }))
    .map(([scope, name]) => `@${scope.join("")}/${name.join("")}`)
    .filter((name) => !name.includes("/-")),
);

/** ISO 8601 UTC strings from year 0000 to 9999, with and without milliseconds. */
export const arbIsoUtc: fc.Arbitrary<string> = fc
  .tuple(fc.integer({ min: MIN_ISO_MS, max: MAX_ISO_MS }), fc.boolean())
  .map(([ms, withMillis]) => {
    const iso = new Date(ms).toISOString();
    return withMillis ? iso : iso.replace(/\.\d{3}Z$/, "Z");
  });

/** Sequences, including ones that contain '#'. */
export const arbSequence: fc.Arbitrary<string> = fc.oneof(
  fc.string({ minLength: 1, maxLength: 30 }),
  fc.tuple(fc.string({ maxLength: 10 }), fc.string({ maxLength: 10 })).map(([a, b]) => `${a}#${b}`),
);

const arbVersion: fc.Arbitrary<SnapshotVersion> = fc.record({
  version: fc.tuple(fc.nat(20), fc.nat(20), fc.nat(20)).map(([a, b, c]) => `${String(a)}.${String(b)}.${String(c)}`),
  publishTime: fc.integer({ min: 946_684_800_000, max: 2_208_988_800_000 }).map((ms) => new Date(ms).toISOString()),
  hasInstallScript: fc.boolean(),
  provenance: fc.constantFrom(true, false, null),
});

/** Snapshots over the given pools of names and capture times. */
export function arbSnapshot(names: readonly string[], captureTimes: readonly string[]): fc.Arbitrary<Snapshot> {
  return fc.record({
    name: fc.constantFrom(...names),
    captureTime: fc.constantFrom(...captureTimes),
    maintainers: fc.array(fc.constantFrom("alice", "bob", "carol", "mallory"), { maxLength: 4 }),
    versions: fc.array(arbVersion, { maxLength: 3 }),
  });
}

export const SEEN_BASE_MS = Date.parse("2026-11-20T00:00:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1000;

export interface SeenRecord {
  readonly name: string;
  readonly at: number;
}

/** Seen records over a pool of six names, times within 200 days either side of a base time. */
export const arbSeenSet: fc.Arbitrary<readonly SeenRecord[]> = fc.array(
  fc.record({
    name: fc.constantFrom("alpha", "beta", "@s/gamma", "Delta", "delta", "zeta"),
    at: fc.integer({ min: SEEN_BASE_MS - 200 * DAY_MS, max: SEEN_BASE_MS + 200 * DAY_MS }),
  }),
  { maxLength: 30 },
);

/** GitHub owner and repository segments that parseRepoUrl accepts. */
export const arbOwner: fc.Arbitrary<string> = fc
  .array(fc.constantFrom(...SEGMENT), { minLength: 1, maxLength: 20 })
  .map((chars) => chars.join(""))
  .filter((owner) => owner !== "orgs");
export const arbRepo: fc.Arbitrary<string> = fc.array(fc.constantFrom(...SEGMENT, "."), { minLength: 1, maxLength: 20 })
  .map((chars) => chars.join(""))
  .filter((repo) => !repo.startsWith(".") && !repo.includes("..") && !repo.endsWith(".git"));

export const arbValidRepoUrl: fc.Arbitrary<string> = fc
  .tuple(arbOwner, arbRepo, fc.constantFrom("", "/", ".git", "/tree/main"))
  .map(([owner, repo, suffix]) => `https://github.com/${owner}/${repo}${suffix}`);

const arbNearMissUrl: fc.Arbitrary<string> = fc.oneof(
  arbValidRepoUrl.map((url) => url.replace("https://", "http://")),
  arbValidRepoUrl.map((url) => `${url}?x=1`),
  arbValidRepoUrl.map((url) => url.replace("github.com", "gitlab.com")),
  arbOwner.map((owner) => `https://github.com/${owner}`),
  fc.string({ maxLength: 40 }),
);

/** Lambda URL events with random methods, paths and raw query strings, many of them valid. */
export const arbEvent: fc.Arbitrary<LambdaFunctionURLEvent> = fc
  .record({
    method: fc.oneof(fc.constant("GET"), fc.constant("GET"), fc.constantFrom("POST", "PUT", "DELETE", "HEAD", "OPTIONS", "get")),
    rawPath: fc.oneof(fc.constant("/api/scan"), fc.constant("/api/scan"), fc.constantFrom("/api/scan/", "/api/scan/x", "/api", "/", "/API/SCAN", "/api/scan%20")),
    rawQueryString: fc.oneof(
      arbValidRepoUrl.map(repoQuery),
      arbValidRepoUrl.map(repoQuery),
      arbNearMissUrl.map(repoQuery),
      fc.tuple(arbValidRepoUrl, arbValidRepoUrl).map(([a, b]) => `${repoQuery(a)}&${repoQuery(b)}`),
      arbValidRepoUrl.map((url) => `${repoQuery(url)}&x=1`),
      arbValidRepoUrl.map((url) => `x=1&${repoQuery(url)}`),
      fc.string({ minLength: 513, maxLength: 600 }).map((long) => repoQuery(`https://github.com/a/${long}`)),
      fc.constantFrom("", "repo=", "repo", "REPO=https%3A%2F%2Fgithub.com%2Fa%2Fb", "x=1"),
      fc.string({ maxLength: 60 }),
    ),
  })
  .map((parts) => makeEvent(parts));

/** A canary of 12 to 20 letters and digits, placed in repository parameters by the no-echo property. */
export const arbCanary: fc.Arbitrary<string> = fc
  .array(fc.constantFrom(..."ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789".split("")), { minLength: 12, maxLength: 20 })
  .map((chars) => chars.join(""));

export interface HostileRepo {
  readonly canary: string;
  /** The raw repo parameter value. */
  readonly repo: string;
  /** True when parseRepoUrl accepts the value. */
  readonly valid: boolean;
}

/** Repository parameters with a canary in the Owner, the Repo, the /tree/ suffix, or an invalid URL. */
export const arbHostileRepo: fc.Arbitrary<HostileRepo> = arbCanary.chain((canary) =>
  fc.constantFrom<HostileRepo>(
    { canary, repo: `https://github.com/${canary}/repo`, valid: true },
    { canary, repo: `https://github.com/owner/${canary}`, valid: true },
    { canary, repo: `https://github.com/owner/repo/tree/${canary}`, valid: true },
    { canary, repo: `https://example.com/${canary}`, valid: false },
    { canary, repo: `https://github.com/${canary}`, valid: false },
    { canary, repo: `https://github.com/o/r?${canary}`, valid: false },
  ),
);
