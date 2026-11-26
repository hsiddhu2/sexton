// The height kept free under the Scene (spec clean-site): the Footer bar, the site footer and the gaps between them,
// so the Scene fills the viewport and its graves stand at its bottom above the Footer bar, as in the prototype.
import { useEffect, useState } from "react";

/** The gap between the Scene card and the Footer bar, and the main area's bottom padding, in CSS pixels. */
export const RESERVE_GAPS = 16 + 14;
const MEASURED = [".foot-bar", ".site-footer"] as const;

/** Pure. The reserve from the measured heights; 0 when nothing is measured (jsdom), so the Scene keeps its old rule. */
export function reserveFor(heights: readonly number[]): number {
  const sum = heights.reduce((a, h) => a + (Number.isFinite(h) && h > 0 ? Math.ceil(h) : 0), 0);
  return sum > 0 ? sum + RESERVE_GAPS : 0;
}

export function useReserve(key: unknown): number {
  const [reserve, setReserve] = useState(0);
  useEffect(() => {
    const nodes = MEASURED.map((s) => document.querySelector<HTMLElement>(s)).filter((n): n is HTMLElement => n !== null);
    const measure = (): void => {
      setReserve(reserveFor(nodes.map((n) => n.getBoundingClientRect().height)));
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
