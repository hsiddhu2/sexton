// Core data shapes for the Sexton engine. Spec: .kiro/specs/health-scoring, Requirements 1, 3, 10, 11.

/** A signal whose upstream read succeeded. Requirement 1.2. */
export interface AvailableSignal<T> {
  readonly value: T;
  readonly source: string;
  readonly fetchedAt: string;
  readonly available: true;
}

/** A signal whose upstream read failed after all retries. Requirement 1.3. */
export interface UnavailableSignal {
  readonly value: null;
  readonly source: string;
  readonly fetchedAt: string;
  readonly available: false;
  readonly reason: string;
}

/** The uniform signal envelope. Requirement 1.1. Never a bare value. */
export type Signal<T> = AvailableSignal<T> | UnavailableSignal;

export const SEVERITIES = ["Critical", "High", "Moderate", "Low", "Unknown"] as const;
export type Severity = (typeof SEVERITIES)[number];

export interface Advisory {
  readonly id: string;
  readonly severity: Severity;
  readonly summary: string;
}

/** States from least healthy to most healthy. Requirement 13.1. */
export const STATE_ORDER = ["Possessed", "Dead", "Haunted", "Restless", "Alive"] as const;
export type State = (typeof STATE_ORDER)[number];

/** The four original signals. Requirement 10.5 of health-scoring, 10.1 of history-signals. */
export interface OriginalSignals {
  /** ISO 8601 instant of the most recent publish across all versions, or null when no version date parses. */
  readonly lastPublish: Signal<string | null>;
  readonly deprecated: Signal<boolean>;
  readonly hasInstallScript: Signal<boolean>;
  readonly advisories: Signal<readonly Advisory[]>;
}

// Types for the history-signals spec (.kiro/specs/history-signals).

/** The four original signal names. history-signals Requirement 10.1. */
export const ORIGINAL_SIGNAL_NAMES = ["lastPublish", "deprecated", "hasInstallScript", "advisories"] as const;

/** The six new signal names. history-signals Requirement 10.1. */
export const NEW_SIGNAL_NAMES = [
  "maintainers",
  "provenance",
  "transitiveReach",
  "maintainerChange",
  "provenanceRegression",
  "newInstallScript",
] as const;

/** All ten signal names, derived so the lists cannot drift. Requirement 10.1. */
export const SIGNAL_NAMES = [...ORIGINAL_SIGNAL_NAMES, ...NEW_SIGNAL_NAMES] as const;
export type SignalName = (typeof SIGNAL_NAMES)[number];

/** Value of the provenance signal. Requirement 2.2, 2.3. */
export interface ProvenanceValue {
  readonly present: boolean;
  /** The SLSA predicateType when present, else null. */
  readonly predicateType: string | null;
}

/** Value of the transitiveReach signal. Requirement 3.3. */
export interface TransitiveReachValue {
  /** Non-negative integer. */
  readonly reach: number;
  readonly graphsMissing: number;
}

/** One maintainer change derived from history. Requirement 6.5. */
export interface MaintainerChangeEvent {
  readonly kind: "snapshot-pair" | "live";
  readonly before: readonly string[];
  readonly after: readonly string[];
  /** ISO 8601 UTC. */
  readonly eventTime: string;
  /** Recent (90 days) per Requirement 6.6. */
  readonly recent: boolean;
}

/** Value of the maintainerChange signal. Requirement 6.4, 6.5. */
export type MaintainerChangeValue =
  | { readonly status: "history-insufficient"; readonly events: readonly [] }
  | { readonly status: "history-sufficient"; readonly events: readonly MaintainerChangeEvent[] };

/** Value of the provenanceRegression signal. Requirement 7.2, 7.3, 7.4, 7.5. */
export type ProvenanceRegressionValue =
  | {
      readonly status: "regression";
      readonly installedVersion: string;
      readonly earlierVersion: string;
      readonly snapshotCaptureTime: string;
    }
  | { readonly status: "no-regression"; readonly snapshotCaptureTime: string }
  | { readonly status: "history-insufficient"; readonly reason: string };

/** A version that gained an install script in the last 90 days. Requirement 8.2. */
export interface NewInstallScriptEvent {
  readonly version: string;
  /** ISO 8601 UTC. */
  readonly publishTime: string;
}

/** The six new signals. Requirement 10.1, 10.2. */
export interface NewSignals {
  readonly maintainers: Signal<readonly string[]>;
  readonly provenance: Signal<ProvenanceValue>;
  readonly transitiveReach: Signal<TransitiveReachValue>;
  readonly maintainerChange: Signal<MaintainerChangeValue>;
  readonly provenanceRegression: Signal<ProvenanceRegressionValue>;
  readonly newInstallScript: Signal<readonly NewInstallScriptEvent[]>;
}

/** All ten signals. Requirement 10.1. */
export type PackageSignals = OriginalSignals & NewSignals;

export interface PackageRef {
  readonly name: string;
  readonly installedVersion: string;
}

export interface PackageHealth extends PackageRef {
  readonly state: State;
  /** The rule that matched. Requirement 7.1 of the handoff spec. */
  readonly stateReason: string;
  readonly signals: PackageSignals;
  readonly missingSignals: readonly SignalName[];
}

export interface HealthReport {
  readonly generatedAt: string;
  readonly packages: readonly PackageHealth[];
}

// Types for the policy spec (.kiro/specs/policy).

export const RULE_TYPES = ["forbid_state", "forbid_install_scripts", "max_age_months", "require_provenance"] as const;
export type RuleType = (typeof RULE_TYPES)[number];

export interface Matchers {
  readonly matchPackageNames?: readonly string[];
  /** Plain strings, validated at parse time. */
  readonly matchPackagePatterns?: readonly string[];
  readonly excludePackageNames?: readonly string[];
}

interface RuleBase extends Matchers {
  /** 1 to 80 characters. */
  readonly name?: string;
}

export interface ForbidStateRule extends RuleBase {
  readonly type: "forbid_state";
  readonly states: readonly State[];
}
export interface ForbidInstallScriptsRule extends RuleBase {
  readonly type: "forbid_install_scripts";
  readonly allow?: readonly string[];
}
export interface MaxAgeMonthsRule extends RuleBase {
  readonly type: "max_age_months";
  readonly months: number;
}
export interface RequireProvenanceRule extends RuleBase {
  readonly type: "require_provenance";
  readonly packages: readonly string[];
}
export type Rule = ForbidStateRule | ForbidInstallScriptsRule | MaxAgeMonthsRule | RequireProvenanceRule;

/** Only schema keys. */
export interface Policy {
  readonly version: 1;
  readonly rules: readonly Rule[];
}

export const ERROR_CODES = [
  "YAML_SYNTAX",
  "MULTIPLE_DOCUMENTS",
  "DUPLICATE_KEY",
  "NOT_OBJECT",
  "MISSING_FIELD",
  "VERSION_UNSUPPORTED",
  "UNKNOWN_RULE_TYPE",
  "UNKNOWN_FIELD",
  "WRONG_TYPE",
  "EMPTY_LIST",
  "INVALID_MONTHS",
  "INVALID_WILDCARD",
  "INVALID_PATTERN",
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

export interface ValidationError {
  /** JSON Pointer, "" for the document, "$" for the text as a whole. */
  readonly path: string;
  readonly message: string;
  readonly code: ErrorCode;
}

export type ParseResult =
  | { readonly ok: true; readonly policy: Policy }
  | { readonly ok: false; readonly errors: readonly [ValidationError, ...ValidationError[]] };

export type PolicySource = "default" | "file";

export interface Failure {
  readonly name: string;
  readonly installedVersion: string;
  /** "state" for forbid_state, else the signal name. */
  readonly signal: "state" | "hasInstallScript" | "lastPublish" | "provenance";
  /** State name, true, ISO string, or provenance value. */
  readonly value: string | boolean | ProvenanceValue;
  /** Null for the state rule. */
  readonly source: string | null;
  /** generatedAt for the state rule. */
  readonly fetchedAt: string;
  readonly reason: string;
  /** max_age_months only. ISO instant of the age boundary. */
  readonly boundary?: string;
}

export interface Unevaluated {
  readonly name: string;
  readonly installedVersion: string;
  readonly signal: "hasInstallScript" | "lastPublish" | "provenance";
  readonly reason: string;
}

/** Internal. The shared return type of the four rule functions. */
export interface RuleOutcome {
  readonly failures: readonly Failure[];
  readonly unevaluated: readonly Unevaluated[];
  readonly notFound: readonly string[];
}

export interface RuleResult {
  readonly index: number;
  readonly type: RuleType;
  /** Key absent when the rule has no name. */
  readonly name?: string;
  readonly pass: boolean;
  readonly failures: readonly Failure[];
  readonly unevaluated: readonly Unevaluated[];
  /** Empty except for require_provenance. */
  readonly notFound: readonly string[];
}

export interface PolicyResult {
  readonly source: PolicySource;
  readonly pass: boolean;
  readonly rules: readonly RuleResult[];
}
