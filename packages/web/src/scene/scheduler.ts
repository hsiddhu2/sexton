export interface FrameApi {
  request(cb: () => void): number;
  cancel(id: number): void;
}

export interface RedrawScheduler {
  invalidate(): void;
  paintNow(): void;
  dispose(): void;
}

/** Coalesces any number of invalidations into one paint per animation frame (9.3). */
export function createRedrawScheduler(frame: FrameApi, paint: () => void): RedrawScheduler {
  let pending: number | null = null;
  return {
    invalidate() {
      if (pending !== null) return;
      pending = frame.request(() => {
        pending = null;
        paint();
      });
    },
    paintNow() {
      paint();
    },
    dispose() {
      if (pending !== null) frame.cancel(pending);
      pending = null;
    },
  };
}
