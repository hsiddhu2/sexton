import { Match } from "aws-cdk-lib/assertions";
import { beforeAll, describe, expect, it } from "vitest";
import { build, resourcesOfType, type Built } from "./helpers.js";

let built: Built;
beforeAll(() => {
  built = build();
});

describe("SextonData-dev", () => {
  it("is named, has termination protection and depends on nothing in Edge (1.1)", () => {
    expect(built.data.stackName).toBe("SextonData-dev");
    expect(built.data.terminationProtection).toBe(true);
    expect(built.data.dependencies).toHaveLength(0);
    expect(built.edge.dependencies.map((s) => s.stackName)).toEqual(["SextonData-dev"]);
  });

  it("creates the cache table: pk only, on-demand, AWS owned key, TTL expiresAt (2.8)", () => {
    built.dataTemplate.hasResourceProperties("AWS::DynamoDB::GlobalTable", {
      TableName: "sexton-cache-dev",
      KeySchema: [{ AttributeName: "pk", KeyType: "HASH" }],
      AttributeDefinitions: [{ AttributeName: "pk", AttributeType: "S" }],
      BillingMode: "PAY_PER_REQUEST",
      TimeToLiveSpecification: { AttributeName: "expiresAt", Enabled: true },
      SSESpecification: { SSEEnabled: false },
    });
  });

  it("creates the snapshots table with the GSI, PITR, deletion protection, retain and no TTL (3.1)", () => {
    built.dataTemplate.hasResource("AWS::DynamoDB::GlobalTable", {
      DeletionPolicy: "Retain",
      UpdateReplacePolicy: "Retain",
      Properties: Match.objectLike({
        TableName: "sexton-snapshots-dev",
        KeySchema: [
          { AttributeName: "pk", KeyType: "HASH" },
          { AttributeName: "sk", KeyType: "RANGE" },
        ],
        BillingMode: "PAY_PER_REQUEST",
        TimeToLiveSpecification: Match.absent(),
        SSESpecification: { SSEEnabled: false },
        GlobalSecondaryIndexes: [
          {
            IndexName: "seen-by-time",
            KeySchema: [
              { AttributeName: "gpk", KeyType: "HASH" },
              { AttributeName: "seenAt", KeyType: "RANGE" },
            ],
            Projection: { ProjectionType: "INCLUDE", NonKeyAttributes: ["name"] },
          },
        ],
        Replicas: [
          Match.objectLike({
            Region: "us-east-1",
            DeletionProtectionEnabled: true,
            PointInTimeRecoverySpecification: { PointInTimeRecoveryEnabled: true },
          }),
        ],
      }),
    });
    const attrs = resourcesOfType(built.dataTemplate, "AWS::DynamoDB::GlobalTable")
      .map(([, r]) => r.Properties)
      .find((p) => p?.["TableName"] === "sexton-snapshots-dev")?.["AttributeDefinitions"];
    expect(attrs).toEqual(
      expect.arrayContaining([
        { AttributeName: "seenAt", AttributeType: "N" },
        { AttributeName: "gpk", AttributeType: "S" },
      ]),
    );
  });

  it("creates the GitHub token secret empty, retained, and outputs its ARN (9.5)", () => {
    built.dataTemplate.hasResource("AWS::SecretsManager::Secret", {
      DeletionPolicy: "Retain",
      Properties: {
        Name: "sexton/github-token-dev",
        Description: Match.anyValue(),
        SecretString: Match.absent(),
        GenerateSecretString: Match.absent(),
      },
    });
    built.dataTemplate.hasOutput("GithubTokenSecretArn", { Value: { Ref: Match.stringLikeRegexp("GithubTokenSecret") } });
  });
});
