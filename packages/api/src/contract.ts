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

export const REMEDIATION_KINDS = ["bump", "remove", "migrate"] as const;
export type RemediationKind = (typeof REMEDIATION_KINDS)[number];

/** Placeholder. A later remediation spec replaces it. */
export interface RemediationEntry {
  readonly packageName: string;
  readonly kind: RemediationKind;
  readonly title: string;
  readonly prBody: string;
}

export interface ScanResponse {
  readonly report: HealthReport;
  readonly policy: PolicyResult;
  readonly remediations?: readonly RemediationEntry[];
}
