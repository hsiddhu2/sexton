// The Plan stage of the hosted scan. Spec: .kiro/specs/hosted-plans, Requirement 6. Modelled on packages/cli compose.ts.
// bumpTargets (first 25), gatherBumpData, gatherMigrationData, runMigrations, planRemediation, attachRemediations.
// No import sites on the hosted path, so no hosted plan is remove (design.md, Overview). Each step has its own guard:
// a throw costs that step's output and marks the stage partial, never the scan. Steps are injectable for tests.

import {
  attachRemediations,
  bumpTargets,
  gatherBumpData,
  gatherMigrationData,
  planRemediation,
  readPackageScripts,
  runMigrations,
  type BumpDataResult,
  type BumpTarget,
  type ClientContext,
  type FileSource,
  type HealthReport,
  type IntakePackage,
  type PolicyResult,
  type RecipeOutcome,
  type RemediationEntry,
  type RemediationPlan,
} from "@sexton/engine";

export const MAX_BUMP_TARGETS = 25;

export interface PlanSteps {
  readonly readPackageScripts: typeof readPackageScripts;
  readonly bumpTargets: typeof bumpTargets;
  readonly gatherBumpData: typeof gatherBumpData;
  readonly gatherMigrationData: typeof gatherMigrationData;
  readonly runMigrations: typeof runMigrations;
  readonly planRemediation: typeof planRemediation;
  readonly attachRemediations: typeof attachRemediations;
}

export const ENGINE_PLAN_STEPS: PlanSteps = {
  readPackageScripts,
  bumpTargets,
  gatherBumpData,
  gatherMigrationData,
  runMigrations,
  planRemediation,
  attachRemediations,
};

export interface PlanStageInput {
  readonly ctx: ClientContext;
  readonly report: HealthReport;
  readonly policy: PolicyResult;
  readonly intake: readonly IntakePackage[];
  /** The package.json text intake read, for the scripts map. Empty when unknown. */
  readonly packageJsonText: string;
  /** Builds the File source for recipes, or answers undefined when none is wanted (Requirement 6.5). */
  readonly files?: () => FileSource | undefined;
  readonly steps?: Partial<PlanSteps>;
}

export interface PlanStageResult {
  readonly remediations: RemediationEntry[];
  readonly partial: boolean;
}

type MigrationData = Awaited<ReturnType<typeof gatherMigrationData>>;

/** Never rejects. */
export async function planStage(input: PlanStageInput): Promise<PlanStageResult> {
  const steps: PlanSteps = { ...ENGINE_PLAN_STEPS, ...input.steps };
  let partial = false;
  const guard = async <T>(step: () => T | Promise<T>, fallback: T): Promise<T> => {
    try {
      return await step();
    } catch {
      partial = true;
      return fallback;
    }
  };

  const options = { intake: input.intake, importSites: new Map<string, number>() };
  const scripts = await guard(() => steps.readPackageScripts(input.packageJsonText), new Map<string, string>() as ReadonlyMap<string, string>);
  const targets = await guard((): readonly BumpTarget[] => steps.bumpTargets(input.report, options).slice(0, MAX_BUMP_TARGETS), []);
  const bumpData = await guard(() => steps.gatherBumpData(input.ctx, targets), new Map<string, BumpDataResult>() as ReadonlyMap<string, BumpDataResult>);
  const view = { packages: input.intake, scripts };
  const data = await guard(() => steps.gatherMigrationData(input.ctx, view), new Map() as MigrationData);
  const files = await guard(() => input.files?.(), undefined);
  const migrations = await guard(
    () => steps.runMigrations(input.report, options, { packageJson: view, files, data }),
    new Map<string, RecipeOutcome>() as ReadonlyMap<string, RecipeOutcome>,
  );
  const plans = await guard((): readonly RemediationPlan[] => steps.planRemediation(input.report, { ...options, bumpData, migrations }), []);
  const remediations = await guard(() => steps.attachRemediations(input.report, input.policy, plans), []);
  return { remediations, partial };
}
