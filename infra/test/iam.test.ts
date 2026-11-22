// Property 13: IAM policy shape, checked over every policy-bearing resource of both templates.
// Requirements 8.1, 8.2, 8.3, 8.4, 9.6.

import { beforeAll, describe, expect, it } from "vitest";
import { build, resourcesOfType, type Built, type Json } from "./helpers.js";

interface Statement {
  readonly source: string;
  readonly actions: readonly string[];
  readonly resources: readonly Json[];
  readonly condition: Json | undefined;
}

const asArray = <T>(v: T | readonly T[] | undefined): readonly T[] => (v === undefined ? [] : Array.isArray(v) ? (v as readonly T[]) : [v as T]);

function statementsOf(doc: Json | undefined, source: string): Statement[] {
  if (doc === null || typeof doc !== "object" || Array.isArray(doc)) return [];
  return asArray(doc["Statement"] as Json).map((s) => {
    const st = s as Record<string, Json>;
    return {
      source,
      actions: asArray(st["Action"] as string | string[]),
      resources: asArray(st["Resource"]),
      condition: st["Condition"],
    };
  });
}

function allStatements(b: Built): Statement[] {
  const out: Statement[] = [];
  for (const [name, template] of [["data", b.dataTemplate], ["edge", b.edgeTemplate]] as const) {
    for (const [id, r] of resourcesOfType(template, "AWS::IAM::Policy")) out.push(...statementsOf(r.Properties?.["PolicyDocument"], `${name}/${id}`));
    for (const [id, r] of resourcesOfType(template, "AWS::IAM::Role")) {
      for (const p of asArray(r.Properties?.["Policies"] as Json[] | undefined)) {
        out.push(...statementsOf((p as Record<string, Json>)["PolicyDocument"], `${name}/${id}/inline`));
      }
    }
    for (const type of ["AWS::S3::BucketPolicy", "AWS::SNS::TopicPolicy"]) {
      for (const [id, r] of resourcesOfType(template, type)) out.push(...statementsOf(r.Properties?.["PolicyDocument"], `${name}/${id}`));
    }
    for (const [id, r] of resourcesOfType(template, "AWS::Lambda::Permission")) {
      out.push({ source: `${name}/${id}`, actions: [String(r.Properties?.["Action"])], resources: [r.Properties?.["FunctionName"] ?? null], condition: undefined });
    }
  }
  return out;
}

const refersToSnapshots = (s: Statement) => JSON.stringify(s.resources).includes("SnapshotsTable");
const FORBIDDEN_ON_SNAPSHOTS = new Set([
  "dynamodb:UpdateItem",
  "dynamodb:DeleteItem",
  "dynamodb:BatchWriteItem",
  "dynamodb:PartiQLUpdate",
  "dynamodb:PartiQLDelete",
  "dynamodb:PartiQLInsert",
  "dynamodb:DeleteTable",
  "dynamodb:UpdateTable",
  "dynamodb:UpdateTimeToLive",
  "dynamodb:RestoreTableToPointInTime",
]);

/** The only statement allowed a "*" resource: CDK's BucketDeployment CloudFront invalidation. Design.md, IAM. */
const ALLOWED_STAR_ACTIONS = ["cloudfront:CreateInvalidation", "cloudfront:GetInvalidation"];

/**
 * Renders a policy resource the way CloudFormation would in us-east-1, account 123456789012.
 * A LogGroup's Arn attribute renders with its trailing ":*", as CloudFormation documents it.
 */
function render(value: Json): string {
  if (typeof value === "string") return value;
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error(`cannot render ${JSON.stringify(value)}`);
  if ("Fn::GetAtt" in value) {
    const [id, attr] = value["Fn::GetAtt"] as [string, string];
    const type = (built.edgeTemplate.toJSON()["Resources"] as Record<string, { Type: string }>)[id]?.Type;
    if (type === "AWS::Logs::LogGroup" && attr === "Arn") return `arn:aws:logs:us-east-1:123456789012:log-group:${id}:*`;
    return `arn:aws:x:us-east-1:123456789012:${id}`;
  }
  if ("Fn::Join" in value) {
    const [sep, parts] = value["Fn::Join"] as [string, Json[]];
    return parts.map(render).join(sep);
  }
  if ("Ref" in value) {
    const ref = String(value["Ref"]);
    return { "AWS::Partition": "aws", "AWS::Region": "us-east-1", "AWS::AccountId": "123456789012", "AWS::URLSuffix": "amazonaws.com" }[ref] ?? ref;
  }
  throw new Error(`cannot render ${JSON.stringify(value)}`);
}

/** IAM resource matching: "*" matches any run of characters, "?" any one character. */
function globMatches(pattern: string, arn: string): boolean {
  const source = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".");
  return new RegExp(`^${source}$`).test(arn);
}

let built: Built;
let statements: Statement[];
beforeAll(() => {
  built = build();
  statements = allStatements(built);
});

describe("Feature: infra, Property 13: IAM policy shape", () => {
  it("finds the statements it checks", () => {
    expect(statements.length).toBeGreaterThan(10);
    expect(statements.some(refersToSnapshots)).toBe(true);
  });

  it("grants no update, delete, batch write, PartiQL write or wildcard action on the snapshots table or index (8.2)", () => {
    for (const s of statements.filter(refersToSnapshots)) {
      for (const a of s.actions) {
        expect(FORBIDDEN_ON_SNAPSHOTS.has(a), `${s.source} grants ${a}`).toBe(false);
        expect(a.endsWith("*"), `${s.source} grants wildcard ${a}`).toBe(false);
      }
    }
  });

  it("has no action or resource equal to * except the allow-listed invalidation statement (8.3)", () => {
    for (const s of statements) {
      expect(s.actions.includes("*"), `${s.source} has action *`).toBe(false);
      if (s.resources.includes("*")) {
        expect([...s.actions].sort(), `${s.source} has resource *`).toEqual([...ALLOWED_STAR_ACTIONS].sort());
        expect(s.source).toMatch(/CustomCDKBucketDeployment/);
      }
    }
  });

  it("grants no DynamoDB wildcard action anywhere", () => {
    for (const s of statements) for (const a of s.actions) if (a.startsWith("dynamodb:")) expect(a.endsWith("*"), s.source).toBe(false);
  });

  const shapeOf = (role: string) =>
    statements
      .filter((s) => s.source.includes(role))
      .map((s) => ({
        actions: [...s.actions].sort(),
        table: /CacheTable/.test(JSON.stringify(s.resources))
          ? "cache"
          : /SnapshotsTable/.test(JSON.stringify(s.resources))
            ? "snapshots"
            : /GithubTokenSecret/.test(JSON.stringify(s.resources))
              ? "secret"
              : /RemediationLogTable/.test(JSON.stringify(s.resources))
                ? "log"
                : "logs",
        condition: s.condition ?? null,
      }));

  it("limits the scan role exactly as design.md says (8.4)", () => {
    expect(shapeOf("ScanRoleDefaultPolicy")).toEqual([
      { actions: ["logs:CreateLogStream", "logs:PutLogEvents"], table: "logs", condition: null },
      { actions: ["dynamodb:GetItem", "dynamodb:PutItem"], table: "cache", condition: null },
      { actions: ["dynamodb:Query"], table: "snapshots", condition: { "ForAllValues:StringLike": { "dynamodb:LeadingKeys": ["snap#*"] } } },
      { actions: ["dynamodb:PutItem"], table: "snapshots", condition: { "ForAllValues:StringLike": { "dynamodb:LeadingKeys": ["seen#*"] } } },
      // Spec hosted-plans, Requirement 8.1.
      { actions: ["secretsmanager:GetSecretValue"], table: "secret", condition: null },
      // Spec remediate, Requirement 5.4: the evidence path reads the log.
      { actions: ["dynamodb:Query"], table: "log", condition: null },
    ]);
  });

  it("limits the remediate role to a scan's statements, the secret and PutItem on the log (remediate 8.2, 5.4)", () => {
    expect(shapeOf("RemediateRoleDefaultPolicy")).toEqual([
      { actions: ["logs:CreateLogStream", "logs:PutLogEvents"], table: "logs", condition: null },
      { actions: ["secretsmanager:GetSecretValue"], table: "secret", condition: null },
      { actions: ["dynamodb:GetItem", "dynamodb:PutItem"], table: "cache", condition: null },
      { actions: ["dynamodb:Query"], table: "snapshots", condition: { "ForAllValues:StringLike": { "dynamodb:LeadingKeys": ["snap#*"] } } },
      { actions: ["dynamodb:PutItem"], table: "snapshots", condition: { "ForAllValues:StringLike": { "dynamodb:LeadingKeys": ["seen#*"] } } },
      { actions: ["dynamodb:PutItem"], table: "log", condition: null },
    ]);
  });

  it("gives no role anything on the log table but the remediate PutItem and the scan Query", () => {
    const onLog = statements.filter((s) => JSON.stringify(s.resources).includes("RemediationLogTable"));
    expect(onLog.map((s) => `${s.source.replace(/DefaultPolicy.*$/, "")} ${s.actions.join(",")}`).sort()).toEqual([
      "edge/RemediateRole dynamodb:PutItem",
      "edge/ScanRole dynamodb:Query",
    ]);
  });

  it("limits the snapshotter role to the cache, the snapshots table, the seen index and its logs", () => {
    const snap = statements.filter((s) => s.source.includes("SnapshotterRoleDefaultPolicy"));
    const actions = snap.flatMap((s) => s.actions).sort();
    expect(actions).toEqual(
      ["dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:PutItem", "dynamodb:Query", "dynamodb:Query", "logs:CreateLogStream", "logs:PutLogEvents"].sort(),
    );
    expect(JSON.stringify(snap)).toContain("/index/seen-by-time");
  });

  it("grants log write on each function's log group ARN itself, with no suffix (8.4)", () => {
    for (const [role, group] of [["ScanRoleDefaultPolicy", "ScanLogs"], ["SnapshotterRoleDefaultPolicy", "SnapshotterLogs"]] as const) {
      const ids = resourcesOfType(built.edgeTemplate, "AWS::Logs::LogGroup").map(([id]) => id).filter((id) => id.startsWith(group));
      expect(ids, group).toHaveLength(1);
      const logStatements = statements.filter((s) => s.source.includes(role) && s.actions.some((a) => a.startsWith("logs:")));
      expect(logStatements.map((s) => ({ actions: [...s.actions].sort(), resources: s.resources })), role).toEqual([
        { actions: ["logs:CreateLogStream", "logs:PutLogEvents"], resources: [{ "Fn::GetAtt": [ids[0], "Arn"] }] },
      ]);
    }
  });

  it("renders every log statement resource with exactly one ':*', never ':*:', and matching a Lambda log stream ARN", () => {
    const logStatements = statements.filter((s) => s.actions.some((a) => a.startsWith("logs:")));
    expect(logStatements.length).toBeGreaterThanOrEqual(2);
    for (const s of logStatements) {
      for (const resource of s.resources) {
        const rendered = render(resource);
        expect(rendered.split(":*").length - 1, `${s.source}: ${rendered}`).toBe(1);
        expect(rendered.includes(":*:"), `${s.source}: ${rendered}`).toBe(false);
        const group = /:log-group:([^:]+):/.exec(rendered)?.[1];
        expect(group, `${s.source}: ${rendered}`).toBeDefined();
        const stream = `arn:aws:logs:us-east-1:123456789012:log-group:${group ?? ""}:log-stream:2026/11/21/[$LATEST]0123abcd`;
        expect(globMatches(rendered, stream), `${s.source}: ${rendered} does not cover ${stream}`).toBe(true);
      }
    }
  });

  it("attaches no managed policy to the scan or snapshotter role (8.1)", () => {
    for (const [id, r] of resourcesOfType(built.edgeTemplate, "AWS::IAM::Role")) {
      if (id.startsWith("ScanRole") || id.startsWith("SnapshotterRole")) expect(r.Properties?.["ManagedPolicyArns"], id).toBeUndefined();
    }
  });

  // Superseded in part by spec hosted-plans, Requirement 8: the scan role, and only it, reads the secret on its exact ARN.
  // Superseded in part by spec remediate, Requirement 8.5: the scan and remediate roles read the secret; the snapshotter never.
  it("lets only the scan and remediate roles read the GitHub token secret, with GetSecretValue on its exact ARN (hosted-plans 8.1, remediate 8.2)", () => {
    const secretStatements = statements.filter((s) => s.actions.some((a) => a.startsWith("secretsmanager:")) || JSON.stringify(s.resources).includes("GithubTokenSecret"));
    expect(secretStatements.map((s) => s.source.replace(/DefaultPolicy.*$/, "")).sort()).toEqual(["edge/RemediateRole", "edge/ScanRole"]);
    for (const s of secretStatements) {
      expect(s.actions).toEqual(["secretsmanager:GetSecretValue"]);
      expect(s.resources).toHaveLength(1);
      expect(JSON.stringify(s.resources[0])).toMatch(/GithubTokenSecret/);
      expect(JSON.stringify(s.resources)).not.toContain("*");
      expect(s.condition).toBeUndefined();
    }
  });

  it("lets the scheduler invoke only the snapshotter", () => {
    const sched = statements.filter((s) => s.source.includes("SchedulerRoleForTarget"));
    expect(sched.flatMap((s) => s.actions)).toEqual(["lambda:InvokeFunction"]);
    expect(JSON.stringify(sched.map((s) => s.resources))).not.toContain("ScanFunction");
  });
});
