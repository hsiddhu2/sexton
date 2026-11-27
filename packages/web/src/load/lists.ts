import type { ApiErrorCode, RemediationStatusList, RuleTypeList, SeverityList, SignalNameList, StateList } from "@sexton/api";

export const STATES = ["Possessed", "Dead", "Haunted", "Restless", "Alive"] as const;
export const SEVERITIES = ["Critical", "High", "Moderate", "Low", "Unknown"] as const;
export const SIGNAL_NAMES = [
  "lastPublish",
  "deprecated",
  "hasInstallScript",
  "advisories",
  "maintainers",
  "provenance",
  "transitiveReach",
  "maintainerChange",
  "provenanceRegression",
  "newInstallScript",
  "publisherChange",
  "newDependency",
] as const;
export const RULE_TYPES = ["forbid_state", "forbid_install_scripts", "max_age_months", "require_provenance"] as const;
export const REMEDIATION_KINDS = ["bump", "remove", "migrate"] as const;
export const REMEDIATION_STATUSES = ["proposed", "no-safe-version", "unavailable"] as const;

/** The API's error codes (packages/api/src/http/responses.ts), mirrored for the failed-scan cards (spec clean-site, 12.3). */
export const API_ERROR_CODES = [
  "invalid-request",
  "method-not-allowed",
  "invalid-url",
  "missing-package-json",
  "invalid-package-json",
  "invalid-lockfile",
  "manifest-too-large",
  "invalid-policy",
  "fetch-failed",
  "internal-error",
  "evidence-too-large",
] as const;

type Same<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Assert<T extends true> = T;

/** Compile-time tie to the contract: a drifted member or order fails type-checking (1.4). */
export type ListsMatchContract = [
  Assert<Same<typeof STATES, StateList>>,
  Assert<Same<typeof SEVERITIES, SeverityList>>,
  Assert<Same<typeof SIGNAL_NAMES, SignalNameList>>,
  Assert<Same<typeof RULE_TYPES, RuleTypeList>>,
  Assert<Same<typeof REMEDIATION_STATUSES, RemediationStatusList>>,
  Assert<Same<(typeof API_ERROR_CODES)[number], ApiErrorCode>>,
];
