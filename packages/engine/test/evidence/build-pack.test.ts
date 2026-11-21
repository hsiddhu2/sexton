// Spec: .kiro/specs/evidence-pack, Requirements 3.1 to 3.10. Property 40 (builder half).

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { BUILD_FAILURES, buildEvidencePack, COMMIT_NOTE, serialiseEvidencePack, type EvidenceInput } from "../../src/evidence/build-pack.js";
import { canonicalJson } from "../../src/evidence/canonical-json.js";
import { sha256HexOfText } from "../../src/evidence/sha256.js";
import { ENGINE_VERSION } from "../../src/version.js";
import type { RemediationLogEntry } from "../../src/types.js";
import { deepFreeze, healthySignals } from "../remediation/arbitraries.js";
import { AT, arbEvidenceInput, arbHostileInput, reportFor } from "./arbitraries.js";

const REPO = { owner: "acme", repo: "app", url: "https://github.com/acme/app" };

function input(overrides: Partial<EvidenceInput> = {}): EvidenceInput {
  return {
    report: reportFor(REPO, [{ name: "left-pad", installedVersion: "1.3.0", state: "Dead", stateReason: "installed version is deprecated", signals: healthySignals(), missingSignals: [] }]),
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

function log(overrides: Partial<RemediationLogEntry>): RemediationLogEntry {
  return { repository: REPO.url, branch: "sexton/bump-a", prUrl: "https://github.com/acme/app/pull/1", package: "a", kind: "bump", timestamp: "2026-11-02T00:00:00Z", ...overrides };
}

async function built(i: EvidenceInput) {
  const result = await buildEvidencePack(i);
  if (!result.ok) throw new Error(result.reason);
  return result.pack;
}

describe("buildEvidencePack examples", () => {
  it("fills the scan section and seals the canonical body", async () => {
    const pack = await built(input({ manifestDigests: { packageJson: "1".repeat(64), packageLock: null } }));
    expect(pack.evidenceVersion).toBe(1);
    expect(pack.body.scan).toEqual({
      repository: REPO.url,
      commit: null,
      commitNote: COMMIT_NOTE,
      generatedAt: AT.toISOString(),
      engineVersion: ENGINE_VERSION,
      policy: { version: 1, source: "default", digest: null },
      manifests: { packageJson: "1".repeat(64), packageLock: null },
      unlocked: false,
      unlockedPackages: [],
      lockfileVersion: 3,
      capped: false,
      totalDirect: 1,
      skipped: { peer: 0, optional: 0, invalidName: 0 },
      unresolved: [],
    });
    expect(pack.body.remediation).toEqual({ plans: [], log: { available: false, entries: [] } });
    expect(pack.body.sbom.components).toHaveLength(1);
    expect(pack.integrity).toEqual({ algorithm: "SHA-256", canonicalization: "RFC 8785", digest: await sha256HexOfText(canonicalJson(pack.body) as string) });
    expect(Object.keys(pack.body)).toEqual(["scan", "sbom", "packages", "policy", "remediation"]);
  });

  it("records a known commit without a note", async () => {
    const pack = await built(input({ commit: "0123456789abcdef0123456789abcdef01234567" }));
    expect(pack.body.scan.commit).toBe("0123456789abcdef0123456789abcdef01234567");
    expect(pack.body.scan.commitNote).toBeNull();
    expect(pack.body.sbom.metadata.component.version).toBe("0123456789abcdef0123456789abcdef01234567");
  });

  it("keeps the policy digest for a policy file only", async () => {
    const digest = "2".repeat(64);
    expect((await built(input({ policyDigest: digest, policyResult: { source: "file", pass: true, rules: [] } }))).body.scan.policy.digest).toBe(digest);
    expect((await built(input({ policyDigest: digest }))).body.scan.policy.digest).toBeNull();
  });

  it.each([
    ["report has no scan metadata", input({ report: { generatedAt: AT.toISOString(), packages: [] } })],
    ["commit is not a 40 character hex string", input({ commit: "ABCDEF0123456789abcdef0123456789abcdef01" })],
    ["commit is not a 40 character hex string", input({ commit: "abc" })],
    ["body is not serialisable", input({ manifestDigests: { packageJson: null, packageLock: null }, policyResult: { source: "default", pass: true, rules: [{ index: Number.NaN } as never] } })],
  ])("fails with %s", async (reason, i) => {
    expect(await buildEvidencePack(i)).toEqual({ ok: false, reason });
  });

  it("keeps valid log entries for this repository, sorted by timestamp then branch", async () => {
    const entries = [
      log({ branch: "sexton/bump-b", timestamp: "2026-11-03T00:00:00Z" }),
      log({ branch: "sexton/bump-z", timestamp: "2026-11-02T00:00:00Z" }),
      log({ branch: "sexton/bump-a", timestamp: "2026-11-02T00:00:00Z" }),
      log({ repository: "https://github.com/other/app" }),
      log({ prUrl: "http://insecure" }),
    ];
    const pack = await built(input({ remediationLog: entries }));
    expect(pack.body.remediation.log.available).toBe(true);
    expect(pack.body.remediation.log.entries.map((e) => e.branch)).toEqual(["sexton/bump-a", "sexton/bump-z", "sexton/bump-b"]);
    expect((await built(input({ remediationLog: [] }))).body.remediation.log).toEqual({ available: true, entries: [] });
  });

  it("copies remediation entries as plans", async () => {
    const pack = await built(
      input({
        remediations: [
          { packageName: "left-pad", kind: "bump", status: "proposed", title: "Sexton: bump left-pad", summary: "s", prBody: "b", chosenVersion: "2.0.0", majorUpgrade: true },
          { packageName: "x", kind: "remove", status: "unavailable", title: "t", summary: "s", prBody: "b" },
        ],
      }),
    );
    expect(pack.body.remediation.plans).toEqual([
      { packageName: "left-pad", kind: "bump", status: "proposed", title: "Sexton: bump left-pad", chosenVersion: "2.0.0", majorUpgrade: true },
      { packageName: "x", kind: "remove", status: "unavailable", title: "t" },
    ]);
  });

  it("cleans lone surrogates before hashing, and writes the pack file with two spaces and a final newline", async () => {
    const i = input();
    const report = { ...i.report, packages: [{ ...(i.report.packages[0] as never as object), stateReason: "bad \ud800" }] } as never;
    const pack = await built({ ...i, report });
    expect(pack.body.packages[0]?.stateReason).toBe("bad �");
    const text = serialiseEvidencePack(pack);
    expect(text.endsWith("}\n")).toBe(true);
    expect(text.split("\n")[1]).toBe('  "evidenceVersion": 1,');
  });
});

describe("Feature: evidence-pack, Property 40: Builder total, pure and deterministic", () => {
  it("always builds a valid input, deterministically, without changing it", async () => {
    await fc.assert(
      fc.asyncProperty(fc.oneof(arbEvidenceInput, arbHostileInput), async (i) => {
        const before = structuredClone(i);
        deepFreeze(i);
        const a = await buildEvidencePack(i);
        const b = await buildEvidencePack(structuredClone(before));
        expect(a.ok).toBe(true);
        expect(b).toEqual(a);
        expect(i).toEqual(before);
      }),
      { numRuns: 100 },
    );
  });

  it("never rejects and returns a closed reason for arbitrary values in every field", async () => {
    const field = fc.oneof(fc.anything(), fc.constant(undefined), fc.constant(null));
    await fc.assert(
      fc.asyncProperty(
        fc.oneof(
          fc.anything(),
          arbEvidenceInput.chain((i) =>
            fc.record({ key: fc.constantFrom(...(Object.keys(i) as (keyof EvidenceInput)[])), value: field }).map(({ key, value }) => ({ ...i, [key]: value })),
          ),
        ),
        async (value) => {
          const result = await buildEvidencePack(value as EvidenceInput);
          if (!result.ok) expect(BUILD_FAILURES).toContain(result.reason);
        },
      ),
      { numRuns: 100 },
    );
  });
});
