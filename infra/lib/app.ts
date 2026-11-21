// Builds the Sexton CDK app: both stacks, cdk-nag AwsSolutions checks and the written suppressions.
// Used by bin/sexton.ts and by the tests. Requirements 1.1, 1.2, 10.3, 10.4.

import { App, Validations } from "aws-cdk-lib";
import { AwsSolutionsChecks } from "cdk-nag";
import { REGION, STAGE, assertRegion, stackName } from "./config.js";
import { SextonDataStack } from "./data-stack.js";
import { SextonEdgeStack, type HandlerCode } from "./edge-stack.js";
import { applyNagSuppressions } from "./nag-suppressions.js";

export interface BuildAppOptions {
  readonly region?: string;
  readonly stage?: string;
  readonly scanCode: HandlerCode;
  readonly snapshotterCode: HandlerCode;
  readonly webAssetPath: string | null;
  readonly outdir?: string;
}

export interface SextonApp {
  readonly app: App;
  readonly data: SextonDataStack;
  readonly edge: SextonEdgeStack;
}

export function buildApp(options: BuildAppOptions): SextonApp {
  const region = assertRegion(options.region ?? REGION);
  const stage = options.stage ?? STAGE;
  // Strong references: the Data stack keeps its exports while Edge uses them.
  const context = { "@aws-cdk/core:defaultCrossStackReferences": "strong" };
  const app = new App(options.outdir === undefined ? { context } : { context, outdir: options.outdir });
  const env = { region };

  const data = new SextonDataStack(app, stackName("SextonData", stage), { env, stage });
  const edge = new SextonEdgeStack(app, stackName("SextonEdge", stage), {
    env,
    stage,
    data,
    scanCode: options.scanCode,
    snapshotterCode: options.snapshotterCode,
    webAssetPath: options.webAssetPath,
  });
  edge.addStackDependency(data);

  applyNagSuppressions(data, edge);
  Validations.of(app).addPlugins(new AwsSolutionsChecks(app, { verbose: true }));
  return { app, data, edge };
}
