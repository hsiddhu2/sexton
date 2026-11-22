// runEvidence: the composition behind GET /api/evidence. Spec: .kiro/specs/evidence-pack, Requirements 7.1, 7.3 to 7.11.
// Runs the scan, builds the pack, writes JSON or Markdown. Never rejects. Logs one line with counts only, never the repository.

import { buildEvidencePack, renderEvidenceMarkdown, serialiseEvidencePack, sha256HexOfText } from "@sexton/engine";
import { evidenceResponse, MAX_EVIDENCE_BYTES, utf8Length } from "./http/evidence-response.js";
import type { EvidenceFormat } from "./http/evidence-request.js";
import { errorResponse, evidenceTooLargeSpec, internalErrorSpec, type FunctionUrlResponse } from "./http/responses.js";
import { errorName } from "./log/logger.js";
import { scanWithInputs, type ScanDeps, type Summary } from "./scan.js";
import type { RemediationLogEntry, RepoRef } from "@sexton/engine";

export interface EvidenceRequestInput {
  readonly repoUrl: string;
  readonly repo: RepoRef;
  readonly format: EvidenceFormat;
}

interface EvidenceSummary {
  status: number;
  format: EvidenceFormat;
  packages: number;
  bytes: number;
}

async function hashOrNull(text: string | null | undefined): Promise<string | null> {
  return typeof text === "string" ? sha256HexOfText(text) : null;
}

/** The log entries of the repository, or null when no log is connected or the read fails (one warn line). */
async function readLog(deps: ScanDeps, repository: string): Promise<readonly RemediationLogEntry[] | null> {
  if (deps.remediationLog === undefined) return null;
  try {
    return await deps.remediationLog.list(repository);
  } catch (error) {
    deps.log.warn({ msg: "remediation-log-unavailable", errorName: errorName(error) });
    return null;
  }
}

async function evidence(request: EvidenceRequestInput, deps: ScanDeps, requestId: string, summary: EvidenceSummary): Promise<FunctionUrlResponse> {
  const scanSummary: Summary = { status: 500, packages: 0, capped: false, unlocked: false, policySource: "none" };
  const scanned = await scanWithInputs(request.repoUrl, deps, scanSummary);
  summary.packages = scanSummary.packages;
  if (!scanned.ok) return errorResponse(scanned.response, requestId);

  const built = await buildEvidencePack({
    report: scanned.body.report,
    dependencies: scanned.dependencies,
    policyResult: scanned.body.policy,
    policyDigest: await hashOrNull(scanned.policyText),
    // The commit the scan read at, or null when it read HEAD (spec hosted-plans, Requirement 7.1).
    commit: scanned.commit,
    manifestDigests: {
      packageJson: await hashOrNull(scanned.manifests?.packageJson),
      packageLock: await hashOrNull(scanned.manifests?.packageLock),
    },
    // The scan's plans (hosted-plans 7.2) and the remediation log of this repository (remediate 7.1).
    remediations: scanned.body.remediations ?? [],
    // The log partition uses the lower-cased URL (spec remediate, design decision 9).
    remediationLog: await readLog(deps, request.repoUrl.toLowerCase()),
  });
  if (!built.ok) return errorResponse(internalErrorSpec(), requestId);

  const body = request.format === "md" ? renderEvidenceMarkdown(built.pack) : serialiseEvidencePack(built.pack);
  summary.bytes = utf8Length(body);
  if (summary.bytes > MAX_EVIDENCE_BYTES) return errorResponse(evidenceTooLargeSpec(), requestId);
  return evidenceResponse(body, request.format, request.repo, built.pack.integrity.digest, requestId);
}

export async function runEvidence(request: EvidenceRequestInput, deps: ScanDeps, requestId: string): Promise<FunctionUrlResponse> {
  const started = Date.now();
  const summary: EvidenceSummary = { status: 500, format: request.format, packages: 0, bytes: 0 };
  let response: FunctionUrlResponse;
  try {
    response = await evidence(request, deps, requestId, summary);
  } catch (error) {
    deps.log.error({ msg: "evidence-failed", errorName: errorName(error) });
    response = errorResponse(internalErrorSpec(), requestId);
  }
  summary.status = response.statusCode ?? 500;
  try {
    deps.log.info({ msg: "evidence", ...summary, durationMs: Math.max(0, Date.now() - started) });
  } catch {
    // Logging must never fail a request.
  }
  return response;
}
