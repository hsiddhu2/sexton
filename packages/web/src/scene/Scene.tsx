import { memo, useEffect, useRef } from "react";
import { drawScene } from "./draw.js";
import { backingStore, type ScenePlan } from "./layout.js";
import { createRedrawScheduler, type RedrawScheduler } from "./scheduler.js";

export interface SceneProps {
  readonly plan: ScenePlan;
}

function SceneView({ plan }: SceneProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const planRef = useRef(plan);
  const schedulerRef = useRef<RedrawScheduler | null>(null);
  planRef.current = plan;
  const backing = backingStore(plan.width, plan.groundHeight, window.devicePixelRatio);

  useEffect(() => {
    let ctx: CanvasRenderingContext2D | null = null;
    const scheduler = createRedrawScheduler(
      {
        request: (cb) => window.requestAnimationFrame(cb),
        cancel: (id) => {
          window.cancelAnimationFrame(id);
        },
      },
      () => {
        const canvas = canvasRef.current;
        if (canvas === null) return;
        ctx ??= canvas.getContext("2d");
        if (ctx === null) return;
        const current = planRef.current;
        drawScene(ctx, current, backingStore(current.width, current.groundHeight, window.devicePixelRatio).scale);
      },
    );
    schedulerRef.current = scheduler;
    scheduler.invalidate();
    let uninstall: (() => void) | null = null;
    let cancelled = false;
    if (__SEXTON_E2E__) {
      void import("./timing-hook.js").then((m) => {
        if (!cancelled) uninstall = m.installTimingHook(() => { scheduler.paintNow(); });
      });
    }
    return () => {
      cancelled = true;
      uninstall?.();
      scheduler.dispose();
      schedulerRef.current = null;
    };
  }, []);

  useEffect(() => {
    schedulerRef.current?.invalidate();
  }, [plan]);

  return (
    <canvas
      ref={canvasRef}
      className="scene-canvas"
      aria-hidden="true"
      width={backing.width}
      height={backing.height}
      style={{ width: plan.width, height: plan.groundHeight }}
    />
  );
}

export const Scene = memo(SceneView);
