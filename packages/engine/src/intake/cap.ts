// Dependency cap. Spec: .kiro/specs/repo-intake, Requirement 6 (R-IN-4). Pure.

export const MAX_DIRECT_DEPENDENCIES = 300;

export interface CapResult<T> {
  readonly packages: readonly T[];
  readonly capped: boolean;
  readonly totalDirect: number;
}

/** Keeps the first `max` entries in order. totalDirect is the length before the cap. */
export function applyCap<T>(list: readonly T[], max: number = MAX_DIRECT_DEPENDENCIES): CapResult<T> {
  return {
    packages: list.slice(0, max),
    capped: list.length > max,
    totalDirect: list.length,
  };
}
