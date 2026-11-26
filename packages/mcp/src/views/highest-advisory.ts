// Highest advisory severity of a package, or null. Spec: .kiro/specs/sexton-power, Requirement 3.1. Pure.
import { SEVERITIES, type PackageHealth, type Severity } from "@sexton/engine";

export function highestAdvisory(pkg: PackageHealth): Severity | null {
  const signal = pkg.signals.advisories;
  if (!signal.available) return null;
  return SEVERITIES.find((severity) => signal.value.some((a) => a.severity === severity)) ?? null;
}
