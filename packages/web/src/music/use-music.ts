// The Music switch (spec clean-site, design C12, requirements 14.2 to 14.4 and 14.7): off at load; one audio element,
// made on the first turn-on, loops the track; off pauses it. The beat drives the Characters only while it plays.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { beatMs, type Track } from "./track.js";

export interface Music {
  readonly on: boolean;
  readonly toggle: () => void;
  /** The beat the Pose clock follows while Music is on, else null (normal idle motion). */
  readonly beat: { readonly beatMs: number } | null;
}

/** Makes the audio element; a seam for tests. */
export type MakeAudio = (src: string) => HTMLAudioElement;
const makeAudio: MakeAudio = (src) => new Audio(src);

export function useMusic(track: Track | null, make: MakeAudio = makeAudio): Music {
  const [on, setOn] = useState(false);
  const audio = useRef<HTMLAudioElement | null>(null);
  const toggle = useCallback((): void => {
    if (track === null) return;
    if (on) {
      audio.current?.pause();
      setOn(false);
      return;
    }
    // No audio element exists before the first turn-on (14.7).
    audio.current ??= make(track.file);
    audio.current.loop = true;
    setOn(true);
    // A refused play (no user gesture, a missing file) turns Music off again.
    void audio.current.play().catch(() => {
      setOn(false);
    });
  }, [on, track, make]);
  useEffect(
    () => () => {
      audio.current?.pause();
    },
    [],
  );
  const ms = track === null ? null : beatMs(track);
  // One beat object while on, so the Scene is not planned again on every render of the page.
  const beat = useMemo(() => (on && ms !== null ? { beatMs: ms } : null), [on, ms]);
  return { on, toggle, beat };
}
