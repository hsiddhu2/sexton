// The opening Stop and the Play stepping of the scrubber, as a pure reducer. Spec cemetery-time-fixes, requirements 3 and 4.

/** One Play step every 5,000 ms: Play is a Replay's "Play all" (spec clean-site, 8.9); Home has no Play. */
export const PLAY_STEP_MS = 5000;

export interface PlayState {
  readonly index: number;
  readonly playing: boolean;
}

export type PlayEvent =
  | { readonly type: "load"; readonly count: number; readonly replay: boolean }
  | { readonly type: "play"; readonly count: number }
  | { readonly type: "tick"; readonly count: number }
  | { readonly type: "pause" }
  | { readonly type: "seek"; readonly index: number; readonly count: number };

/** A replay opens at its first Stop, every other response at its Scan date (the last Stop). 0 when there is no Stop. */
export function openingStop(count: number, replay: boolean): number {
  if (count <= 0 || replay) return 0;
  return count - 1;
}

function clamp(index: number, count: number): number {
  const last = Math.max(count - 1, 0);
  if (!Number.isInteger(index) || index < 0) return 0;
  return Math.min(index, last);
}

export function playStep(state: PlayState, event: PlayEvent): PlayState {
  switch (event.type) {
    case "load":
      return { index: openingStop(event.count, event.replay), playing: false };
    case "play":
      if (event.count < 2) return state;
      if (state.index >= event.count - 1) return { index: 0, playing: true };
      return { index: state.index, playing: true };
    case "tick": {
      if (!state.playing) return state;
      const next = state.index + 1;
      if (next >= event.count - 1) return { index: Math.max(event.count - 1, 0), playing: false };
      return { index: next, playing: true };
    }
    case "pause":
      return state.playing ? { index: state.index, playing: false } : state;
    case "seek":
      return { index: clamp(event.index, event.count), playing: false };
  }
}
