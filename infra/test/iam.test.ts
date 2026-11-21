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

  it("limits the scan role exactly as design.md says (8.4)", () => {
    const scan = statements.filter((s) => s.source.includes("ScanRoleDefaultPolicy"));
    const shape = scan.map((s) => ({
      actions: [...s.actions].sort(),
      table: /CacheTable/.test(JSON.stringify(s.resources)) ? "cache" : /SnapshotsTable/.test(JSON.stringify(s.resources)) ? "snapshots" : "logs",
      condition: s.condition ?? null,
    }));
    expect(shape).toEqual([
      { actions: ["logs:CreateLogStream", "logs:PutLogEvents"], table: "logs", condition: null },
      { actions: ["dynamodb:GetItem", "dynamodb:PutItem"], table: "cache", condition: null },
      { actions: ["dynamodb:Query"], table: "snapshots", condition: { "ForAllValues:StringLike": { "dynamodb:LeadingKeys": ["snap#*"] } } },
      { actions: ["dynamodb:PutItem"], table: "snapshots", condition: { "ForAllValues:StringLike": { "dynamodb:LeadingKeys": ["seen#*"] } } },
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

  it("attaches no managed policy to the scan or snapshotter role (8.1)", () => {
    for (const [id, r] of resourcesOfType(built.edgeTemplate, "AWS::IAM::Role")) {
      if (id.startsWith("ScanRole") || id.startsWith("SnapshotterRole")) expect(r.Properties?.["ManagedPolicyArns"], id).toBeUndefined();
    }
  });

  it("grants no role access to the GitHub token secret (9.6)", () => {
    for (const s of statements) {
      for (const a of s.actions) expect(a.startsWith("secretsmanager:"), `${s.source} grants ${a}`).toBe(false);
      expect(JSON.stringify(s.resources)).not.toContain("GithubTokenSecret");
    }
  });

  it("lets the scheduler invoke only the snapshotter", () => {
    const sched = statements.filter((s) => s.source.includes("SchedulerRoleForTarget"));
    expect(sched.flatMap((s) => s.actions)).toEqual(["lambda:InvokeFunction"]);
    expect(JSON.stringify(sched.map((s) => s.resources))).not.toContain("ScanFunction");
  });
});
