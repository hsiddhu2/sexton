// runEvidence: the composition behind GET /api/evidence. Spec: .kiro/specs/evidence-pack, Requirements 7.1, 7.3 to 7.11.
// Runs the scan, builds the pack, writes JSON or Markdown. Never rejects. Logs one line with counts only, never the repository.

import { buildEvidencePack, renderEvidenceMarkdown, serialiseEvidencePack, sha256HexOfText } from "@sexton/engine";
import { evidenceResponse, MAX_EVIDENCE_BYTES, utf8Length } from "./http/evidence-response.js";
import type { EvidenceFormat } from "./http/evidence-request.js";
import { errorResponse, evidenceTooLargeSpec, internalErrorSpec, type FunctionUrlResponse } from "./http/responses.js";
import { errorName } from "./log/logger.js";
import { scanWithInputs, type ScanDeps, type Summary } from "./scan.js";
import type { RepoRef } from "@sexton/engine";

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
    // 10b resolves the head commit; until then the hosted pack says it was not recorded (handoff decision 13).
    commit: null,
    manifestDigests: {
      packageJson: await hashOrNull(scanned.manifests?.packageJson),
      packageLock: await hashOrNull(scanned.manifests?.packageLock),
    },
    // Nothing on the hosted scan path plans remediations or keeps a log yet (10b).
    remediations: [],
    remediationLog: null,
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
