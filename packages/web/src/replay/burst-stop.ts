// The Burst Stop of a replay (spec cemetery-undead-2, requirement 9.4): the first Stop at which its one grave's Form
// is Possessed, found from the Segments, never a date in the code. Pure.
import type { PackageHealth, ScanResponse } from "@sexton/api";
import { hasGhost } from "../scene/layout.js";
import { formAt, timelineOf } from "../time/form-at.js";
import { stopsFor } from "../time/stops.js";

export const BURST_CAPTION = "The wind stops. A grave opens.";

/** The Burst Stop in ms, or null for a scan that is not a replay, or a replay with no Possessed Stop. */
export function burstStopFor(response: ScanResponse, order: readonly PackageHealth[]): number | null {
  if (response.replay === undefined || order.length !== 1) return null;
  const pkg = order[0];
  if (pkg === undefined) return null;
  const timeline = timelineOf(response, pkg.name);
  if (timeline === undefined) return null;
  for (const stop of stopsFor(response).stops) {
    const view = formAt(timeline, stop, { state: pkg.state, reason: pkg.stateReason, ghost: hasGhost(pkg) });
    if (view.state === "Possessed") return stop;
  }
  return null;
}
