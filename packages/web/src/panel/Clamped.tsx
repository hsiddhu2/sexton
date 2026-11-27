// A text box that styles.css may clamp to a fixed number of lines with an ellipsis (spec clean-site, requirement 3.26):
// the Inspector, the Fix order rows and the Step panel keep one height at each layout, so pointing at a grave moves
// nothing. The whole text stays in the DOM, so assistive technology reads all of it; while the box is cut short its
// title holds the whole text too, and the Drawer shows it in full.
import type { ReactNode } from "react";
import { createElement, useLayoutEffect, useRef } from "react";

export interface ClampedProps {
  readonly as?: "p" | "span" | "b";
  readonly className: string;
  /** The whole text, shown as the title while the box is cut short. */
  readonly text: string;
  /** What the box shows, when it is more than the plain text (Terms inside a sentence). */
  readonly children?: ReactNode;
}

/** Pure. True when a box shows less than its content, across or down. */
export function isCut(box: { scrollWidth: number; clientWidth: number; scrollHeight: number; clientHeight: number }): boolean {
  return box.scrollWidth > box.clientWidth + 1 || box.scrollHeight > box.clientHeight + 1;
}

export function Clamped({ as = "p", className, text, children }: ClampedProps) {
  const ref = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (el === null) return undefined;
    const check = (): void => {
      if (isCut(el)) el.title = text;
      else el.removeAttribute("title");
    };
    check();
    // A box of fixed width does not resize when the fonts arrive, so it is checked again then.
    let live = true;
    void (document.fonts as FontFaceSet | undefined)?.ready.then(() => {
      if (live) check();
    });
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(check);
    observer?.observe(el);
    return () => {
      live = false;
      observer?.disconnect();
    };
  }, [text]);
  return createElement(as, { ref, className }, children ?? text);
}
