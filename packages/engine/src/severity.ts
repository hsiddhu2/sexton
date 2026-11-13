// Severity normalisation. Requirement 3. Total function: any input yields one of the five values.

import { SEVERITIES, type Severity } from "./types.js";

const TEXT_MAP: Readonly<Record<string, Severity>> = {
  CRITICAL: "Critical",
  HIGH: "High",
  MODERATE: "Moderate",
  MEDIUM: "Moderate",
  LOW: "Low",
};

/** Maps any string to a Severity. Unknown for anything outside the four textual labels. Requirement 3.2. */
export function normaliseSeverity(text: unknown): Severity {
  if (typeof text !== "string") return "Unknown";
  return TEXT_MAP[text.trim().toUpperCase()] ?? "Unknown";
}

/** Maps a numeric CVSS base score to a Severity. Requirement 3.3. */
export function severityFromScore(score: number): Severity {
  if (!Number.isFinite(score) || score <= 0) return "Unknown";
  if (score >= 9) return "Critical";
  if (score >= 7) return "High";
  if (score >= 4) return "Moderate";
  return "Low";
}

/** Shape of the OSV fields this module reads. Everything else is ignored. */
export interface OsvSeverityFields {
  readonly database_specific?: { readonly severity?: unknown } | null;
  readonly severity?: readonly { readonly type?: unknown; readonly score?: unknown }[] | null;
}

/**
 * Derives a Severity from an OSV vulnerability record.
 * Textual database_specific.severity first. Then a numeric base score in the severity array.
 * CVSS vector strings are never parsed. Requirement 3.2 to 3.5.
 */
export function severityFromOsv(record: OsvSeverityFields): Severity {
  const text = record.database_specific?.severity;
  if (typeof text === "string") {
    const mapped = TEXT_MAP[text.trim().toUpperCase()];
    if (mapped !== undefined) return mapped;
  }
  for (const entry of record.severity ?? []) {
    const score = numericScore(entry.score);
    if (score !== null) return severityFromScore(score);
  }
  return "Unknown";
}

function numericScore(score: unknown): number | null {
  if (typeof score === "number") return score;
  if (typeof score === "string" && /^\d+(\.\d+)?$/.test(score.trim())) return Number(score);
  return null;
}

export function isSeverity(value: unknown): value is Severity {
  return typeof value === "string" && (SEVERITIES as readonly string[]).includes(value);
}
