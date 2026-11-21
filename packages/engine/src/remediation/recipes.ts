// Recipe registries. Spec: .kiro/specs/remediation, Requirements 1.5, 1.6, and .kiro/specs/migration-node-sass,
// Requirement 4.1: release 0.1 ships one recipe, node-sass to sass.

import type { Recipe } from "../types.js";
import { NODE_SASS_RECIPE } from "./node-sass-recipe.js";

export type RecipeRegistry = ReadonlyMap<string, Recipe>;

/** No entries, for callers that want no migrations. */
export const EMPTY_RECIPE_REGISTRY: RecipeRegistry = new Map<string, Recipe>();

/** The default: node-sass to sass. Used when PlanOptions.recipes is undefined. */
export const DEFAULT_RECIPE_REGISTRY: RecipeRegistry = new Map<string, Recipe>([["node-sass", NODE_SASS_RECIPE]]);
