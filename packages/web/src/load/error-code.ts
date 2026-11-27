// The code reader of a failed scan (spec clean-site, design C10, requirements 12.3 and 12.4): the code field of an API
// error body, kept only when it is one of the API's error codes. Untrusted input: nothing else of the body leaves
// this function. Pure.
import type { ApiErrorCode } from "@sexton/api";
import { API_ERROR_CODES } from "./lists.js";

/** The largest error body that is read at all: 4 KiB. */
export const MAX_ERROR_BODY_BYTES = 4 * 1024;

const CODES: ReadonlySet<string> = new Set(API_ERROR_CODES);

function isApiErrorCode(value: unknown): value is ApiErrorCode {
  return typeof value === "string" && CODES.has(value);
}

/** Pure, never throws. The body's own `code` when it is a known code and the body is at most 4 KiB of UTF-8, else null. */
export function errorCodeOf(body: string): ApiErrorCode | null {
  if (new TextEncoder().encode(body).byteLength > MAX_ERROR_BODY_BYTES) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
  const code = Object.getOwnPropertyDescriptor(parsed, "code")?.value as unknown;
  return isApiErrorCode(code) ? code : null;
}
