// SextonData: the cache table, the snapshots table and the empty GitHub token secret.
// Requirements 2.8, 3.1, 9.5, 9.6.

import { CfnOutput, RemovalPolicy, Stack, type StackProps } from "aws-cdk-lib";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import type { Construct } from "constructs";
import { SEEN_INDEX_NAME, secretName, tableName } from "./config.js";

export interface SextonDataStackProps extends StackProps {
  readonly stage: string;
}

export class SextonDataStack extends Stack {
  readonly cacheTable: dynamodb.TableV2;
  readonly snapshotsTable: dynamodb.TableV2;
  readonly seenIndexName = SEEN_INDEX_NAME;
  readonly githubTokenSecret: secretsmanager.CfnSecret;

  constructor(scope: Construct, id: string, props: SextonDataStackProps) {
    super(scope, id, { ...props, terminationProtection: true });

    this.cacheTable = new dynamodb.TableV2(this, "CacheTable", {
      tableName: tableName("sexton-cache", props.stage),
      partitionKey: { name: "pk", type: dynamodb.AttributeType.STRING },
      billing: dynamodb.Billing.onDemand(),
      encryption: dynamodb.TableEncryptionV2.dynamoOwnedKey(),
      timeToLiveAttribute: "expiresAt",
      removalPolicy: RemovalPolicy.DESTROY,
    });

    this.snapshotsTable = new dynamodb.TableV2(this, "SnapshotsTable", {
      tableName: tableName("sexton-snapshots", props.stage),
      partitionKey: { name: "pk", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "sk", type: dynamodb.AttributeType.STRING },
      billing: dynamodb.Billing.onDemand(),
      encryption: dynamodb.TableEncryptionV2.dynamoOwnedKey(),
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      deletionProtection: true,
      removalPolicy: RemovalPolicy.RETAIN,
      globalSecondaryIndexes: [
        {
          indexName: SEEN_INDEX_NAME,
          partitionKey: { name: "gpk", type: dynamodb.AttributeType.STRING },
          sortKey: { name: "seenAt", type: dynamodb.AttributeType.NUMBER },
          projectionType: dynamodb.ProjectionType.INCLUDE,
          nonKeyAttributes: ["name"],
        },
      ],
    });

    // L1 on purpose: the L2 Secret generates a value when none is given. Omitting both
    // SecretString and GenerateSecretString creates an empty secret (CloudFormation docs).
    this.githubTokenSecret = new secretsmanager.CfnSecret(this, "GithubTokenSecret", {
      name: secretName(props.stage),
      description: "GitHub credentials for remediation pull requests (spec 05). Empty in release 0.1; no role reads it.",
    });
    this.githubTokenSecret.applyRemovalPolicy(RemovalPolicy.RETAIN);

    new CfnOutput(this, "GithubTokenSecretArn", { value: this.githubTokenSecret.ref });
  }
}
