// The evidence pack builder. Spec: .kiro/specs/evidence-pack, Requirement 3.
// Never rejects and never mutates its input. The digest is over the UTF-8 bytes of the RFC 8785 canonical form of
// the Clean copy of the body, never over the file.

import { isValidLogEntry } from "../remediation/log-entry.js";
import type {
  EvidenceBody,
  EvidenceBuildFailure,
  EvidenceBuildResult,
  EvidencePack,
  EvidencePlan,
  HealthReport,
  IntakePackage,
  ManifestDigests,
  PolicyResult,
  RemediationEntry,
  RemediationLogEntry,
} from "../types.js";
import { EVIDENCE_BUILD_FAILURES } from "../types.js";
import { ENGINE_VERSION } from "../version.js";
import { canonicalJson, cleanJsonCopy } from "./canonical-json.js";
import { buildSbom } from "./sbom.js";
import { sha256HexOfText } from "./sha256.js";

export { EVIDENCE_BUILD_FAILURES as BUILD_FAILURES };
export const COMMIT_NOTE = "commit not recorded, the scan read the default branch head";
const COMMIT = /^[0-9a-f]{40}$/;

export interface EvidenceInput {
  readonly report: HealthReport;
  readonly dependencies: readonly IntakePackage[];
  readonly policyResult: PolicyResult;
  /** SHA-256 hex of the policy file text, null for the default policy. */
  readonly policyDigest: string | null;
  /** 40 lower-case hex characters, or null when not known. */
  readonly commit: string | null;
  readonly manifestDigests: ManifestDigests;
  readonly remediations: readonly RemediationEntry[];
  /** null when no remediation log is connected. */
  readonly remediationLog: readonly RemediationLogEntry[] | null;
}

function fail(reason: EvidenceBuildFailure): EvidenceBuildResult {
  return { ok: false, reason };
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function plan(entry: RemediationEntry): EvidencePlan {
  return {
    packageName: entry.packageName,
    kind: entry.kind,
    status: entry.status,
    title: entry.title,
    ...(entry.chosenVersion !== undefined ? { chosenVersion: entry.chosenVersion } : {}),
    ...(entry.majorUpgrade !== undefined ? { majorUpgrade: entry.majorUpgrade } : {}),
  };
}

function logEntries(log: readonly RemediationLogEntry[], repository: string): RemediationLogEntry[] {
  return log
    .filter((e) => isValidLogEntry(e) && e.repository === repository)
    .map((e) => ({ repository: e.repository, branch: e.branch, prUrl: e.prUrl, package: e.package, kind: e.kind, timestamp: e.timestamp }))
    .sort((a, b) => compare(a.timestamp, b.timestamp) || compare(a.branch, b.branch));
}

async function build(input: EvidenceInput): Promise<EvidenceBuildResult> {
  const { report } = input;
  const scan = report.scan;
  if (scan === undefined) return fail("report has no scan metadata");
  if (input.commit !== null && (typeof input.commit !== "string" || !COMMIT.test(input.commit))) {
    return fail("commit is not a 40 character hex string");
  }
  const source = input.policyResult.source;
  const sbom = await buildSbom({
    repo: scan.repo,
    commit: input.commit,
    generatedAt: report.generatedAt,
    packages: report.packages,
    dependencies: input.dependencies,
  });
  const body: EvidenceBody = {
    scan: {
      repository: scan.repo.url,
      commit: input.commit,
      commitNote: input.commit === null ? COMMIT_NOTE : null,
      generatedAt: report.generatedAt,
      engineVersion: ENGINE_VERSION,
      policy: { version: 1, source, digest: source === "file" ? input.policyDigest : null },
      manifests: { packageJson: input.manifestDigests.packageJson, packageLock: input.manifestDigests.packageLock },
      unlocked: scan.unlocked,
      unlockedPackages: scan.unlockedPackages,
      lockfileVersion: scan.lockfileVersion,
      capped: scan.capped,
      totalDirect: scan.totalDirect,
      skipped: scan.skipped,
      unresolved: scan.unresolved,
    },
    sbom,
    packages: report.packages,
    policy: input.policyResult,
    remediation: {
      plans: input.remediations.map(plan),
      log: input.remediationLog === null ? { available: false, entries: [] } : { available: true, entries: logEntries(input.remediationLog, scan.repo.url) },
    },
  };
  // The Clean copy is a fresh deep copy, so nothing in the pack is shared with the input.
  const clean = cleanJsonCopy(body);
  if (!clean.ok) return fail("body is not serialisable");
  const text = canonicalJson(clean.value);
  if (text === null) return fail("body is not serialisable");
  const pack: EvidencePack = {
    evidenceVersion: 1,
    body: clean.value as unknown as EvidenceBody,
    integrity: { algorithm: "SHA-256", canonicalization: "RFC 8785", digest: await sha256HexOfText(text) },
  };
  return { ok: true, pack };
}

/** Builds the evidence pack. Resolves to a failure from BUILD_FAILURES for any input it cannot use. Requirement 3.1. */
export async function buildEvidencePack(input: EvidenceInput): Promise<EvidenceBuildResult> {
  try {
    return await build(input);
  } catch {
    return fail("body is not serialisable");
  }
}

/** The pack file: two-space indentation and a final newline. Requirement 3.9. */
export function serialiseEvidencePack(pack: EvidencePack): string {
  return JSON.stringify(pack, null, 2) + "\n";
}
