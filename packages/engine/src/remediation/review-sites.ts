// Review-site scanner. Spec: .kiro/specs/migration-node-sass, Requirement 2. Pure. Plain substring matching only.

import type { ReviewSite } from "../types.js";
import { cleanLine } from "./clean-line.js";

export const MAX_REVIEW_SITES = 200;
/** Code points kept before the ellipsis, so an excerpt is at most 120 code points. */
export const EXCERPT_MAX = 119;

const STYLE_EXTENSIONS = [".scss", ".sass", ".css"];
const SCRIPT_EXTENSIONS = [".js", ".mjs", ".cjs", ".ts", ".mts", ".cts", ".jsx", ".tsx"];
const NODE_SASS_REFERENCES = [`require("node-sass")`, `require('node-sass')`, `from "node-sass"`, `from 'node-sass'`, `import("node-sass")`];

export const isStyleFile = (path: string): boolean => STYLE_EXTENSIONS.some((ext) => path.endsWith(ext));
export const isScriptFile = (path: string): boolean => SCRIPT_EXTENSIONS.some((ext) => path.endsWith(ext));

function byCodeUnits(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function lines(text: string): string[] {
  return text.split("\n").map((line) => (line.endsWith("\r") ? line.slice(0, -1) : line));
}

export interface ScannedFile {
  readonly path: string;
  readonly text: string;
}

export interface ReviewSitesResult {
  readonly sites: readonly ReviewSite[];
  readonly truncated: boolean;
}

/** Script sites first by name, then file sites by path and line. At most 200. */
export function findReviewSites(files: readonly ScannedFile[], scripts: ReadonlyMap<string, string>): ReviewSitesResult {
  const all: ReviewSite[] = [];
  const push = (site: ReviewSite): boolean => {
    all.push(site);
    return all.length > MAX_REVIEW_SITES;
  };
  for (const name of [...scripts.keys()].sort(byCodeUnits)) {
    const command = scripts.get(name) as string;
    if (command.includes("node-sass") && push({ path: "package.json", line: null, rule: "node-sass-script", excerpt: cleanLine(name, EXCERPT_MAX) })) {
      return { sites: all.slice(0, MAX_REVIEW_SITES), truncated: true };
    }
  }
  const sorted = [...files].sort((a, b) => byCodeUnits(a.path, b.path));
  for (const file of sorted) {
    const style = isStyleFile(file.path);
    const script = !style && isScriptFile(file.path) && NODE_SASS_REFERENCES.some((ref) => file.text.includes(ref));
    if (!style && !script) continue;
    const fileLines = lines(file.text);
    for (let i = 0; i < fileLines.length; i++) {
      const line = fileLines[i] as string;
      const hit = style ? line.includes("/deep/") : line.includes(".render(") || line.includes(".renderSync(");
      if (!hit) continue;
      const site: ReviewSite = { path: file.path, line: i + 1, rule: style ? "deep-combinator" : "legacy-render", excerpt: cleanLine(line.trim(), EXCERPT_MAX) };
      if (push(site)) return { sites: all.slice(0, MAX_REVIEW_SITES), truncated: true };
    }
  }
  return { sites: all, truncated: false };
}
