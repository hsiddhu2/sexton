import type { ScanResponse } from "@sexton/api";

export const NO_SCAN_METADATA_TEXT = "no scan metadata in this response";
export const DEMO_LABEL_TEXT = "demo fixture, recorded data";
export const MAX_LISTED_UNLOCKED = 20;

export interface HeaderModel {
  readonly repoText: string;
  readonly demoLabel: string | null;
  readonly scanTime: string;
  readonly unlockedNotice: string | null;
  readonly cappedNotice: string | null;
  readonly policyStatus: "pass" | "fail";
  readonly policyLabel: "default policy" | "policy file";
  readonly failingRules: number;
}

function unlockedNoticeFor(unlocked: boolean, names: readonly string[]): string | null {
  if (unlocked) return "unlocked scan: no lockfile exists, so versions were resolved from declared ranges";
  if (names.length === 0) return null;
  const listed = names.slice(0, MAX_LISTED_UNLOCKED).join(", ");
  const rest = names.length > MAX_LISTED_UNLOCKED ? `, and ${String(names.length - MAX_LISTED_UNLOCKED)} more` : "";
  return `unlocked: ${String(names.length)} packages resolved from declared ranges: ${listed}${rest}`;
}

/** Pure. The demo label comes from isDemo only and never from the repository name. */
export function headerModel(response: ScanResponse, isDemo: boolean): HeaderModel {
  const { report, policy } = response;
  const scan = report.scan;
  return {
    repoText: scan === undefined ? NO_SCAN_METADATA_TEXT : scan.repo.url,
    demoLabel: isDemo ? DEMO_LABEL_TEXT : null,
    scanTime: report.generatedAt,
    unlockedNotice: scan === undefined ? null : unlockedNoticeFor(scan.unlocked, scan.unlockedPackages),
    cappedNotice:
      scan !== undefined && scan.capped
        ? `capped: showing ${String(report.packages.length)} of ${String(scan.totalDirect)} direct dependencies`
        : null,
    policyStatus: policy.pass ? "pass" : "fail",
    policyLabel: policy.source === "default" ? "default policy" : "policy file",
    failingRules: policy.rules.filter((rule) => !rule.pass).length,
  };
}
