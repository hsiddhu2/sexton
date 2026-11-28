// Bounds on Outside text. Spec: .kiro/specs/sexton-power, Requirement 10. Pure.
// clean: terminal-safe text cut to a field maximum (safe of @sexton/cli: neutralise, then cleanLine).
// capList and boundValue: list and key caps with a truncated flag. limitResult: the 100 KiB cut.
import { safe } from "@sexton/cli";

/** Field maxima in code points, Requirement 10.2. */
export const MAX = {
  name: 214,
  version: 64,
  reason: 200,
  summary: 200,
  advisorySummary: 300,
  url: 500,
  ruleName: 80,
  other: 200,
  prBodyPreview: 4000,
} as const;
/** List caps, Requirement 10.3. */
export const CAP = { advisories: 20, maintainers: 20, failures: 20, policyErrors: 20, packages: 300, values: 20, keys: 30, depth: 4 } as const;
export const MAX_RESULT_TEXT = 100 * 1024;
const KEY_PATTERN = /^[A-Za-z][A-Za-z0-9]{0,40}$/;

/** Terminal-safe text of at most max code points. */
export function clean(value: unknown, max: number): string {
  // safe() cuts to max code points and then appends an ellipsis, so its result can be max + 1 long.
  const text = safe(value, max);
  const points = Array.from(text);
  return points.length <= max ? text : `${points.slice(0, max - 1).join("")}\u2026`;
}

export function cleanOrNull(value: unknown, max: number): string | null {
  return typeof value === "string" ? clean(value, max) : null;
}

export interface Capped<T> {
  readonly items: T[];
  readonly truncated: boolean;
}

export function capList<T>(list: readonly T[], cap: number): Capped<T> {
  return { items: list.slice(0, cap), truncated: list.length > cap };
}

/** A flag the bounded copy sets when it drops anything. */
export interface Cut {
  truncated: boolean;
}

/** A bounded JSON copy of any value: strings cleaned, arrays and objects capped, keys limited to identifiers, depth limited. */
export function boundValue(value: unknown, cut: Cut, depth = 0): unknown {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") {
    const text = clean(value, MAX.other);
    if (text.length < value.length && Array.from(value).length > MAX.other) cut.truncated = true;
    return text;
  }
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "boolean") return value;
  if (depth >= CAP.depth) {
    cut.truncated = true;
    return null;
  }
  if (Array.isArray(value)) {
    if (value.length > CAP.values) cut.truncated = true;
    return value.slice(0, CAP.values).map((item) => boundValue(item, cut, depth + 1));
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    let kept = 0;
    for (const [key, item] of Object.entries(value)) {
      if (!KEY_PATTERN.test(key) || kept >= CAP.keys) {
        cut.truncated = true;
        continue;
      }
      out[key] = boundValue(item, cut, depth + 1);
      kept += 1;
    }
    return out;
  }
  return null;
}

function largestArray(node: unknown, best: { list: unknown[] | null }): void {
  if (Array.isArray(node)) {
    if (node.length > 0 && (best.list === null || node.length > best.list.length)) best.list = node;
    for (const item of node) largestArray(item, best);
  } else if (typeof node === "object" && node !== null) {
    for (const item of Object.values(node)) largestArray(item, best);
  }
}

/**
 * Serialises the object and, when the text would pass maxBytes, drops items from the end of the largest list until it fits.
 * Sets truncated: true at the top level when it drops anything. Returns the object it serialised and its text.
 */
export function limitResult(object: Record<string, unknown>, maxBytes: number): { object: Record<string, unknown>; json: string } {
  let json = JSON.stringify(object);
  if (Buffer.byteLength(json, "utf8") <= maxBytes) return { object, json };
  const copy = JSON.parse(json) as Record<string, unknown>;
  copy["truncated"] = true;
  for (;;) {
    json = JSON.stringify(copy);
    if (Buffer.byteLength(json, "utf8") <= maxBytes) return { object: copy, json };
    const best: { list: unknown[] | null } = { list: null };
    largestArray(copy, best);
    if (best.list === null) {
      const minimal = { ok: copy["ok"] === false ? false : true, truncated: true };
      return { object: minimal, json: JSON.stringify(minimal) };
    }
    best.list.length -= Math.max(1, Math.floor(best.list.length / 2));
  }
}
