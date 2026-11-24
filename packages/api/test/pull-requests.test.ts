// Pull request marks from the remediation log. Spec cemetery-time, requirements 14.1, 14.2. No network.
import { InMemorySnapshotStore, MemoryCacheStore, REMEDIATION_KINDS, type RemediationLogEntry } from "@sexton/engine";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { pullRequestMarks, MAX_PULL_REQUEST_MARKS } from "../src/pull-requests.js";
import { runScan, type ScanDeps } from "../src/scan.js";
import { captureLogger } from "./support/capture-logger.js";
import { FIXTURE_NOW, fixturePackages, packageRoutes, PLAN_ROUTES, repoRoutes, routedTransport } from "./support/fixture-transport.js";

const NAMES = ["a", "b", "c", "d", "@s/e"] as const;
const arbEntry: fc.Arbitrary<RemediationLogEntry> = fc.record({
  repository: fc.constantFrom("https://github.com/x/y", "https://github.com/p/q"),
  branch: fc.constantFrom("sexton/bump-a", "sexton/remove-b"),
  prUrl: fc.nat({ max: 99999 }).map((n) => `https://github.com/x/y/pull/${String(n + 1)}`),
  package: fc.constantFrom(...NAMES, "unknown"),
  kind: fc.constantFrom(...REMEDIATION_KINDS),
  timestamp: fc.date({ min: new Date("2026-01-01T00:00:00Z"), max: new Date("2026-12-31T00:00:00Z"), noInvalidDate: true }).map((d) => d.toISOString()),
});

describe("Feature: cemetery-time, Property 17: Pull request marks from the log", () => {
  it("returns one mark per reported package with an entry, the latest, never an unknown package, at most 300", () => {
    fc.assert(
      fc.property(fc.array(arbEntry, { maxLength: 40 }), fc.subarray([...NAMES]), (entries, reported) => {
        const marks = pullRequestMarks(entries, reported);
        expect(marks.length).toBeLessThanOrEqual(MAX_PULL_REQUEST_MARKS);
        const seen = new Set<string>();
        for (const m of marks) {
          expect(reported).toContain(m.package);
          expect(seen.has(m.package)).toBe(false);
          seen.add(m.package);
          const own = entries.filter((e) => e.package === m.package);
          const latest = Math.max(...own.map((e) => Date.parse(e.timestamp)));
          expect(Date.parse(m.timestamp)).toBe(latest);
          expect(own.some((e) => e.prUrl === m.prUrl && e.kind === m.kind && e.timestamp === m.timestamp)).toBe(true);
        }
        for (const name of reported) expect(seen.has(name)).toBe(entries.some((e) => e.package === name));
      }),
      { numRuns: 100 },
    );
  });

  it("caps the list at 300 marks", () => {
    const names = Array.from({ length: 320 }, (_, i) => `p${String(i)}`);
    const entries = names.map((package_, i): RemediationLogEntry => ({
      repository: "https://github.com/x/y",
      branch: `sexton/bump-${package_}`,
      prUrl: `https://github.com/x/y/pull/${String(i + 1)}`,
      package: package_,
      kind: "bump",
      timestamp: "2026-11-01T00:00:00.000Z",
    }));
    expect(pullRequestMarks(entries, names)).toHaveLength(300);
  });

  it("drops an entry whose prUrl is not https", () => {
    const entry: RemediationLogEntry = { repository: "r", branch: "sexton/bump-a", prUrl: "http://example.com/1", package: "a", kind: "bump", timestamp: "2026-11-01T00:00:00.000Z" };
    expect(pullRequestMarks([entry], ["a"])).toEqual([]);
  });
});

const REPO_URL = "https://github.com/sexton-demo/fixture";
const POLICY_URL = "https://raw.githubusercontent.com/sexton-demo/fixture/HEAD/sexton.policy.yml";

function deps(remediationLog: ScanDeps["remediationLog"]) {
  const packages = fixturePackages();
  const routed = routedTransport([
    ...repoRoutes("sexton-demo", "fixture", packages),
    ...packages.flatMap((p) => packageRoutes(p.name, p.installedVersion)),
    ...PLAN_ROUTES,
    { url: POLICY_URL, status: 404, text: "" },
  ]);
  const log = captureLogger();
  const d: ScanDeps = {
    transport: routed.transport,
    cacheStore: new MemoryCacheStore(),
    snapshotStore: new InMemorySnapshotStore(),
    clock: () => FIXTURE_NOW,
    log,
    retry: { sleep: () => Promise.resolve() },
    ...(remediationLog !== undefined ? { remediationLog } : {}),
  };
  return { deps: d, log, names: packages.map((p) => p.name) };
}

describe("pullRequests in the scan response", () => {
  it("reads the log with the lower-cased URL and adds the marks", async () => {
    const asked: string[] = [];
    let names: readonly string[] = [];
    const reader = {
      list: (repository: string): Promise<readonly RemediationLogEntry[]> => {
        asked.push(repository);
        const first = names[0] ?? "x";
        return Promise.resolve([{ repository, branch: `sexton/bump-${first}`, prUrl: "https://github.com/hsiddhu2/sexton-demo/pull/3", package: first, kind: "bump", timestamp: "2026-11-02T00:00:00.000Z" }]);
      },
    };
    const d = deps(reader);
    names = d.names;
    const plain = await runScan(REPO_URL, d.deps);
    if (!plain.ok) throw new Error("scan failed");
    expect(asked[asked.length - 1]).toBe(REPO_URL);
    expect(plain.body.pullRequests).toHaveLength(1);
    expect(plain.body.pullRequests?.[0]?.package).toBe(names[0]);
    for (const mark of plain.body.pullRequests ?? []) expect(mark.prUrl.startsWith("https://")).toBe(true);
  });

  it("omits the field when the reader fails, keeps the scan and logs the error name only", async () => {
    const secret = "https://github.com/secret/repo ghp_TOKEN";
    const d = deps({ list: () => Promise.reject(new TypeError(secret)) });
    const outcome = await runScan(REPO_URL, d.deps);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect("pullRequests" in outcome.body).toBe(false);
    const warn = d.log.lines.filter((l) => l.fields["msg"] === "remediation-log-unavailable");
    expect(warn).toHaveLength(1);
    expect(warn[0]?.level).toBe("warn");
    expect(warn[0]?.fields).toEqual({ msg: "remediation-log-unavailable", errorName: "TypeError" });
    expect(JSON.stringify(d.log.lines)).not.toContain("ghp_TOKEN");
  });

  it("omits the field when no log is connected", async () => {
    const outcome = await runScan(REPO_URL, deps(undefined).deps);
    expect(outcome.ok && "pullRequests" in outcome.body).toBe(false);
  });
});
