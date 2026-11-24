// Builds the Timelines of a scan response. Spec cemetery-time, requirements 8.11, 8.12, 8.14.
// Reads no packument: the documents come from the scoring sink. OSV dates come from the cache.

import {
  buildTimeline,
  fetchAdvisoryPublished,
  mapWithConcurrency,
  timelineFacts,
  type ClientContext,
  type HealthReport,
  type PackageTimeline,
  type TimelineSinkInput,
} from "@sexton/engine";

export type TimelineInput = TimelineSinkInput;

const TIMELINE_CONCURRENCY = 8;

/**
 * One Timeline per package. A package whose build throws is omitted and the rest stay.
 * The result has own properties only, so a package named `__proto__` is a plain key.
 */
export async function buildTimelines(
  ctx: ClientContext,
  report: HealthReport,
  inputs: ReadonlyMap<string, TimelineInput>,
  scanDate: Date,
): Promise<Record<string, PackageTimeline>> {
  const entries = await mapWithConcurrency(report.packages, TIMELINE_CONCURRENCY, async (health) => {
    try {
      const input = inputs.get(health.name);
      if (input === undefined) return null;
      const advisories = health.signals.advisories;
      const dates = new Map<string, string | null>();
      if (advisories.available) {
        for (const advisory of advisories.value) dates.set(advisory.id, await fetchAdvisoryPublished(ctx, advisory.id));
      }
      const facts = timelineFacts({
        fullPackument: input.fullPackument,
        abbreviatedPackument: input.abbreviatedPackument,
        installed: input.installedVersion,
        provenance: input.provenance,
        advisories,
        advisoryDates: dates,
        scanDate,
      });
      return [health.name, buildTimeline(facts, health, scanDate)] as const;
    } catch {
      return null;
    }
  });
  return Object.fromEntries(entries.filter((e): e is readonly [string, PackageTimeline] => e !== null));
}
