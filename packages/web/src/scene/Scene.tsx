import { memo, useEffect, useRef } from "react";
import { drawScene } from "./draw.js";
import { backingStore, type ScenePlan } from "./layout.js";
import { poseStepMs } from "./motion.js";
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
    const paint = (current: ScenePlan, nowMs: number = Date.now()): void => {
      const canvas = canvasRef.current;
      if (canvas === null) return;
      ctx ??= canvas.getContext("2d");
      if (ctx === null) return;
      drawScene(ctx, current, backingStore(current.width, current.groundHeight, window.devicePixelRatio).scale, nowMs);
    };
    const scheduler = createRedrawScheduler(
      {
        request: (cb) => window.requestAnimationFrame(cb),
        cancel: (id) => {
          window.cancelAnimationFrame(id);
        },
      },
      () => {
        paint(planRef.current);
      },
    );
    schedulerRef.current = scheduler;
    scheduler.invalidate();
    let uninstall: (() => void) | null = null;
    let cancelled = false;
    if (__SEXTON_E2E__) {
      void import("./timing-hook.js").then((m) => {
        if (!cancelled) uninstall = m.installTimingHook(() => { scheduler.paintNow(); }, () => planRef.current, paint);
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

  // The Character clock (spec cemetery-undead, 4.1, 4.2, 4.6): one repaint every FRAME_MS while motion is allowed
  // and the page is visible. React does not re-render for it: only the canvas repaints.
  const still = plan.reducedMotion || plan.graves.length === 0;
  // One repaint per Pose step: every FRAME_MS, or every half beat while Music is on (spec clean-site, 14.3).
  const stepMs = poseStepMs(plan.beat ?? null);
  useEffect(() => {
    if (still) return undefined;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const tick = (): void => {
      timer = null;
      if (document.visibilityState === "hidden") return;
      schedulerRef.current?.invalidate();
      timer = setTimeout(tick, stepMs);
    };
    const onVisibility = (): void => {
      if (document.visibilityState !== "hidden" && timer === null) tick();
    };
    timer = setTimeout(tick, stepMs);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      if (timer !== null) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [still, stepMs]);

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
