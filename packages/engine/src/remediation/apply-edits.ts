// Applies Package.json Edits to package.json text. Spec: .kiro/specs/remediate, Requirement 1. Pure, never throws.
// Keeps indentation, key order and the final newline. Structured edits only: the text is parsed and re-serialised,
// never patched as a string.

import type { PackageJsonEdit } from "../types.js";

export type ApplyFailure = "invalid-json" | "not-an-object" | "section-not-object" | "name-absent";
export type ApplyResult = { readonly ok: true; readonly text: string } | { readonly ok: false; readonly reason: ApplyFailure };

/** The dependency sections, in the order a new one is placed after. */
export const DEPENDENCY_SECTIONS = ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"] as const;

type Obj = Record<string, unknown>;

function isObj(value: unknown): value is Obj {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** A null-prototype copy that keeps own keys in order, including "__proto__", so nothing reaches a prototype. */
function own(source: Obj): Obj {
  const out = Object.create(null) as Obj;
  for (const key of Object.keys(source)) Object.defineProperty(out, key, { value: source[key], enumerable: true, writable: true, configurable: true });
  return out;
}

function set(target: Obj, key: string, value: unknown): void {
  Object.defineProperty(target, key, { value, enumerable: true, writable: true, configurable: true });
}

/** Tab, 4 or 2 spaces, from the first line that starts with whitespace. Default 2. */
export function detectIndent(text: string): string | number {
  for (const line of text.split("\n").slice(1)) {
    if (line.startsWith("\t")) return "\t";
    if (line.startsWith("    ")) return 4;
    if (line.startsWith(" ")) return 2;
  }
  return 2;
}

function isSorted(keys: readonly string[]): boolean {
  if (keys.length < 2) return true;
  for (let i = 1; i < keys.length; i++) if ((keys[i - 1] as string) > (keys[i] as string)) return false;
  return true;
}

/** Inserts key into a sorted section at its place, rebuilding the order. */
function insertSorted(section: Obj, key: string, value: unknown): Obj {
  const out = Object.create(null) as Obj;
  let placed = false;
  for (const k of Object.keys(section)) {
    if (!placed && key < k) {
      set(out, key, value);
      placed = true;
    }
    set(out, k, section[k]);
  }
  if (!placed) set(out, key, value);
  return out;
}

/** Puts a new section after the last existing dependency section, or at the end. */
function withSection(root: Obj, name: string): Obj {
  const existing = DEPENDENCY_SECTIONS.filter((s) => Object.hasOwn(root, s));
  const after = existing.at(-1);
  const out = Object.create(null) as Obj;
  let placed = false;
  for (const k of Object.keys(root)) {
    set(out, k, root[k]);
    if (k === after) {
      set(out, name, Object.create(null) as Obj);
      placed = true;
    }
  }
  if (!placed) set(out, name, Object.create(null) as Obj);
  return out;
}

function applyOne(root: Obj, edit: PackageJsonEdit): { ok: true; root: Obj } | { ok: false; reason: ApplyFailure } {
  if (edit.op === "remove-dependency") {
    let found = false;
    for (const s of DEPENDENCY_SECTIONS) {
      if (!Object.hasOwn(root, s)) continue;
      const section = root[s];
      if (!isObj(section)) return { ok: false, reason: "section-not-object" };
      if (!Object.hasOwn(section, edit.name)) continue;
      found = true;
      const copy = own(section);
      Reflect.deleteProperty(copy, edit.name);
      set(root, s, copy);
    }
    return found ? { ok: true, root } : { ok: false, reason: "name-absent" };
  }
  let next = root;
  if (!Object.hasOwn(next, edit.section)) {
    if (edit.op === "set-range") return { ok: false, reason: "name-absent" };
    next = withSection(next, edit.section);
  }
  const section = next[edit.section];
  if (!isObj(section)) return { ok: false, reason: "section-not-object" };
  if (edit.op === "set-range") {
    if (!Object.hasOwn(section, edit.name)) return { ok: false, reason: "name-absent" };
    const copy = own(section);
    set(copy, edit.name, edit.range);
    set(next, edit.section, copy);
    return { ok: true, root: next };
  }
  // add-dependency: an existing key keeps its place and takes the range.
  if (Object.hasOwn(section, edit.name)) {
    const copy = own(section);
    set(copy, edit.name, edit.range);
    set(next, edit.section, copy);
    return { ok: true, root: next };
  }
  const keys = Object.keys(section);
  const copy = isSorted(keys) ? insertSorted(section, edit.name, edit.range) : own(section);
  if (!isSorted(keys)) set(copy, edit.name, edit.range);
  set(next, edit.section, copy);
  return { ok: true, root: next };
}

/** The edited text, or a failure. Never throws. */
export function applyPackageJsonEdits(text: string, edits: readonly PackageJsonEdit[]): ApplyResult {
  try {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return { ok: false, reason: "invalid-json" };
    }
    if (!isObj(parsed)) return { ok: false, reason: "not-an-object" };
    let root = own(parsed);
    for (const edit of edits) {
      const result = applyOne(root, edit);
      if (!result.ok) return result;
      root = result.root;
    }
    const out = JSON.stringify(root, null, detectIndent(text));
    return { ok: true, text: text.endsWith("\n") ? `${out}\n` : out };
  } catch {
    return { ok: false, reason: "invalid-json" };
  }
}
