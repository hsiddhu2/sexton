// Import-site counting for the remove remediation. Spec: .kiro/specs/cli-and-action, Requirement 2 (R-RM-3).
// Plain substring matching like review-sites.ts: no regular expression is built from a package name. Pure.

import { hasIgnoredSegment } from "./safe-path.js";

export const COUNTED_EXTENSIONS: readonly string[] = [
  ".js", ".mjs", ".cjs", ".ts", ".mts", ".cts", ".jsx", ".tsx", ".vue", ".svelte",
  ".json", ".yml", ".yaml", ".scss", ".sass", ".css", ".less", ".html",
];
const STYLE_EXTENSIONS: readonly string[] = [".scss", ".sass", ".css", ".less"];
const NEVER_COUNTED: readonly string[] = ["package.json", "package-lock.json", "npm-shrinkwrap.json"];
const QUOTES = ['"', "'", "`"];
/** Characters that can be part of a package name or a path to one; a whole-word match has none on either side. */
const NAME_CHARS = /[A-Za-z0-9._\-@/~]/;

function baseName(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

/** True for a path whose file Sexton reads when counting references. */
export function isCountedPath(path: string): boolean {
  if (hasIgnoredSegment(path) || NEVER_COUNTED.includes(baseName(path))) return false;
  return COUNTED_EXTENSIONS.some((ext) => path.endsWith(ext));
}

function lineReferences(line: string, name: string, style: boolean): boolean {
  for (const q of QUOTES) {
    if (line.includes(`${q}${name}${q}`) || line.includes(`${q}${name}/`)) return true;
    if (style && line.includes(`~${name}${q}`)) return true;
  }
  return style && line.includes(`~${name}/`);
}

function wordIn(command: string, name: string): boolean {
  for (let at = command.indexOf(name); at !== -1; at = command.indexOf(name, at + 1)) {
    const before = at === 0 ? "" : command.charAt(at - 1);
    const after = command.charAt(at + name.length);
    if ((before === "" || !NAME_CHARS.test(before)) && (after === "" || !NAME_CHARS.test(after))) return true;
  }
  return false;
}

/** Counts, per name, the lines of counted files that reference it, plus the package.json scripts that run it. */
export function countReferences(
  files: readonly { readonly path: string; readonly text: string }[],
  scripts: ReadonlyMap<string, string>,
  names: readonly string[],
): Map<string, number> {
  const counts = new Map<string, number>(names.map((n) => [n, 0]));
  const wanted = [...counts.keys()].filter((n) => n.length > 0);
  for (const file of files) {
    if (typeof file.path !== "string" || typeof file.text !== "string" || !isCountedPath(file.path)) continue;
    const style = STYLE_EXTENSIONS.some((ext) => file.path.endsWith(ext));
    for (const line of file.text.split("\n")) {
      for (const name of wanted) if (lineReferences(line, name, style)) counts.set(name, (counts.get(name) ?? 0) + 1);
    }
  }
  for (const command of scripts.values()) {
    for (const name of wanted) if (typeof command === "string" && wordIn(command, name)) counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return counts;
}
