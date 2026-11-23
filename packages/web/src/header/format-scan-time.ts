export interface ScanTimeView {
  readonly text: string;
  readonly dateTime: string | null;
}

const ISO_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

function pad(n: number, width: number): string {
  return String(n).padStart(width, "0");
}

/**
 * Pure. A valid ISO instant reads as `12 Nov 2026, 00:00 UTC`, from UTC fields and a
 * fixed English month table (no Intl, so the output never depends on the locale).
 * Anything else comes back unchanged with a null dateTime.
 */
export function scanTimeView(value: string): ScanTimeView {
  if (!ISO_PATTERN.test(value)) return { text: value, dateTime: null };
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return { text: value, dateTime: null };
  // Date.parse rolls an impossible day (2026-02-31) into the next month. Reject it.
  const year = Number(value.slice(0, 4));
  const monthIndex = Number(value.slice(5, 7)) - 1;
  const day = Number(value.slice(8, 10));
  const probe = new Date(0);
  probe.setUTCFullYear(year, monthIndex, day);
  if (probe.getUTCMonth() !== monthIndex || probe.getUTCDate() !== day) return { text: value, dateTime: null };
  const d = new Date(ms);
  const month = MONTHS[d.getUTCMonth()];
  if (month === undefined) return { text: value, dateTime: null };
  const text = `${String(d.getUTCDate())} ${month} ${pad(d.getUTCFullYear(), 4)}, ${pad(d.getUTCHours(), 2)}:${pad(d.getUTCMinutes(), 2)} UTC`;
  return { text, dateTime: value };
}
