// A Logger that records every call, for assertions.

import type { LogFields, Logger } from "../../src/log/logger.js";

export interface CapturedLine {
  readonly level: "info" | "warn" | "error";
  readonly fields: LogFields;
}

export function captureLogger(): Logger & { readonly lines: CapturedLine[] } {
  const lines: CapturedLine[] = [];
  return {
    lines,
    info: (fields) => lines.push({ level: "info", fields }),
    warn: (fields) => lines.push({ level: "warn", fields }),
    error: (fields) => lines.push({ level: "error", fields }),
  };
}
