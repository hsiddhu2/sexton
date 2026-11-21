// Responses for GET /api/evidence. Pure. Spec: .kiro/specs/evidence-pack, Requirements 7.4 to 7.6, 7.8, 7.10.

import type { RepoRef } from "@sexton/engine";
import type { EvidenceFormat } from "./evidence-request.js";
import type { FunctionUrlResponse } from "./responses.js";

export const MAX_EVIDENCE_BYTES = 5 * 1024 * 1024;

const CONTENT_TYPES: Readonly<Record<EvidenceFormat, string>> = {
  json: "application/json; charset=utf-8",
  md: "text/markdown; charset=utf-8",
};

function safe(part: string): string {
  return part.replace(/[^A-Za-z0-9._-]/g, "_");
}

/** sexton-evidence-<owner>-<repo>.<json|md> from the parsed reference only, filtered to A-Z a-z 0-9 . - _. */
export function evidenceFileName(repo: Pick<RepoRef, "owner" | "repo">, format: EvidenceFormat): string {
  return `sexton-evidence-${safe(repo.owner)}-${safe(repo.repo)}.${format === "md" ? "md" : "json"}`;
}

export function utf8Length(text: string): number {
  return new TextEncoder().encode(text).byteLength;
}

export function evidenceResponse(body: string, format: EvidenceFormat, repo: RepoRef, digest: string, requestId: string): FunctionUrlResponse {
  return {
    statusCode: 200,
    headers: {
      "content-type": CONTENT_TYPES[format],
      "content-disposition": `attachment; filename="${evidenceFileName(repo, format)}"`,
      "x-sexton-evidence-digest": digest,
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      "x-sexton-request-id": requestId,
    },
    body,
  };
}
