// Unhealthy states. Spec: .kiro/specs/remediation, Requirement 1.2. Pure.

import type { State, UnhealthyState } from "../types.js";

export function isUnhealthy(state: State): state is UnhealthyState {
  return state === "Possessed" || state === "Dead" || state === "Haunted";
}
