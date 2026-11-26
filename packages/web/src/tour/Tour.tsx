// The Tour (spec clean-site, design C11, requirements 13.3 to 13.10): a full-screen blocker that takes every press
// outside the card, a spotlight box around the highlighted part with the rest dimmed, and the card, placed by
// tour/place-card.ts inside the viewport. The card takes focus when a step shows and keeps it inside; Escape is the
// page's (10.3). The Guide ghost sits beside the step title (design C16, 19.5).
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { TourStep } from "../load/screen-state.js";
import { trapStep } from "../drawer/focus-trap.js";
import { GhostPicture } from "../scene/GhostPicture.js";
import { placeCard, type Box } from "./place-card.js";
import { TOUR_OFF_TEXT, TOUR_STEPS } from "./tour-steps.js";

export interface TourProps {
  readonly step: TourStep;
  readonly apiConfigured: boolean;
  readonly onNext: () => void;
  readonly onEnd: () => void;
}

/** The spotlight's padding around its target, in CSS pixels. */
export const SPOT_PAD = 6;

function measure(target: string, reveal: boolean): Box | null {
  const el = document.querySelector(`[data-tour="${target}"]`);
  if (el === null) return null;
  // A target below the fold (the Panel under the Scene in one column) is scrolled into view first.
  if (reveal && typeof el.scrollIntoView === "function") el.scrollIntoView({ block: "nearest" });
  const r = el.getBoundingClientRect();
  return { x: r.left, y: r.top, w: r.width, h: r.height };
}

/**
 * Pure. The four dimming panels around the spotlight (above, below, left and right of it), or one over the whole
 * viewport when the target is not on the page. Panels, not a shadow, so the dimming is one token at one opacity.
 */
export function dims(box: Box | null, viewport: { readonly width: number; readonly height: number }): Box[] {
  const { width, height } = viewport;
  if (box === null) return [{ x: 0, y: 0, w: width, h: height }];
  const top = Math.max(0, box.y - SPOT_PAD);
  const bottom = Math.min(height, box.y + box.h + SPOT_PAD);
  const left = Math.max(0, box.x - SPOT_PAD);
  const right = Math.min(width, box.x + box.w + SPOT_PAD);
  const band = Math.max(0, bottom - top);
  return [
    { x: 0, y: 0, w: width, h: top },
    { x: 0, y: bottom, w: width, h: Math.max(0, height - bottom) },
    { x: 0, y: top, w: left, h: band },
    { x: right, y: top, w: Math.max(0, width - right), h: band },
  ];
}

export function Tour({ step, apiConfigured, onNext, onEnd }: TourProps) {
  const shown = TOUR_STEPS[step];
  const text = step === 2 && !apiConfigured ? TOUR_OFF_TEXT : shown.text;
  const [box, setBox] = useState<Box | null>(null);
  const [viewport, setViewport] = useState({ width: window.innerWidth, height: window.innerHeight });
  // The card's measured height (0 before the first measure, when CARD_HEIGHT stands in).
  const [cardHeight, setCardHeight] = useState(0);
  const cardRef = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    const update = (reveal = false): void => {
      setBox(measure(shown.target, reveal));
      setViewport({ width: window.innerWidth, height: window.innerHeight });
      setCardHeight(cardRef.current?.offsetHeight ?? 0);
    };
    const onChange = (): void => {
      update();
    };
    update(true);
    window.addEventListener("resize", onChange);
    window.addEventListener("scroll", onChange, true);
    return () => {
      window.removeEventListener("resize", onChange);
      window.removeEventListener("scroll", onChange, true);
    };
  }, [shown.target]);

  // The card takes focus at each step, after any focus return of a View owner it replaced (a Drawer's runs in a
  // layout effect, before this one), and gives it to the header's Tour button when the Tour ends.
  const primaryRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    primaryRef.current?.focus();
  }, [step]);
  useEffect(
    () => () => {
      document.querySelector<HTMLElement>("[data-tour-button]")?.focus();
    },
    [],
  );
  // Tab stays in the card wherever focus is, so a press on the dimmed page cannot hand Tab to the page behind.
  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent): void => {
      const card = cardRef.current;
      if (event.key !== "Tab" || card === null) return;
      const items = [...card.querySelectorAll<HTMLElement>("button")];
      const next = items[trapStep(items.length, items.indexOf(document.activeElement as HTMLElement), event.shiftKey)];
      if (next === undefined) return;
      event.preventDefault();
      next.focus();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  const place = placeCard(box ?? { x: viewport.width / 2, y: viewport.height, w: 0, h: 0 }, viewport, cardHeight);
  const last = step === 2;
  return (
    <div className="tour">
      {/* A press on the blocker keeps focus where it is, in the card (13.5). */}
      <div
        className="tour-block"
        aria-hidden="true"
        onMouseDown={(event) => {
          event.preventDefault();
        }}
      />
      {dims(box, viewport).map((d, i) => (
        <div key={i} className="tour-dim" aria-hidden="true" style={{ left: d.x, top: d.y, width: d.w, height: d.h }} />
      ))}
      {box === null ? null : (
        <div
          className="tour-spot"
          aria-hidden="true"
          style={{ left: box.x - SPOT_PAD, top: box.y - SPOT_PAD, width: box.w + 2 * SPOT_PAD, height: box.h + 2 * SPOT_PAD }}
        />
      )}
      <section
        ref={cardRef}
        className="tour-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-title"
        aria-describedby="tour-text"
        style={{ left: place.x, top: place.y, width: place.width }}
      >
        <p className="eyebrow">Step {step + 1} of 3</p>
        <div className="tour-title-row">
          <GhostPicture />
          <h2 id="tour-title" className="tour-title">
            {shown.title}
          </h2>
        </div>
        <p id="tour-text" className="tour-text">
          {text}
        </p>
        <p className="tour-buttons">
          <button type="button" className="button" onClick={onEnd}>
            Skip
          </button>
          <button ref={primaryRef} type="button" className="button button-primary" onClick={last ? onEnd : onNext}>
            {last ? "Done" : "Next"}
          </button>
        </p>
      </section>
    </div>
  );
}
