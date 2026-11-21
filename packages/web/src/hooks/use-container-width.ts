import { useEffect, useState, type RefObject } from "react";

/** Observed width of an element. Notifications are applied in at most one state update per animation frame. */
export function useContainerWidth(ref: RefObject<HTMLElement | null>): number {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const element = ref.current;
    if (element === null) return undefined;
    let latest = element.clientWidth;
    let frame: number | null = null;
    const apply = (): void => {
      frame = null;
      setWidth(latest);
    };
    const observer = new ResizeObserver((entries) => {
      const entry = entries[entries.length - 1];
      if (entry === undefined) return;
      latest = entry.contentRect.width;
      frame ??= window.requestAnimationFrame(apply);
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
      if (frame !== null) window.cancelAnimationFrame(frame);
    };
  }, [ref]);
  return width;
}
