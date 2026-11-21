// Writes lines and returns an exit code. Every line is already Safe text or fixed text.

import type { Writer } from "./deps.js";

export function writeLines(writer: Writer, lines: readonly string[], code: number): number {
  if (lines.length > 0) writer.write(lines.join("\n") + "\n");
  return code;
}
