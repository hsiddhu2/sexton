// The failure card of a Live scan (spec clean-site, design C10, requirement 12.2), chosen from the HTTP status and the
// API error code only, by the first match of a fixed order. Pure.
import type { ApiErrorCode } from "@sexton/api";
import { claim } from "../copy/claims.js";
import type { LoadError } from "./load-error.js";

export type FailureCardId =
  | "network"
  | "rate-limited"
  | "busy"
  | "not-readable"
  | "invalid-url"
  | "invalid-file"
  | "too-large"
  | "invalid-policy"
  | "generic";

export interface FailureCard {
  readonly id: FailureCardId;
  readonly sentence: string;
  readonly next: string;
}

/** The fixed card table of 12.2, in its order. */
export const FAILURE_CARDS: Readonly<Record<FailureCardId, FailureCard>> = {
  network: { id: "network", sentence: "We could not reach the scan service.", next: "Check your connection and try again." },
  "rate-limited": { id: "rate-limited", sentence: "Too many scans from your network right now.", next: "Wait a few minutes and try again." },
  busy: { id: "busy", sentence: "GitHub or npm is busy right now.", next: "Wait a minute and try again." },
  "not-readable": {
    id: "not-readable",
    sentence: "We could not read that repo.",
    next: claim("failure.not-readable"),
  },
  "invalid-url": { id: "invalid-url", sentence: "That is not a GitHub repo address.", next: "Write it as owner/name, or paste a github.com link." },
  "invalid-file": { id: "invalid-file", sentence: "This repo's package.json or lockfile could not be read.", next: "Check that the file is valid JSON." },
  "too-large": { id: "too-large", sentence: "This repo's package.json or lockfile is larger than 5 MiB.", next: "Try a smaller repo." },
  "invalid-policy": { id: "invalid-policy", sentence: "This repo's sexton.policy.yml is not valid.", next: "Fix the policy file, or try a repo without one." },
  generic: { id: "generic", sentence: "The scan failed on our side.", next: "Try again, or try the demo repo." },
};

/** The card of a replay value outside the closed set (10.10): nothing is loaded. */
export const NO_SUCH_REPLAY_TEXT = "That replay does not exist.";
/** The card of 12.7, for a failed Sample scan or scan file load or a refused Replay file. */
export const LOAD_FAILED_CARD = { sentence: "This scan could not be loaded.", next: "Try again, or open the sample." } as const;

/** Pure. The card for a failed Live scan; a null status is a network error with no HTTP response. */
export function failureCard(status: number | null, apiCode: ApiErrorCode | null): FailureCard {
  if (status === null) return FAILURE_CARDS.network;
  if (status === 429) return FAILURE_CARDS["rate-limited"];
  if (status === 503 || status === 504 || apiCode === "fetch-failed") return FAILURE_CARDS.busy;
  switch (apiCode) {
    case "missing-package-json":
      return FAILURE_CARDS["not-readable"];
    case "invalid-url":
      return FAILURE_CARDS["invalid-url"];
    case "invalid-package-json":
    case "invalid-lockfile":
      return FAILURE_CARDS["invalid-file"];
    case "manifest-too-large":
      return FAILURE_CARDS["too-large"];
    case "invalid-policy":
      return FAILURE_CARDS["invalid-policy"];
    default:
      return FAILURE_CARDS.generic;
  }
}

/**
 * Pure. The card for a failed Live scan from its LoadError: its HTTP status and API code only. An error with the code
 * fetch-failed and no status had no HTTP response (a network error); any other code (too large, not JSON, not the
 * scan format) came on a response the API sent, so it has no status of its own here and takes the generic card.
 */
export function liveFailureCard(error: LoadError): FailureCard {
  if (error.code !== "fetch-failed") return FAILURE_CARDS.generic;
  return failureCard(error.status ?? null, error.apiCode ?? null);
}
