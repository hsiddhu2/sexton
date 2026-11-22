// POST /api/remediate responses. Spec: .kiro/specs/remediate, Requirements 6.2 to 6.5. Pure.
// Fixed text only. No CORS header. A prUrl only with the PR prefix.

import type { FunctionUrlResponse } from "../http/responses.js";
import type { RemediateOutcome } from "./executor.js";

export const PR_PREFIX = "https://github.com/hsiddhu2/sexton-demo/pull/";

export const REMEDIATE_MESSAGES = {
  "method-not-allowed": "Only POST is supported.",
  "invalid-request": 'Send POST /api/remediate with a JSON body {"repo": "<canonical GitHub URL>", "package": "<name>"}.',
  "repository-not-allowed": "Pull requests are opened only on the demo repository, https://github.com/hsiddhu2/sexton-demo.",
  "internal-error": "The request failed unexpectedly.",
} as const;
export type RemediateErrorCode = keyof typeof REMEDIATE_MESSAGES;

export function hasPrPrefix(url: unknown): url is string {
  return typeof url === "string" && url.startsWith(PR_PREFIX) && /^[1-9][0-9]{0,9}$/.test(url.slice(PR_PREFIX.length));
}

function headers(requestId: string): Record<string, string> {
  return {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "x-sexton-request-id": requestId,
  };
}

export function remediateError(status: number, code: RemediateErrorCode, requestId: string): FunctionUrlResponse {
  return { statusCode: status, headers: headers(requestId), body: JSON.stringify({ code, message: REMEDIATE_MESSAGES[code] }) };
}

/** The outcome as the response body. A prUrl without the PR prefix is dropped. */
export function outcomeBody(outcome: RemediateOutcome): Record<string, unknown> {
  switch (outcome.status) {
    case "opened":
      return {
        status: "opened",
        ...(hasPrPrefix(outcome.prUrl) ? { prUrl: outcome.prUrl } : {}),
        logged: outcome.logged,
        ...(outcome.reviewSites !== undefined ? { reviewSites: { posted: outcome.reviewSites.posted, dropped: outcome.reviewSites.dropped } } : {}),
      };
    case "existing":
      return { status: "existing", ...(hasPrPrefix(outcome.prUrl) ? { prUrl: outcome.prUrl } : {}) };
    case "refused":
      return { status: "refused", reason: outcome.reason };
    case "failed":
      return { status: "failed", step: outcome.step, reason: outcome.reason };
  }
}

export function outcomeResponse(outcome: RemediateOutcome, requestId: string): FunctionUrlResponse {
  return { statusCode: 200, headers: headers(requestId), body: JSON.stringify(outcomeBody(outcome)) };
}
