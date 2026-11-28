// The Scan hint that fits (spec home-page, 3.8 and 12.12). A Scan box shows its long hint only while the whole hint
// fits inside the field's text area, and the short hint otherwise. The width is read from the field itself, so the
// rule holds in every layout, with or without a tag beside the field. Where nothing can be measured (no layout, no
// canvas, as in a unit test) the Narrow layout decides, as before.
import { useLayoutEffect, useState, type RefObject } from "react";
import { useNarrow } from "./use-narrow.js";

/** Room in px kept free at the end of the text area, so the hint never touches the field's edge. */
export const HINT_SLACK_PX = 4;

let canvas: HTMLCanvasElement | null = null;

/** The width in px of `text` drawn in the field's placeholder font, or null when it cannot be measured. */
export function hintWidth(field: HTMLInputElement, text: string): number | null {
  try {
    canvas ??= document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (context === null) return null;
    const style = window.getComputedStyle(field, "::placeholder");
    const font = style.font !== "" ? style.font : `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    context.font = font;
    const spacing = Number.parseFloat(style.letterSpacing);
    const extra = Number.isFinite(spacing) ? spacing * text.length : 0;
    return context.measureText(text).width + extra;
  } catch {
    return null;
  }
}

/** The width in px of the field's text area, or null when it has no layout. Chromium reports an input's clientWidth
 * without its padding, so the box is read and its padding and borders are taken off once. */
export function textAreaWidth(field: HTMLInputElement): number | null {
  const box = field.getBoundingClientRect().width;
  if (!(box > 0)) return null;
  const style = window.getComputedStyle(field);
  const px = (value: string): number => Number.parseFloat(value) || 0;
  const width = box - px(style.paddingLeft) - px(style.paddingRight) - px(style.borderLeftWidth) - px(style.borderRightWidth);
  return Number.isFinite(width) ? width : null;
}

/** Pure: the long hint when it is known to fit, the short one when it is known not to, and the layout's choice otherwise. */
export function chooseHint(long: string, short: string, longWidth: number | null, room: number | null, narrow: boolean): string {
  if (longWidth === null || room === null) return narrow ? short : long;
  return longWidth + HINT_SLACK_PX <= room ? long : short;
}

/** The hint for the field behind `ref`, measured again whenever the field resizes and whenever fonts finish loading. */
export function useFittingHint(ref: RefObject<HTMLInputElement | null>, long: string, short: string): string {
  const narrow = useNarrow();
  const [hint, setHint] = useState(narrow ? short : long);
  // A layout effect, so a field that is too small never paints the long hint for a frame.
  useLayoutEffect(() => {
    const field = ref.current;
    const measure = (): void => {
      const room = field === null ? null : textAreaWidth(field);
      const choice = field === null || room === null ? (narrow ? short : long) : chooseHint(long, short, hintWidth(field, long), room, narrow);
      setHint(choice);
    };
    measure();
    if (field === null) return undefined;
    let live = true;
    const fonts = document.fonts as FontFaceSet | undefined;
    void fonts?.ready.then(() => {
      if (live) measure();
    });
    // A web font that finishes after `ready` has resolved changes the hint's width but not the field's.
    fonts?.addEventListener("loadingdone", measure);
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(measure) : null;
    observer?.observe(field);
    return () => {
      live = false;
      fonts?.removeEventListener("loadingdone", measure);
      observer?.disconnect();
    };
  }, [ref, long, short, narrow]);
  return hint;
}
