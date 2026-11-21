// Planner options. Spec: .kiro/specs/remediation, Requirement 1.1.

import type { IntakePackage } from "../types.js";
import type { BumpDataResult } from "./gather-bump-data.js";
import type { RecipeRegistry } from "./recipes.js";

export interface PlanOptions {
  readonly intake?: readonly IntakePackage[];
  readonly importSites?: ReadonlyMap<string, number>;
  readonly recipes?: RecipeRegistry;
  readonly bumpData?: ReadonlyMap<string, BumpDataResult>;
}
