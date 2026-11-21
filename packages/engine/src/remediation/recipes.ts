// Recipe registry. Spec: .kiro/specs/remediation, Requirements 1.5, 1.6. Release 0.1 ships no recipe.

import type { Recipe } from "../types.js";

export type RecipeRegistry = ReadonlyMap<string, Recipe>;

/** No entries, so migrate is never chosen unless the caller injects a registry. */
export const EMPTY_RECIPE_REGISTRY: RecipeRegistry = new Map<string, Recipe>();
