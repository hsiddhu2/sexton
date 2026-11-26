// Kind choice. Spec: .kiro/specs/remediation, Requirements 1.4 to 1.8, 3.2, and .kiro/specs/remediation-safety, bugfix 2.5. Pure.

import type { RemediationKind } from "../types.js";
import { DEFAULT_RECIPE_REGISTRY, type RecipeRegistry } from "./recipes.js";

export interface KindOptions {
  readonly importSites?: ReadonlyMap<string, number>;
  readonly recipes?: RecipeRegistry;
}

/** Packages that generated code imports or the toolchain consumes, so zero import sites in source does not mean unused. */
export const IMPLICIT_USE_NAMES: ReadonlySet<string> = new Set(["tslib", "@babel/runtime", "@swc/helpers", "core-js", "regenerator-runtime"]);
/** Type packages are read by the compiler with no import by name. */
export const IMPLICIT_USE_PREFIX = "@types/";

/** True for an Implicit-use name: never removed on an import count. Spec remediation-safety, D3. */
export function isImplicitUse(name: string): boolean {
  return name.startsWith(IMPLICIT_USE_PREFIX) || IMPLICIT_USE_NAMES.has(name);
}

/** migrate when a recipe exists, then remove when import sites are exactly 0 and the name is not Implicit-use, then bump. */
export function chooseKind(name: string, options: KindOptions): RemediationKind {
  const recipes = options.recipes ?? DEFAULT_RECIPE_REGISTRY;
  if (recipes.has(name)) return "migrate";
  if (options.importSites?.get(name) === 0 && !isImplicitUse(name)) return "remove";
  return "bump";
}
