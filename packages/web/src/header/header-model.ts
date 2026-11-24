import type { ScanResponse } from "@sexton/api";

export const NO_SCAN_METADATA_TEXT = "no scan metadata in this response";
export const DEMO_LABEL_TEXT = "demo fixture, recorded data";
export const MAX_LISTED_UNLOCKED = 20;
export const DEMO_EVIDENCE_LINKS: EvidenceLinks = { json: "/demo/evidence.json", markdown: "/demo/evidence.md" };

/** Download addresses of the evidence pack. Spec evidence-pack, Requirement 8.2. */
export interface EvidenceLinks {
  readonly json: string;
  readonly markdown: string;
}

export interface HeaderModel {
  readonly repoText: string;
  readonly demoLabel: string | null;
  readonly scanTime: string;
  readonly unlockedNotice: string | null;
  readonly cappedNotice: string | null;
  readonly policyStatus: "pass" | "fail";
  readonly policyLabel: "default policy" | "policy file";
  readonly failingRules: number;
  readonly evidenceLinks: EvidenceLinks | null;
  /** False on a replay: its policy result is for the replay's end time, not for the date the scrubber shows. */
  readonly showPolicy: boolean;
}

function unlockedNoticeFor(unlocked: boolean, names: readonly string[]): string | null {
  if (unlocked) return "unlocked scan: no lockfile exists, so versions were resolved from declared ranges";
  if (names.length === 0) return null;
  const listed = names.slice(0, MAX_LISTED_UNLOCKED).join(", ");
  const rest = names.length > MAX_LISTED_UNLOCKED ? `, and ${String(names.length - MAX_LISTED_UNLOCKED)} more` : "";
  return `unlocked: ${String(names.length)} packages resolved from declared ranges: ${listed}${rest}`;
}

/**
 * Demo links for the demo, API links for a scan requested through the repository form (hostedApiBase set), else none.
 * The repository URL in an API link is the canonical URL from the scan metadata, encoded. Pure, no fetch.
 */
function evidenceLinksFor(response: ScanResponse, isDemo: boolean, hostedApiBase: string | null): EvidenceLinks | null {
  if (response.replay !== undefined) return null; // a replay is not a scan: no downloads
  if (isDemo) return DEMO_EVIDENCE_LINKS;
  const scan = response.report.scan;
  if (hostedApiBase === null || scan === undefined) return null;
  const base = `${hostedApiBase}/evidence?repo=${encodeURIComponent(scan.repo.url)}`;
  return { json: `${base}&format=json`, markdown: `${base}&format=md` };
}

/**
 * Pure. The demo label comes from isDemo only and never from the repository name. A replay shows its title in place
 * of the repository and hides the policy line.
 */
export function headerModel(response: ScanResponse, isDemo: boolean, hostedApiBase: string | null = null): HeaderModel {
  const { report, policy } = response;
  const scan = report.scan;
  return {
    repoText: response.replay !== undefined ? response.replay.title : scan === undefined ? NO_SCAN_METADATA_TEXT : scan.repo.url,
    demoLabel: isDemo && response.replay === undefined ? DEMO_LABEL_TEXT : null,
    scanTime: report.generatedAt,
    unlockedNotice: scan === undefined ? null : unlockedNoticeFor(scan.unlocked, scan.unlockedPackages),
    cappedNotice:
      scan !== undefined && scan.capped
        ? `capped: showing ${String(report.packages.length)} of ${String(scan.totalDirect)} direct dependencies`
        : null,
    policyStatus: policy.pass ? "pass" : "fail",
    policyLabel: policy.source === "default" ? "default policy" : "policy file",
    failingRules: policy.rules.filter((rule) => !rule.pass).length,
    evidenceLinks: evidenceLinksFor(response, isDemo, hostedApiBase),
    showPolicy: response.replay === undefined,
  };
}
