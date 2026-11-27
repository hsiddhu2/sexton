// Names, region and limits for the Sexton CDK app. Pure constants and name builders.
// Values are explained in .kiro/specs/infra/design.md.

export const REGION = "us-east-1";
export const STAGE = "dev";

export type StackBase = "SextonData" | "SextonEdge";
export type TableBase = "sexton-cache" | "sexton-snapshots" | "sexton-remediation-log";

export function stackName(base: StackBase, stage: string): string {
  return `${base}-${stage}`;
}

export function tableName(base: TableBase, stage: string): string {
  return `${base}-${stage}`;
}

export function secretName(stage: string): string {
  return `sexton/github-token-${stage}`;
}

export const SEEN_INDEX_NAME = "seen-by-time";

export const SCAN_TIMEOUT_SECONDS = 60;
export const SCAN_MEMORY_MB = 1024;
export const SCAN_RESERVED_CONCURRENCY = 10;
export const SNAPSHOTTER_TIMEOUT_SECONDS = 600;
export const SNAPSHOTTER_MEMORY_MB = 1024;
export const SNAPSHOTTER_RESERVED_CONCURRENCY = 1;

/** EventBridge Scheduler cron fields for 03:17 UTC every day: cron(17 3 * * ? *). */
export const SNAPSHOTTER_CRON = { minute: "17", hour: "3" } as const;
export const SNAPSHOTTER_SCHEDULE_EXPRESSION = "cron(17 3 * * ? *)";

export const ORIGIN_READ_TIMEOUT_SECONDS = 60;
export const ORIGIN_COMPLETION_TIMEOUT_SECONDS = 65;
export const ORIGIN_CONNECTION_ATTEMPTS = 1;

export const RATE_LIMIT = { limit: 100, windowSeconds: 300 } as const;
export const API_PATH_PREFIX = "/api/";

export const LOG_RETENTION_DAYS = 30;

/**
 * Repositories that may receive a Sexton pull request (spec remediate, decision 1). Lower-case owner/repo.
 * Changing it is a code change and a deploy.
 */
export const REMEDIATE_ALLOWLIST: readonly string[] = ["hsiddhu2/sexton-demo"];
export const REMEDIATE_PATH = "/api/remediate";
export const REMEDIATE_TIMEOUT_SECONDS = 60;
export const REMEDIATE_MEMORY_MB = 1024;
export const REMEDIATE_RESERVED_CONCURRENCY = 2;
/** 10 is the lowest limit WAF accepts (waf-rule-statement-type-rate-based-high-level-settings). */
export const REMEDIATE_RATE_LIMIT = { limit: 10, windowSeconds: 300 } as const;

/** Error-rate alarm threshold in percent, over 5 minutes. */
export const SCAN_ERROR_RATE_PERCENT = 5;
/** Duration p95 alarm threshold in milliseconds, over 5 minutes. */
export const SCAN_DURATION_P95_MS = 45_000;

export const METRIC_NAMESPACE = "Sexton";

/** Throws unless the region is us-east-1. Requirement 1.2. */
export function assertRegion(region: string | undefined): string {
  if (region !== REGION) {
    throw new Error(`Sexton deploys only to ${REGION}. Got region: ${region === undefined ? "none" : region}.`);
  }
  return region;
}
