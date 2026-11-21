import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { createRedrawScheduler, type FrameApi } from "../src/scene/scheduler.js";

function manualFrames(): FrameApi & { flush(): void; pending(): number } {
  const queue = new Map<number, () => void>();
  let next = 1;
  return {
    request(cb) {
      const id = next++;
      queue.set(id, cb);
      return id;
    },
    cancel(id) {
      queue.delete(id);
    },
    flush() {
      const callbacks = [...queue.values()];
      queue.clear();
      for (const cb of callbacks) cb();
    },
    pending: () => queue.size,
  };
}

describe("Feature: cemetery-ui, Property 17: Redraws happen once per frame, and only for a change", () => {
  it("paints once per frame that held a change", () => {
    fc.assert(
      fc.property(fc.array(fc.constantFrom("change", "noise", "frame"), { maxLength: 100 }), (events) => {
        const frames = manualFrames();
        let paints = 0;
        const scheduler = createRedrawScheduler(frames, () => {
          paints += 1;
        });
        let changed = false;
        let expected = 0;
        for (const event of events) {
          if (event === "change") {
            scheduler.invalidate();
            changed = true;
          } else if (event === "frame") {
            frames.flush();
            if (changed) expected += 1;
            changed = false;
          }
          expect(paints).toBe(expected);
        }
      }),
      { numRuns: 100 },
    );
  });

  it("dispose cancels a pending frame", () => {
    const frames = manualFrames();
    let paints = 0;
    const scheduler = createRedrawScheduler(frames, () => {
      paints += 1;
    });
    scheduler.invalidate();
    scheduler.dispose();
    frames.flush();
    expect([paints, frames.pending()]).toEqual([0, 0]);
  });

  it("paintNow paints synchronously", () => {
    let paints = 0;
    createRedrawScheduler(manualFrames(), () => {
      paints += 1;
    }).paintNow();
    expect(paints).toBe(1);
  });
});
