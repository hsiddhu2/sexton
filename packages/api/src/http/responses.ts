// Response bodies and headers for the scan API. Pure. Spec: .kiro/specs/infra, Requirements 4.2 to 4.10.
// Every body is built from named fields. The only variable parts are an error code, an engine file name,
// an upstream HTTP status inside the engine's fixed message, and policy error codes and JSON pointer paths.

import { parseRepoUrl, type IntakeError, type ValidationError } from "@sexton/engine";
import type { LambdaFunctionURLResult } from "aws-lambda";

/** The structured form of a function URL result. */
export type FunctionUrlResponse = Exclude<LambdaFunctionURLResult, string>;
import type { ScanResponse } from "../contract.js";

export const API_ERROR_CODES = [
  "invalid-request",
  "method-not-allowed",
  "invalid-url",
  "missing-package-json",
  "invalid-package-json",
  "invalid-lockfile",
  "manifest-too-large",
  "invalid-policy",
  "fetch-failed",
  "internal-error",
  "evidence-too-large",
] as const;
export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

export { POLICY_FILE } from "@sexton/engine";
import { POLICY_FILE } from "@sexton/engine";
export const MAX_POLICY_ERRORS = 20;
export const MAX_POLICY_ERROR_PATH = 200;

export interface ErrorBody {
  readonly code: ApiErrorCode;
  readonly message: string;
  readonly file?: string;
  readonly errors?: readonly { readonly code: string; readonly path: string }[];
}

export interface ErrorSpec {
  readonly status: number;
  readonly body: ErrorBody;
}

/** The engine's fixed text for a rejected URL. parseRepoUrl("") is always rejected and holds no input. */
const ENGINE_INVALID_URL_MESSAGE = ((): string => {
  const result = parseRepoUrl("");
  return result.ok ? "The URL is not a public GitHub repository URL." : result.message;
})();

/** Fixed messages, the whole table of text the API writes itself. */
export const FIXED_MESSAGES = {
  "method-not-allowed": "Only GET is supported.",
  "invalid-request": "Send GET /api/scan?repo=<public GitHub URL>.",
  "invalid-url": ENGINE_INVALID_URL_MESSAGE,
  "invalid-policy": `${POLICY_FILE} is not valid.`,
  "policy-fetch-failed": `${POLICY_FILE} could not be fetched.`,
  "internal-error": "The scan failed unexpectedly.",
  "invalid-evidence-request": "Send GET /api/evidence?repo=<public GitHub URL>&format=json or md.",
  "evidence-too-large": "The evidence pack is larger than 5 MiB.",
} as const;

export function requestErrorSpec(code: "method-not-allowed" | "invalid-request" | "invalid-url"): ErrorSpec {
  return { status: code === "method-not-allowed" ? 405 : 400, body: { code, message: FIXED_MESSAGES[code] } };
}

/** The evidence path's request errors. invalid-request carries the evidence text, never the scan text. Spec evidence-pack, decision 11. */
export function evidenceRequestErrorSpec(code: "method-not-allowed" | "invalid-request" | "invalid-url"): ErrorSpec {
  if (code !== "invalid-request") return requestErrorSpec(code);
  return { status: 400, body: { code, message: FIXED_MESSAGES["invalid-evidence-request"] } };
}

export function evidenceTooLargeSpec(): ErrorSpec {
  return { status: 422, body: { code: "evidence-too-large", message: FIXED_MESSAGES["evidence-too-large"] } };
}

export function internalErrorSpec(): ErrorSpec {
  return { status: 500, body: { code: "internal-error", message: FIXED_MESSAGES["internal-error"] } };
}

const INTAKE_STATUS: Readonly<Record<IntakeError["code"], number>> = {
  "invalid-url": 400,
  "missing-package-json": 422,
  "invalid-package-json": 422,
  "invalid-lockfile": 422,
  "manifest-too-large": 422,
  "fetch-failed": 502,
  "internal-error": 500,
};

/** The engine guarantees its messages are fixed templates with no input. Only the code, message and file are copied. */
export function intakeErrorSpec(error: IntakeError): ErrorSpec {
  if (error.code === "internal-error") return internalErrorSpec();
  if (error.code === "invalid-url") return requestErrorSpec("invalid-url");
  const status = Object.hasOwn(INTAKE_STATUS, error.code) ? INTAKE_STATUS[error.code] : 500;
  const body: ErrorBody = error.file !== undefined ? { code: error.code, message: error.message, file: error.file } : { code: error.code, message: error.message };
  return { status, body };
}

/** At most 20 errors, each { code, path } with the path cut to 200 characters. Policy messages are dropped. */
export function policyErrorSpec(errors: readonly ValidationError[]): ErrorSpec {
  return {
    status: 422,
    body: {
      code: "invalid-policy",
      message: FIXED_MESSAGES["invalid-policy"],
      file: POLICY_FILE,
      errors: errors.slice(0, MAX_POLICY_ERRORS).map((error) => ({ code: error.code, path: error.path.slice(0, MAX_POLICY_ERROR_PATH) })),
    },
  };
}

export function policyFetchFailedSpec(): ErrorSpec {
  return { status: 502, body: { code: "fetch-failed", message: FIXED_MESSAGES["policy-fetch-failed"], file: POLICY_FILE } };
}

function headers(requestId: string, cacheControl: string): Record<string, string> {
  return {
    "content-type": "application/json; charset=utf-8",
    "cache-control": cacheControl,
    "x-content-type-options": "nosniff",
    "x-sexton-request-id": requestId,
  };
}

export function errorResponse(spec: ErrorSpec, requestId: string): FunctionUrlResponse {
  return { statusCode: spec.status, headers: headers(requestId, "no-store"), body: JSON.stringify(spec.body) };
}

export function okResponse(body: ScanResponse, requestId: string): FunctionUrlResponse {
  return { statusCode: 200, headers: headers(requestId, "public, max-age=300"), body: JSON.stringify(body) };
}
