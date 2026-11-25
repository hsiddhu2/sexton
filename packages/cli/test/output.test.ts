// Output safety, summary and import-site conditions. Spec: .kiro/specs/cli-and-action. Properties 45, 47 and 48.

import fc from "fast-check";
import type { HealthReport, IntakePackage, PolicyResult, RemediationEntry } from "@sexton/engine";
import { describe, expect, it } from "vitest";
import { renderCheck } from "../src/check-output.js";
import { importSitesFor } from "../src/import-sites.js";
import { runCli } from "../src/run-cli.js";
import { MAX_SUMMARY_CHARS, renderSummary, SUMMARY_MARKER } from "../src/summary.js";
import { renderScanFooter, renderTable } from "../src/table.js";
import { arbHostileHealth, arbHostileString, arbPolicyResultFor, MARKER } from "../../engine/test/remediation/arbitraries.js";
import { appFiles, fakeDeps, ROOT } from "./support.js";

// No C0 or C1 control other than \n, no DEL, no line or paragraph separator, no bidi control or mark, no lone surrogate.
const UNSAFE = new RegExp(
  // eslint-disable-next-line no-control-regex -- control characters are exactly what this test looks for
  "[\\u0000-\\u0009\\u000b-\\u001f\\u007f-\\u009f\\u2028\\u2029\\u202a-\\u202e\\u2066-\\u2069\\u200e\\u200f\\u061c]|[\\ud800-\\udbff](?![\\udc00-\\udfff])|(?<![\\ud800-\\udbff])[\\udc00-\\udfff]",
);

const arbScanText = fc.tuple(fc.array(arbHostileHealth, { minLength: 1, maxLength: 3 }), fc.array(arbHostileString, { minLength: 4, maxLength: 4 })).chain(([packages, h]) =>
  arbPolicyResultFor(packages[0]?.name ?? "x", 3).map((policy) => {
    const s = (i: number) => (h[i] ?? "") + "\u001b[31m\u009b2J\r";
    const report: HealthReport = {
      generatedAt: "2026-11-12T00:00:00.000Z",
      packages,
      scan: {
        repo: { owner: "a", repo: "b", url: "https://github.com/a/b" },
        unlocked: false,
        unlockedPackages: [s(0)],
        lockfileVersion: 3,
        capped: true,
        totalDirect: 400,
        skipped: { peer: 0, optional: 0, invalidName: 0 },
        unresolved: [s(1)],
      },
    };
    const hostilePolicy: PolicyResult = {
      ...policy,
      rules: policy.rules.map((r) => ({ ...r, name: s(2), failures: r.failures.map((f) => ({ ...f, reason: s(3), name: s(0) })) })),
    };
    const remediations: RemediationEntry[] = [{ packageName: s(1), kind: "bump", status: "proposed", title: s(2), summary: s(3), prBody: s(0) }];
    return { report, policy: hostilePolicy, remediations };
  }),
);

describe("Feature: cli-and-action, Property 45: No control character in output", () => {
  it("the table, footer and check output hold no escape or control character other than line feed", () => {
    fc.assert(
      fc.property(arbScanText, ({ report, policy, remediations }) => {
        const text = [...renderTable(report), ...renderScanFooter(report, policy, remediations), ...renderCheck(policy)].join("\n");
        expect(UNSAFE.test(text)).toBe(false);
        expect(text).not.toContain("\u001b");
      }),
      { numRuns: 1000 },
    );
  });

  it("stderr of an invalid policy file with hostile keys is safe too", async () => {
    const h = fakeDeps({ files: appFiles({ [`${ROOT}/sexton.policy.yml`]: 'version: 1\nrules:\n  - type: forbid_state\n    states: [Dead]\n    "\u001b[2Jx‮": 1\n' }) });
    expect(await runCli(["check"], h.deps)).toBe(2);
    expect(UNSAFE.test(h.err.join("").replace(/\n/g, ""))).toBe(false);
  });
});

describe("Feature: cli-and-action, Property 48: Summary has no raw outside line", () => {
  it("leaves no marker outside a code span, starts with the Marker and stays within 60000 characters", () => {
    fc.assert(
      fc.property(arbScanText, ({ report, policy, remediations }) => {
        const summary = renderSummary(report, policy, remediations);
        expect(summary.startsWith(`${SUMMARY_MARKER}\n`)).toBe(true);
        expect(summary.length).toBeLessThanOrEqual(MAX_SUMMARY_CHARS);
        expect(summary.replace(/`[^`\n]*`/g, "")).not.toContain(MARKER);
      }),
      { numRuns: 1000 },
    );
  });

  it("cuts a huge summary with the closing note", () => {
    const remediations = Array.from({ length: 2000 }, (_, i): RemediationEntry => ({ packageName: "p", kind: "bump", status: "proposed", title: `Sexton: bump p${String(i)} ${"x".repeat(40)}`, summary: "", prBody: "" }));
    const summary = renderSummary({ generatedAt: "x", packages: [] }, { source: "default", pass: true, rules: [] }, remediations);
    expect(summary.length).toBeLessThanOrEqual(MAX_SUMMARY_CHARS);
    expect(summary.endsWith("Summary cut at 60000 characters. Run sexton check locally for the full result.")).toBe(true);
  });
});

const arbIntake = fc.array(
  fc.record({ name: fc.constantFrom("a", "b", "c", "@s/d"), origin: fc.constantFrom("dependencies" as const, "devDependencies" as const) }).map(
    (r): IntakePackage => ({ name: r.name, installedVersion: "1.0.0", declaredRange: "^1.0.0", origin: r.origin, resolution: "locked" }),
  ),
  { maxLength: 6 },
);

describe("Feature: cli-and-action, Property 47: importSites conditions", () => {
  it("has no devDependency entry, none at all unless the listing ran in full, and otherwise one per dependency", () => {
    fc.assert(
      fc.property(arbIntake, fc.boolean(), fc.boolean(), fc.nat(2), fc.array(fc.nat(3), { minLength: 4, maxLength: 4 }), (intake, performed, capped, skipped, n) => {
        const counts = new Map(["a", "b", "c", "@s/d"].map((name, i) => [name, n[i] ?? 0]));
        const sites = importSitesFor(intake, counts, { performed, capped, skipped });
        for (const name of sites.keys()) expect(intake.some((p) => p.name === name && p.origin === "dependencies")).toBe(true);
        if (!performed || capped || skipped > 0) expect(sites.size).toBe(0);
        else {
          const firstOrigin = new Map<string, string>();
          for (const p of intake) if (!firstOrigin.has(p.name)) firstOrigin.set(p.name, p.origin);
          for (const p of intake) if (p.origin === "dependencies") expect(sites.has(p.name)).toBe(true);
        }
      }),
      { numRuns: 100 },
    );
  });
});

describe("scan table: Publisher and New deps columns (spec new-signals, Requirement 6.3)", () => {
  it("shows the publisher status and the count of new dependencies, 5+ when capped, and none without an earlier version", () => {
    const base = fc.sample(arbHostileHealth, { numRuns: 1, seed: 7 })[0];
    if (base === undefined) throw new Error("no sample");
    const at = "2026-11-12T00:00:00.000Z";
    const src = "https://registry.npmjs.org/x";
    const record = { version: "1.0.0", publisher: "a", method: "token" as const, publishTime: at };
    const row = (publisherChange: HealthReport["packages"][number]["signals"]["publisherChange"], newDependency: HealthReport["packages"][number]["signals"]["newDependency"]) => {
      const report: HealthReport = {
        generatedAt: at,
        packages: [{ ...base, name: "x", installedVersion: "1.0.1", state: "Alive", stateReason: "r", signals: { ...base.signals, publisherChange, newDependency } }],
      };
      return renderTable(report)[1]?.trimEnd() ?? "";
    };
    const compared = { status: "compared" as const, installedVersion: "1.0.1", earlierVersion: "1.0.0", installedPublishTime: at, added: [], capped: false, addedCount: 2 };
    expect(row({ value: { status: "changed", earlier: record, installed: record }, source: src, fetchedAt: at, available: true }, { value: compared, source: src, fetchedAt: at, available: true })).toMatch(/changed\s+2$/);
    expect(
      row(
        { value: { status: "no-earlier-version", installed: null }, source: src, fetchedAt: at, available: true },
        { value: { ...compared, capped: true, addedCount: 9, added: Array.from({ length: 5 }, (_, i) => ({ name: `d${String(i)}`, range: "^1.0.0", resolvedVersion: null, resolvedPublishTime: null, installScript: null, fresh: false })) }, source: src, fetchedAt: at, available: true },
      ),
    ).toMatch(/none\s+5\+$/);
    expect(row({ value: null, source: src, fetchedAt: at, available: false, reason: "HTTP 503" }, { value: null, source: src, fetchedAt: at, available: false, reason: "HTTP 503" })).toMatch(
      /unavailable\s+unavailable$/,
    );
  });
});
