// The Panel scrolls inside itself only when its cards are taller than its box (spec clean-site, 3.29). In the Wide
// layout the Panel takes the grid row's height, which fits the viewport; a Panel that fits stays a plain box, so the
// page renders as it did before, and a short screen gets a scrolling Panel instead of a scrolling page.
import { useCallback, useEffect, useState } from "react";

/** Pure. Whether the content overflows its box by more than a sub-pixel rounding. */
export function panelOverflows(content: number, box: number): boolean {
  return Number.isFinite(content) && Number.isFinite(box) && box > 0 && content > box + 0.5;
}

/** A callback ref for the Panel and whether it scrolls; the answer follows the Panel's and its cards' sizes. */
export function usePanelScroll(): readonly [(element: HTMLElement | null) => void, boolean] {
  const [element, setElement] = useState<HTMLElement | null>(null);
  const [scroll, setScroll] = useState(false);
  const ref = useCallback((node: HTMLElement | null) => {
    setElement(node);
  }, []);
  useEffect(() => {
    if (element === null) {
      setScroll(false);
      return;
    }
    const measure = (): void => {
      setScroll(panelOverflows(element.scrollHeight, element.clientHeight));
    };
    measure();
    window.addEventListener("resize", measure);
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(measure) : null;
    observer?.observe(element);
    for (const child of element.children) observer?.observe(child);
    return () => {
      window.removeEventListener("resize", measure);
      observer?.disconnect();
    };
  }, [element]);
  return [ref, scroll] as const;
}
