// Bump selector. Spec: .kiro/specs/remediation, Requirements 2.1 to 2.16, HP decisions 2, 3, 8. Pure, no I/O.

import type { Advisory } from "../types.js";
import { orderCandidates } from "./candidates.js";
import { rangeStyle, type RangeStyle } from "./range-style.js";

export interface SelectBumpInput {
  readonly installedVersion: string;
  readonly declaredRange?: string;
  readonly published: readonly string[];
  readonly deprecated: ReadonlySet<string>;
  readonly advisories: ReadonlyMap<string, readonly Advisory[]>;
}

export type SelectBumpResult =
  | {
      readonly outcome: "chosen";
      readonly version: string;
      readonly majorUpgrade: boolean;
      readonly style: RangeStyle;
      readonly evaluated: number;
    }
  | { readonly outcome: "none"; readonly evaluated: number };

/** Passing: not deprecated, has advisory data, and every advisory is Low. Requirement 2.6 to 2.8. */
export function isPassing(version: string, deprecated: ReadonlySet<string>, advisories: ReadonlyMap<string, readonly Advisory[]>): boolean {
  if (deprecated.has(version)) return false;
  const list = advisories.get(version);
  if (list === undefined) return false;
  return list.every((a) => a.severity === "Low");
}

/** The first Passing candidate in Candidate order, or none. Never throws. */
export function selectBump(input: SelectBumpInput): SelectBumpResult {
  try {
    const candidates = orderCandidates(input.installedVersion, input.declaredRange, input.published);
    for (let i = 0; i < candidates.length; i++) {
      const candidate = candidates[i] as (typeof candidates)[number];
      if (isPassing(candidate.version, input.deprecated, input.advisories)) {
        return {
          outcome: "chosen",
          version: candidate.version,
          majorUpgrade: !candidate.inRange,
          style: rangeStyle(input.declaredRange),
          evaluated: i + 1,
        };
      }
    }
    return { outcome: "none", evaluated: candidates.length };
  } catch {
    return { outcome: "none", evaluated: 0 };
  }
}
