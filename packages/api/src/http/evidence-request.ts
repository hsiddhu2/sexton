// Request validation for GET /api/evidence. Pure. Spec: .kiro/specs/evidence-pack, Requirements 7.2, 7.7.
// Reads the method, the path and the raw query string only: no header, no cookie, no body.

import { parseRepoUrl, type RepoRef } from "@sexton/engine";
import type { LambdaFunctionURLEvent } from "aws-lambda";
import { MAX_REPO_PARAM_LENGTH } from "./scan-request.js";

export const EVIDENCE_PATH = "/api/evidence";
export const EVIDENCE_FORMATS = ["json", "md"] as const;
export type EvidenceFormat = (typeof EVIDENCE_FORMATS)[number];

export type EvidenceRequest =
  | { readonly ok: true; readonly repoUrl: string; readonly repo: RepoRef; readonly format: EvidenceFormat }
  | { readonly ok: false; readonly status: 405; readonly code: "method-not-allowed" }
  | { readonly ok: false; readonly status: 400; readonly code: "invalid-request" | "invalid-url" };

const METHOD_NOT_ALLOWED: EvidenceRequest = { ok: false, status: 405, code: "method-not-allowed" };
const INVALID_REQUEST: EvidenceRequest = { ok: false, status: 400, code: "invalid-request" };
const INVALID_URL: EvidenceRequest = { ok: false, status: 400, code: "invalid-url" };

export function parseEvidenceRequest(event: Pick<LambdaFunctionURLEvent, "rawPath" | "rawQueryString" | "requestContext">): EvidenceRequest {
  if (event.requestContext.http.method !== "GET") return METHOD_NOT_ALLOWED;
  if (event.rawPath !== EVIDENCE_PATH) return INVALID_REQUEST;
  let repo: string | undefined;
  let format: EvidenceFormat | undefined;
  for (const [name, value] of new URLSearchParams(event.rawQueryString ?? "").entries()) {
    if (name === "repo" && repo === undefined) repo = value;
    else if (name === "format" && format === undefined && (EVIDENCE_FORMATS as readonly string[]).includes(value)) format = value as EvidenceFormat;
    else return INVALID_REQUEST;
  }
  if (repo === undefined || repo.length > MAX_REPO_PARAM_LENGTH) return INVALID_REQUEST;
  const parsed = parseRepoUrl(repo);
  // The Canonical URL from the parsed reference, never the raw value.
  return parsed.ok ? { ok: true, repoUrl: parsed.repo.url, repo: parsed.repo, format: format ?? "json" } : INVALID_URL;
}
