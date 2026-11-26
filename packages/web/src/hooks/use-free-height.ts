import { useEffect, useState, type RefObject } from "react";

/** Pure. The viewport height under the element top, or 0 when it cannot be read. */
export function freeHeight(innerHeight: number, top: number): number {
  if (!Number.isFinite(innerHeight) || innerHeight <= 0 || !Number.isFinite(top)) return 0;
  // Rounded up: a fractional top must not leave a sub-pixel strip under the ground.
  return Math.max(0, Math.ceil(innerHeight - top));
}

/**
 * Free height of the viewport under the container, so the ground can reach the bottom of the page.
 * Recomputed on resize and when the container width changes.
 */
export function useFreeHeight(ref: RefObject<HTMLElement | null>, width: number): number {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    const measure = (): void => {
      const element = ref.current;
      if (element === null) {
        setHeight(0);
        return;
      }
      // The ground runs to the bottom of the viewport, under the Footer bar that stays in view over it
      // (spec cemetery-undead, 9.4, design.md decision 15).
      setHeight(freeHeight(window.innerHeight, element.getBoundingClientRect().top + window.scrollY));
    };
    measure();
    window.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("resize", measure);
    };
  }, [ref, width]);
  return height;
}

/** Pure. The height the graves should end within: the free height less a Footer bar that stays in view over it. */
export function fitHeight(free: number, footer: number, pinned: boolean): number {
  if (!Number.isFinite(free) || free <= 0) return 0;
  return pinned && Number.isFinite(footer) && footer > 0 ? Math.max(0, Math.floor(free - footer)) : 0;
}

/**
 * The height of the Footer bar while it stays in view over the scene (960 px and wider), else 0.
 * Every `.night-footer` node is measured and observed, and the nodes are found again when `key` changes (a new
 * response can replace a footer). The height is the tallest sticky node (spec cemetery-undead-2, A8).
 */
export function usePinnedFooterHeight(width: number, key?: unknown): number {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    const footers = Array.from(document.querySelectorAll<HTMLElement>(".night-footer"));
    const measure = (): void => {
      let tallest = 0;
      for (const footer of footers) {
        if (!footer.isConnected || window.getComputedStyle(footer).position !== "sticky") continue;
        tallest = Math.max(tallest, Math.ceil(footer.getBoundingClientRect().height));
      }
      setHeight(tallest);
    };
    measure();
    window.addEventListener("resize", measure);
    const observer = typeof ResizeObserver === "function" && footers.length > 0 ? new ResizeObserver(measure) : null;
    for (const footer of footers) observer?.observe(footer);
    return () => {
      window.removeEventListener("resize", measure);
      observer?.disconnect();
    };
  }, [width, key]);
  return height;
}
