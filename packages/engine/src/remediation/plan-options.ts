// Planner options. Spec: .kiro/specs/remediation, Requirement 1.1, and .kiro/specs/migration-node-sass, Requirement 5.2.

import type { BumpDataResult, IntakePackage, RecipeOutcome } from "../types.js";
import type { RecipeRegistry } from "./recipes.js";

export interface PlanOptions {
  readonly intake?: readonly IntakePackage[];
  readonly importSites?: ReadonlyMap<string, number>;
  /** Default DEFAULT_RECIPE_REGISTRY. */
  readonly recipes?: RecipeRegistry;
  readonly bumpData?: ReadonlyMap<string, BumpDataResult>;
  /** Recipe outcomes from runMigrations, by package name. */
  readonly migrations?: ReadonlyMap<string, RecipeOutcome>;
}
