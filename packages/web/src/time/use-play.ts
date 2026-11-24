// The Play timer: one setTimeout of PLAY_STEP_MS while playing, cleared on every step, pause, new load and unmount.
// Spec cemetery-time-fixes, requirement 4, design.md "F3" and calls 24 and 25.
import { useCallback, useEffect, useState } from "react";
import { PLAY_STEP_MS, playStep, type PlayEvent, type PlayState } from "./play.js";
import { stopText } from "./Scrubber.js";

export interface PlayControls {
  readonly index: number;
  readonly playing: boolean;
  /** The text of the polite live line. */
  readonly announce: string;
  readonly play: () => void;
  readonly pause: () => void;
  readonly seek: (index: number) => void;
}

interface Held {
  /** The load the state belongs to: a new load id or Stop count is a new load. */
  readonly key: string;
  readonly play: PlayState;
  readonly announce: string;
}

function loaded(key: string, count: number, replay: boolean): Held {
  return { key, play: playStep({ index: 0, playing: false }, { type: "load", count, replay }), announce: "" };
}

/** The announcement after an event: "Playing from", each step's date, "End of history at", "Paused at", or "" for a seek. */
function announcement(before: PlayState, after: PlayState, event: PlayEvent, stops: readonly number[]): string {
  const at = (i: number): string => {
    const ms = stops[i];
    return ms === undefined ? "" : stopText(ms);
  };
  switch (event.type) {
    case "play":
      return after.playing && !before.playing ? `Playing from ${at(after.index)}` : "";
    case "tick":
      if (!before.playing) return "";
      return after.playing ? at(after.index) : `End of history at ${at(after.index)}`;
    case "pause":
      return before.playing ? `Paused at ${at(after.index)}` : "";
    default:
      return "";
  }
}

export function usePlay(stops: readonly number[], loadId: number, replay: boolean): PlayControls {
  const count = stops.length;
  const key = `${String(loadId)}:${String(count)}:${replay ? "replay" : "scan"}`;
  const [held, setHeld] = useState<Held>(() => loaded(key, count, replay));
  // A new load replaces the state during render, so no frame shows the old Stop and a pending timer is dropped.
  const current = held.key === key ? held : loaded(key, count, replay);
  if (held.key !== key) setHeld(current);

  const send = useCallback(
    (event: PlayEvent): void => {
      setHeld((prev) => {
        if (prev.key !== key) return prev;
        const next = playStep(prev.play, event);
        // An event that changes nothing keeps the live line as it is.
        if (next === prev.play) return prev;
        return { key, play: next, announce: announcement(prev.play, next, event, stops) };
      });
    },
    [key, stops],
  );

  const { index, playing } = current.play;
  useEffect(() => {
    if (!playing) return undefined;
    const timer = setTimeout(() => {
      send({ type: "tick", count });
    }, PLAY_STEP_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [playing, index, count, send]);

  const play = useCallback(() => {
    send({ type: "play", count });
  }, [send, count]);
  const pause = useCallback(() => {
    send({ type: "pause" });
  }, [send]);
  const seek = useCallback(
    (next: number) => {
      send({ type: "seek", index: next, count });
    },
    [send, count],
  );
  return { index, playing, announce: current.announce, play, pause, seek };
}
