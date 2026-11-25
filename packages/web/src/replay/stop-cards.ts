import type { ScanResponse, State } from "@sexton/api";
import { formAt, timelineOf } from "../time/form-at.js";

/** One Stop of a replay, as its card in the Footer bar shows it (K2d fix 1). */
export interface StopCard {
  readonly name: string;
  readonly version: string | null;
  readonly state: State | null;
}

/**
 * Pure. The card of each Stop of a replay: the one package's version and State at that Stop, from its Segments.
 * Null for any response that is not a replay of one package.
 */
export function stopCards(response: ScanResponse, stops: readonly number[]): readonly StopCard[] | null {
  const pkg = response.report.packages[0];
  if (response.replay === undefined || pkg === undefined || response.report.packages.length !== 1) return null;
  const timeline = timelineOf(response, pkg.name);
  const scanForm = { state: pkg.state, reason: pkg.stateReason, ghost: false };
  return stops.map((ms) => {
    const view = formAt(timeline, ms, scanForm);
    return { name: pkg.name, version: view.version ?? null, state: view.state };
  });
}
