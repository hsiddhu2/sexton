// The pure state function. Requirements 2, 11, 12, 13, 14. No I/O here.

import { fromIso, isAvailable } from "./signal.js";
import {
  STATE_ORDER,
  type Advisory,
  type MaintainerChangeValue,
  type NewInstallScriptEvent,
  type NewSignals,
  type PackageSignals,
  type ProvenanceRegressionValue,
  type State,
} from "./types.js";

export { STATE_ORDER };

/** A last publish strictly older than this many months is stale. Spec state-age-rule. */
export const STALE_AFTER_MONTHS = 24;

/** Health rank: Possessed 0, Dead 1, Haunted 2, Restless 3, Alive 4. Requirement 13.1. */
export function healthRank(state: State): number {
  return STATE_ORDER.indexOf(state);
}

/**
 * Inputs to the state function. A field set to undefined means the signal is unavailable.
 * lastPublish null means the registry had no parseable version date. Requirement 2.2, 11.8.
 */
export interface StateInputs {
  readonly lastPublish?: Date | null;
  readonly deprecated?: boolean;
  readonly advisories?: readonly Advisory[];
  /** Possession inputs. undefined means unavailable. Requirement 9. */
  readonly maintainerChange?: MaintainerChangeValue;
  readonly provenanceRegression?: ProvenanceRegressionValue;
  readonly newInstallScript?: readonly NewInstallScriptEvent[];
}

export interface StateResult {
  readonly state: State;
  readonly stateReason: string;
}

/** Subtracts whole calendar months in UTC. */
export function monthsBefore(now: Date, months: number): Date {
  const d = new Date(now.getTime());
  d.setUTCMonth(d.getUTCMonth() - months);
  return d;
}

/**
 * Evaluates the state rules in order, first match wins: Possessed, Dead, Haunted, Restless, Alive.
 * Age alone never gives Dead: Dead needs deprecation, or staleness together with an advisory.
 * Rules only use conditions whose signals are available. Requirement 9, 11, 14, as corrected
 * by spec state-age-rule.
 * Possessed comes only from the three Possession inputs. Requirement 9.8.
 */
export function evaluateState(inputs: StateInputs, now: Date): StateResult {
  // Possessed, first, before the all-unavailable shortcut. Requirement 9.1, 9.12.
  if (inputs.maintainerChange?.events.some((e) => e.recent) === true) {
    return { state: "Possessed", stateReason: "maintainer change in the last 90 days" };
  }
  const regression = inputs.provenanceRegression;
  if (regression?.status === "regression") {
    return {
      state: "Possessed",
      stateReason: `provenance regression: ${regression.installedVersion} has no provenance, ${regression.earlierVersion} had it`,
    };
  }
  const added = inputs.newInstallScript?.[0];
  if (added !== undefined) {
    return { state: "Possessed", stateReason: `install script added in ${added.version}` };
  }

  const hasPublish = inputs.lastPublish !== undefined;
  const hasDeprecated = inputs.deprecated !== undefined;
  const hasAdvisories = inputs.advisories !== undefined;

  if (!hasPublish && !hasDeprecated && !hasAdvisories) {
    return { state: "Restless", stateReason: "all state signals unavailable" };
  }

  const publish = inputs.lastPublish ?? null;
  const advisories = inputs.advisories ?? [];
  const nowMs = now.getTime();
  const staleBefore = monthsBefore(now, STALE_AFTER_MONTHS).getTime();
  const publishMs = publish === null ? null : publish.getTime();
  const ageKnown = publishMs !== null && Number.isFinite(publishMs) && publishMs <= nowMs;
  const stale = ageKnown && publishMs < staleBefore;
  const hasAdvisory = hasAdvisories && advisories.length > 0;

  // Dead: deprecated, or stale with an open advisory of any severity. Requirement 11.3 as corrected.
  if (hasDeprecated && inputs.deprecated === true) {
    return { state: "Dead", stateReason: "installed version is deprecated" };
  }
  if (stale && hasAdvisory) {
    return { state: "Dead", stateReason: `no release in ${STALE_AFTER_MONTHS} months and an open advisory` };
  }

  // Haunted. Requirement 11.4.
  if (hasAdvisories && advisories.some((a) => a.severity === "Critical" || a.severity === "High")) {
    return { state: "Haunted", stateReason: "advisory of severity High or Critical" };
  }

  // Restless: stale on its own, or a Moderate or Low advisory. Requirement 11.5 as corrected.
  if (stale) {
    return { state: "Restless", stateReason: `no release in ${STALE_AFTER_MONTHS} months` };
  }
  if (hasAdvisories && advisories.some((a) => a.severity === "Moderate" || a.severity === "Low")) {
    return { state: "Restless", stateReason: "advisory of severity Moderate or Low" };
  }

  // Alive. Requirement 11.6.
  return { state: "Alive", stateReason: "no rule matched" };
}

/** Adapts signal envelopes to state inputs and evaluates. ISO at the boundary, Date inside. Requirement 2. */
export function stateFromSignals(
  signals: Pick<PackageSignals, "lastPublish" | "deprecated" | "advisories"> &
    Partial<Pick<NewSignals, "maintainerChange" | "provenanceRegression" | "newInstallScript">>,
  now: Date,
): StateResult {
  const inputs: { -readonly [K in keyof StateInputs]: StateInputs[K] } = {};
  if (isAvailable(signals.lastPublish)) {
    inputs.lastPublish = signals.lastPublish.value === null ? null : fromIso(signals.lastPublish.value);
  }
  if (isAvailable(signals.deprecated)) {
    inputs.deprecated = signals.deprecated.value;
  }
  if (isAvailable(signals.advisories)) {
    inputs.advisories = signals.advisories.value;
  }
  if (signals.maintainerChange !== undefined && isAvailable(signals.maintainerChange)) {
    inputs.maintainerChange = signals.maintainerChange.value;
  }
  if (signals.provenanceRegression !== undefined && isAvailable(signals.provenanceRegression)) {
    inputs.provenanceRegression = signals.provenanceRegression.value;
  }
  if (signals.newInstallScript !== undefined && isAvailable(signals.newInstallScript)) {
    inputs.newInstallScript = signals.newInstallScript.value;
  }
  return evaluateState(inputs, now);
}
