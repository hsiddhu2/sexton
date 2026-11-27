import type { ApiErrorCode } from "@sexton/api";
import type { ContractError } from "./validate-scan-response.js";

export type LoadErrorCode = "scan-url-rejected" | "fetch-failed" | "too-large" | "invalid-json" | "invalid-response";

export interface LoadError {
  readonly code: LoadErrorCode;
  /** Fixed text, plus " (HTTP nnn)" when a status is kept. */
  readonly message: string;
  readonly status?: number;
  /** Spec clean-site, 12.3: the code of a non-2xx API body, kept only when it is one of the API's error codes. */
  readonly apiCode?: ApiErrorCode;
  readonly contractErrors?: readonly ContractError[];
}

export const LOAD_ERROR_TEXT: Record<LoadErrorCode, string> = {
  "scan-url-rejected": "The scan address is not allowed.",
  "fetch-failed": "The scan could not be fetched.",
  "too-large": "The scan is larger than 5 MiB.",
  "invalid-json": "The scan is not valid JSON.",
  "invalid-response": "The scan does not match the expected format.",
};

const MAX_LOAD_CONTRACT_ERRORS = 5;

export function makeLoadError(
  code: LoadErrorCode,
  extra?: { readonly status?: number; readonly apiCode?: ApiErrorCode; readonly contractErrors?: readonly ContractError[] },
): LoadError {
  const status = extra?.status;
  const keepStatus = status !== undefined && Number.isInteger(status) && status >= 100 && status <= 599;
  const text = LOAD_ERROR_TEXT[code];
  const base = { code, message: keepStatus ? `${text} (HTTP ${String(status)})` : text };
  const withCode = extra?.apiCode === undefined ? base : { ...base, apiCode: extra.apiCode };
  const withStatus = keepStatus ? { ...withCode, status } : withCode;
  if (extra?.contractErrors !== undefined) {
    return { ...withStatus, contractErrors: extra.contractErrors.slice(0, MAX_LOAD_CONTRACT_ERRORS) };
  }
  return withStatus;
}
