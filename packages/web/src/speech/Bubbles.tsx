// The speech Bubbles over the Scene (spec cemetery-undead-2, requirement 7). Decoration only: aria-hidden, no pointer
// events, hidden in Serious mode and while the drawer is open, still under Reduced motion.
import type { PackageHealth } from "@sexton/api";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Rect, ScenePlan } from "../scene/layout.js";
import type { FormView } from "../time/form-at.js";
import { bubbleLine } from "./bubble-table.js";
import { BUBBLE_SHOW_MS, BUBBLE_SLOT_MS, bubblesAt, slotOf } from "./bubble-schedule.js";
import { placeBubble, TAIL, type BubbleGeometry } from "./bubble-place.js";

/** Each Bubble fades out over this long before its show window ends. */
export const BUBBLE_FADE_MS = 200;

export interface PlacedBubble {
  readonly index: number;
  readonly line: string;
  readonly rect: Rect;
  readonly tail: BubbleGeometry["tail"];
  readonly tailRect: Rect;
}

/** Pure. The Bubble line of each grave at the chosen date, or null: from the Form shown, never a state rule. */
export function bubbleLines(packages: readonly PackageHealth[], views: readonly (FormView | undefined)[] | undefined): readonly (string | null)[] {
  return packages.map((pkg, i) => {
    const view = views?.[i];
    if (view !== undefined && view.state === null) return null;
    return bubbleLine(view?.state ?? pkg.state, view?.reason ?? pkg.stateReason);
  });
}

/** The tooltip's width and gap: a Bubble keeps clear of the band beside the hovered or focused grave where it opens. */
const TOOLTIP_BAND = 248;

/**
 * Pure. The Bubbles to show at an instant: at most two, placed clear of every name label and of each other. The
 * hovered or focused grave speaks through its tooltip instead, and no Bubble sits where that tooltip opens.
 */
export function bubblesFor(plan: ScenePlan, lines: readonly (string | null)[], nowMs: number): readonly PlacedBubble[] {
  const lantern = plan.lantern === null ? undefined : plan.graves[plan.lantern];
  const reserved: Rect[] = lantern === undefined ? [] : [{ x: lantern.rect.x - TOOLTIP_BAND, y: lantern.rect.y, w: lantern.rect.w + 2 * TOOLTIP_BAND, h: lantern.rect.h }];
  const eligible: number[] = [];
  lines.forEach((line, i) => {
    if (line !== null && i !== plan.lantern && placeBubble(plan, i, line, reserved) !== null) eligible.push(i);
  });
  const out: PlacedBubble[] = [];
  for (const index of bubblesAt(eligible, nowMs)) {
    const line = lines[index];
    if (line == null) continue;
    const placed = placeBubble(plan, index, line, [...reserved, ...out.flatMap((b) => [b.rect, b.tailRect])]);
    if (placed !== null) out.push({ index, line, ...placed });
  }
  return out;
}

/** The next instant the layer changes: a slot start, a fade start or a show boundary. */
function nextChange(nowMs: number): number {
  const start = (slotOf(nowMs) ?? 0) * BUBBLE_SLOT_MS;
  for (const t of [start + BUBBLE_SHOW_MS - BUBBLE_FADE_MS, start + BUBBLE_SHOW_MS, start + BUBBLE_SLOT_MS]) if (t > nowMs) return t;
  return start + BUBBLE_SLOT_MS;
}

export interface BubblesProps {
  readonly plan: ScenePlan;
  readonly lines: readonly (string | null)[];
  readonly hidden: boolean;
  readonly reducedMotion: boolean;
}

export function Bubbles({ plan, lines, hidden, reducedMotion }: BubblesProps) {
  const [clock, setClock] = useState(() => Date.now());
  const [visible, setVisible] = useState(() => typeof document === "undefined" || document.visibilityState !== "hidden");
  useEffect(() => {
    const onVisibility = (): void => {
      setVisible(document.visibilityState !== "hidden");
      setClock(Date.now());
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);
  // One timer to the next change. It does not run while the Bubbles are hidden or the page is.
  const running = !hidden && visible;
  // Shown again after a pause: read the clock afresh before the paint, so a stale slot never shows (review, task 8).
  useLayoutEffect(() => {
    if (running) setClock(Date.now());
  }, [running]);
  useEffect(() => {
    if (!running) return undefined;
    const now = Date.now();
    const timer = setTimeout(() => {
      setClock(Date.now());
    }, Math.max(0, nextChange(now) - now));
    return () => {
      clearTimeout(timer);
    };
  }, [running, clock]);
  const shown = useMemo(() => (running ? bubblesFor(plan, lines, clock) : []), [running, plan, lines, clock]);
  if (shown.length === 0) return null;
  const start = (slotOf(clock) ?? 0) * BUBBLE_SLOT_MS;
  const leaving = clock >= start + BUBBLE_SHOW_MS - BUBBLE_FADE_MS;
  const className = `bubble${reducedMotion ? " bubble-still" : ""}${leaving && !reducedMotion ? " bubble-leaving" : ""}`;
  return (
    <div className="bubble-layer" aria-hidden="true">
      {shown.map((b) => (
        <BubbleText key={`${String(start)}-${String(b.index)}`} bubble={b} className={className} fade={!reducedMotion} leaving={leaving} />
      ))}
    </div>
  );
}

/**
 * One Bubble. It fades in when it appears and out before its show boundary, with the Web Animations API (the style
 * sheet holds no transition). Under Reduced motion it appears and goes with no fade.
 */
function BubbleText({ bubble, className, fade, leaving }: { readonly bubble: PlacedBubble; readonly className: string; readonly fade: boolean; readonly leaving: boolean }) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!fade || el === null || typeof el.animate !== "function") return;
    el.animate(leaving ? [{ opacity: 1 }, { opacity: 0 }] : [{ opacity: 0 }, { opacity: 1 }], { duration: BUBBLE_FADE_MS, fill: "forwards" });
  }, [fade, leaving]);
  // The square's centre sits on the Bubble's edge, TAIL from the tip.
  const { x, y, side } = bubble.tail;
  const centre = side === "down" ? { left: x, top: y - TAIL } : side === "left" ? { left: x + TAIL, top: y } : { left: x - TAIL, top: y };
  return (
    <div ref={ref} className="bubble-group">
      {/* The tail points at the speaker and ends inside its cell. Painted first, so the Bubble covers its inner half. */}
      <span className={`bubble-tail bubble-tail-${side}`} style={centre} />
      <p className={className} style={{ left: bubble.rect.x, top: bubble.rect.y, width: bubble.rect.w, height: bubble.rect.h }}>
        {bubble.line}
      </p>
    </div>
  );
}
