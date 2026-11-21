// Recipe runner. Spec: .kiro/specs/migration-node-sass, Requirements 1.3, 1.8, 1.9, 4.6, 5.1.
// Runs recipes before planning, so planRemediation stays synchronous. No I/O of its own.

import type { HealthReport, Recipe, RecipeInput, RecipeOutcome, RecipeResult, ScanCounts } from "../types.js";
import { capFileSource } from "./capped-source.js";
import { hasIgnoredSegment, isSafePath } from "./safe-path.js";
import type { PlanOptions } from "./plan-options.js";
import { indexIntake, precheck } from "./precheck.js";
import { DEFAULT_RECIPE_REGISTRY } from "./recipes.js";
import { NOTE_NOT_SCANNED } from "./recipe-notes.js";
import { isUnhealthy } from "./unhealthy.js";

export const REASON_RECIPE_FAILED = "migration could not be run";

const NOT_SCANNED: ScanCounts = { performed: false, listed: 0, read: 0, skipped: 0, capped: false };

function isResult(value: unknown): value is RecipeResult {
  if (typeof value !== "object" || value === null) return false;
  const r = value as Record<string, unknown>;
  return Array.isArray(r["edits"]) && Array.isArray(r["reviewSites"]) && Array.isArray(r["filesChanged"]) && Array.isArray(r["notes"]);
}

/** Runs one recipe with a Capped source. Never rejects; scan counts come from the wrapper, not the recipe. */
export async function runRecipe(recipe: Recipe, input: RecipeInput): Promise<RecipeOutcome> {
  const capped = input.files === undefined ? undefined : capFileSource(input.files);
  let outcome: unknown;
  try {
    outcome = await recipe.run({ ...input, files: capped?.source });
  } catch {
    return { ok: false, reason: REASON_RECIPE_FAILED };
  }
  if (typeof outcome !== "object" || outcome === null) return { ok: false, reason: REASON_RECIPE_FAILED };
  const o = outcome as { ok?: unknown; reason?: unknown; result?: unknown };
  if (o.ok === false) return { ok: false, reason: typeof o.reason === "string" ? o.reason : REASON_RECIPE_FAILED };
  if (o.ok !== true || !isResult(o.result)) return { ok: false, reason: REASON_RECIPE_FAILED };
  const scan = capped?.counts() ?? NOT_SCANNED;
  // Defence in depth for injected recipes: only package.json Edits, and sites on package.json or a listed path.
  const listed = new Set(capped === undefined || !scan.performed ? [] : await capped.source.listFiles()); // memoised, no second inner call
  const edits = o.result.edits.filter((e) => typeof e === "object" && e !== null && e.path === "package.json");
  const reviewSites = o.result.reviewSites.filter(
    (s) => typeof s === "object" && s !== null && (s.path === "package.json" || (isSafePath(s.path) && !hasIgnoredSegment(s.path) && listed.has(s.path))),
  );
  const notes = !scan.performed && !o.result.notes.includes(NOTE_NOT_SCANNED) ? [...o.result.notes, NOTE_NOT_SCANNED] : o.result.notes;
  return { ok: true, result: { ...o.result, edits, reviewSites, scan, notes } };
}

/** One outcome per Unhealthy package whose planned kind is migrate, first report entry per name, in report order. */
export async function runMigrations(report: HealthReport, options: PlanOptions, input: RecipeInput): Promise<ReadonlyMap<string, RecipeOutcome>> {
  const recipes = options.recipes ?? DEFAULT_RECIPE_REGISTRY;
  const intakeByName = indexIntake(options.intake);
  const seen = new Set<string>();
  const out = new Map<string, RecipeOutcome>();
  for (const pkg of report.packages) {
    if (seen.has(pkg.name)) continue;
    seen.add(pkg.name);
    if (!isUnhealthy(pkg.state)) continue;
    const check = precheck(pkg, options, intakeByName);
    const recipe = recipes.get(pkg.name);
    if (!check.ok || check.kind !== "migrate" || recipe === undefined) continue;
    out.set(pkg.name, await runRecipe(recipe, input));
  }
  return out;
}
