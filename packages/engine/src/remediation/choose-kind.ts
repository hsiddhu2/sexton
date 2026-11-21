// Kind choice. Spec: .kiro/specs/remediation, Requirements 1.4 to 1.8, 3.2. Pure.

import type { RemediationKind } from "../types.js";
import { DEFAULT_RECIPE_REGISTRY, type RecipeRegistry } from "./recipes.js";

export interface KindOptions {
  readonly importSites?: ReadonlyMap<string, number>;
  readonly recipes?: RecipeRegistry;
}

/** migrate when a recipe exists, then remove when import sites are exactly 0, then bump. */
export function chooseKind(name: string, options: KindOptions): RemediationKind {
  const recipes = options.recipes ?? DEFAULT_RECIPE_REGISTRY;
  if (recipes.has(name)) return "migrate";
  if (options.importSites?.get(name) === 0) return "remove";
  return "bump";
}
