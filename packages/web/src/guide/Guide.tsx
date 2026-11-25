// The first-visit Guide (spec judge-path, requirement 1): a non-modal dialog of four steps, each beside its Anchor.
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type RefObject } from "react";
import type { Rect } from "../scene/layout.js";
import { GUIDE_MARGIN, GUIDE_STEPS, guideArrow, placeGuide, type AnchorId, type GuideArrow, type GuidePlace } from "./guide-steps.js";

export type GuideStepIndex = 0 | 1 | 2 | 3;

export interface GuideProps {
  readonly step: GuideStepIndex;
  readonly onStep: (step: GuideStepIndex) => void;
  /** Close, Done and Escape. The caller stores "closed". */
  readonly onClose: () => void;
  readonly reducedMotion: boolean;
  /** A new value moves focus to the Guide's heading (the Guide button was pressed). */
  readonly focusRequest: number;
  /** The control a step points at, or null when it is not on the page. */
  readonly anchorFor: (id: AnchorId) => HTMLElement | null;
  /** Every grave's Name label, in client coordinates. */
  readonly labels: () => readonly Rect[];
  /** Where focus returns when the Guide closes while focus is inside it. */
  readonly returnFocusTo: RefObject<HTMLElement | null>;
}

/** The card's height before it is measured, as in the placement property's range. */
const EST_HEIGHT = 200;
/** An Anchor that lies nowhere on screen, so the card takes its dock. */
const NOWHERE: Rect = { x: -1e5, y: -1e5, w: 0, h: 0 };

function pinnedEdge(selector: string, edge: "bottom" | "top"): number | null {
  const el = document.querySelector(selector);
  if (el === null) return null;
  const position = window.getComputedStyle(el).position;
  if (position !== "sticky" && position !== "fixed") return null;
  const r = el.getBoundingClientRect();
  if (r.height === 0) return null;
  if (edge === "bottom") return r.bottom > 0 && r.top <= 0 ? r.bottom : null;
  return r.top < window.innerHeight ? r.top : null;
}

export function Guide({ step, onStep, onClose, reducedMotion, focusRequest, anchorFor, labels, returnFocusTo }: GuideProps) {
  const sectionRef = useRef<HTMLElement | null>(null);
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const [place, setPlace] = useState<(GuidePlace & { readonly arrow: GuideArrow | null }) | null>(null);
  const current = GUIDE_STEPS[step] ?? GUIDE_STEPS[0];
  const anchorId = current?.anchor ?? "fix-first-grave";

  const placeRef = useRef<(GuidePlace & { readonly arrow: GuideArrow | null }) | null>(null);
  const replace = useCallback((): void => {
    const anchor = anchorFor(anchorId);
    const r = anchor?.getBoundingClientRect();
    const rect: Rect = r === undefined || (r.width === 0 && r.height === 0) ? NOWHERE : { x: r.left, y: r.top, w: r.width, h: r.height };
    const measured = sectionRef.current?.offsetHeight ?? 0;
    const height = measured > 0 ? measured : EST_HEIGHT;
    const viewport = { width: window.innerWidth, height: window.innerHeight, headerBottom: pinnedEdge(".site-header", "bottom"), footerTop: pinnedEdge(".night-footer", "top") };
    const at = placeGuide(rect, viewport, height, labels());
    const next = { ...at, arrow: guideArrow(at, rect, viewport, height) };
    const prev = placeRef.current;
    if (prev !== null && prev.left === next.left && prev.top === next.top && prev.side === next.side && prev.arrow?.edge === next.arrow?.edge && prev.arrow?.offset === next.arrow?.offset) return;
    placeRef.current = next;
    setPlace(next);
  }, [anchorFor, anchorId, labels]);

  useLayoutEffect(() => {
    replace();
  }, [replace]);

  // The scene lays out after the page loads, and Bubbles come and go: each frame the card follows its Anchor. Once the
  // Anchor has stood still for two frames, a step brings it into view between a pinned header and Footer bar (1.13).
  useEffect(() => {
    let frame = 0;
    let last = "";
    let still = 0;
    let shown = false;
    const tick = (): void => {
      const anchor = anchorFor(anchorId);
      const r = anchor?.getBoundingClientRect();
      const key = r === undefined ? "" : `${String(r.left)},${String(r.top)},${String(r.width)},${String(r.height)}`;
      still = key === last ? still + 1 : 0;
      last = key;
      if (!shown && anchor !== null && r !== undefined && still >= 2) {
        shown = true;
        const top = pinnedEdge(".site-header", "bottom") ?? 0;
        const bottom = pinnedEdge(".night-footer", "top") ?? window.innerHeight;
        if (r.top < top) window.scrollBy(0, r.top - top - GUIDE_MARGIN);
        else if (r.bottom > bottom) window.scrollBy(0, Math.min(r.bottom - bottom + GUIDE_MARGIN, r.top - top - GUIDE_MARGIN));
      }
      replace();
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [anchorFor, anchorId, replace]);

  // The step's control is outlined while the step shows, so it is found however far the card must sit from it.
  useEffect(() => {
    const anchor = anchorFor(anchorId);
    anchor?.classList.add("guide-target");
    return () => {
      anchor?.classList.remove("guide-target");
    };
  }, [anchorFor, anchorId]);

  // A short fade in, only with motion and where the browser has the Web Animations API (1.17).
  useEffect(() => {
    const el = sectionRef.current;
    if (reducedMotion || el === null || typeof el.animate !== "function") return;
    el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 150 });
  }, [reducedMotion]);

  useLayoutEffect(() => {
    if (focusRequest > 0) headingRef.current?.focus();
  }, [focusRequest]);

  const close = (): void => {
    const inside = sectionRef.current?.contains(document.activeElement) === true;
    onClose();
    if (inside) returnFocusTo.current?.focus();
  };
  const onKeyDown = (event: KeyboardEvent<HTMLElement>): void => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    close();
  };
  const last = step === GUIDE_STEPS.length - 1;
  return (
    <section
      ref={sectionRef}
      className="guide"
      role="dialog"
      aria-modal="false"
      aria-labelledby="guide-title"
      data-side={place?.side ?? "dock"}
      style={place === null ? undefined : { left: place.left, top: place.top }}
      onKeyDown={onKeyDown}
    >
      {place?.arrow == null ? null : <span className={`guide-arrow guide-arrow-${place.arrow.edge}`} aria-hidden="true" style={place.arrow.edge === "left" || place.arrow.edge === "right" ? { top: place.arrow.offset } : { left: place.arrow.offset }} />}
      <p className="guide-count">
        Step {step + 1} of {GUIDE_STEPS.length}
      </p>
      <h2 id="guide-title" className="guide-title" ref={headingRef} tabIndex={-1}>
        {current?.title}
      </h2>
      <p className="guide-body">{current?.body}</p>
      <div className="guide-controls">
        {step > 0 ? (
          <button
            type="button"
            onClick={() => {
              onStep((step - 1) as GuideStepIndex);
            }}
          >
            Back
          </button>
        ) : null}
        {last ? (
          <button type="button" className="guide-next" onClick={close}>
            Done
          </button>
        ) : (
          <button
            type="button"
            className="guide-next"
            onClick={() => {
              onStep((step + 1) as GuideStepIndex);
            }}
          >
            Next
          </button>
        )}
        <button type="button" className="guide-close" aria-label="Close guide" onClick={close}>
          Close
        </button>
      </div>
    </section>
  );
}
