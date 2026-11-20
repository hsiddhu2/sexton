// Scan metadata for a HealthReport. Requirements 9.2 to 9.4, 9.10. Pure.

import type { HealthReport, IntakeSuccess, ScanMetadata } from "../types.js";

/** Builds the scan metadata from a successful intake. Fresh copies, the eight named fields, no packages list. */
export function scanMetadata(intake: IntakeSuccess): ScanMetadata {
  return {
    repo: { ...intake.repo },
    unlocked: intake.unlocked,
    unlockedPackages: [...intake.unlockedPackages],
    lockfileVersion: intake.lockfileVersion,
    capped: intake.capped,
    totalDirect: intake.totalDirect,
    skipped: { ...intake.skipped },
    unresolved: [...intake.unresolved],
  };
}

/** Returns a new report with the scan field set. Mutates neither argument. */
export function attachScan(report: HealthReport, scan: ScanMetadata): HealthReport {
  return { ...report, scan };
}
