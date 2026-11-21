// SextonEdge: functions, function URL, CloudFront, WAF, web bucket, schedule, alarms.
// Requirements 4.7, 5, 6.6, 7.1, 7.2, 8, 9.1 to 9.3. Values come from config.ts.

import { Annotations, CfnOutput, CfnParameter, Duration, RemovalPolicy, Stack, type StackProps } from "aws-cdk-lib";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch";
import * as cwActions from "aws-cdk-lib/aws-cloudwatch-actions";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as nodejs from "aws-cdk-lib/aws-lambda-nodejs";
import * as logs from "aws-cdk-lib/aws-logs";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as s3deploy from "aws-cdk-lib/aws-s3-deployment";
import * as scheduler from "aws-cdk-lib/aws-scheduler";
import * as schedulerTargets from "aws-cdk-lib/aws-scheduler-targets";
import * as sns from "aws-cdk-lib/aws-sns";
import * as snsSubscriptions from "aws-cdk-lib/aws-sns-subscriptions";
import * as wafv2 from "aws-cdk-lib/aws-wafv2";
import type { Construct } from "constructs";
import {
  API_PATH_PREFIX,
  LOG_RETENTION_DAYS,
  METRIC_NAMESPACE,
  ORIGIN_COMPLETION_TIMEOUT_SECONDS,
  ORIGIN_CONNECTION_ATTEMPTS,
  ORIGIN_READ_TIMEOUT_SECONDS,
  RATE_LIMIT,
  SCAN_DURATION_P95_MS,
  SCAN_ERROR_RATE_PERCENT,
  SCAN_MEMORY_MB,
  SCAN_RESERVED_CONCURRENCY,
  SCAN_TIMEOUT_SECONDS,
  SNAPSHOTTER_CRON,
  SNAPSHOTTER_MEMORY_MB,
  SNAPSHOTTER_RESERVED_CONCURRENCY,
  SNAPSHOTTER_TIMEOUT_SECONDS,
} from "./config.js";
import { CONTENT_SECURITY_POLICY, HSTS_MAX_AGE_SECONDS } from "./web-security-headers.js";

/** How a function gets its code: bundled from a TypeScript entry, or a placeholder until the handler exists. */
export type HandlerCode =
  | { readonly kind: "bundle"; readonly entry: string; readonly projectRoot: string; readonly depsLockFilePath: string }
  | { readonly kind: "placeholder" };

export interface DataRefs {
  readonly cacheTable: dynamodb.ITableV2;
  readonly snapshotsTable: dynamodb.ITableV2;
  readonly seenIndexName: string;
}

export interface SextonEdgeStackProps extends StackProps {
  readonly stage: string;
  readonly data: DataRefs;
  readonly scanCode: HandlerCode;
  readonly snapshotterCode: HandlerCode;
  /** Directory holding the built web app, or null when it has not been built. */
  readonly webAssetPath: string | null;
}

export const PLACEHOLDER_WARNING = "handler entry not found: placeholder code that answers 503 is used. Do not deploy.";
export const NO_WEB_WARNING = "packages/web/dist/index.html not found: the web bucket deployment is omitted. Do not deploy.";

const PLACEHOLDER_SOURCE = [
  "exports.handler = async () => ({",
  "  statusCode: 503,",
  "  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },",
  "  body: JSON.stringify({ code: 'not-deployed', message: 'The scan API is not deployed yet.' }),",
  "});",
].join("\n");

const RATE_LIMITED_BODY_KEY = "rate-limited";
const RATE_LIMITED_BODY = JSON.stringify({ code: "rate-limited", message: "Too many requests. Try again in a few minutes." });

export class SextonEdgeStack extends Stack {
  readonly scanFunction: lambda.Function;
  readonly snapshotterFunction: lambda.Function;
  readonly scanRole: iam.Role;
  readonly snapshotterRole: iam.Role;
  readonly webBucket: s3.Bucket;
  readonly distribution: cloudfront.Distribution;
  readonly webAcl: wafv2.CfnWebACL;
  readonly alarmTopic: sns.Topic;
  readonly bucketDeployment: s3deploy.BucketDeployment | undefined;
  readonly alarms: readonly cloudwatch.Alarm[];

  constructor(scope: Construct, id: string, props: SextonEdgeStackProps) {
    super(scope, id, props);
    const { cacheTable, snapshotsTable, seenIndexName } = props.data;

    const alarmEmail = new CfnParameter(this, "AlarmEmail", {
      type: "String",
      description: "Email address that receives Sexton alarms.",
      allowedPattern: "^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$",
      constraintDescription: "must be an email address",
    });

    // Log groups, one per function, 30 days. Passed as logGroup so CDK adds no retention custom resource.
    const scanLogs = new logs.LogGroup(this, "ScanLogs", {
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: RemovalPolicy.DESTROY,
    });
    const snapshotterLogs = new logs.LogGroup(this, "SnapshotterLogs", {
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: RemovalPolicy.DESTROY,
    });
    if (LOG_RETENTION_DAYS !== 30) throw new Error("log retention constant and RetentionDays.ONE_MONTH disagree");

    // Roles: inline statements only, no managed policies. Design.md "IAM" table.
    this.scanRole = new iam.Role(this, "ScanRole", {
      assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
      description: "Sexton scan function",
    });
    this.scanRole.addToPolicy(logStatement(scanLogs));
    this.scanRole.addToPolicy(
      new iam.PolicyStatement({ actions: ["dynamodb:GetItem", "dynamodb:PutItem"], resources: [cacheTable.tableArn] }),
    );
    this.scanRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ["dynamodb:Query"],
        resources: [snapshotsTable.tableArn],
        conditions: { "ForAllValues:StringLike": { "dynamodb:LeadingKeys": ["snap#*"] } },
      }),
    );
    this.scanRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ["dynamodb:PutItem"],
        resources: [snapshotsTable.tableArn],
        conditions: { "ForAllValues:StringLike": { "dynamodb:LeadingKeys": ["seen#*"] } },
      }),
    );

    this.snapshotterRole = new iam.Role(this, "SnapshotterRole", {
      assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
      description: "Sexton snapshotter function",
    });
    this.snapshotterRole.addToPolicy(logStatement(snapshotterLogs));
    this.snapshotterRole.addToPolicy(
      new iam.PolicyStatement({ actions: ["dynamodb:GetItem", "dynamodb:PutItem"], resources: [cacheTable.tableArn] }),
    );
    this.snapshotterRole.addToPolicy(
      new iam.PolicyStatement({ actions: ["dynamodb:PutItem", "dynamodb:Query"], resources: [snapshotsTable.tableArn] }),
    );
    this.snapshotterRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ["dynamodb:Query"],
        resources: [`${snapshotsTable.tableArn}/index/${seenIndexName}`],
      }),
    );

    const environment = {
      NODE_OPTIONS: "--enable-source-maps",
      CACHE_TABLE: cacheTable.tableName,
      SNAPSHOTS_TABLE: snapshotsTable.tableName,
      SEEN_INDEX: seenIndexName,
      STAGE: props.stage,
    };

    this.scanFunction = makeFunction(this, "ScanFunction", props.scanCode, {
      description: "Sexton GET /api/scan",
      role: this.scanRole,
      logGroup: scanLogs,
      memorySize: SCAN_MEMORY_MB,
      timeout: Duration.seconds(SCAN_TIMEOUT_SECONDS),
      reservedConcurrentExecutions: SCAN_RESERVED_CONCURRENCY,
      environment,
    });
    this.snapshotterFunction = makeFunction(this, "SnapshotterFunction", props.snapshotterCode, {
      description: "Sexton daily snapshotter",
      role: this.snapshotterRole,
      logGroup: snapshotterLogs,
      memorySize: SNAPSHOTTER_MEMORY_MB,
      timeout: Duration.seconds(SNAPSHOTTER_TIMEOUT_SECONDS),
      reservedConcurrentExecutions: SNAPSHOTTER_RESERVED_CONCURRENCY,
      environment,
    });

    // Function URL, IAM auth: only signed requests from CloudFront (OAC) get through.
    const scanUrl = this.scanFunction.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.AWS_IAM,
      invokeMode: lambda.InvokeMode.BUFFERED,
    });

    // Web bucket: private, versioned, SSL only, read only through CloudFront OAC.
    this.webBucket = new s3.Bucket(this, "WebBucket", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      versioned: true,
      encryption: s3.BucketEncryption.S3_MANAGED,
      objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_ENFORCED,
      removalPolicy: RemovalPolicy.RETAIN,
    });

    const headers = new cloudfront.ResponseHeadersPolicy(this, "SecurityHeaders", {
      comment: "Sexton security headers",
      securityHeadersBehavior: {
        contentSecurityPolicy: { contentSecurityPolicy: CONTENT_SECURITY_POLICY, override: true },
        contentTypeOptions: { override: true },
        frameOptions: { frameOption: cloudfront.HeadersFrameOption.DENY, override: true },
        referrerPolicy: { referrerPolicy: cloudfront.HeadersReferrerPolicy.NO_REFERRER, override: true },
        strictTransportSecurity: {
          accessControlMaxAge: Duration.seconds(HSTS_MAX_AGE_SECONDS),
          includeSubdomains: true,
          override: true,
        },
      },
    });

    const apiOriginRequestPolicy = new cloudfront.OriginRequestPolicy(this, "ApiOriginRequestPolicy", {
      comment: "Sexton API: forward the repo query parameter only",
      queryStringBehavior: cloudfront.OriginRequestQueryStringBehavior.allowList("repo"),
      headerBehavior: cloudfront.OriginRequestHeaderBehavior.none(),
      cookieBehavior: cloudfront.OriginRequestCookieBehavior.none(),
    });

    this.webAcl = buildWebAcl(this);

    this.distribution = new cloudfront.Distribution(this, "Distribution", {
      comment: `Sexton ${props.stage}`,
      defaultRootObject: "index.html",
      httpVersion: cloudfront.HttpVersion.HTTP2_AND_3,
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
      enableIpv6: true,
      webAclId: this.webAcl.attrArn,
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(this.webBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        responseHeadersPolicy: headers,
        compress: true,
      },
      additionalBehaviors: {
        [`${API_PATH_PREFIX}*`]: {
          origin: origins.FunctionUrlOrigin.withOriginAccessControl(scanUrl, {
            readTimeout: Duration.seconds(ORIGIN_READ_TIMEOUT_SECONDS),
            responseCompletionTimeout: Duration.seconds(ORIGIN_COMPLETION_TIMEOUT_SECONDS),
            connectionAttempts: ORIGIN_CONNECTION_ATTEMPTS,
          }),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.HTTPS_ONLY,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          originRequestPolicy: apiOriginRequestPolicy,
          responseHeadersPolicy: headers,
          compress: true,
        },
      },
      errorResponses: [403, 404].map((httpStatus) => ({
        httpStatus,
        responseHttpStatus: 200,
        responsePagePath: "/index.html",
        ttl: Duration.seconds(0),
      })),
    });

    // FunctionUrlOrigin.withOriginAccessControl adds lambda:InvokeFunctionUrl and lambda:InvokeFunction
    // for cloudfront.amazonaws.com, scoped to this distribution. A test asserts both.

    if (props.webAssetPath === null) {
      Annotations.of(this).addWarningV2("sexton:no-web-build", NO_WEB_WARNING);
      this.bucketDeployment = undefined;
    } else {
      this.bucketDeployment = new s3deploy.BucketDeployment(this, "WebDeployment", {
        sources: [s3deploy.Source.asset(props.webAssetPath)],
        destinationBucket: this.webBucket,
        distribution: this.distribution,
        distributionPaths: ["/*"],
        prune: true,
        memoryLimit: 512,
      });
    }

    // Daily snapshotter at 03:17 UTC, no retries.
    new scheduler.Schedule(this, "SnapshotterSchedule", {
      description: "Sexton daily snapshotter",
      schedule: scheduler.ScheduleExpression.cron(SNAPSHOTTER_CRON),
      target: new schedulerTargets.LambdaInvoke(this.snapshotterFunction, { retryAttempts: 0 }),
    });

    // Alarms to one SNS topic with an email subscription from the AlarmEmail parameter.
    this.alarmTopic = new sns.Topic(this, "AlarmTopic", { displayName: "Sexton alarms", enforceSSL: true });
    this.alarmTopic.addSubscription(new snsSubscriptions.EmailSubscription(alarmEmail.valueAsString));
    this.alarms = buildAlarms(this, {
      scanFunction: this.scanFunction,
      snapshotterFunction: this.snapshotterFunction,
      scanLogs,
      cacheTable,
      snapshotsTable,
      seenIndexName,
    });
    const action = new cwActions.SnsAction(this.alarmTopic);
    for (const alarm of this.alarms) alarm.addAlarmAction(action);

    new CfnOutput(this, "DistributionDomainName", { value: this.distribution.distributionDomainName });
    new CfnOutput(this, "DistributionId", { value: this.distribution.distributionId });
    new CfnOutput(this, "WebBucketName", { value: this.webBucket.bucketName });
    new CfnOutput(this, "ScanFunctionName", { value: this.scanFunction.functionName });
    new CfnOutput(this, "SnapshotterFunctionName", { value: this.snapshotterFunction.functionName });
  }
}

/**
 * Log write on the log group ARN itself. CloudFormation's LogGroup Arn attribute already ends in ":*",
 * which covers every stream in the group. Appending ":log-stream:*" to it gives a resource that matches
 * no stream, and Lambda then drops every log line without an error.
 */
function logStatement(group: logs.LogGroup): iam.PolicyStatement {
  return new iam.PolicyStatement({
    actions: ["logs:CreateLogStream", "logs:PutLogEvents"],
    resources: [group.logGroupArn],
  });
}

interface FunctionSettings {
  readonly description: string;
  readonly role: iam.Role;
  readonly logGroup: logs.LogGroup;
  readonly memorySize: number;
  readonly timeout: Duration;
  readonly reservedConcurrentExecutions: number;
  readonly environment: Record<string, string>;
}

function makeFunction(scope: Stack, id: string, code: HandlerCode, settings: FunctionSettings): lambda.Function {
  const common = {
    ...settings,
    runtime: lambda.Runtime.NODEJS_22_X,
    architecture: lambda.Architecture.ARM_64,
  };
  if (code.kind === "placeholder") {
    Annotations.of(scope).addWarningV2(`sexton:placeholder-${id}`, `${id}: ${PLACEHOLDER_WARNING}`);
    return new lambda.Function(scope, id, { ...common, handler: "index.handler", code: lambda.Code.fromInline(PLACEHOLDER_SOURCE) });
  }
  return new nodejs.NodejsFunction(scope, id, {
    ...common,
    entry: code.entry,
    handler: "handler",
    projectRoot: code.projectRoot,
    depsLockFilePath: code.depsLockFilePath,
    bundling: {
      format: nodejs.OutputFormat.ESM,
      target: "node22",
      sourceMap: true,
      minify: true,
      mainFields: ["module", "main"],
      // Bundle the pinned @aws-sdk packages instead of using the SDK the Lambda runtime ships (design.md, Security).
      externalModules: [],
      banner: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);",
      forceDockerBundling: false,
    },
  });
}

function managedGroupRule(name: string, priority: number): wafv2.CfnWebACL.RuleProperty {
  return {
    name,
    priority,
    overrideAction: { none: {} },
    statement: { managedRuleGroupStatement: { vendorName: "AWS", name } },
    visibilityConfig: { cloudWatchMetricsEnabled: true, sampledRequestsEnabled: true, metricName: name },
  };
}

function buildWebAcl(scope: Stack): wafv2.CfnWebACL {
  return new wafv2.CfnWebACL(scope, "WebAcl", {
    scope: "CLOUDFRONT",
    defaultAction: { allow: {} },
    visibilityConfig: { cloudWatchMetricsEnabled: true, sampledRequestsEnabled: true, metricName: "SextonWebAcl" },
    customResponseBodies: {
      [RATE_LIMITED_BODY_KEY]: { contentType: "APPLICATION_JSON", content: RATE_LIMITED_BODY },
    },
    rules: [
      managedGroupRule("AWSManagedRulesCommonRuleSet", 0),
      managedGroupRule("AWSManagedRulesKnownBadInputsRuleSet", 1),
      {
        name: "ApiRateLimit",
        priority: 2,
        // 429 with a JSON body, so the distribution's 403/404 page mapping never rewrites it.
        action: { block: { customResponse: { responseCode: 429, customResponseBodyKey: RATE_LIMITED_BODY_KEY } } },
        statement: {
          rateBasedStatement: {
            limit: RATE_LIMIT.limit,
            evaluationWindowSec: RATE_LIMIT.windowSeconds,
            aggregateKeyType: "IP",
            scopeDownStatement: {
              byteMatchStatement: {
                fieldToMatch: { uriPath: {} },
                positionalConstraint: "STARTS_WITH",
                searchString: API_PATH_PREFIX,
                textTransformations: [{ priority: 0, type: "NONE" }],
              },
            },
          },
        },
        visibilityConfig: { cloudWatchMetricsEnabled: true, sampledRequestsEnabled: true, metricName: "ApiRateLimit" },
      },
    ],
  });
}

interface AlarmInputs {
  readonly scanFunction: lambda.Function;
  readonly snapshotterFunction: lambda.Function;
  readonly scanLogs: logs.LogGroup;
  readonly cacheTable: dynamodb.ITableV2;
  readonly snapshotsTable: dynamodb.ITableV2;
  readonly seenIndexName: string;
}

function buildAlarms(scope: Stack, inputs: AlarmInputs): cloudwatch.Alarm[] {
  const fiveMinutes = Duration.minutes(5);
  const oneDay = Duration.days(1);

  const errors5xx = new logs.MetricFilter(scope, "ScanErrors5xxFilter", {
    logGroup: inputs.scanLogs,
    filterPattern: logs.FilterPattern.all(
      logs.FilterPattern.stringValue("$.msg", "=", "scan"),
      logs.FilterPattern.numberValue("$.status", ">=", 500),
    ),
    metricNamespace: METRIC_NAMESPACE,
    metricName: "ScanErrors5xx",
    metricValue: "1",
    defaultValue: 0,
  }).metric({ statistic: "Sum", period: fiveMinutes });

  const errorRate = new cloudwatch.MathExpression({
    expression: "IF(invocations > 0, 100 * errors / invocations, 0)",
    usingMetrics: {
      errors: errors5xx,
      invocations: inputs.scanFunction.metricInvocations({ statistic: "Sum", period: fiveMinutes }),
    },
    period: fiveMinutes,
    label: "Scan 5xx rate (percent)",
  });

  const snapshotterProblems = new cloudwatch.MathExpression({
    expression: "FILL(failed, 0) + FILL(deferred, 0) + FILL(listingError, 0) + FILL(lambdaErrors, 0)",
    usingMetrics: {
      failed: new cloudwatch.Metric({ namespace: METRIC_NAMESPACE, metricName: "SnapshotterFailed", statistic: "Sum", period: oneDay }),
      deferred: new cloudwatch.Metric({ namespace: METRIC_NAMESPACE, metricName: "SnapshotterDeferred", statistic: "Sum", period: oneDay }),
      listingError: new cloudwatch.Metric({ namespace: METRIC_NAMESPACE, metricName: "SnapshotterError", statistic: "Sum", period: oneDay }),
      lambdaErrors: inputs.snapshotterFunction.metricErrors({ statistic: "Sum", period: oneDay }),
    },
    period: oneDay,
    label: "Snapshotter failures, deferrals and errors",
  });

  const throttleMetric = (metricName: string, dimensionsMap: Record<string, string>): cloudwatch.Metric =>
    new cloudwatch.Metric({ namespace: "AWS/DynamoDB", metricName, dimensionsMap, statistic: "Sum", period: fiveMinutes });
  const cache = { TableName: inputs.cacheTable.tableName };
  const snaps = { TableName: inputs.snapshotsTable.tableName };
  const gsi = { TableName: inputs.snapshotsTable.tableName, GlobalSecondaryIndexName: inputs.seenIndexName };
  const dynamoThrottles = new cloudwatch.MathExpression({
    expression: "FILL(cr, 0) + FILL(cw, 0) + FILL(sr, 0) + FILL(sw, 0) + FILL(gr, 0) + FILL(gw, 0)",
    usingMetrics: {
      cr: throttleMetric("ReadThrottleEvents", cache),
      cw: throttleMetric("WriteThrottleEvents", cache),
      sr: throttleMetric("ReadThrottleEvents", snaps),
      sw: throttleMetric("WriteThrottleEvents", snaps),
      gr: throttleMetric("ReadThrottleEvents", gsi),
      gw: throttleMetric("WriteThrottleEvents", gsi),
    },
    period: fiveMinutes,
    label: "DynamoDB throttle events",
  });

  const notBreaching = cloudwatch.TreatMissingData.NOT_BREACHING;
  const gt = cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD;
  return [
    new cloudwatch.Alarm(scope, "ScanErrorRate", {
      alarmDescription: `Scan 5xx responses above ${SCAN_ERROR_RATE_PERCENT} percent in 5 minutes`,
      metric: errorRate, threshold: SCAN_ERROR_RATE_PERCENT, evaluationPeriods: 1, comparisonOperator: gt, treatMissingData: notBreaching,
    }),
    new cloudwatch.Alarm(scope, "ScanDurationP95", {
      alarmDescription: `Scan duration p95 above ${SCAN_DURATION_P95_MS} ms in 5 minutes`,
      metric: inputs.scanFunction.metricDuration({ statistic: "p95", period: fiveMinutes }),
      threshold: SCAN_DURATION_P95_MS, evaluationPeriods: 1, comparisonOperator: gt, treatMissingData: notBreaching,
    }),
    new cloudwatch.Alarm(scope, "ScanThrottles", {
      alarmDescription: "Scan function throttled in 5 minutes",
      metric: inputs.scanFunction.metricThrottles({ statistic: "Sum", period: fiveMinutes }),
      threshold: 0, evaluationPeriods: 1, comparisonOperator: gt, treatMissingData: notBreaching,
    }),
    new cloudwatch.Alarm(scope, "SnapshotterProblems", {
      alarmDescription: "Snapshotter failed, deferred or errored names in a day",
      metric: snapshotterProblems, threshold: 0, evaluationPeriods: 1, comparisonOperator: gt, treatMissingData: notBreaching,
    }),
    new cloudwatch.Alarm(scope, "DynamoThrottles", {
      alarmDescription: "DynamoDB throttle events on the Sexton tables in 5 minutes",
      metric: dynamoThrottles, threshold: 0, evaluationPeriods: 1, comparisonOperator: gt, treatMissingData: notBreaching,
    }),
  ];
}
