// Parity with the CLI and the web app, sources, determinism, network scope.
// Spec: .kiro/specs/sexton-power, Properties 2, 3 (b) and (e), 7, 10, 11. Requirements 3.2, 3.3, 5.4, 5.5, 6.3, 8.3, 8.5, 9.2.
import fc from "fast-check";
import { renderCheck, runCli } from "@sexton/cli";
import { SIGNAL_NAMES, triageOrder, type PackageHealth, type PolicyResult, type RuleResult, type Transport } from "@sexton/engine";
import { describe, expect, it } from "vitest";
import { triageOrder as webTriageOrder } from "../../web/src/triage/triage.js";
import { arbTriageList } from "../../engine/test/arbitraries.js";
import { appFiles, fakeDeps, harness, ROOT } from "./support.js";

const POLICY_FAILS = "version: 1\nrules:\n  - name: No living dependencies\n    type: forbid_state\n    states: [Alive, Restless, Dead, Haunted, Possessed]\n  - name: Fresh\n    type: max_age_months\n    months: 1\n";
const PROJECTS: Record<string, Record<string, string>> = {
  "default policy": appFiles(),
  "a policy that fails": appFiles({ [`${ROOT}/sexton.policy.yml`]: POLICY_FAILS }),
};

function rebuild(json: Record<string, unknown>): PolicyResult {
  const rules = (json["rules"] as Record<string, unknown>[]).map((r) => ({ index: 0, type: r["type"], name: r["name"], pass: r["pass"], failures: r["failures"], unevaluated: r["unevaluated"], notFound: r["notFound"] }) as unknown as RuleResult);
  return { source: json["policySource"] as "default" | "file", pass: json["pass"] as boolean, rules };
}

describe("Property 2: parity with the CLI", () => {
  for (const [label, files] of Object.entries(PROJECTS)) {
    it(`check_policy equals sexton check, and scan_project and fix_order equal scan.json (${label})`, async () => {
      const h = await harness({ projectFiles: files });
      const cli = fakeDeps({ files });
      const checkExit = await runCli(["check", ROOT], cli.deps);
      const tool = await h.client.callTool("check_policy", { projectDir: ROOT });
      expect(tool.json["exitCode"]).toBe(checkExit);
      expect(renderCheck(rebuild(tool.json)).join("\n") + "\n").toBe(cli.out.join(""));

      const cliScan = fakeDeps({ files });
      expect(await runCli(["scan", ROOT], cliScan.deps)).toBe(0);
      const file = JSON.parse(cliScan.writes.get(`${ROOT}/scan.json`) ?? "{}") as { report: { packages: PackageHealth[] }; remediations: { packageName: string; kind: string; status: string; title: string; summary: string; chosenVersion?: string }[] };
      const scan = await h.client.callTool("scan_project", { projectDir: ROOT });
      const rows = scan.json["packages"] as { name: string; version: string; state: string; reason: string }[];
      expect(rows.length).toBe(file.report.packages.length);
      for (const row of rows) {
        const p = file.report.packages.find((x) => x.name === row.name);
        expect(p).toBeDefined();
        expect({ version: row.version, state: row.state, reason: row.reason }).toEqual({ version: p?.installedVersion, state: p?.state, reason: p?.stateReason });
      }
      const order = await h.client.callTool("fix_order", { projectDir: ROOT });
      const plans = (order.json["packages"] as { name: string; plan: { kind: string; status: string; title: string; summary: string; chosenVersion: string | null } | null }[]).filter((p) => p.plan !== null);
      expect(plans.length).toBe(file.remediations.length);
      for (const entry of file.remediations) {
        const plan = plans.find((p) => p.name === entry.packageName)?.plan;
        expect(plan).toMatchObject({ kind: entry.kind, status: entry.status, title: entry.title, summary: entry.summary, chosenVersion: entry.chosenVersion ?? null });
      }
    });
  }
});

describe("Property 3: triage order", () => {
  it("(b) the Engine's order equals the web app's, for any list of up to 300 packages", () => {
    fc.assert(
      fc.property(arbTriageList(300), (list) => {
        const engine = triageOrder(list).map((p) => p.name);
        const web = webTriageOrder(list as never).map((p: { name: string }) => p.name);
        expect(engine).toEqual(web);
      }),
      { numRuns: 100 },
    );
  });
  it("(e) scan_project and fix_order list the same names in the Engine's order", async () => {
    const h = await harness();
    const scan = await h.client.callTool("scan_project", { projectDir: ROOT });
    const order = await h.client.callTool("fix_order", { projectDir: ROOT });
    const a = (scan.json["packages"] as { name: string }[]).map((p) => p.name);
    const b = (order.json["packages"] as { name: string; position: number }[]).map((p) => p.name);
    expect(a).toEqual(b);
    expect((order.json["packages"] as { position: number }[]).map((p) => p.position)).toEqual(b.map((_, i) => i + 1));
    const cli = fakeDeps({ files: appFiles() });
    await runCli(["scan", ROOT], cli.deps);
    const report = (JSON.parse(cli.writes.get(`${ROOT}/scan.json`) ?? "{}") as { report: { packages: PackageHealth[] } }).report;
    expect(triageOrder(report.packages).map((p) => p.name)).toEqual(a);
  });
});

describe("Property 7: every claim has a source", () => {
  async function explainAll(h: Awaited<ReturnType<typeof harness>>): Promise<Record<string, unknown>[]> {
    const scan = await h.client.callTool("scan_project", { projectDir: ROOT });
    const names = (scan.json["packages"] as { name: string }[]).map((p) => p.name);
    const out: Record<string, unknown>[] = [];
    for (const name of names) out.push((await h.client.callTool("explain_package", { projectDir: ROOT, package: name })).json);
    return out;
  }
  function check(explained: Record<string, unknown>[]): void {
    expect(explained.length).toBeGreaterThan(0);
    for (const e of explained) {
      expect(e["ok"]).toBe(true);
      const signals = e["signals"] as Record<string, { available: boolean; source: string; fetchedAt: string; value?: unknown; reason?: string }>;
      expect(Object.keys(signals).sort()).toEqual([...SIGNAL_NAMES].sort());
      for (const s of Object.values(signals)) {
        expect(s.source.length).toBeGreaterThan(0);
        expect(Number.isNaN(Date.parse(s.fetchedAt))).toBe(false);
        if (!s.available) {
          expect((s.reason ?? "").length).toBeGreaterThan(0);
          expect("value" in s).toBe(false);
        }
      }
    }
  }
  it("holds with every upstream answering", async () => check(await explainAll(await harness())));
  it("holds with every upstream failing: signals are unavailable with a reason and keep their source", async () => {
    const down: Transport = () => Promise.reject(new Error("upstream down"));
    const h = await harness({ transport: down, cli: (cli) => ({ ...cli, transport: down }) });
    const explained = await explainAll(h);
    check(explained);
    expect(explained.some((e) => Object.values(e["signals"] as Record<string, { available: boolean }>).some((s) => !s.available))).toBe(true);
  });
});

describe("Property 10: determinism", () => {
  it("two calls, and a fresh server, give byte-identical text", async () => {
    const h = await harness();
    const other = await harness();
    for (const [tool, args] of [["scan_project", { projectDir: ROOT }], ["fix_order", { projectDir: ROOT }], ["check_policy", { projectDir: ROOT }]] as const) {
      const a = await h.client.callTool(tool, args);
      const b = await h.client.callTool(tool, args);
      const c = await other.client.callTool(tool, args);
      expect(b.text).toBe(a.text);
      expect(c.text).toBe(a.text);
    }
  });
});

describe("Property 11: network scope", () => {
  it("every URL is on the three hosts, with no Authorization header and only GET or POST", async () => {
    const seen: { url: string; method: string; headers: Record<string, string> }[] = [];
    const h = await harness({
      cli: (cli) => ({
        ...cli,
        transport: ((url, request) => {
          seen.push({ url, method: request.method, headers: { ...request.headers } });
          return cli.transport(url, request);
        }) as Transport,
      }),
    });
    await h.client.callTool("scan_project", { projectDir: ROOT });
    expect(seen.length).toBeGreaterThan(0);
    for (const s of seen) {
      expect(["registry.npmjs.org", "api.osv.dev", "api.deps.dev"]).toContain(new URL(s.url).host);
      expect(["GET", "POST"]).toContain(s.method);
      expect(Object.keys(s.headers).map((k) => k.toLowerCase())).not.toContain("authorization");
    }
  });
});
