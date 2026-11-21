// Plain one-line text for entry titles and summaries. Spec: .kiro/specs/remediation, Requirement 7.4. Pure.

import { cutUnits, neutralise } from "./escape-field.js";

export function cleanLine(value: string, maxCodePoints: number): string {
  return cutUnits(Array.from(neutralise(value)), () => 1, maxCodePoints);
}
