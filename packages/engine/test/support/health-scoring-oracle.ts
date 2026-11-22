// Health-scoring rule table. It follows the state rules without the Possessed rules.
// It was rewritten for spec state-age-rule, because the rule it mirrors changed
// (age alone gives Restless, Dead needs deprecation or age with an advisory).
// Test support only, not production code. Used by Property 12 (task 4.4).
// Requirements 10.6, 9.11.

import type { Advisory, State } from "../../src/types.js";

export const STALE_AFTER_MONTHS = 24;

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
  const staleBefore = monthsBefore(now, STALE_AFTER_MONTHS).getTime();
  const publishMs = publish === null ? null : publish.getTime();
  const stale =
    publishMs !== null && Number.isFinite(publishMs) && publishMs <= nowMs && publishMs < staleBefore;
  const anyAdvisory = hasAdvisories && advisories.length > 0;
  const severe = hasAdvisories && advisories.some((a) => a.severity === "Critical" || a.severity === "High");
  const mild = hasAdvisories && advisories.some((a) => a.severity === "Moderate" || a.severity === "Low");

  if (hasDeprecated && inputs.deprecated === true) {
    return { state: "Dead", stateReason: "installed version is deprecated" };
  }
  if (stale && anyAdvisory) {
    return { state: "Dead", stateReason: "no release in 24 months and an open advisory" };
  }
  if (severe) {
    return { state: "Haunted", stateReason: "advisory of severity High or Critical" };
  }
  if (stale) {
    return { state: "Restless", stateReason: "no release in 24 months" };
  }
  if (mild) {
    return { state: "Restless", stateReason: "advisory of severity Moderate or Low" };
  }
  return { state: "Alive", stateReason: "no rule matched" };
}

export { evaluateState as oracleEvaluateState };
