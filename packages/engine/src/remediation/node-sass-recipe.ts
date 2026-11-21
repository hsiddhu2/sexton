// The node-sass to sass recipe. Spec: .kiro/specs/migration-node-sass, Requirements 2, 3.7, 4. R-RM-7.
// Pure given its input: it reads only the Package.json view, the Migration data and the (capped) File source.

import type { BumpDataResult, FileSource, PackageJsonEdit, Recipe, RecipeInput, RecipeOutcome } from "../types.js";
import { sassCandidates, sassLoaderCandidates, sassLoaderNeed } from "./migration-candidates.js";
import { rangeStyle, styledRange } from "./range-style.js";
import {
  NOTE_NOT_SCANNED,
  NOTE_SASS_LOADER_RAISED,
  NOTE_SASS_LOADER_UNCHANGED,
  NOTE_SASS_LOADER_UNKNOWN,
  NOTE_SITES_TRUNCATED,
} from "./recipe-notes.js";
import { findReviewSites, isScriptFile, isStyleFile, type ScannedFile } from "./review-sites.js";
import { isPassing } from "./select-bump.js";

export const NODE_SASS_RECIPE_ID = "node-sass-to-sass";
export const MIGRATION_DATA_UNAVAILABLE = "migration data unavailable: ";

type Choice = { readonly ok: true; readonly version: string } | { readonly ok: false; readonly reason: string };

function choose(name: string, data: BumpDataResult | undefined, candidatesOf: (published: readonly string[]) => readonly string[]): Choice {
  if (data === undefined) return { ok: false, reason: `${MIGRATION_DATA_UNAVAILABLE}${name} data was not gathered` };
  if (!data.ok) return { ok: false, reason: `${MIGRATION_DATA_UNAVAILABLE}${data.reason}` };
  const candidates = candidatesOf(data.published);
  const version = candidates.find((v) => isPassing(v, data.deprecated, data.advisories));
  if (version !== undefined) return { ok: true, version };
  return {
    ok: false,
    reason: `${MIGRATION_DATA_UNAVAILABLE}no safe version of ${name} found among ${String(candidates.length)} evaluated candidate versions`,
  };
}

/** Lists and reads Style and Script files. Undefined when the listing failed or there is no source. */
async function readRelevant(files: FileSource | undefined): Promise<ScannedFile[] | undefined> {
  if (files === undefined) return undefined;
  let paths: unknown;
  try {
    paths = await files.listFiles();
  } catch {
    return undefined;
  }
  if (!Array.isArray(paths)) return undefined;
  const out: ScannedFile[] = [];
  for (const path of paths as unknown[]) {
    if (typeof path !== "string" || !(isStyleFile(path) || isScriptFile(path))) continue;
    let text: unknown;
    try {
      text = await files.readFile(path);
    } catch {
      text = undefined;
    }
    if (typeof text === "string") out.push({ path, text });
  }
  return out;
}

async function run(input: RecipeInput): Promise<RecipeOutcome> {
  const packages = input.packageJson.packages;
  const nodeSass = packages.find((p) => p.name === "node-sass");
  const need = sassLoaderNeed(packages);
  const edits: PackageJsonEdit[] = [];
  const notes: string[] = [];

  if (nodeSass !== undefined) {
    edits.push({ path: "package.json", op: "remove-dependency", section: nodeSass.origin, name: "node-sass" });
    if (!packages.some((p) => p.name === "sass")) {
      const sass = choose("sass", input.data.get("sass"), sassCandidates);
      if (!sass.ok) return sass;
      edits.push({ path: "package.json", op: "add-dependency", section: nodeSass.origin, name: "sass", range: styledRange("caret", sass.version) });
    }
    if (need.kind === "raise") {
      const loader = choose("sass-loader", input.data.get("sass-loader"), (p) => sassLoaderCandidates(p, need.effective));
      if (!loader.ok) return loader;
      edits.push({
        path: "package.json",
        op: "set-range",
        section: need.pkg.origin,
        name: "sass-loader",
        range: styledRange(rangeStyle(need.pkg.declaredRange), loader.version),
      });
    }
  }

  const scanned = await readRelevant(input.files);
  const { sites, truncated } = findReviewSites(scanned ?? [], input.packageJson.scripts);
  if (truncated) notes.push(NOTE_SITES_TRUNCATED);
  if (nodeSass !== undefined) {
    if (need.kind === "raise") notes.push(NOTE_SASS_LOADER_RAISED);
    else if (need.kind === "compatible") notes.push(NOTE_SASS_LOADER_UNCHANGED);
    else if (need.kind === "unknown") notes.push(NOTE_SASS_LOADER_UNKNOWN);
  }
  if (scanned === undefined) notes.push(NOTE_NOT_SCANNED);

  return {
    ok: true,
    result: {
      edits,
      reviewSites: sites,
      filesChanged: edits.length > 0 ? ["package.json"] : [],
      scan: { performed: scanned !== undefined, listed: 0, read: 0, skipped: 0, capped: false },
      notes,
    },
  };
}

export const NODE_SASS_RECIPE: Recipe = { id: NODE_SASS_RECIPE_ID, from: "node-sass", to: "sass", run };
