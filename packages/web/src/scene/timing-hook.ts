declare global {
  interface Window {
    __sextonTiming?: { redraw(n: number): number[] };
  }
}

/** E2E builds only: n synchronous full paints, each timed. Returns an uninstall function. */
export function installTimingHook(repaint: () => void): () => void {
  window.__sextonTiming = {
    redraw(n: number): number[] {
      const times: number[] = [];
      for (let i = 0; i < n; i += 1) {
        const start = performance.now();
        repaint();
        times.push(performance.now() - start);
      }
      return times;
    },
  };
  return () => {
    delete window.__sextonTiming;
  };
}
