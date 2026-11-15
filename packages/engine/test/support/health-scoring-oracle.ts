// FROZEN health-scoring rule table. This is a verbatim copy of evaluateState from
// src/state.ts as it was before the Possessed rule was added. It must never change.
// Test support only, not production code. Used by Property 12 (task 4.4).
// Requirements 10.6, 9.11.

import type { Advisory, State } from "../../src/types.js";

export const DEAD_AFTER_MONTHS = 24;
export const RESTLESS_AFTER_MONTHS = 12;

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

export { evaluateState as oracleEvaluateState };
