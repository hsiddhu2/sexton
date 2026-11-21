// Snapshot and Seen key encoding. Pure. Spec: .kiro/specs/infra, Requirements 3.2, 3.3, 3.8.
// The sort key starts with the capture time as a fixed-width 15-digit number, so text order equals time order.

/** Milliseconds from 0000-01-01T00:00:00Z to the Unix epoch. */
export const CAPTURE_OFFSET_MS = 62_167_219_200_000;
export const CAPTURE_DIGITS = 15;
export const SNAPSHOT_PREFIX = "snap#";
export const SEEN_PREFIX = "seen#";
export const SEEN_GSI_PK = "seen";

const MAX_SHIFTED = 10 ** CAPTURE_DIGITS - 1;

export function snapshotPk(name: string): string {
  return SNAPSHOT_PREFIX + name;
}

export function seenPk(name: string): string {
  return SEEN_PREFIX + name;
}

/** Throws RangeError for a time outside years 0000 to about 31,000, or a non-integer time. */
export function encodeSnapshotSk(captureMs: number, sequence: string): string {
  const shifted = captureMs + CAPTURE_OFFSET_MS;
  if (!Number.isSafeInteger(captureMs) || shifted < 0 || shifted > MAX_SHIFTED) throw new RangeError("capture time out of range");
  return `${String(shifted).padStart(CAPTURE_DIGITS, "0")}#${sequence}`;
}

/** Splits after the 15 digits, so a sequence that contains '#' round-trips. Undefined for any other shape. */
export function decodeSnapshotSk(sk: string): { readonly captureMs: number; readonly sequence: string } | undefined {
  if (sk.length <= CAPTURE_DIGITS || sk[CAPTURE_DIGITS] !== "#") return undefined;
  const digits = sk.slice(0, CAPTURE_DIGITS);
  if (!/^\d{15}$/.test(digits)) return undefined;
  return { captureMs: Number(digits) - CAPTURE_OFFSET_MS, sequence: sk.slice(CAPTURE_DIGITS + 1) };
}

export function encodeSeenSk(seenMs: number, sequence: string): string {
  return encodeSnapshotSk(seenMs, sequence);
}
