// npm attestations client. Requirement 2. Never downloads a tarball.

import { cacheKey } from "../cache.js";
import { requestWithRetry, UpstreamError } from "../http.js";
import { available, unavailable } from "../signal.js";
import type { ProvenanceValue, Signal } from "../types.js";
import { isRecord, type ClientContext } from "./context.js";
import { encodePackageName, NPM_REGISTRY } from "./npm.js";

export const ATTESTATIONS_SOURCE = "npm-attestations";
export const SLSA_PROVENANCE_PREDICATE = "https://slsa.dev/provenance/v1";

const MALFORMED_REASON = "malformed attestations body";
const ABSENT: ProvenanceValue = { present: false, predicateType: null };

class MalformedAttestationsError extends Error {
  constructor() {
    super(MALFORMED_REASON);
    this.name = "MalformedAttestationsError";
  }
}

export function attestationsUrl(name: string, version: string): string {
  return `${NPM_REGISTRY}/-/npm/v1/attestations/${encodePackageName(name)}@${encodeURIComponent(version)}`;
}

/**
 * Pure. Null when the body is not an attestations document.
 * present is true iff some attestation has the SLSA provenance predicateType. Requirement 2.2, 2.3, 2.9.
 */
export function parseAttestations(body: unknown): ProvenanceValue | null {
  if (!isRecord(body) || !Array.isArray(body["attestations"])) return null;
  for (const entry of body["attestations"] as unknown[]) {
    if (isRecord(entry) && entry["predicateType"] === SLSA_PROVENANCE_PREDICATE) {
      return { present: true, predicateType: SLSA_PROVENANCE_PREDICATE };
    }
  }
  return { present: false, predicateType: null };
}

/** Reads provenance for the installed version. Never throws. A 404 is cached as present false. Requirement 2. */
export async function fetchProvenanceSignal(ctx: ClientContext, name: string, version: string): Promise<Signal<ProvenanceValue>> {
  const url = attestationsUrl(name, version);
  const now = ctx.clock();
  try {
    const value = await ctx.cache.get<ProvenanceValue>(cacheKey(ATTESTATIONS_SOURCE, name, version), async () => {
      const response = await requestWithRetry(ctx.transport, url, { method: "GET", headers: { Accept: "application/json" } }, ctx.retry ?? {});
      if (response.status === 404) return ABSENT;
      if (response.status < 200 || response.status >= 300) {
        throw new UpstreamError(url, response.status);
      }
      let body: unknown;
      try {
        body = await response.json();
      } catch {
        throw new MalformedAttestationsError();
      }
      const parsed = parseAttestations(body);
      if (parsed === null) throw new MalformedAttestationsError();
      return parsed;
    });
    return available(value, url, now);
  } catch (error) {
    if (error instanceof UpstreamError) return unavailable(`HTTP ${error.status}`, url, now);
    if (error instanceof MalformedAttestationsError) return unavailable(MALFORMED_REASON, url, now);
    const message = error instanceof Error ? error.message : String(error);
    return unavailable(`no status received: ${message}`, url, now);
  }
}
