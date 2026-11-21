import { useEffect, useState } from "react";

/** Toggles 0 and 1 every second, only while a ghost exists and Reduced motion does not apply (5.7 to 5.9). */
export function useGhostPhase(anyGhost: boolean, reducedMotion: boolean): 0 | 1 {
  const [phase, setPhase] = useState<0 | 1>(0);
  const running = anyGhost && !reducedMotion;
  useEffect(() => {
    if (!running) return undefined;
    const timer = setInterval(() => {
      setPhase((p) => (p === 0 ? 1 : 0));
    }, 1000);
    return () => {
      clearInterval(timer);
      setPhase(0);
    };
  }, [running]);
  return running ? phase : 0;
}
