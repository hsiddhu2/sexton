// POST /api/remediate request validation. Spec: .kiro/specs/remediate, Requirement 6.1. Pure.
// Exactly { "repo": <canonical URL>, "package": <valid package name> }, each key once, at most 2048 bytes,
// content-type application/json. Reads the method, the path, the content-type header and the body only.

import { isValidPackageName, parseRepoUrl, type RepoRef } from "@sexton/engine";
import type { LambdaFunctionURLEvent } from "aws-lambda";

export const REMEDIATE_PATH = "/api/remediate";
export const MAX_REMEDIATE_BODY_BYTES = 2048;

export type RemediateRequest =
  | { readonly ok: true; readonly repo: RepoRef; readonly packageName: string; readonly bodyHash: boolean }
  | { readonly ok: false; readonly status: 405; readonly code: "method-not-allowed" }
  | { readonly ok: false; readonly status: 400; readonly code: "invalid-request" };

const METHOD_NOT_ALLOWED: RemediateRequest = { ok: false, status: 405, code: "method-not-allowed" };
const INVALID: RemediateRequest = { ok: false, status: 400, code: "invalid-request" };
const CONTENT_TYPE = /^application\/json(\s*;\s*charset=utf-8)?$/i;

function header(headers: Readonly<Record<string, string | undefined>> | undefined, name: string): string | undefined {
  let value: string | undefined;
  for (const [k, v] of Object.entries(headers ?? {})) if (k.toLowerCase() === name) value = v;
  return value;
}

/**
 * The top-level keys of a JSON object text, in order, repeats kept. Null when the text is not an object at the top.
 * A small scanner over string tokens and brackets; JSON.parse still decides validity.
 */
export function topLevelKeys(text: string): string[] | null {
  const keys: string[] = [];
  let depth = 0;
  let i = 0;
  let expectKey = false;
  let started = false;
  while (i < text.length) {
    const c = text[i] as string;
    if (c === '"') {
      let j = i + 1;
      while (j < text.length && text[j] !== '"') j += text[j] === "\\" ? 2 : 1;
      if (j >= text.length) return null;
      if (depth === 1 && expectKey) {
        try {
          keys.push(JSON.parse(text.slice(i, j + 1)) as string);
        } catch {
          return null;
        }
        expectKey = false;
      }
      i = j + 1;
      continue;
    }
    if (c === "{" || c === "[") {
      if (!started) {
        if (c !== "{") return null;
        started = true;
      }
      depth += 1;
      if (depth === 1) expectKey = true;
    } else if (c === "}" || c === "]") depth -= 1;
    else if (c === "," && depth === 1) expectKey = true;
    else if (!started && !/\s/.test(c)) return null;
    i += 1;
  }
  return started ? keys : null;
}

function bodyText(event: Pick<LambdaFunctionURLEvent, "body" | "isBase64Encoded">): string | null {
  if (typeof event.body !== "string") return null;
  const bytes = event.isBase64Encoded ? Buffer.from(event.body, "base64") : Buffer.from(event.body, "utf8");
  if (bytes.byteLength > MAX_REMEDIATE_BODY_BYTES) return null;
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

export function parseRemediateRequest(
  event: Pick<LambdaFunctionURLEvent, "rawPath" | "rawQueryString" | "headers" | "body" | "isBase64Encoded" | "requestContext">,
): RemediateRequest {
  if (event.requestContext.http.method !== "POST") return METHOD_NOT_ALLOWED;
  if (event.rawPath !== REMEDIATE_PATH || (event.rawQueryString ?? "") !== "") return INVALID;
  if (!CONTENT_TYPE.test((header(event.headers, "content-type") ?? "").trim())) return INVALID;
  const text = bodyText(event);
  if (text === null) return INVALID;
  const keys = topLevelKeys(text);
  if (keys === null || keys.length !== 2 || [...keys].sort().join(",") !== "package,repo") return INVALID;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return INVALID;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return INVALID;
  const repoValue = (parsed as Record<string, unknown>)["repo"];
  const packageValue = (parsed as Record<string, unknown>)["package"];
  if (typeof repoValue !== "string" || typeof packageValue !== "string" || !isValidPackageName(packageValue)) return INVALID;
  const repo = parseRepoUrl(repoValue);
  if (!repo.ok || repo.repo.url !== repoValue) return INVALID;
  return { ok: true, repo: repo.repo, packageName: packageValue, bodyHash: header(event.headers, "x-amz-content-sha256") !== undefined };
}
