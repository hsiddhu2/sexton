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
import type { RemediationEntry, REMEDIATION_STATUSES } from "@sexton/engine";

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
}
