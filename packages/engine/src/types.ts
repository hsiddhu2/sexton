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

export const SIGNAL_NAMES = ["lastPublish", "deprecated", "hasInstallScript", "advisories"] as const;
export type SignalName = (typeof SIGNAL_NAMES)[number];

/** The four signals recorded for every package. Requirement 10.5. */
export interface PackageSignals {
  /** ISO 8601 instant of the most recent publish across all versions, or null when no version date parses. */
  readonly lastPublish: Signal<string | null>;
  readonly deprecated: Signal<boolean>;
  readonly hasInstallScript: Signal<boolean>;
  readonly advisories: Signal<readonly Advisory[]>;
}

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
