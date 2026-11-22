// cdk-nag acknowledgements (cdk-nag 3 uses CDK's Validations.of().acknowledge()).
// Each entry has a written reason that also appears in design.md, "cdk-nag suppressions".
// Requirement 10.4. Nothing else in the code acknowledges a rule.

import { Validations, type CfnElement, type Stack } from "aws-cdk-lib";
import type { IConstruct } from "constructs";
import type { SextonDataStack } from "./data-stack.js";
import type { SextonEdgeStack } from "./edge-stack.js";

/** Where an acknowledgement attaches: a stack and the id (or id prefix) of a direct child construct. */
export interface SuppressionTarget {
  readonly stack: "data" | "edge";
  readonly child: string;
  /** Match child ids that start with `child` (for CDK-generated ids that carry a hash). */
  readonly prefix?: boolean;
}

export interface NagSuppression {
  /** Rule id, for example AwsSolutions-L1. */
  readonly rule: string;
  /**
   * Finding ids for granular rules (IAM4, IAM5). `{Name}` is replaced by the logical ID of the
   * default CloudFormation resource of the edge stack's child construct `Name`.
   */
  readonly findings?: readonly string[];
  readonly targets: readonly SuppressionTarget[];
  readonly reason: string;
}

const BUCKET_DEPLOYMENT: SuppressionTarget = { stack: "edge", child: "Custom::CDKBucketDeployment", prefix: true };

export const NAG_SUPPRESSIONS: readonly NagSuppression[] = [
  {
    rule: "AwsSolutions-CFR1",
    targets: [{ stack: "edge", child: "Distribution" }],
    reason: "Geo restriction is not wanted: Sexton is a public open-source demo for any country.",
  },
  {
    rule: "AwsSolutions-CFR3",
    targets: [{ stack: "edge", child: "Distribution" }],
    reason:
      "Access logs are off in 0.1 for cost and to avoid storing viewer IP addresses; WAF sampled requests and Lambda logs cover operations.",
  },
  {
    rule: "AwsSolutions-CFR4",
    targets: [{ stack: "edge", child: "Distribution" }],
    reason:
      "The default CloudFront certificate forces the TLSv1 security policy; TLS 1.2 minimum needs a custom domain, recorded in docs/threat-model.md. HSTS is set and modern clients negotiate TLS 1.3.",
  },
  {
    rule: "AwsSolutions-S1",
    targets: [{ stack: "edge", child: "WebBucket" }],
    reason: "Server access logs are off in 0.1: the bucket is read only through CloudFront OAC and holds public build output.",
  },
  {
    rule: "AwsSolutions-SMG4",
    targets: [{ stack: "data", child: "GithubTokenSecret" }],
    reason: "The secret holds a fine-grained token HP created and rotates by hand before it expires (31 Jan 2027, runbook token rotation); a GitHub token cannot be rotated by a Lambda without a GitHub App, which 0.1 does not use.",
  },
  {
    rule: "AwsSolutions-L1",
    targets: [
      { stack: "edge", child: "ScanFunction" },
      { stack: "edge", child: "SnapshotterFunction" },
      { stack: "edge", child: "RemediateFunction" },
    ],
    reason: "tech.md fixes Node.js 22 for the whole repository; nodejs22.x is supported until 30 May 2027.",
  },
  {
    rule: "AwsSolutions-IAM5",
    findings: ["Resource::<{SnapshotterFunction}.Arn>:*"],
    targets: [{ stack: "edge", child: "SchedulerRoleForTarget", prefix: true }],
    reason:
      "CDK's scheduler target grants invoke on the snapshotter function and its versions (function ARN plus :*); it is one function and no other.",
  },
  {
    rule: "AwsSolutions-L1",
    targets: [BUCKET_DEPLOYMENT],
    reason: "CDK-owned BucketDeployment custom resource: its runtime is chosen by CDK.",
  },
  {
    rule: "AwsSolutions-IAM4",
    findings: ["Policy::arn:<AWS::Partition>:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"],
    targets: [BUCKET_DEPLOYMENT],
    reason: "CDK-owned BucketDeployment custom resource: CDK attaches the AWS managed basic execution policy to its role.",
  },
  {
    rule: "AwsSolutions-IAM5",
    findings: [
      "Action::s3:GetObject*",
      "Action::s3:GetBucket*",
      "Action::s3:List*",
      "Action::s3:DeleteObject*",
      "Action::s3:Abort*",
      "Resource::arn:<AWS::Partition>:s3:::cdk-hnb659fds-assets-<AWS::AccountId>-us-east-1/*",
      "Resource::<{WebBucket}.Arn>/*",
      "Resource::*",
    ],
    targets: [BUCKET_DEPLOYMENT],
    reason:
      "CDK-owned BucketDeployment custom resource: it reads the CDK asset bucket, writes the web bucket, and creates CloudFront invalidations, which CDK grants on *.",
  },
];

function stackFor(target: SuppressionTarget, data: SextonDataStack, edge: SextonEdgeStack): Stack {
  return target.stack === "data" ? data : edge;
}

function findTargets(target: SuppressionTarget, data: SextonDataStack, edge: SextonEdgeStack): IConstruct[] {
  const stack = stackFor(target, data, edge);
  return stack.node.children.filter((c) => (target.prefix === true ? c.node.id.startsWith(target.child) : c.node.id === target.child));
}

function logicalIdOf(edge: SextonEdgeStack, child: string): string {
  const resource = edge.node.tryFindChild(child)?.node.defaultChild;
  if (resource === undefined) throw new Error(`nag suppression refers to unknown construct ${child}`);
  return edge.getLogicalId(resource as CfnElement);
}

/** Expands `{Name}` placeholders and returns the acknowledgement ids for one entry. */
export function acknowledgementIds(entry: NagSuppression, edge: SextonEdgeStack): string[] {
  if (entry.findings === undefined) return [entry.rule];
  return entry.findings.map(
    (f) => `${entry.rule}[${f.replace(/\{([A-Za-z]+)\}/g, (_m: string, name: string) => logicalIdOf(edge, name))}]`,
  );
}

export function applyNagSuppressions(data: SextonDataStack, edge: SextonEdgeStack): void {
  for (const entry of NAG_SUPPRESSIONS) {
    for (const target of entry.targets) {
      const constructs = findTargets(target, data, edge);
      // The BucketDeployment is absent when there is no web build; every other target must exist.
      if (constructs.length === 0 && target !== BUCKET_DEPLOYMENT) {
        throw new Error(`nag suppression target not found: ${target.stack}/${target.child}`);
      }
      for (const construct of constructs) {
        for (const id of acknowledgementIds(entry, edge)) {
          Validations.of(construct).acknowledge({ id, reason: entry.reason });
        }
      }
    }
  }
}
