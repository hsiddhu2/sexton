import { Annotations, Match } from "aws-cdk-lib/assertions";
import { beforeAll, describe, expect, it } from "vitest";
import { CONTENT_SECURITY_POLICY, HSTS_MAX_AGE_SECONDS } from "../lib/web-security-headers.js";
import { build, resourcesOfType, type Built } from "./helpers.js";

let built: Built;
beforeAll(() => {
  built = build();
});

const fnProps = (name: "ScanFunction" | "SnapshotterFunction") => {
  const found = resourcesOfType(built.edgeTemplate, "AWS::Lambda::Function").find(([id]) => id.startsWith(name));
  if (found === undefined) throw new Error(`${name} not found`);
  return found[1].Properties ?? {};
};

describe("functions (5.6, 7.2, 6.6)", () => {
  it("warns that placeholder handlers must not be deployed", () => {
    const warnings = Annotations.fromStack(built.edge).findWarning("*", Match.stringLikeRegexp("placeholder code that answers 503"));
    expect(warnings.map((w) => String(w.entry.data))).toEqual([
      expect.stringContaining("ScanFunction:"),
      expect.stringContaining("SnapshotterFunction:"),
    ]);
  });

  it("runs scan on nodejs22.x arm64, 1024 MB, 60 s, reserved concurrency 10", () => {
    expect(fnProps("ScanFunction")).toMatchObject({
      Runtime: "nodejs22.x",
      Architectures: ["arm64"],
      MemorySize: 1024,
      Timeout: 60,
      ReservedConcurrentExecutions: 10,
    });
  });

  it("runs the snapshotter on nodejs22.x arm64, 1024 MB, 600 s, reserved concurrency 1", () => {
    expect(fnProps("SnapshotterFunction")).toMatchObject({
      Runtime: "nodejs22.x",
      Architectures: ["arm64"],
      MemorySize: 1024,
      Timeout: 600,
      ReservedConcurrentExecutions: 1,
    });
  });

  it("passes table names and the index name, and no secret, in the environment", () => {
    const env = (fnProps("ScanFunction")["Environment"] as { Variables: Record<string, unknown> }).Variables;
    expect(Object.keys(env).sort()).toEqual(["CACHE_TABLE", "NODE_OPTIONS", "SEEN_INDEX", "SNAPSHOTS_TABLE", "STAGE"]);
    expect(env["SEEN_INDEX"]).toBe("seen-by-time");
  });

  it("creates one log group per function with 30 days retention", () => {
    const groups = resourcesOfType(built.edgeTemplate, "AWS::Logs::LogGroup");
    expect(groups).toHaveLength(2);
    for (const [, g] of groups) expect(g.Properties?.["RetentionInDays"]).toBe(30);
    for (const name of ["ScanFunction", "SnapshotterFunction"] as const) {
      expect(fnProps(name)["LoggingConfig"]).toMatchObject({ LogGroup: { Ref: expect.stringMatching(/Logs/) } });
    }
  });
});

describe("function URL and CloudFront access (5.1, 5.2)", () => {
  it("uses AWS_IAM auth and buffered mode, with no CORS", () => {
    built.edgeTemplate.hasResourceProperties("AWS::Lambda::Url", {
      AuthType: "AWS_IAM",
      InvokeMode: "BUFFERED",
      Cors: Match.absent(),
    });
  });

  it("grants InvokeFunctionUrl and InvokeFunction to CloudFront only, scoped to this distribution", () => {
    const perms = resourcesOfType(built.edgeTemplate, "AWS::Lambda::Permission").map(([, p]) => p.Properties ?? {});
    const scanPerms = perms.filter((p) => JSON.stringify(p["FunctionName"]).includes("ScanFunction"));
    expect(scanPerms.map((p) => p["Action"]).sort()).toEqual(["lambda:InvokeFunction", "lambda:InvokeFunctionUrl"]);
    for (const p of scanPerms) {
      expect(p["Principal"]).toBe("cloudfront.amazonaws.com");
      const source = JSON.stringify(p["SourceArn"]);
      expect(source).toContain(":distribution/");
      expect(source).toContain("Distribution");
    }
  });

  it("uses OAC of type lambda and of type s3, both always signing with sigv4", () => {
    for (const type of ["lambda", "s3"]) {
      built.edgeTemplate.hasResourceProperties("AWS::CloudFront::OriginAccessControl", {
        OriginAccessControlConfig: Match.objectLike({ OriginAccessControlOriginType: type, SigningBehavior: "always", SigningProtocol: "sigv4" }),
      });
    }
  });
});

describe("distribution (5.3, 5.4, 5.7, 5.8, 5.9)", () => {
  const config = () => {
    const [[, d]] = resourcesOfType(built.edgeTemplate, "AWS::CloudFront::Distribution") as [[string, { Properties: { DistributionConfig: Record<string, unknown> } }]];
    return d.Properties.DistributionConfig;
  };

  it("routes /api/* to the function URL: GET/HEAD, HTTPS only, no cache, repo-only origin request policy", () => {
    const behaviours = config()["CacheBehaviors"] as Record<string, unknown>[];
    expect(behaviours).toHaveLength(1);
    expect(behaviours[0]).toMatchObject({
      PathPattern: "/api/*",
      AllowedMethods: ["GET", "HEAD"],
      ViewerProtocolPolicy: "https-only",
      CachePolicyId: "4135ea2d-6df8-44a3-9df3-4b5a84be39ad", // managed CachingDisabled
    });
    built.edgeTemplate.hasResourceProperties("AWS::CloudFront::OriginRequestPolicy", {
      OriginRequestPolicyConfig: Match.objectLike({
        QueryStringsConfig: { QueryStringBehavior: "whitelist", QueryStrings: ["repo"] },
        HeadersConfig: { HeaderBehavior: "none" },
        CookiesConfig: { CookieBehavior: "none" },
      }),
    });
  });

  it("gives the API origin a 60 s read timeout, 65 s completion timeout and one connection attempt, over HTTPS", () => {
    const origins = config()["Origins"] as Record<string, unknown>[];
    const api = origins.find((o) => o["CustomOriginConfig"] !== undefined);
    expect(api).toMatchObject({
      ConnectionAttempts: 1,
      ResponseCompletionTimeout: 65,
      CustomOriginConfig: { OriginReadTimeout: 60, OriginProtocolPolicy: "https-only" },
    });
  });

  it("serves the rest from the bucket, redirecting HTTP to HTTPS, with index.html for 403 and 404", () => {
    expect(config()).toMatchObject({
      DefaultRootObject: "index.html",
      DefaultCacheBehavior: { ViewerProtocolPolicy: "redirect-to-https" },
      HttpVersion: "http2and3",
      IPV6Enabled: true,
      PriceClass: "PriceClass_100",
    });
    expect(config()["CustomErrorResponses"]).toEqual([
      { ErrorCode: 403, ResponseCode: 200, ResponsePagePath: "/index.html", ErrorCachingMinTTL: 0 },
      { ErrorCode: 404, ResponseCode: 200, ResponsePagePath: "/index.html", ErrorCachingMinTTL: 0 },
    ]);
    expect(config()["ViewerCertificate"]).toBeUndefined();
  });

  it("adds the security headers to every behaviour, with no CORS", () => {
    built.edgeTemplate.hasResourceProperties("AWS::CloudFront::ResponseHeadersPolicy", {
      ResponseHeadersPolicyConfig: Match.objectLike({
        CorsConfig: Match.absent(),
        SecurityHeadersConfig: {
          ContentSecurityPolicy: { ContentSecurityPolicy: CONTENT_SECURITY_POLICY, Override: true },
          ContentTypeOptions: { Override: true },
          FrameOptions: { FrameOption: "DENY", Override: true },
          ReferrerPolicy: { ReferrerPolicy: "no-referrer", Override: true },
          StrictTransportSecurity: { AccessControlMaxAgeSec: HSTS_MAX_AGE_SECONDS, IncludeSubdomains: true, Override: true },
        },
      }),
    });
    expect(HSTS_MAX_AGE_SECONDS).toBeGreaterThanOrEqual(31_536_000);
    expect(CONTENT_SECURITY_POLICY).toBe(
      "default-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
    );
    const cfg = config();
    const policies = [cfg["DefaultCacheBehavior"], ...(cfg["CacheBehaviors"] as unknown[])].map(
      (b) => (b as Record<string, unknown>)["ResponseHeadersPolicyId"],
    );
    expect(policies.every((p) => JSON.stringify(p).includes("SecurityHeaders"))).toBe(true);
  });
});

describe("web bucket (5.10)", () => {
  it("is private, SSL-only, versioned and retained", () => {
    built.edgeTemplate.hasResource("AWS::S3::Bucket", {
      DeletionPolicy: "Retain",
      Properties: Match.objectLike({
        PublicAccessBlockConfiguration: { BlockPublicAcls: true, BlockPublicPolicy: true, IgnorePublicAcls: true, RestrictPublicBuckets: true },
        VersioningConfiguration: { Status: "Enabled" },
      }),
    });
    const policy = JSON.stringify(resourcesOfType(built.edgeTemplate, "AWS::S3::BucketPolicy").map(([, p]) => p.Properties));
    expect(policy).toContain('"aws:SecureTransport":"false"');
    expect(policy).toContain("cloudfront.amazonaws.com");
    expect(policy).toContain("AWS:SourceArn");
  });

  it("deploys the web build with an invalidation of /*", () => {
    built.edgeTemplate.hasResourceProperties("Custom::CDKBucketDeployment", {
      DistributionPaths: ["/*"],
      Prune: true,
    });
  });

  it("omits the deployment and warns when there is no web build", () => {
    const noWeb = build({ web: false });
    expect(resourcesOfType(noWeb.edgeTemplate, "Custom::CDKBucketDeployment")).toHaveLength(0);
    Annotations.fromStack(noWeb.edge).hasWarning("/SextonEdge-dev", Match.stringLikeRegexp("packages/web/dist/index.html not found"));
  });
});

describe("WAF (5.5)", () => {
  it("attaches a CLOUDFRONT web ACL with the two managed groups and the /api/ rate limit", () => {
    const acls = resourcesOfType(built.edgeTemplate, "AWS::WAFv2::WebACL");
    expect(acls).toHaveLength(1);
    const props = acls[0]?.[1].Properties as Record<string, unknown>;
    expect(props["Scope"]).toBe("CLOUDFRONT");
    expect(props["DefaultAction"]).toEqual({ Allow: {} });
    const rules = props["Rules"] as Record<string, unknown>[];
    expect(rules.map((r) => r["Name"])).toEqual(["AWSManagedRulesCommonRuleSet", "AWSManagedRulesKnownBadInputsRuleSet", "ApiRateLimit"]);
    expect(rules.map((r) => r["Priority"])).toEqual([0, 1, 2]);
    expect(rules[2]).toMatchObject({
      Action: { Block: { CustomResponse: { ResponseCode: 429, CustomResponseBodyKey: "rate-limited" } } },
      Statement: {
        RateBasedStatement: {
          Limit: 100,
          EvaluationWindowSec: 300,
          AggregateKeyType: "IP",
          ScopeDownStatement: {
            ByteMatchStatement: { FieldToMatch: { UriPath: {} }, PositionalConstraint: "STARTS_WITH", SearchString: "/api/" },
          },
        },
      },
    });
    const dist = JSON.stringify(resourcesOfType(built.edgeTemplate, "AWS::CloudFront::Distribution"));
    expect(dist).toContain("WebAcl");
  });
});

describe("schedule (7.1)", () => {
  it("invokes the snapshotter at 03:17 UTC every day with no retries", () => {
    built.edgeTemplate.hasResourceProperties("AWS::Scheduler::Schedule", {
      ScheduleExpression: "cron(17 3 * * ? *)",
      Target: Match.objectLike({ Arn: { "Fn::GetAtt": [Match.stringLikeRegexp("SnapshotterFunction"), "Arn"] }, RetryPolicy: { MaximumRetryAttempts: 0 } }),
    });
  });
});

describe("alarms and topic (9.1, 9.2, 9.3)", () => {
  it("creates the five alarms, all sending to the topic", () => {
    const alarms = resourcesOfType(built.edgeTemplate, "AWS::CloudWatch::Alarm");
    expect(alarms.map(([id]) => id.replace(/[0-9A-F]{8}$/, "")).sort()).toEqual(
      ["DynamoThrottles", "ScanDurationP95", "ScanErrorRate", "ScanThrottles", "SnapshotterProblems"].sort(),
    );
    for (const [, a] of alarms) {
      expect(JSON.stringify(a.Properties?.["AlarmActions"])).toContain("AlarmTopic");
      expect(a.Properties?.["ComparisonOperator"]).toBe("GreaterThanThreshold");
    }
    const byName = Object.fromEntries(alarms.map(([id, a]) => [id.replace(/[0-9A-F]{8}$/, ""), a.Properties ?? {}]));
    expect(byName["ScanErrorRate"]?.["Threshold"]).toBe(5);
    expect(byName["ScanDurationP95"]).toMatchObject({ Threshold: 45000, ExtendedStatistic: "p95", Period: 300 });
    expect(byName["ScanThrottles"]).toMatchObject({ Threshold: 0, Period: 300 });
    expect(byName["SnapshotterProblems"]?.["Threshold"]).toBe(0);
    expect(byName["DynamoThrottles"]?.["Threshold"]).toBe(0);
  });

  it("counts scan 5xx from the scan summary log line", () => {
    built.edgeTemplate.hasResourceProperties("AWS::Logs::MetricFilter", {
      FilterPattern: '{ ($.msg = "scan") && ($.status >= 500) }',
      MetricTransformations: [Match.objectLike({ MetricNamespace: "Sexton", MetricName: "ScanErrors5xx", MetricValue: "1" })],
    });
  });

  it("enforces SSL on the topic and subscribes the AlarmEmail parameter", () => {
    built.edgeTemplate.hasParameter("AlarmEmail", { Type: "String" });
    built.edgeTemplate.hasResourceProperties("AWS::SNS::Subscription", { Protocol: "email", Endpoint: { Ref: "AlarmEmail" } });
    const policy = JSON.stringify(resourcesOfType(built.edgeTemplate, "AWS::SNS::TopicPolicy"));
    expect(policy).toContain('"aws:SecureTransport":"false"');
  });

  it("holds no email address literal (9.3)", () => {
    for (const template of [built.edgeTemplate, built.dataTemplate]) {
      const text = JSON.stringify(template.toJSON());
      expect(text).not.toMatch(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
    }
  });
});

describe("outputs", () => {
  it("outputs the distribution, bucket and function names", () => {
    for (const name of ["DistributionDomainName", "DistributionId", "WebBucketName", "ScanFunctionName", "SnapshotterFunctionName"]) {
      built.edgeTemplate.hasOutput(name, {});
    }
  });
});
