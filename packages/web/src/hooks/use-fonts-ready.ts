import { useEffect, useState } from "react";

/** The canvas families: the grave name labels are Inter 600 (spec clean-site, 5.1). */
export const CANVAS_FONTS = ["600 15px Inter"] as const;

/**
 * Turns true once the canvas fonts have loaded, so the Scene repaints once with them. Until then the canvas draws
 * with the fallback family. Where the Font Loading API is missing, or a load fails, it stays false and nothing breaks.
 */
export function useFontsReady(): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const fonts = typeof document === "undefined" ? undefined : (document as Document & { fonts?: FontFaceSet }).fonts;
    if (fonts === undefined || typeof fonts.load !== "function") return undefined;
    let live = true;
    Promise.all(CANVAS_FONTS.map((f) => fonts.load(f)))
      .then(() => {
        if (live) setReady(true);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);
  return ready;
}
