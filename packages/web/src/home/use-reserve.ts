// The height kept free under the Scene (spec clean-site): the Footer bar, the site footer and the gaps between them,
// so the Scene fills the viewport and its graves stand at its bottom above the Footer bar, as in the approved design.
import { useEffect, useState } from "react";

/** The gap between the Scene card and the Footer bar, and the main area's bottom padding, in CSS pixels. */
export const RESERVE_GAPS = 16 + 14;
/** The row gap of the scrubber (.scrub, gap 4px) above a note row. */
const NOTE_GAP = 4;
const MEASURED = [".foot-bar", ".site-footer"] as const;

/** The scrubber notes an earlier date adds to the Footer bar; the reserve leaves them out (D1). */
const NOTES = ".foot-bar .scrub-note";
/** The track's credit under the site footer line; the reserve leaves it out, so it sits below the fold (14.6). */
const CREDIT = ".site-footer .footer-credit";

/**
 * Pure. The reserve from the measured heights, less the height of the earlier date's notes, so the Scene and its fit
 * scale are the same at every date (review against the approved design, D1); 0 when nothing is measured (jsdom), so the
 * Scene keeps its old rule.
 */
export function reserveFor(heights: readonly number[], notes = 0): number {
  // The notes sit inside the first height (the Footer bar); they come off before the rounding up.
  const less = Number.isFinite(notes) && notes > 0 ? notes : 0;
  const sum = heights.reduce((a, h, i) => {
    const kept = i === 0 ? h - less : h;
    return a + (Number.isFinite(kept) && kept > 0 ? Math.ceil(kept) : 0);
  }, 0);
  return sum > 0 ? sum + RESERVE_GAPS : 0;
}

/** The outer height of an element: its box and its vertical margins. */
function outerHeight(element: HTMLElement): number {
  const style = window.getComputedStyle(element);
  return element.getBoundingClientRect().height + (parseFloat(style.marginTop) || 0) + (parseFloat(style.marginBottom) || 0);
}

export function useReserve(key: unknown): number {
  const [reserve, setReserve] = useState(0);
  useEffect(() => {
    const nodes = MEASURED.map((s) => document.querySelector<HTMLElement>(s)).filter((n): n is HTMLElement => n !== null);
    const measure = (): void => {
      // A note row also adds the scrubber's row gap above it.
      const notes = [...document.querySelectorAll<HTMLElement>(NOTES)].reduce((a, n) => a + outerHeight(n) + NOTE_GAP, 0);
      const credit = document.querySelector<HTMLElement>(CREDIT);
      const creditHeight = credit === null ? 0 : outerHeight(credit);
      const heights = nodes.map((n) => n.getBoundingClientRect().height - (n.matches(".site-footer") ? creditHeight : 0));
      setReserve(reserveFor(heights, notes));
    };
    measure();
    window.addEventListener("resize", measure);
    const observer = typeof ResizeObserver === "function" && nodes.length > 0 ? new ResizeObserver(measure) : null;
    for (const n of nodes) observer?.observe(n);
    return () => {
      window.removeEventListener("resize", measure);
      observer?.disconnect();
    };
  }, [key]);
  return reserve;
}
