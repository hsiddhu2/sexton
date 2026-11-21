// Spec: .kiro/specs/evidence-pack, Requirements 5.1 to 5.10. Property 39 and the Markdown half of property 40.

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { buildEvidencePack, type EvidenceInput } from "../../src/evidence/build-pack.js";
import {
  DIGEST_LIMIT_SENTENCE,
  FOOTER,
  LOG_EMPTY,
  LOG_NOT_CONNECTED,
  renderEvidenceMarkdown,
  VERIFY_TEXT,
} from "../../src/evidence/render-markdown.js";
import { SIGNAL_SUMMARIES } from "../../src/evidence/signal-summary.js";
import { available } from "../../src/signal.js";
import { SIGNAL_NAMES, type Advisory, type EvidencePack, type PackageHealth, type PolicyResult } from "../../src/types.js";
import { arbHostileString, healthySignals, MARKER } from "../remediation/arbitraries.js";
import { AT, arbEvidenceInput, arbHostileInput, reportFor } from "./arbitraries.js";

const REPO = { owner: "acme", repo: "app", url: "https://github.com/acme/app" };

function pkg(name: string, state: PackageHealth["state"], advisories: readonly Advisory[] = []): PackageHealth {
  const signals = { ...healthySignals(), advisories: available(advisories, "https://api.osv.dev/v1/querybatch", AT) };
  return { name, installedVersion: "1.0.0", state, stateReason: `reason ${name}`, signals, missingSignals: [] };
}

async function packOf(i: EvidenceInput): Promise<EvidencePack> {
  const result = await buildEvidencePack(i);
  if (!result.ok) throw new Error(result.reason);
  return result.pack;
}

function input(overrides: Partial<EvidenceInput> = {}): EvidenceInput {
  return {
    report: reportFor(REPO, [pkg("b", "Alive"), pkg("a", "Alive"), pkg("z", "Possessed"), pkg("d", "Dead")]),
    dependencies: [],
    policyResult: { source: "default", pass: true, rules: [] },
    policyDigest: null,
    commit: null,
    manifestDigests: { packageJson: null, packageLock: null },
    remediations: [],
    remediationLog: null,
    ...overrides,
  };
}

function headings(md: string): string[] {
  return md.split("\n").filter((l) => /^#{1,2} /.test(l));
}

describe("renderEvidenceMarkdown examples", () => {
  it("writes the sections in order with the fixed texts", async () => {
    const pack = await packOf(input());
    const md = renderEvidenceMarkdown(pack);
    expect(headings(md)).toEqual([
      "# Sexton evidence pack: `https://github.com/acme/app`",
      "## Integrity",
      "## Scan",
      "## Policy",
      "## Packages",
      "## Signals",
      "## SBOM",
      "## Remediation",
    ]);
    expect(md).toContain(`- Digest: \`${pack.integrity.digest}\``);
    expect(md).toContain(DIGEST_LIMIT_SENTENCE);
    expect(md).toContain(VERIFY_TEXT);
    expect(md).toContain(LOG_NOT_CONNECTED);
    expect(md).toContain("no plans");
    expect(md.trimEnd().endsWith(FOOTER)).toBe(true);
    expect(md).toContain("- Commit: not recorded (`commit not recorded, the scan read the default branch head`)");
  });

  it("orders the packages table by state, then name", async () => {
    const md = renderEvidenceMarkdown(await packOf(input()));
    const rows = md.split("\n").filter((l) => /^\| `[a-z]` \|/.test(l));
    expect(rows.map((r) => r.slice(3, 4))).toEqual(["z", "d", "a", "b"]);
  });

  it("shows ten signal rows per package with source and time", async () => {
    const md = renderEvidenceMarkdown(await packOf(input({ report: reportFor(REPO, [pkg("a", "Alive")]) })));
    const section = md.slice(md.indexOf("## Signals"), md.indexOf("## SBOM"));
    for (const name of SIGNAL_NAMES) expect(section).toContain(`| ${name} | `);
    expect(section.split("\n").filter((l) => l.startsWith("| ") && !l.startsWith("| Signal")).length).toBe(10);
    expect(Object.keys(SIGNAL_SUMMARIES).sort()).toEqual([...SIGNAL_NAMES].sort());
  });

  it("shows an unavailable signal with its reason", async () => {
    const p = pkg("a", "Alive");
    const signals = { ...p.signals, deprecated: { value: null, source: "https://registry.npmjs.org/a", fetchedAt: AT.toISOString(), available: false as const, reason: "HTTP 503" } };
    const md = renderEvidenceMarkdown(await packOf(input({ report: reportFor(REPO, [{ ...p, signals }]) })));
    expect(md).toContain("| deprecated | unavailable: `HTTP 503` | `https://registry.npmjs.org/a` |");
  });

  it("caps advisories at 20 per package", async () => {
    const advisories = Array.from({ length: 23 }, (_, i): Advisory => ({ id: `GHSA-${String(i)}`, severity: "High", summary: `s${String(i)}` }));
    const md = renderEvidenceMarkdown(await packOf(input({ report: reportFor(REPO, [pkg("a", "Haunted", advisories)]) })));
    expect(md.split("\n").filter((l) => l.startsWith("- `GHSA-")).length).toBe(20);
    expect(md).toContain("and 3 more in the JSON");
  });

  it("renders policy rules with failures and the plans and log tables", async () => {
    const policyResult: PolicyResult = {
      source: "file",
      pass: false,
      rules: [
        {
          index: 0,
          type: "forbid_state",
          name: "no dead",
          pass: false,
          failures: [{ name: "d", installedVersion: "1.0.0", signal: "state", value: "Dead", source: null, fetchedAt: AT.toISOString(), reason: "state Dead is forbidden" }],
          unevaluated: [{ name: "a", installedVersion: "1.0.0", signal: "lastPublish", reason: "lastPublish unavailable" }],
          notFound: ["q"],
        },
      ],
    };
    const md = renderEvidenceMarkdown(
      await packOf(
        input({
          policyResult,
          policyDigest: "3".repeat(64),
          remediations: [{ packageName: "d", kind: "bump", status: "proposed", title: "Sexton: bump d", summary: "s", prBody: "b", chosenVersion: "2.0.0", majorUpgrade: true }],
          remediationLog: [{ repository: REPO.url, branch: "sexton/bump-d", prUrl: "https://github.com/acme/app/pull/4", package: "d", kind: "bump", timestamp: "2026-11-20T00:00:00Z" }],
        }),
      ),
    );
    expect(md).toContain("Result: **fail**, source `file`");
    expect(md).toContain("### Rule 0: `forbid_state` `no dead`");
    expect(md).toContain("- `d` `1.0.0`: `state Dead is forbidden`");
    expect(md).toContain("Not evaluated:\n- `a` `1.0.0`: `lastPublish unavailable`");
    expect(md).toContain("Not found:\n- `q`");
    expect(md).toContain(`digest \`${"3".repeat(64)}\``);
    expect(md).toContain("| `d` | `bump` | `proposed` | `Sexton: bump d` | `2.0.0` | yes |");
    expect(md).toContain("| `https://github.com/acme/app` | `sexton/bump-d` | `d` | `bump` | `https://github.com/acme/app/pull/4` | `2026-11-20T00:00:00Z` |");
  });

  it("says no pull requests are recorded for an empty connected log", async () => {
    expect(renderEvidenceMarkdown(await packOf(input({ remediationLog: [] })))).toContain(LOG_EMPTY);
  });
});

/** Every hostile free-text field: packages, policy and remediation entries. */
const arbFullyHostile: fc.Arbitrary<EvidenceInput> = fc
  .tuple(arbHostileInput, fc.array(arbHostileString, { minLength: 8, maxLength: 8 }))
  .map(([i, h]) => {
    const s = (n: number): string => h[n] as string;
    return {
      ...i,
      policyResult: {
        source: "file",
        pass: false,
        rules: [
          {
            index: 0,
            type: "forbid_state",
            name: s(0),
            pass: false,
            failures: [{ name: s(1), installedVersion: s(2), signal: "state", value: s(3), source: s(4), fetchedAt: s(5), reason: s(6) }],
            unevaluated: [{ name: s(1), installedVersion: s(2), signal: "provenance", reason: s(7) }],
            notFound: [s(0)],
          },
        ],
      },
      remediations: [{ packageName: s(1), kind: "migrate", status: "proposed", title: s(2), summary: s(3), prBody: s(4), chosenVersion: s(5) }],
      report: {
        ...i.report,
        packages: i.report.packages,
        scan: i.report.scan === undefined ? undefined : { ...i.report.scan, unresolved: [s(6)], unlockedPackages: [s(7)] },
      } as EvidenceInput["report"],
    };
  });

describe("Feature: evidence-pack, Property 39: No raw untrusted line in the report", () => {
  it("leaves no marker once every code span is removed", async () => {
    await fc.assert(
      fc.asyncProperty(arbFullyHostile, async (i) => {
        const md = renderEvidenceMarkdown(await packOf(i));
        expect(md).toContain(MARKER);
        expect(md.replace(/`[^`\n]*`/g, "")).not.toContain(MARKER);
      }),
      { numRuns: 1000 },
    );
  });
});

describe("Feature: evidence-pack, Property 40: Builder total, pure and deterministic (Markdown)", () => {
  it("gives equal reports for equal packs and shows the digest in the Integrity section", async () => {
    await fc.assert(
      fc.asyncProperty(fc.oneof(arbEvidenceInput, arbHostileInput), async (i) => {
        const pack = await packOf(i);
        const md = renderEvidenceMarkdown(pack);
        expect(renderEvidenceMarkdown(structuredClone(pack))).toBe(md);
        const integrity = md.slice(md.indexOf("## Integrity"), md.indexOf("## Scan"));
        expect(integrity).toContain(pack.integrity.digest);
      }),
      { numRuns: 100 },
    );
  });
});
