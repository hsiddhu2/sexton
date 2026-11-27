// The Replay told step by step (spec clean-site, design C6, requirement 8): what the Step panel, the date badge and
// the Step cards show at each Step, from the Replay file's Step texts and the one grave's Segments. Pure.
import type { ReplayStep, ScanResponse, State } from "@sexton/api";
import { scanTimeView } from "../header/format-scan-time.js";
import { stopsFor } from "../time/stops.js";
import { stopCards } from "./stop-cards.js";

export const REPLAY_NOT_LIVE = "Reconstructed from public reports. Not a live scan.";
export const WHY_HEADING = "Why attackers do this";
export const NEXT_STEP = "Next step";
export const BACK_TO_CEMETERY = "Back to the cemetery";
export const PLAY_ALL = "Play all";
export const EXIT_REPLAY = "Exit replay";

/** A link only for an address that starts with https:// and holds no white space or control character (8.12). */
export function isSafeSourceUrl(url: string): boolean {
  // eslint-disable-next-line no-control-regex -- the point is to reject control characters
  return url.startsWith("https://") && !/[\s\u0000-\u001f\u007f]/.test(url);
}

export interface StoryStep extends ReplayStep {
  /** The Step's instant in ms, and as written for display ("31 Mar 2026, 00:21 UTC"). */
  readonly ms: number;
  readonly time: string;
  readonly package: string;
  readonly version: string | null;
  readonly state: State | null;
}

/**
 * Pure. One StoryStep per Stop, in order, or null for a response that is not a Replay of one package, or whose Step
 * texts do not match its Stops (the validator refuses such a file, 8.15).
 */
export function storySteps(response: ScanResponse): readonly StoryStep[] | null {
  const replay = response.replay;
  if (replay === undefined) return null;
  const stops = stopsFor(response).stops;
  const cards = stopCards(response, stops);
  if (cards === null || cards.length !== replay.steps.length) return null;
  const out: StoryStep[] = [];
  cards.forEach((card, i) => {
    const step = replay.steps[i];
    const ms = stops[i];
    if (step === undefined || ms === undefined) return;
    out.push({
      title: step.title,
      happened: step.happened,
      shows: step.shows,
      ms,
      time: scanTimeView(new Date(ms).toISOString()).text,
      package: card.name,
      version: card.version,
      state: card.state,
    });
  });
  return out.length === cards.length ? out : null;
}

/** Pure. The Step badge: "<package> <version> is <State>" (8.4). */
export function stepBadge(step: StoryStep): string {
  const name = step.version === null ? step.package : `${step.package} ${step.version}`;
  return `${name} is ${step.state ?? "Not published"}`;
}
