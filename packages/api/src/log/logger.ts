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
  try {
    const raw: unknown = error instanceof Error ? error.name : typeof error;
    const clean = typeof raw === "string" ? raw.replace(/[^A-Za-z0-9_]/g, "").slice(0, 100) : "";
    return clean === "" ? "Error" : clean;
  } catch {
    // A name getter that throws.
    return "Error";
  }
}

export type LogLevel = "info" | "warn" | "error";

const RESERVED = new Set(["level", "time", "correlationId"]);

/** One JSON log line. Pure. Keys of fields that clash with level, time or correlationId are dropped, as are non-scalar values. */
export function logLine(level: LogLevel, correlationId: string, fields: LogFields, now: Date): string {
  const out: Record<string, string | number | boolean> = { level, time: now.toISOString(), correlationId };
  for (const [key, value] of Object.entries(fields)) {
    if (RESERVED.has(key)) continue;
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") out[key] = value;
  }
  return JSON.stringify(out);
}

export function createLogger(correlationId: string, sink: (line: string) => void = console.log, clock: () => Date = () => new Date()): Logger {
  const write = (level: LogLevel) => (fields: LogFields) => sink(logLine(level, correlationId, fields, clock()));
  return { info: write("info"), warn: write("warn"), error: write("error") };
}

const CORRELATION_ID = /^[A-Za-z0-9_=-]{1,128}$/;

/**
 * The CloudFront request ID when the x-amz-cf-id header is 1 to 128 characters of [A-Za-z0-9_=-],
 * otherwise the Lambda request ID. Requirement 6.4.
 */
export function correlationId(headers: Readonly<Record<string, string | undefined>> | undefined, awsRequestId: string): string {
  let value: string | undefined;
  for (const [name, headerValue] of Object.entries(headers ?? {})) {
    if (name.toLowerCase() === "x-amz-cf-id") value = headerValue;
  }
  return value !== undefined && CORRELATION_ID.test(value) ? value : awsRequestId;
}
