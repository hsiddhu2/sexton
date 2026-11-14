// The pure state function. Requirements 2, 11, 12, 13, 14. No I/O here.

import { fromIso, isAvailable } from "./signal.js";
import { STATE_ORDER, type Advisory, type PackageSignals, type State } from "./types.js";

export { STATE_ORDER };

export const DEAD_AFTER_MONTHS = 24;
export const RESTLESS_AFTER_MONTHS = 12;

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
 * Evaluates the state rules in order, first match wins: Dead, Haunted, Restless, Alive.
 * Rules only use conditions whose signals are available. Requirement 11, 14.
 * Possessed is never produced here. Requirement 11.7.
 */
export function evaluateState(inputs: StateInputs, now: Date): StateResult {
  const hasPublish = inputs.lastPublish !== undefined;
  const hasDeprecated = inputs.deprecated !== undefined;
  const hasAdvisories = inputs.advisories !== undefined;

  if (!hasPublish && !hasDeprecated && !hasAdvisories) {
    return { state: "Restless", stateReason: "all state signals unavailable" };
  }

  const publish = inputs.lastPublish ?? null;
  const advisories = inputs.advisories ?? [];
  const nowMs = now.getTime();
  const deadBefore = monthsBefore(now, DEAD_AFTER_MONTHS).getTime();
  const restlessBefore = monthsBefore(now, RESTLESS_AFTER_MONTHS).getTime();
  const publishMs = publish === null ? null : publish.getTime();
  const ageKnown = publishMs !== null && Number.isFinite(publishMs) && publishMs <= nowMs;

  // Dead. Requirement 11.3.
  if (hasDeprecated && inputs.deprecated === true) {
    return { state: "Dead", stateReason: "installed version is deprecated" };
  }
  if (ageKnown && publishMs < deadBefore) {
    return { state: "Dead", stateReason: `last publish more than ${DEAD_AFTER_MONTHS} months ago` };
  }

  // Haunted. Requirement 11.4.
  if (hasAdvisories && advisories.some((a) => a.severity === "Critical" || a.severity === "High")) {
    return { state: "Haunted", stateReason: "advisory of severity High or Critical" };
  }

  // Restless. Requirement 11.5.
  if (ageKnown && publishMs <= restlessBefore) {
    return { state: "Restless", stateReason: `last publish between ${RESTLESS_AFTER_MONTHS} and ${DEAD_AFTER_MONTHS} months ago` };
  }
  if (hasAdvisories && advisories.some((a) => a.severity === "Moderate" || a.severity === "Low")) {
    return { state: "Restless", stateReason: "advisory of severity Moderate or Low" };
  }

  // Alive. Requirement 11.6.
  return { state: "Alive", stateReason: "no rule matched" };
}

/** Adapts signal envelopes to state inputs and evaluates. ISO at the boundary, Date inside. Requirement 2. */
export function stateFromSignals(
  signals: Pick<PackageSignals, "lastPublish" | "deprecated" | "advisories">,
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
  return evaluateState(inputs, now);
}
