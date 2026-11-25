// The Sound toggle and its gates (spec cemetery-undead-2, requirement 8). No engine and no AudioContext exist until
// Sound is on and the page has seen a gesture: pressing the toggle is one, and a remembered "on" waits for the first
// pointer or key press. The page going hidden silences everything; visible again, the wind bed returns.
import { useCallback, useEffect, useRef, useState } from "react";
import { browserStorage } from "../epitaph/serious.js";
import { createSoundEngine, type SoundEngine } from "./engine.js";
import { readSound, writeSound } from "./sound-pref.js";
import type { AudioContextLike, VoiceId } from "./voices.js";

/** The ghost call plays at most once in this many milliseconds. */
export const GHOST_CALL_GAP_MS = 1_500;

/** Pure. True when a ghost call may play at `nowMs`, after the last one at `lastMs`. */
export function ghostCallDue(lastMs: number | null, nowMs: number): boolean {
  return lastMs === null || nowMs - lastMs >= GHOST_CALL_GAP_MS;
}

export interface SoundControls {
  readonly on: boolean;
  readonly toggle: () => void;
  /** Plays a Voice when Sound is on, armed and the page is visible; else nothing. */
  readonly play: (voice: VoiceId) => void;
}

export interface UseSoundOptions {
  readonly serious: boolean;
  /** The AudioContext factory. Tests pass a fake; the page uses the browser's AudioContext. */
  readonly makeContext?: () => AudioContextLike;
}

function browserContext(): AudioContextLike {
  const Ctor = (window as unknown as { AudioContext?: new () => AudioContextLike }).AudioContext;
  if (typeof Ctor !== "function") throw new Error("no Web Audio");
  return new Ctor();
}

export function useSound({ serious, makeContext = browserContext }: UseSoundOptions): SoundControls {
  const [on, setOn] = useState(() => readSound(browserStorage()));
  const [armed, setArmed] = useState(false);
  const engineRef = useRef<SoundEngine | null>(null);
  const seriousRef = useRef(serious);
  seriousRef.current = serious;
  const makeRef = useRef(makeContext);
  makeRef.current = makeContext;

  const engine = useCallback((): SoundEngine => {
    engineRef.current ??= createSoundEngine(
      () => makeRef.current(),
      (message) => {
        if (__SEXTON_E2E__) console.warn(message);
      },
    );
    return engineRef.current;
  }, []);

  // A remembered "on" waits for the first pointer or key press on the page.
  useEffect(() => {
    if (!on || armed) return undefined;
    const arm = (): void => {
      setArmed(true);
    };
    window.addEventListener("pointerdown", arm, { capture: true, once: true });
    window.addEventListener("keydown", arm, { capture: true, once: true });
    return () => {
      window.removeEventListener("pointerdown", arm, { capture: true });
      window.removeEventListener("keydown", arm, { capture: true });
    };
  }, [on, armed]);

  // On and armed: the wind bed plays unless Serious mode is on. Off: everything goes quiet.
  useEffect(() => {
    if (!on || !armed) {
      engineRef.current?.suspend();
      return;
    }
    if (document.visibilityState === "hidden") return;
    const e = engine();
    e.resume();
    e.wind(true, { serious });
  }, [on, armed, serious, engine]);

  useEffect(() => {
    const onVisibility = (): void => {
      const e = engineRef.current;
      if (e === null) return;
      if (document.visibilityState === "hidden") e.suspend();
      else if (on && armed) {
        e.resume();
        e.wind(true, { serious: seriousRef.current });
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [on, armed]);

  useEffect(
    () => () => {
      engineRef.current?.dispose();
      engineRef.current = null;
    },
    [],
  );

  const toggle = useCallback((): void => {
    const next = !on;
    writeSound(browserStorage(), next);
    setOn(next);
    // Pressing the toggle is itself a gesture.
    if (next) setArmed(true);
  }, [on]);

  const play = useCallback(
    (voice: VoiceId): void => {
      if (!on || !armed || document.visibilityState === "hidden") return;
      engine().play(voice, { serious: seriousRef.current });
    },
    [on, armed, engine],
  );

  return { on, toggle, play };
}
