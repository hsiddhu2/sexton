// RFC 8785 canonical JSON and the clean copy taken before hashing. Spec: .kiro/specs/evidence-pack, Requirement 1.
// https://www.rfc-editor.org/rfc/rfc8785: keys sorted by UTF-16 code units, no white space, strings and numbers as
// ECMAScript JSON.stringify writes them, lone surrogates and non-finite numbers are errors. Pure, never throws.

export type JsonValue = null | boolean | number | string | readonly JsonValue[] | { readonly [key: string]: JsonValue };

const LONE_SURROGATE = /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/;
const LONE_SURROGATE_ALL = /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g;

function isPlainObject(value: object): boolean {
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/** Own enumerable string keys, or null when the object has a symbol key or an accessor. */
function dataKeys(value: object): string[] | null {
  if (Object.getOwnPropertySymbols(value).length > 0) return null;
  const keys: string[] = [];
  for (const key of Object.getOwnPropertyNames(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined || !("value" in descriptor)) return null;
    if (descriptor.enumerable === true) keys.push(key);
  }
  return keys;
}

function write(value: unknown, open: Set<object>): string | null {
  if (value === null) return "null";
  switch (typeof value) {
    case "boolean":
      return value ? "true" : "false";
    case "number":
      return Number.isFinite(value) ? JSON.stringify(value) : null;
    case "string":
      return LONE_SURROGATE.test(value) ? null : JSON.stringify(value);
    case "object":
      break;
    default:
      return null;
  }
  if (open.has(value)) return null;
  open.add(value);
  try {
    if (Array.isArray(value)) {
      const parts: string[] = [];
      for (let i = 0; i < value.length; i++) {
        if (!Object.hasOwn(value, i)) return null;
        const part = write((value as unknown[])[i], open);
        if (part === null) return null;
        parts.push(part);
      }
      return `[${parts.join(",")}]`;
    }
    if (!isPlainObject(value)) return null;
    const keys = dataKeys(value);
    if (keys === null) return null;
    keys.sort();
    const parts: string[] = [];
    for (const key of keys) {
      if (LONE_SURROGATE.test(key)) return null;
      const part = write((value as Record<string, unknown>)[key], open);
      if (part === null) return null;
      parts.push(`${JSON.stringify(key)}:${part}`);
    }
    return `{${parts.join(",")}}`;
  } finally {
    open.delete(value);
  }
}

/** The RFC 8785 text of a JSON value, or null for any value that is not one. Requirement 1.1. */
export function canonicalJson(value: unknown): string | null {
  try {
    return write(value, new Set());
  } catch {
    return null;
  }
}

const FAIL: { readonly ok: false } = { ok: false };

function cleanString(text: string): string {
  return text.replace(LONE_SURROGATE_ALL, "�");
}

function copy(value: unknown, open: Set<object>): { ok: true; value: JsonValue } | { ok: false } {
  if (value === null || typeof value === "boolean") return { ok: true, value };
  if (typeof value === "number") return Number.isFinite(value) ? { ok: true, value } : FAIL;
  if (typeof value === "string") return { ok: true, value: cleanString(value) };
  if (typeof value !== "object" || open.has(value)) return FAIL;
  open.add(value);
  try {
    if (Array.isArray(value)) {
      const out: JsonValue[] = [];
      for (let i = 0; i < value.length; i++) {
        if (!Object.hasOwn(value, i)) return FAIL;
        const item = copy((value as unknown[])[i], open);
        if (!item.ok) return FAIL;
        out.push(item.value);
      }
      return { ok: true, value: out };
    }
    if (!isPlainObject(value)) return FAIL;
    const keys = dataKeys(value);
    if (keys === null) return FAIL;
    const out: Record<string, JsonValue> = {};
    const seen = new Set<string>();
    for (const key of keys) {
      const raw: unknown = (value as Record<string, unknown>)[key];
      if (raw === undefined) continue;
      const cleanKey = cleanString(key);
      if (seen.has(cleanKey)) return FAIL;
      seen.add(cleanKey);
      const item = copy(raw, open);
      if (!item.ok) return FAIL;
      Object.defineProperty(out, cleanKey, { value: item.value, enumerable: true, writable: true, configurable: true });
    }
    return { ok: true, value: out };
  } finally {
    open.delete(value);
  }
}

/**
 * The Clean copy: lone surrogates to U+FFFD in strings and keys, keys with an undefined value dropped.
 * Fails for a cycle, a value that is not JSON, a non-finite number or two keys that become equal. Requirement 1.4.
 */
export function cleanJsonCopy(value: unknown): { readonly ok: true; readonly value: JsonValue } | { readonly ok: false } {
  try {
    return copy(value, new Set());
  } catch {
    return FAIL;
  }
}
