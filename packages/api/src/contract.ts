import type {
  Advisory,
  Failure,
  HealthReport,
  PackageHealth,
  PackageSignals,
  PolicyResult,
  RepoRef,
  RULE_TYPES,
  RuleResult,
  ScanMetadata,
  SEVERITIES,
  Severity,
  Signal,
  SIGNAL_NAMES,
  SignalName,
  State,
  STATE_ORDER,
} from "@sexton/engine";
import type { Form, PackageTimeline, RemediationEntry, RemediationKind, REMEDIATION_STATUSES, TimelineSegment } from "@sexton/engine";

// Spec cemetery-time, 8.11 and 8.15: the Timeline shapes live in the engine.
export type { Form, PackageTimeline, TimelineSegment };

export type {
  Advisory,
  Failure,
  HealthReport,
  PackageHealth,
  PackageSignals,
  PolicyResult,
  RepoRef,
  RuleResult,
  ScanMetadata,
  Severity,
  Signal,
  SignalName,
  State,
};

/** The ordered list types, so web can fail type-checking when its literal lists drift (1.4). */
export type SignalNameList = typeof SIGNAL_NAMES;
export type StateList = typeof STATE_ORDER;
export type SeverityList = typeof SEVERITIES;
export type RuleTypeList = typeof RULE_TYPES;

// Remediation shapes live in the engine (spec remediation, Requirement 7.1); the contract re-exports them.
// Spec migration-node-sass, Requirement 7.1: PrIntent carries one or more Edits and review comments.
export type { PackageJsonEdit, PrIntent, RemediationEntry, RemediationKind, RemediationStatus, ReviewComment } from "@sexton/engine";
export { REMEDIATION_KINDS, REMEDIATION_STATUSES } from "@sexton/engine";
export type RemediationStatusList = typeof REMEDIATION_STATUSES;

// The evidence pack lives in the engine (spec evidence-pack, decision 2); the contract re-exports it.
export type { EvidencePack, EvidenceBody, EvidenceIntegrity, EvidenceScan, EvidencePlan, CycloneDxBom } from "@sexton/engine";

export interface ScanResponse {
  readonly report: HealthReport;
  readonly policy: PolicyResult;
  readonly remediations?: readonly RemediationEntry[];
  /** Spec remediate, Requirement 7.2: true only for a repository on the remediate allowlist. */
  readonly actions?: { readonly remediate: boolean };
  /** Spec cemetery-time, 8.11: one Timeline per package, keyed by package name. Absent on the evidence path. */
  readonly timelines?: Readonly<Record<string, PackageTimeline>>;
  /** Spec cemetery-time, 14.3: the latest pull request the remediation log holds for a package. */
  readonly pullRequests?: readonly PullRequestMark[];
  /** Spec cemetery-time, 17: set only on a replay fixture. */
  readonly replay?: ReplayInfo;
  /** Spec cemetery-time-fixes, 6.1: set by the hosted scan's size guard in place of timelines. */
  readonly timelinesOmitted?: "too-large";
}

export interface PullRequestMark {
  readonly package: string;
  readonly kind: RemediationKind;
  readonly prUrl: string;
  readonly timestamp: string;
}

export interface ReplayInfo {
  readonly id: "axios" | "keyv";
  readonly title: string;
  readonly summary: string;
  readonly sources: readonly { readonly label: string; readonly url: string }[];
}
