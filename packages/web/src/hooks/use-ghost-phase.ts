import { useEffect, useState } from "react";
import { GHOST_STEPS, GHOST_STEP_MS } from "../scene/layout.js";

/** Steps an integer phase 0 to 47 every 100 ms, only while a ghost exists and Reduced motion does not apply (4.2, 4.6 to 4.8). */
export function useGhostPhase(anyGhost: boolean, reducedMotion: boolean): number {
  const [phase, setPhase] = useState(0);
  const running = anyGhost && !reducedMotion;
  useEffect(() => {
    if (!running) return undefined;
    const timer = setInterval(() => {
      setPhase((p) => (p + 1) % GHOST_STEPS);
    }, GHOST_STEP_MS);
    return () => {
      clearInterval(timer);
      setPhase(0);
    };
  }, [running]);
  return running ? phase : 0;
}
