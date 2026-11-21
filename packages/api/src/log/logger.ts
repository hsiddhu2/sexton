// Structured logger. Spec: .kiro/specs/infra, Requirement 6.
// Values are scalars only, so no object or response body can be logged by accident.

export type LogFields = Readonly<Record<string, string | number | boolean>>;

export interface Logger {
  info(fields: LogFields): void;
  warn(fields: LogFields): void;
  error(fields: LogFields): void;
}

/** The error's class name, letters, digits and underscore only, at most 100 characters. Never the message. */
export function errorName(error: unknown): string {
  const raw = error instanceof Error ? error.name : typeof error;
  const clean = raw.replace(/[^A-Za-z0-9_]/g, "").slice(0, 100);
  return clean === "" ? "Error" : clean;
}
