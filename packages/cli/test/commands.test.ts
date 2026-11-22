// scan, check and evidence over the recorded fixtures. Spec: .kiro/specs/cli-and-action, Requirements 2.5, 4, 6, 7, 8.

import { formatPolicy, DEFAULT_POLICY, verifyEvidencePack, type EvidencePack } from "@sexton/engine";
import { describe, expect, it } from "vitest";
import { runCli } from "../src/run-cli.js";
import { SUMMARY_MARKER } from "../src/summary.js";
import { appFiles, fakeDeps, fixturePackages, manifestsFor, ROOT } from "./support.js";

const PASSING_POLICY = "version: 1\nrules:\n  - type: forbid_state\n    states: [Possessed]\n";

describe("scan", () => {
  it("prints the table, the policy line and remediations, and writes scan.json with exit 0 even when the policy fails", async () => {
    const h = fakeDeps({ files: appFiles() });
    expect(await runCli(["scan", "."], h.deps)).toBe(0);
    const out = h.out.join("");
    const lines = out.split("\n");
    expect(lines[0]).toMatch(/^Package\s+Version\s+State\s+Reason\s+Advisories\s+Install script\s+Provenance\s+Last publish$/);
    expect(lines[1]).toMatch(/^(colors|event-stream|left-pad|node-sass|request|uuid)\s+\S+\s+Dead /);
    expect(out).toContain("policy: failed (default policy, no sexton.policy.yml found)");
    expect(out).toContain("remediation: Sexton:");
    expect(out).toContain("wrote scan.json");
    const file = h.writes.get(`${ROOT}/scan.json`) ?? "";
    expect(file.endsWith("}\n")).toBe(true);
    const scan = JSON.parse(file) as Record<string, unknown>;
    expect(Object.keys(scan)).toEqual(["report", "policy", "remediations"]);
    expect((scan["report"] as { scan: { repo: { url: string } } }).scan.repo.url).toBe("https://github.com/acme/app");
    expect(file).toBe(JSON.stringify(scan, null, 2) + "\n");
  });

  it("names the repository from --repo, from an https origin, or refuses with exit 2", async () => {
    const https = fakeDeps({ files: appFiles(), origin: "https://github.com/acme/web.git" });
    expect(await runCli(["scan", ".", "--out", "o.json"], https.deps)).toBe(0);
    expect(https.writes.get(`${ROOT}/o.json`)).toContain('"url": "https://github.com/acme/web"');
    const none = fakeDeps({ files: appFiles(), origin: null });
    expect(await runCli(["scan", "."], none.deps)).toBe(2);
    expect(none.err.join("")).toBe("cannot name the repository, pass --repo https://github.com/<owner>/<repo>\n");
    const bad = fakeDeps({ files: appFiles() });
    expect(await runCli(["scan", ".", "--repo", "https://gitlab.com/a/b"], bad.deps)).toBe(2);
    expect(bad.err.join("")).toBe("--repo is not a public GitHub repository URL\n");
    const both = fakeDeps({ files: appFiles(), transport: () => Promise.reject(new Error("offline")) });
    expect(await runCli(["scan", "https://github.com/a/b", "--repo", "https://github.com/a/b"], both.deps)).toBe(2);
    expect(both.calls.network).toBe(0);
  });

  it("refuses a missing package.json and an unwritable output with exit 2", async () => {
    const missing = fakeDeps({ files: {} });
    expect(await runCli(["scan", "."], missing.deps)).toBe(2);
    expect(missing.err.join("")).toBe("package.json was not found in the target directory\n");
    const ro = fakeDeps({ files: appFiles(), failWrites: true });
    expect(await runCli(["scan", "."], ro.deps)).toBe(2);
    expect(ro.err.join("")).toBe("could not write scan.json\n");
  });

  it("reports an invalid policy file with code and pointer lines and exit 2", async () => {
    const h = fakeDeps({ files: appFiles({ [`${ROOT}/sexton.policy.yml`]: "version: 2\nrules: []\nextra: 1\n" }) });
    expect(await runCli(["check"], h.deps)).toBe(2);
    const lines = h.err.join("").trimEnd().split("\n");
    expect(lines[0]).toBe("sexton.policy.yml is not valid");
    expect(lines.length).toBeGreaterThan(1);
    for (const l of lines.slice(1)) expect(l).toMatch(/^ {2}[A-Z_]+ \S+$/);
  });

  it("proposes remove only for an unreferenced dependency when the listing ran in full", async () => {
    const tree = { "src/a.js": 'const r = require("request");\nimport _ from "lodash";\n', "src/b.ts": "import u from 'uuid';" };
    const h = fakeDeps({ files: appFiles(), tree });
    expect(await runCli(["scan", "."], h.deps)).toBe(0);
    const scan = JSON.parse(h.writes.get(`${ROOT}/scan.json`) ?? "{}") as { remediations: { packageName: string; kind: string }[] };
    const kind = (name: string) => scan.remediations.find((r) => r.packageName === name)?.kind;
    expect(kind("left-pad")).toBe("remove");
    expect(kind("colors")).toBeUndefined();
    expect(kind("request")).toBe("bump");
    expect(kind("uuid")).toBe("bump");
    expect(kind("node-sass")).toBe("migrate");
    const dev = fakeDeps({ files: appFiles({}, ["left-pad"]), tree });
    await runCli(["scan", "."], dev.deps);
    const devScan = JSON.parse(dev.writes.get(`${ROOT}/scan.json`) ?? "{}") as { remediations: { packageName: string; kind: string }[] };
    expect(devScan.remediations.find((r) => r.packageName === "left-pad")?.kind).toBe("bump");
  });

  it("scans a repository target from GitHub with no file source and no import counting", async () => {
    const { pkg, lock } = manifestsFor(fixturePackages);
    const { fixtureTransport } = await import("./support.js");
    const base = fixtureTransport().transport;
    const raw = "https://raw.githubusercontent.com/acme/app/HEAD/";
    const h = fakeDeps({
      transport: (url, request) => {
        if (url === `${raw}package.json`) return Promise.resolve({ status: 200, json: () => Promise.resolve(JSON.parse(pkg)), text: () => Promise.resolve({ ok: true as const, text: pkg }) });
        if (url === `${raw}package-lock.json`) return Promise.resolve({ status: 200, json: () => Promise.resolve(JSON.parse(lock)), text: () => Promise.resolve({ ok: true as const, text: lock }) });
        if (url === `${raw}sexton.policy.yml`) return Promise.resolve({ status: 404, json: () => Promise.resolve(null) });
        return base(url, request);
      },
    });
    expect(await runCli(["scan", "https://github.com/acme/app"], h.deps)).toBe(0);
    const scan = JSON.parse(h.writes.get(`${ROOT}/scan.json`) ?? "{}") as { remediations: { kind: string }[] };
    expect(scan.remediations.some((r) => r.kind === "remove")).toBe(false);
    expect(h.calls.git).toBe(0);
  });
});

describe("check", () => {
  it("exits 1 when the default policy fails and writes the summary with the marker", async () => {
    const h = fakeDeps({ files: appFiles() });
    expect(await runCli(["check", "--summary", "s.md"], h.deps)).toBe(1);
    const out = h.out.join("");
    expect(out).toContain("FAIL  forbid_state");
    expect(out).toMatch(/ {6}fail: request@2\.88\.2 {2}/);
    expect(out).toContain("policy failed\npolicy: failed (default policy, no sexton.policy.yml found)");
    const summary = h.writes.get(`${ROOT}/s.md`) ?? "";
    expect(summary.startsWith(`${SUMMARY_MARKER}\n## Sexton check: fail`)).toBe(true);
    expect(summary).toContain("Policy: the default policy, no `sexton.policy.yml` found");
  });

  it("exits 0 when the policy file passes", async () => {
    const h = fakeDeps({ files: appFiles({ [`${ROOT}/sexton.policy.yml`]: PASSING_POLICY }) });
    expect(await runCli(["check"], h.deps)).toBe(0);
    expect(h.out.join("")).toContain("PASS  forbid_state\npolicy passed\npolicy: passed (sexton.policy.yml)");
  });

  it("exits 1 for the default policy written as a file", async () => {
    const h = fakeDeps({ files: appFiles({ [`${ROOT}/sexton.policy.yml`]: formatPolicy(DEFAULT_POLICY) }) });
    expect(await runCli(["check", "."], h.deps)).toBe(1);
  });
});

describe("evidence", () => {
  it("writes both files, prints the digest, and the pack verifies; an edited copy exits 1 and junk exits 2", async () => {
    const head = "0123456789abcdef0123456789abcdef01234567";
    const h = fakeDeps({ files: appFiles({ [`${ROOT}/sexton.policy.yml`]: PASSING_POLICY }), head });
    expect(await runCli(["evidence", "--out-dir", "out"], h.deps)).toBe(0);
    const json = h.writes.get(`${ROOT}/out/sexton-evidence.json`) ?? "";
    const md = h.writes.get(`${ROOT}/out/sexton-evidence.md`) ?? "";
    const pack = JSON.parse(json) as EvidencePack;
    expect(h.out.join("")).toContain(`digest ${pack.integrity.digest}\n`);
    expect(md).toContain(pack.integrity.digest);
    expect(pack.body.scan.commit).toBe(head);
    expect(pack.body.scan.policy.source).toBe("file");
    expect(pack.body.scan.policy.digest).toMatch(/^[0-9a-f]{64}$/);
    expect(pack.body.scan.manifests.packageJson).toMatch(/^[0-9a-f]{64}$/);
    expect(pack.body.remediation.plans.length).toBeGreaterThan(0);
    expect(await verifyEvidencePack(pack)).toEqual({ ok: true });

    const v = fakeDeps({ files: { [`${ROOT}/p.json`]: json, [`${ROOT}/e.json`]: json.replace('"state": "Dead"', '"state": "Alive"'), [`${ROOT}/j.json`]: "{" } });
    expect(await runCli(["evidence", "--verify", "p.json"], v.deps)).toBe(0);
    expect(v.out.join("")).toBe(`verified ${pack.integrity.digest}\n`);
    expect(await runCli(["evidence", "--verify", "e.json"], v.deps)).toBe(1);
    expect(await runCli(["evidence", "--verify", "j.json"], v.deps)).toBe(2);
    expect(await runCli(["evidence", "--verify", "none.json"], v.deps)).toBe(2);
    expect(v.err.join("")).toBe("not an evidence pack\nthe evidence file could not be read\n");
  });

  it("drops a commit that is not 40 lower-case hex characters", async () => {
    const h = fakeDeps({ files: appFiles(), head: "ABC" });
    expect(await runCli(["evidence"], h.deps)).toBe(0);
    const pack = JSON.parse(h.writes.get(`${ROOT}/sexton-evidence.json`) ?? "{}") as EvidencePack;
    expect(pack.body.scan.commit).toBeNull();
  });
});
