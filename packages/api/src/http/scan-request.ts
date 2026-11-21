// Request validation for GET /api/scan. Pure. Spec: .kiro/specs/infra, Requirements 4.1 to 4.3.
// Reads the method, the path and the raw query string only: no header, no cookie, no body.

import { parseRepoUrl } from "@sexton/engine";
import type { LambdaFunctionURLEvent } from "aws-lambda";

export const SCAN_PATH = "/api/scan";
export const MAX_REPO_PARAM_LENGTH = 512;

export type ScanRequest =
  | { readonly ok: true; readonly repoUrl: string }
  | { readonly ok: false; readonly status: 405; readonly code: "method-not-allowed" }
  | { readonly ok: false; readonly status: 400; readonly code: "invalid-request" | "invalid-url" };

const METHOD_NOT_ALLOWED: ScanRequest = { ok: false, status: 405, code: "method-not-allowed" };
const INVALID_REQUEST: ScanRequest = { ok: false, status: 400, code: "invalid-request" };
const INVALID_URL: ScanRequest = { ok: false, status: 400, code: "invalid-url" };

export function parseScanRequest(event: Pick<LambdaFunctionURLEvent, "rawPath" | "rawQueryString" | "requestContext">): ScanRequest {
  if (event.requestContext.http.method !== "GET") return METHOD_NOT_ALLOWED;
  if (event.rawPath !== SCAN_PATH) return INVALID_REQUEST;
  const entries = [...new URLSearchParams(event.rawQueryString ?? "").entries()];
  if (entries.length !== 1) return INVALID_REQUEST;
  const [name, value] = entries[0] ?? ["", ""];
  if (name !== "repo" || value.length > MAX_REPO_PARAM_LENGTH) return INVALID_REQUEST;
  const parsed = parseRepoUrl(value);
  // The Canonical URL from the parsed reference, never the raw value.
  return parsed.ok ? { ok: true, repoUrl: parsed.repo.url } : INVALID_URL;
}
