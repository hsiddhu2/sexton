// Timeline types. Spec cemetery-time, requirements 8 to 10. No I/O here.

import type { Severity, State } from "../types.js";

export const TIMELINE_MAX_VERSIONS = 50;
export const TIMELINE_MAX_ADVISORIES = 20;
export const TIMELINE_MAX_MAINTAINERS = 10;
export const TIMELINE_MAX_SEGMENTS = 64;

/** One version of a package with its dated facts. A null flag means unknown, not false. */
export interface TimelineVersion {
  readonly version: string;
  /** ISO. Null only in hand-built facts. */
  readonly publishedAt: string | null;
  readonly installScript: boolean | null;
  readonly provenance: boolean | null;
  /** At most 10 names. */
  readonly maintainers: readonly string[] | null;
}

export interface TimelineAdvisory {
  readonly id: string;
  readonly severity: Severity;
  readonly summary: string;
  /** ISO. */
  readonly publishedAt: string;
}

export interface TimelineFacts {
  readonly installed: string;
  /** Version order, at most 50, the installed version included. */
  readonly versions: readonly TimelineVersion[];
  /** Set when older versions were dropped. ISO. */
  readonly coveredFrom: string | null;
  /** Null means unavailable before the scan date. At most 20. */
  readonly advisories: readonly TimelineAdvisory[] | null;
}

/** What a grave shows: one State or the Not-published form (state null), and whether it has a Ghost. */
export interface Form {
  readonly state: State | null;
  readonly reason: string;
  readonly ghost: boolean;
}

export interface StateAsOf {
  readonly form: Form;
  /** Facts that could not be used for this instant. */
  readonly unavailable: readonly string[];
}

export interface TimelineSegment {
  /** ISO. */
  readonly from: string;
  readonly state: State | null;
  /** At most 200 characters. */
  readonly reason: string;
  readonly ghost: boolean;
  /** Optional, at most 100 characters. Set only by the replay generator. buildTimeline never sets it. */
  readonly version?: string;
}

export interface PackageTimeline {
  readonly installed: string;
  readonly coveredFrom: string | null;
  readonly segments: readonly TimelineSegment[];
}
