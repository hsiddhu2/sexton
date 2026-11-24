// The hosted scan's response size guard. Spec cemetery-time-fixes, requirement 5, design.md "F4" and calls 27 to 29.
// Pure apart from applySizeGuard's one warn line. The warn line holds the byte count only, never a package name.
import type { ScanResponse } from "./contract.js";
import type { Logger } from "./log/logger.js";

/** 5 MiB. The Lambda response limit is 6 MB; the rest is room for headers and growth. */
export const TIMELINES_SIZE_LIMIT = 5 * 1024 * 1024;

/** The UTF-8 byte length of the body as the handler sends it (JSON.stringify with no indentation). */
export function responseBytes(body: ScanResponse): number {
  return Buffer.byteLength(JSON.stringify(body), "utf8");
}

export interface GuardResult {
  readonly body: ScanResponse;
  readonly omitted: boolean;
  readonly bytes: number;
}

/** Returns the body unchanged when it has no timelines or fits the limit, else the body without timelines and with timelinesOmitted. */
export function guardTimelinesSize(body: ScanResponse, limit: number = TIMELINES_SIZE_LIMIT): GuardResult {
  if (body.timelines === undefined) return { body, omitted: false, bytes: responseBytes(body) };
  const bytes = responseBytes(body);
  if (bytes <= limit) return { body, omitted: false, bytes };
  const rest: Record<string, unknown> = { ...body };
  Reflect.deleteProperty(rest, "timelines");
  return { body: { ...(rest as unknown as ScanResponse), timelinesOmitted: "too-large" }, omitted: true, bytes };
}

/** The guard at the real limit, with the warn line `timelines-omitted` when it omits. */
export function applySizeGuard(body: ScanResponse, log: Logger): ScanResponse {
  const result = guardTimelinesSize(body);
  if (result.omitted) log.warn({ msg: "timelines-omitted", bytes: result.bytes });
  return result.body;
}
